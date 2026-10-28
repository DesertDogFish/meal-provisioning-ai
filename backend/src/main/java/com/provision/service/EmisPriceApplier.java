package com.provision.service;

import com.provision.entity.EmisPrice;
import com.provision.entity.EmisProduct;
import com.provision.entity.Ingredient;
import com.provision.entity.IngredientPrice;
import com.provision.repository.EmisPriceRepository;
import com.provision.repository.EmisProductRepository;
import com.provision.repository.IngredientPriceRepository;
import com.provision.repository.IngredientRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Перекладывание цен из локальной копии ЕМИСС в {@code ingredient_prices} для привязанных
 * продуктов ({@code ingredients.emis_code}).
 *
 * <p>Зачем отдельный шаг: вся математика стоимости похода (SummaryService, PriceResolutionService,
 * чеки, дашборд) читает {@code ingredient_prices} и ничего не знает про ЕМИСС. Локальная копия —
 * источник правды по Росстату, {@code ingredient_prices} — действующая цена продукта; этот модуль
 * проводит между ними границу и приводит единицы измерения ({@link EmisUnit}).</p>
 *
 * <p>Транзакционная модель — как в Fix-16: чтение слепком в короткой read-only транзакции
 * (никаких JPA-проксей в фоне), запись — {@code REQUIRES_NEW} на продукт.</p>
 *
 * <p><b>Ручные цены синхронизация стирает</b> (решение владельца, Запуск №17): если продукт
 * привязан к позиции ЕМИСС, значит источник цены у него объявлен декларативно, и цена
 * Росстата заменяет любую ранее введённую вручную — и на датах выгрузки (перезапись), и на
 * остальных датах (удаление). Иначе в ряду осталась бы солянка из ручных и официальных цен,
 * а «цена синхронизирована» врала бы. Ручная цена, введённая ПОСЛЕ синка, живёт до следующего
 * синка — это осознанный компромисс «ЕМИСС важнее».</p>
 */
@Service
@Slf4j
public class EmisPriceApplier {

    private final IngredientRepository ingredientRepository;
    private final EmisProductRepository emisProductRepository;
    private final EmisPriceRepository emisPriceRepository;
    private final IngredientPriceRepository priceRepository;

    public EmisPriceApplier(IngredientRepository ingredientRepository,
                            EmisProductRepository emisProductRepository,
                            EmisPriceRepository emisPriceRepository,
                            IngredientPriceRepository priceRepository) {
        this.ingredientRepository = ingredientRepository;
        this.emisProductRepository = emisProductRepository;
        this.emisPriceRepository = emisPriceRepository;
        this.priceRepository = priceRepository;
    }

    /**
     * Слепок привязанного продукта для работы вне БД-сессии: только значения.
     * {@code emisUnit} — разобранный суффикс названия позиции ЕМИСС; если позиции нет в
     * справочнике (код вписан вручную и не найден), единица = OTHER и точки отбрасываются
     * с явной причиной в деталях синка.
     */
    public record LinkedProduct(Long ingredientId, String name, String unit, BigDecimal pieceWeightG,
                                String emisCode, String emisName, EmisUnit emisUnit) {}

    /** Точка цены локальной копии (значение, не сущность — безопасно для фона). */
    public record LocalPrice(LocalDate date, BigDecimal price) {}

    /** Итог применения цен к одному продукту — строка постатейного отчёта в журнале синков. */
    public record ProductOutcome(int created, int updated, int skipped, LocalDate lastDate,
                                 BigDecimal oldPrice, BigDecimal newPrice,
                                 String action, String reason) {}

    /**
     * Все глобальные продукты с привязкой к ЕМИСС + их позиции справочника.
     * Снепшоты походов ({@code trip_id NOT NULL}) не трогаем: история похода неизменна.
     */
    @Transactional(readOnly = true)
    public List<LinkedProduct> loadLinkedProducts() {
        List<Ingredient> linked = ingredientRepository.findByEmisCodeIsNotNullAndTripIdIsNull();
        Map<String, EmisProduct> catalog = new HashMap<>();
        List<String> codes = linked.stream().map(Ingredient::getEmisCode).distinct().toList();
        if (!codes.isEmpty()) {
            for (EmisProduct p : emisProductRepository.findByCodeIn(codes)) {
                catalog.put(p.getCode(), p);
            }
        }
        List<LinkedProduct> out = new ArrayList<>(linked.size());
        for (Ingredient i : linked) {
            EmisProduct p = catalog.get(i.getEmisCode());
            EmisUnit unit = p == null
                    ? EmisUnit.OTHER
                    : new EmisUnit(p.getUnitKind(), p.getUnitAmount(), p.getUnitScale(), p.getUnitLabel());
            out.add(new LinkedProduct(i.getId(), i.getName(),
                    i.getUnit() == null ? null : i.getUnit().name(), i.getPieceWeightG(),
                    i.getEmisCode(), p == null ? null : p.getName(), unit));
        }
        return out;
    }

    /** Точки цен локальной копии по набору кодов — одним запросом, сгруппированные по коду. */
    @Transactional(readOnly = true)
    public Map<String, List<LocalPrice>> loadLocalPrices(String regionCode, Collection<String> emisCodes) {
        Map<String, List<LocalPrice>> out = new HashMap<>();
        if (emisCodes == null || emisCodes.isEmpty()) {
            return out;
        }
        for (EmisPrice p : emisPriceRepository.findByRegionCodeAndEmisCodeIn(regionCode, emisCodes)) {
            out.computeIfAbsent(p.getEmisCode(), k -> new ArrayList<>())
                    .add(new LocalPrice(p.effectiveFrom(), p.getPrice()));
        }
        out.values().forEach(list -> list.sort((a, b) -> a.date().compareTo(b.date())));
        return out;
    }

    /**
     * Применяет точки локальной копии к продукту: короткая отдельная транзакция,
     * ингредиент перезагружается по id ВНУТРИ неё (detached-объекты сюда не передаются).
     *
     * @param source код провайдера, которым помечаются записанные цены ({@code ROSSTAT})
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public ProductOutcome apply(LinkedProduct product, List<LocalPrice> points, String source) {
        if (points == null || points.isEmpty()) {
            String reason = product.emisName() == null
                    ? "Позиция " + product.emisCode() + " не найдена в локальном справочнике ЕМИСС"
                    : "В локальной копии нет цен позиции «" + product.emisName() + "»";
            log.info("Продукт {} ({}): {}", product.ingredientId(), product.name(), reason);
            return new ProductOutcome(0, 0, 0, null, null, null, "SKIPPED", reason);
        }

        Ingredient ingredient = ingredientRepository.findById(product.ingredientId()).orElse(null);
        if (ingredient == null) {
            log.warn("Продукт {} исчез до применения цен ЕМИСС", product.ingredientId());
            return new ProductOutcome(0, 0, 0, null, null, null, "SKIPPED",
                    "Продукт не найден (id " + product.ingredientId() + ")");
        }

        int created = 0;
        int updated = 0;
        int skipped = 0;
        int manualOverwritten = 0;
        LocalDate lastDate = null;
        BigDecimal lastOld = null;
        BigDecimal lastNew = null;
        String lastAction = null;

        for (LocalPrice point : points) {
            BigDecimal unitPrice = product.emisUnit().rounded(
                    product.emisUnit().pricePerUnit(point.price(), product.unit(), product.pieceWeightG()));
            if (unitPrice == null || unitPrice.compareTo(BigDecimal.ZERO) <= 0) {
                skipped++;
                continue;
            }
            Optional<IngredientPrice> existing =
                    priceRepository.findByIngredientIdAndEffectiveFrom(ingredient.getId(), point.date());
            BigDecimal oldPrice = null;
            String action;
            if (existing.isPresent()) {
                IngredientPrice row = existing.get();
                oldPrice = row.getPricePerUnit();
                // Запуск №17: ручная цена больше не защищена — привязка к ЕМИСС означает,
                // что источник цены у продукта объявлен, и Росстат перезаписывает всё.
                if ("MANUAL".equals(row.getSource())) {
                    manualOverwritten++;
                }
                row.setPricePerUnit(unitPrice);
                row.setSource(source);
                priceRepository.save(row);
                updated++;
                action = "UPDATED";
            } else {
                priceRepository.save(IngredientPrice.builder()
                        .ingredient(ingredient)
                        .pricePerUnit(unitPrice)
                        .currency("RUB")
                        .effectiveFrom(point.date())
                        .source(source)
                        .build());
                created++;
                action = "CREATED";
            }
            if (lastDate == null || !point.date().isBefore(lastDate)) {
                lastDate = point.date();
                lastOld = oldPrice;
                lastNew = unitPrice;
                lastAction = action;
            }
        }

        // Остатки ручных цен (даты вне окна выгрузки) удаляем: ряд продукта должен быть
        // однородным — только ЕМИСС. Делаем это лишь когда хоть что-то применили, иначе
        // «синк» без данных оставил бы продукт вообще без цены.
        int manualDeleted = created + updated == 0
                ? 0
                : priceRepository.deleteManualByIngredientId(ingredient.getId());

        StringBuilder reason = new StringBuilder();
        reason.append("Точек цен: ").append(points.size())
                .append(", создано: ").append(created)
                .append(", обновлено: ").append(updated);
        if (manualOverwritten + manualDeleted > 0) {
            reason.append(", ручных цен стёрто: ").append(manualOverwritten + manualDeleted)
                    .append(" (перезаписано ").append(manualOverwritten)
                    .append(", удалено ").append(manualDeleted).append(')');
        }
        if (skipped > 0) {
            reason.append(", отброшено (несовместимые единицы): ").append(skipped);
        }
        String outcomeAction = created + updated == 0 ? "SKIPPED" : (lastAction == null ? "UPDATED" : lastAction);
        return new ProductOutcome(created, updated, skipped, lastDate, lastOld, lastNew,
                outcomeAction, reason.toString());
    }
}

package com.provision.service;

import com.provision.dto.trip.MealCompositionDtos.CompositionPutRequest;
import com.provision.entity.Ingredient;
import com.provision.entity.TripIngredientSubstitution;
import com.provision.entity.User;
import com.provision.repository.TripIngredientSubstitutionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.provision.service.MealCompositionService.STATE_EXCLUDED;
import static com.provision.service.MealCompositionService.STATE_EXTRA;
import static com.provision.service.MealCompositionService.STATE_SCALED;

/**
 * Подзадача 11 (план plans/2026-10-29-full-audit.md): диф-коммит правок состава —
 * SCALE / EXTRA / EXCLUDE / SUBST (FORM-meal-composition-spec §3).
 *
 * <p>Сервер сравнивает желаемое состояние (PUT-тело) с текущими записями правок и
 * удаляет/создаёт/обновляет записи в ОДНОЙ транзакции вызывающего сервиса;
 * повтор того же тела идемпотентен (ничего не меняется).
 *
 * <p>Хранение поверх схемы V19/V20/V21 (без новых таблиц):
 * <ul>
 *   <li>SCALED — «замена на себя»: from=to=X, ratio; derived × ratio;</li>
 *   <li>EXTRA — добавленный продукт: added=true, from=null, to=X; amount_per_serving
 *       хранит АБСОЛЮТ НА ПРИЁМ (V21), SummaryService не масштабирует такие строки;</li>
 *   <li>EXCLUDED — мягкое исключение: to=null, removed=true;</li>
 *   <li>SUBST — замена A→B: from=A, to=B (A≠B), ratio; набор замен ПОЛНОСТЬЮ
 *       заменяется на присланный (устаревшие удаляются).</li>
 * </ul>
 *
 * <p>Входные id уже резолвлены в trip-scope ({@link TripScopedIdResolver}),
 * ингредиенты предзагружены вызывающим.
 */
@Component
@RequiredArgsConstructor
@Slf4j
class CompositionDiffEngine {

    private final TripIngredientSubstitutionRepository substitutionRepository;

    /** Применить диф правок состава (см. javadoc класса). Вызывается внутри @Transactional. */
    void applyDiff(MealContext ctx, CompositionPutRequest request, Map<Long, Long> resolved,
                   Map<Long, Ingredient> ingredients, User user) {
        Long tripId = ctx.trip().getId();
        List<TripIngredientSubstitution> current =
                substitutionRepository.findByTripIdAndRecipeId(tripId, ctx.recipe().getId());
        Map<Long, TripIngredientSubstitution> scaleByFrom = new HashMap<>();
        Map<Long, TripIngredientSubstitution> extraByTo = new HashMap<>();
        Map<Long, TripIngredientSubstitution> excludeByFrom = new HashMap<>();
        Map<Long, TripIngredientSubstitution> replaceByFrom = new HashMap<>();
        for (TripIngredientSubstitution s : current) {
            if (s.isAdded() || s.getFromIngredient() == null) {
                if (s.getToIngredient() != null) extraByTo.put(s.getToIngredient().getId(), s);
            } else if (s.isRemoved() || s.getToIngredient() == null) {
                excludeByFrom.put(s.getFromIngredient().getId(), s);
            } else if (s.getToIngredient().getId().equals(s.getFromIngredient().getId())) {
                scaleByFrom.put(s.getFromIngredient().getId(), s);
            } else {
                replaceByFrom.put(s.getFromIngredient().getId(), s);
            }
        }

        // --- diff по items ---
        Set<Long> keepScaled = new java.util.HashSet<>();
        Set<Long> keepExtra = new java.util.HashSet<>();
        Set<Long> keepExcluded = new java.util.HashSet<>();
        for (CompositionPutRequest.ItemDto item : request.items()) {
            Long ingId = resolved.get(item.ingredientId());
            switch (item.state()) {
                case STATE_SCALED -> {
                    keepScaled.add(ingId);
                    TripIngredientSubstitution existing = scaleByFrom.get(ingId);
                    Ingredient ing = ingredients.get(ingId);
                    if (existing == null) {
                        substitutionRepository.save(TripIngredientSubstitution.builder()
                                .trip(ctx.trip()).recipe(ctx.recipe())
                                .fromIngredient(ing).toIngredient(ing)
                                .ratio(item.ratio()).comment("SCALE via composition")
                                .createdBy(user).build());
                    } else if (existing.getRatio().compareTo(item.ratio()) != 0) {
                        existing.setRatio(item.ratio());
                        substitutionRepository.save(existing);
                    }
                    // SCALED поверх EXCLUDED — снимаем исключение
                    TripIngredientSubstitution ex = excludeByFrom.get(ingId);
                    if (ex != null) {
                        substitutionRepository.delete(ex);
                        excludeByFrom.remove(ingId);
                    }
                }
                case STATE_EXTRA -> {
                    keepExtra.add(ingId);
                    // §3/V21: EXTRA — АБСОЛЮТ на приём; amount_per_serving added-строки хранит
                    // его напрямую (SummaryService не масштабирует такие строки — см.
                    // EffectiveLine.absolute; GET composition отдаёт значение как есть).
                    // Старая схема (abs/people) теряла точность при baseServings≠1 и давала
                    // вклад abs/base в закупке — расчёт расходился с составом.
                    BigDecimal absolute = item.amount();
                    TripIngredientSubstitution existing = extraByTo.get(ingId);
                    if (existing == null) {
                        substitutionRepository.save(TripIngredientSubstitution.builder()
                                .trip(ctx.trip()).recipe(ctx.recipe())
                                .fromIngredient(null).toIngredient(ingredients.get(ingId))
                                .amountPerServing(absolute).ratio(BigDecimal.ONE)
                                .added(true).removed(false)
                                .comment("EXTRA via composition")
                                .createdBy(user).build());
                    } else if (existing.getAmountPerServing() == null
                            || existing.getAmountPerServing().compareTo(absolute) != 0) {
                        existing.setAmountPerServing(absolute);
                        substitutionRepository.save(existing);
                    }
                }
                case STATE_EXCLUDED -> {
                    keepExcluded.add(ingId);
                    if (!excludeByFrom.containsKey(ingId)) {
                        Ingredient ing = ingredients.get(ingId);
                        substitutionRepository.save(TripIngredientSubstitution.builder()
                                .trip(ctx.trip()).recipe(ctx.recipe())
                                .fromIngredient(ing).toIngredient(null)
                                .ratio(BigDecimal.ONE).removed(true)
                                .comment("EXCLUDE via composition")
                                .createdBy(user).build());
                    }
                }
                default -> { /* RECIPE — правок нет */ }
            }
        }

        // Убираем правки, которых нет в desired-состоянии (state=RECIPE или позиция исчезла)
        for (Map.Entry<Long, TripIngredientSubstitution> e : scaleByFrom.entrySet()) {
            if (!keepScaled.contains(e.getKey())) substitutionRepository.delete(e.getValue());
        }
        for (Map.Entry<Long, TripIngredientSubstitution> e : extraByTo.entrySet()) {
            if (!keepExtra.contains(e.getKey())) substitutionRepository.delete(e.getValue());
        }
        for (Map.Entry<Long, TripIngredientSubstitution> e : excludeByFrom.entrySet()) {
            if (!keepExcluded.contains(e.getKey())) substitutionRepository.delete(e.getValue());
        }

        // --- diff по substitutions (полная замена набора) ---
        List<CompositionPutRequest.SubstitutionDto> wantSubs =
                request.substitutions() == null ? List.of() : request.substitutions();
        Map<Long, TripIngredientSubstitution> keepReplace = new HashMap<>();
        for (CompositionPutRequest.SubstitutionDto dto : wantSubs) {
            Long fromId = resolved.get(dto.fromIngredientId());
            Long toId = resolved.get(dto.toIngredientId());
            TripIngredientSubstitution existing = replaceByFrom.get(fromId);
            boolean changed = existing == null
                    || !existing.getToIngredient().getId().equals(toId)
                    || CompositionCalculator.nvl(existing.getRatio())
                            .compareTo(CompositionCalculator.nvl(dto.ratio())) != 0;
            if (changed) {
                if (existing != null) substitutionRepository.delete(existing);
                substitutionRepository.save(TripIngredientSubstitution.builder()
                        .trip(ctx.trip()).recipe(ctx.recipe())
                        .fromIngredient(ingredients.get(fromId))
                        .toIngredient(ingredients.get(toId))
                        .ratio(CompositionCalculator.nvl(dto.ratio()))
                        .comment("SUBST via composition")
                        .createdBy(user).build());
            }
            if (existing != null) keepReplace.put(fromId, existing);
        }
        for (Map.Entry<Long, TripIngredientSubstitution> e : replaceByFrom.entrySet()) {
            if (!keepReplace.containsKey(e.getKey())) substitutionRepository.delete(e.getValue());
        }

        substitutionRepository.flush();
        log.info("Composition commit: trip {} meal {} items {} subs {}", tripId,
                ctx.meal().getId(), request.items().size(), wantSubs.size());
    }
}

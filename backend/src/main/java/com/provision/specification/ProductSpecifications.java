package com.provision.specification;

import com.provision.entity.Ingredient;
import com.provision.entity.IngredientPrice;
import com.provision.entity.RecipeIngredient;
import com.provision.entity.RecipeSource;
import com.provision.entity.UnitOfMeasure;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;
import java.util.List;

/**
 * JPA-спецификации для фильтрации справочника продуктов (GET /api/v1/admin/products).
 * Пустой/нулевой параметр => спецификация возвращает null (нейтральный предикат, AND не ограничивает).
 * Семантика фильтров зеркалит клиентский фильтр src/components/ProductTable.tsx.
 */
public final class ProductSpecifications {

    private ProductSpecifications() {
    }

    /** ILIKE %query% по name ИЛИ code. */
    // V20: справочник продуктов — только глобальные записи (trip_id IS NULL)
    public static Specification<Ingredient> isGlobal() {
        return (root, query, cb) -> cb.isNull(root.get("tripId"));
    }

    public static Specification<Ingredient> matchesQuery(String query) {
        return (root, cq, cb) -> {
            if (query == null || query.isBlank()) {
                return null;
            }
            String like = "%" + query.trim().toLowerCase() + "%";
            return cb.or(
                    cb.like(cb.lower(root.get("name")), like),
                    cb.like(cb.lower(cb.coalesce(root.get("code"), "")), like)
            );
        };
    }

    /** Фильтр по списку категорий (OR внутри списка). */
    public static Specification<Ingredient> hasCategoryIn(List<Long> categoryIds) {
        return (root, cq, cb) -> {
            if (categoryIds == null || categoryIds.isEmpty()) {
                return null;
            }
            return root.join("category", JoinType.INNER).get("id").in(categoryIds);
        };
    }

    /** Фильтр по единицам измерения. Контроллер уже конвертирует строки в UnitOfMeasure (400 при мусоре). */
    public static Specification<Ingredient> hasUnitIn(List<UnitOfMeasure> units) {
        return (root, cq, cb) -> {
            if (units == null || units.isEmpty()) {
                return null;
            }
            return root.get("unit").in(units);
        };
    }

    /** HAS_PRICE / NO_PRICE — есть ли действующая цена на сегодня. */
    public static Specification<Ingredient> hasPriceStatus(String priceStatus) {
        return (root, cq, cb) -> {
            if (priceStatus == null || priceStatus.isBlank()) {
                return null;
            }
            var sub = cq.subquery(Long.class);
            var price = sub.from(IngredientPrice.class);
            sub.select(price.get("ingredient").get("id"))
                    .where(cb.and(
                            cb.equal(price.get("ingredient").get("id"), root.get("id")),
                            cb.lessThanOrEqualTo(price.get("effectiveFrom"), LocalDate.now())
                    ));
            Predicate exists = cb.exists(sub);
            return switch (priceStatus) {
                case "HAS_PRICE" -> exists;
                case "NO_PRICE" -> cb.not(exists);
                default -> null;
            };
        };
    }

    /**
     * NOT_LINKED / NO_DATA / SYNCED — статус синхронизации цены (V26).
     *
     * <p>Считается по привязке {@code ingredients.emis_code} и наличию цены, записанной
     * синхронизацией ({@code ingredient_prices.source='ROSSTAT'}) — те же правила, что и в
     * {@code ProductService.toProductResponse}, поэтому фильтр и колонка таблицы не расходятся.</p>
     */
    public static Specification<Ingredient> hasPriceSyncStatus(String priceSyncStatus) {
        return (root, cq, cb) -> {
            if (priceSyncStatus == null || priceSyncStatus.isBlank()) {
                return null;
            }
            Predicate linked = cb.and(
                    cb.isNotNull(root.get("emisCode")),
                    cb.notEqual(root.get("emisCode"), ""));
            var sub = cq.subquery(Long.class);
            var price = sub.from(IngredientPrice.class);
            sub.select(price.get("ingredient").get("id"))
                    .where(cb.and(
                            cb.equal(price.get("ingredient").get("id"), root.get("id")),
                            cb.equal(price.get("source"), RecipeSource.ROSSTAT.name())
                    ));
            Predicate synced = cb.exists(sub);
            return switch (priceSyncStatus) {
                case "NOT_LINKED" -> cb.not(linked);
                case "SYNCED" -> cb.and(linked, synced);
                case "NO_DATA" -> cb.and(linked, cb.not(synced));
                default -> null;
            };
        };
    }

    /** USED / UNUSED — используется ли продукт хотя бы в одном рецепте. */
    public static Specification<Ingredient> hasUsageStatus(String usageStatus) {
        return (root, cq, cb) -> {
            if (usageStatus == null || usageStatus.isBlank()) {
                return null;
            }
            var sub = cq.subquery(Long.class);
            var ri = sub.from(RecipeIngredient.class);
            sub.select(ri.get("id"))
                    .where(cb.equal(ri.get("ingredient").get("id"), root.get("id")));
            Predicate exists = cb.exists(sub);
            return switch (usageStatus) {
                case "USED" -> exists;
                case "UNUSED" -> cb.not(exists);
                default -> null;
            };
        };
    }
}

package com.provision.specification;

import com.provision.entity.Ingredient;
import com.provision.entity.IngredientPrice;
import com.provision.entity.RecipeIngredient;
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

    /** BOUND / UNBOUND — привязан ли продукт к внешнему коду (ingredient.code). */
    public static Specification<Ingredient> hasBindingStatus(String bindingStatus) {
        return (root, cq, cb) -> {
            if (bindingStatus == null || bindingStatus.isBlank()) {
                return null;
            }
            return switch (bindingStatus) {
                case "BOUND" -> cb.isNotNull(root.get("code"));
                case "UNBOUND" -> cb.isNull(root.get("code"));
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

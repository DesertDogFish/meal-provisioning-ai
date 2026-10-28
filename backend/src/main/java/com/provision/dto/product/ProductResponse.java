package com.provision.dto.product;

import com.provision.entity.UnitOfMeasure;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;

/**
 * Продукт справочника.
 *
 * <p>Привязка к ЕМИСС — «софт»: {@code emisCode} хранится на самом продукте
 * ({@code ingredients.emis_code}, V26), а {@code priceSyncStatus} отвечает на вопрос админа
 * «цена синхронизирована?» без похода на портал:</p>
 * <ul>
 *   <li>{@link #NOT_LINKED} — источник цены не выбран, цену ведёт человек;</li>
 *   <li>{@link #NO_DATA} — продукт привязан к позиции ЕМИСС, но в локальной копии нет её цен
 *       (или они ещё не применены) — нужна синхронизация;</li>
 *   <li>{@link #SYNCED} — привязан, и действующая цена получена из ЕМИСС.</li>
 * </ul>
 */
public record ProductResponse(
    Long id,
    String name,
    ProductCategoryDto category,
    UnitOfMeasure unit,
    String unitLabel,
    BigDecimal packSize,
    Boolean roundToPacks,
    BigDecimal kcalPer100g,
    BigDecimal pieceWeightG,
    String description,
    CurrentPriceDto currentPrice,
    Integer usageRecipes,
    String emisCode,
    String emisName,
    String priceSyncStatus,
    LocalDateTime updatedAt
) {
    public record CurrentPriceDto(
        BigDecimal value,
        String currency,
        LocalDate effectiveFrom,
        String source
    ) {}

    /** Источник цены не выбран. */
    public static final String NOT_LINKED = "NOT_LINKED";
    /** Привязан к ЕМИСС, но цен в локальной копии нет (не синхронизировано). */
    public static final String NO_DATA = "NO_DATA";
    /** Привязан к ЕМИСС, действующая цена получена из локальной копии. */
    public static final String SYNCED = "SYNCED";

    public static final Map<UnitOfMeasure, String> UNIT_LABELS = Map.of(
        UnitOfMeasure.KG, "кг",
        UnitOfMeasure.L, "л",
        UnitOfMeasure.PCS, "шт",
        UnitOfMeasure.PACK, "уп"
    );
}

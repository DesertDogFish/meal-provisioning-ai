package com.provision.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Точка цены ЕМИСС: позиция классификатора × регион × год × месяц (V26).
 *
 * <p>Это локальная копия рядов выгрузки, источник правды по ценам Росстата. Действующая цена
 * продукта по-прежнему живёт в {@code ingredient_prices} — её туда перекладывает
 * {@link com.provision.service.EmisPriceApplier}, чтобы вся математика стоимости похода
 * (SummaryService, PriceResolutionService) не знала про ЕМИСС.</p>
 *
 * <p>Глубина хранения — два последних года (конфиг {@code integration.rosstat.period-years});
 * более старые точки удаляются при каждой синхронизации.</p>
 */
@Entity
@Table(name = "emis_prices", uniqueConstraints = {
        @UniqueConstraint(name = "emis_prices_point_key",
                columnNames = {"emis_code", "region_code", "period_year", "period_month"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EmisPrice {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Код классификатора ЕМИСС (без FK намеренно — см. комментарий V26). */
    @Column(name = "emis_code", nullable = false, length = 16)
    private String emisCode;

    /** ОКАТО региона, например «643004.АГ» — РФ без учёта новых субъектов (с 01.01.2023). */
    @Column(name = "region_code", nullable = false, length = 16)
    private String regionCode;

    @Column(name = "period_year", nullable = false)
    private Integer periodYear;

    /** 1..12. */
    @Column(name = "period_month", nullable = false)
    private Integer periodMonth;

    /** Цена в рублях за единицу позиции ЕМИСС (см. {@link EmisProduct#getUnitScale()}). */
    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal price;

    @Column(name = "loaded_at", nullable = false)
    private LocalDateTime loadedAt;

    @PrePersist
    @PreUpdate
    protected void touch() {
        loadedAt = LocalDateTime.now();
    }

    /** Первый день месяца наблюдения — дата, с которой цена считается действующей. */
    @Transient
    public LocalDate effectiveFrom() {
        return LocalDate.of(periodYear, periodMonth, 1);
    }
}

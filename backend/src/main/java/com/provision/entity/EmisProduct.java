package com.provision.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Позиция классификатора ЕМИСС «Виды товаров и услуг» (ось {@code s_grtov}) — локальная
 * копия справочника (V26). Ключ — код классификатора («105»), а не id значения фильтра
 * со страницы показателя («1743453»): именно код приходит в рядах SDMX, и именно он хранится
 * в {@code ingredients.emis_code}.
 *
 * <p>Единица измерения в ЕМИСС зашита в название («Фарш мясной, кг», «Консервы мясные, 350 г»,
 * «Спички, коробок»), поэтому при загрузке разбирается на {@code unitKind}/{@code unitAmount}/
 * {@code unitScale} — по ним цена позиции приводится к единице нашего продукта
 * ({@link com.provision.service.EmisUnit}). {@code unitLabel} хранит исходный суффикс для UI.</p>
 */
@Entity
@Table(name = "emis_products")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EmisProduct {

    /** Код классификатора ЕМИСС (первичный ключ, строка — коды бывают вида «643004.АГ»). */
    @Id
    @Column(length = 16)
    private String code;

    @Column(nullable = false, length = 500)
    private String name;

    /** MASS | VOLUME | COUNT | OTHER (услуги, метры, сутки — к продуктам не приводятся). */
    @Column(name = "unit_kind", nullable = false, length = 8)
    private String unitKind;

    /** Сколько {@link #unitScale} в единице, за которую указана цена (350 для «350 г»). */
    @Column(name = "unit_amount", nullable = false, precision = 10, scale = 3)
    private BigDecimal unitAmount;

    /** KG | G | L | ML | PCS. */
    @Column(name = "unit_scale", nullable = false, length = 4)
    private String unitScale;

    /** Исходный суффикс названия («кг», «350 г», «шт.») — для подписи в UI. */
    @Column(name = "unit_label", length = 32)
    private String unitLabel;

    @Column(name = "loaded_at", nullable = false)
    private LocalDateTime loadedAt;

    @PrePersist
    @PreUpdate
    protected void touch() {
        loadedAt = LocalDateTime.now();
    }
}

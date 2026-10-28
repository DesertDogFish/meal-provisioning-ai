package com.provision.repository;

import com.provision.entity.EmisPrice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

/** Точки цен локальной копии ЕМИСС (V26). */
@Repository
public interface EmisPriceRepository extends JpaRepository<EmisPrice, Long> {

    /**
     * Все точки региона по нужным позициям классификатора — одним запросом (применение цен
     * к продуктам и расчёт статуса «цена синхронизирована» для страницы продуктов).
     */
    List<EmisPrice> findByRegionCodeAndEmisCodeIn(String regionCode, Collection<String> emisCodes);

    /**
     * Самые свежие точки региона по всем позициям (DISTINCT ON вместо загрузки всей таблицы):
     * нужно, чтобы статус SYNCED/NO_DATA считался одним запросом на весь список продуктов.
     */
    @Query(value = "SELECT DISTINCT ON (p.emis_code) p.* FROM emis_prices p "
            + "WHERE p.region_code = :regionCode "
            + "ORDER BY p.emis_code, p.period_year DESC, p.period_month DESC",
            nativeQuery = true)
    List<EmisPrice> findLatestPerProduct(@Param("regionCode") String regionCode);

    long countByRegionCode(String regionCode);
}

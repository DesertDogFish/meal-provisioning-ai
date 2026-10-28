package com.provision.repository;

import com.provision.entity.EmisProduct;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

/**
 * Локальный справочник ЕМИСС (V26). Поиск идёт по нашей БД — портал для привязки продукта
 * не дёргается (боль запусков №16–17: поиск зависел от доступности fedstat.ru).
 */
@Repository
public interface EmisProductRepository extends JpaRepository<EmisProduct, String> {

    /** Подстрока в названии (без учёта регистра), сортировка по названию, лимит — Pageable. */
    @Query("SELECT p FROM EmisProduct p WHERE lower(p.name) LIKE lower(concat('%', :query, '%')) "
            + "ORDER BY p.name")
    List<EmisProduct> searchByName(@Param("query") String query, Pageable pageable);

    /** Пакетная выборка для списка продуктов: один запрос на страницу вместо N+1. */
    List<EmisProduct> findByCodeIn(Collection<String> codes);
}

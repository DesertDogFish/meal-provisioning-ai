package com.provision.repository;

import com.provision.entity.SyncLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface SyncLogRepository extends JpaRepository<SyncLog, Long>,
        org.springframework.data.jpa.repository.JpaSpecificationExecutor<SyncLog> {
    List<SyncLog> findByProviderOrderByStartedAtDesc(String provider);
    List<SyncLog> findAllByOrderByStartedAtDesc();
    
    @Query("SELECT s FROM SyncLog s WHERE s.provider = :provider AND s.status = 'RUNNING'")
    Optional<SyncLog> findRunningByProvider(@Param("provider") String provider);
    
    @Query("SELECT s FROM SyncLog s WHERE s.status = 'RUNNING'")
    List<SyncLog> findAllRunning();
    
    // Fix-12: findByFilters с JPQL-паттерном «(:param IS NULL OR col = :param)»
    // УДАЛЁН — на Hibernate 6 + PostgreSQL NULL-параметры в таких запросах
    // падают в рантайме («could not determine data type of parameter»), и журнал
    // синков + KPI (/admin/sync-logs, /admin/sync-logs/kpi) отдавали 500.
    // Фильтрация переехала в JPA Specification (SyncLogService.filtersSpec):
    // предикаты собираются в Java только для непустых фильтров — NULL-параметров
    // в запросе нет вовсе.
    @Query("SELECT COUNT(s) FROM SyncLog s WHERE s.provider = :provider AND s.status = 'SUCCESS' AND s.startedAt >= :since")
    long countSuccessfulSince(@Param("provider") String provider, @Param("since") LocalDateTime since);
    
    @Query("SELECT COALESCE(SUM(s.updatedCount), 0) FROM SyncLog s WHERE s.provider = :provider AND s.startedAt >= :since")
    long sumUpdatedSince(@Param("provider") String provider, @Param("since") LocalDateTime since);
    
    @Query("SELECT COALESCE(SUM(s.errorCount), 0) FROM SyncLog s WHERE s.provider = :provider AND s.startedAt >= :since")
    long sumErrorsSince(@Param("provider") String provider, @Param("since") LocalDateTime since);
}

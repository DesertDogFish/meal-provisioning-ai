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
public interface SyncLogRepository extends JpaRepository<SyncLog, Long> {
    List<SyncLog> findByProviderOrderByStartedAtDesc(String provider);
    List<SyncLog> findAllByOrderByStartedAtDesc();
    
    @Query("SELECT s FROM SyncLog s WHERE s.provider = :provider AND s.status = 'RUNNING'")
    Optional<SyncLog> findRunningByProvider(@Param("provider") String provider);
    
    @Query("SELECT s FROM SyncLog s WHERE s.status = 'RUNNING'")
    List<SyncLog> findAllRunning();
    
    @Query("SELECT s FROM SyncLog s WHERE " +
           "(:provider IS NULL OR s.provider = :provider) AND " +
           "(:type IS NULL OR s.type = :type) AND " +
           "(:status IS NULL OR s.status = :status) AND " +
           "(:from IS NULL OR s.startedAt >= :from) AND " +
           "(:to IS NULL OR s.startedAt <= :to) " +
           "ORDER BY s.startedAt DESC")
    List<SyncLog> findByFilters(
        @Param("provider") String provider,
        @Param("type") String type,
        @Param("status") String status,
        @Param("from") LocalDateTime from,
        @Param("to") LocalDateTime to
    );
    
    @Query("SELECT COUNT(s) FROM SyncLog s WHERE s.provider = :provider AND s.status = 'SUCCESS' AND s.startedAt >= :since")
    long countSuccessfulSince(@Param("provider") String provider, @Param("since") LocalDateTime since);
    
    @Query("SELECT COALESCE(SUM(s.updatedCount), 0) FROM SyncLog s WHERE s.provider = :provider AND s.startedAt >= :since")
    long sumUpdatedSince(@Param("provider") String provider, @Param("since") LocalDateTime since);
    
    @Query("SELECT COALESCE(SUM(s.errorCount), 0) FROM SyncLog s WHERE s.provider = :provider AND s.startedAt >= :since")
    long sumErrorsSince(@Param("provider") String provider, @Param("since") LocalDateTime since);
}

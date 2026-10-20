package com.provision.repository;

import com.provision.entity.SyncLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SyncLogRepository extends JpaRepository<SyncLog, Long> {
    List<SyncLog> findByProviderOrderByStartedAtDesc(String provider);
    List<SyncLog> findAllByOrderByStartedAtDesc();
}

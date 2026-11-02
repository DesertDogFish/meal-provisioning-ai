package com.provision.repository;

import com.provision.entity.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;

@Repository
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {
    Optional<RefreshToken> findByTokenHash(String tokenHash);
    
    @Modifying
    @Query("DELETE FROM RefreshToken rt WHERE rt.user.id = :userId")
    void deleteByUserId(Long userId);

    /**
     * Атомарная инвалидация токена по хэшу (аудит 29.10.2026, подзадача 4):
     * возвращает число удалённых строк; 0 — токен уже ротирован/удалён другой
     * транзакцией (защита от race при параллельных /auth/refresh).
     */
    @Modifying
    @Query("DELETE FROM RefreshToken rt WHERE rt.tokenHash = :tokenHash")
    int deleteByTokenHash(String tokenHash);
    
    @Modifying
    @Query("DELETE FROM RefreshToken rt WHERE rt.expiresAt < :now")
    void deleteExpiredTokens(LocalDateTime now);

    /**
     * Подзадача 4 аудита 02.11.2026 (reuse-detection): отозвать ВСЕ активные
     * refresh-токены пользователя (семья) — применяется при предъявлении уже
     * отозванного токена (кража) и при гонке ротаций. Возвращает число отозванных.
     */
    @Modifying
    @Query("UPDATE RefreshToken rt SET rt.revokedAt = :now "
            + "WHERE rt.user.id = :userId AND rt.revokedAt IS NULL")
    int revokeAllByUserId(Long userId, LocalDateTime now);

    /**
     * Атомарная ротация: пометить токен отозванным и связать с новым ТОЛЬКО если
     * он ещё активен (revokedAt IS NULL берёт блокировку строки). 0 обновлённых
     * строк — токен уже ротирован параллельным запросом (гонка) или отозван.
     */
    @Modifying
    @Query("UPDATE RefreshToken rt SET rt.revokedAt = :now, rt.replacedById = :newTokenId "
            + "WHERE rt.tokenHash = :tokenHash AND rt.revokedAt IS NULL")
    int revokeForRotation(String tokenHash, Long newTokenId, LocalDateTime now);
}

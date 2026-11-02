package com.provision.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "refresh_tokens")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RefreshToken {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "token_hash", nullable = false, unique = true, length = 255)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * Подзадача 4 аудита 02.11.2026 (V36): токен отозван — ротирован (заменён новым)
     * или отозван вручную/по reuse-detection. Не null = предъявление токена —
     * сигнал кражи (refresh replay), семья токенов пользователя отзывается.
     */
    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    /** V36: id токена, выданного взамен этого при ротации (цепочка ротаций). */
    @Column(name = "replaced_by_id")
    private Long replacedById;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}

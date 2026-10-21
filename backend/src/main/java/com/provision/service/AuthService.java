package com.provision.service;

import com.provision.dto.auth.*;
import com.provision.entity.RefreshToken;
import com.provision.entity.User;
import com.provision.entity.UserRole;
import com.provision.exception.ConflictException;
import com.provision.exception.NotFoundException;
import com.provision.exception.UnauthorizedException;
import com.provision.repository.RefreshTokenRepository;
import com.provision.repository.UserRepository;
import com.provision.security.JwtService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    @Transactional
    public UserResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new ConflictException("Email already registered: " + request.email());
        }

        User user = User.builder()
                .email(request.email())
                .passwordHash(passwordEncoder.encode(request.password()))
                .firstName(request.firstName())
                .lastName(request.lastName())
                .role(UserRole.USER)
                .build();

        user = userRepository.save(user);
        log.info("Registered new user: {}", user.getEmail());

        return toUserResponse(user);
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.email())
                .orElseThrow(() -> new UnauthorizedException("Invalid email or password"));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new UnauthorizedException("Invalid email or password");
        }

        String accessToken = jwtService.generateAccessToken(user);
        String refreshToken = generateRefreshToken();

        // Сохраняем refresh token (хэш)
        saveRefreshToken(user, refreshToken);

        log.info("User logged in: {}", user.getEmail());
        return new AuthResponse(accessToken, refreshToken);
    }

    @Transactional
    public AuthResponse refreshTokens(RefreshTokenRequest request) {
        String tokenHash = hashToken(request.refreshToken());
        RefreshToken storedToken = refreshTokenRepository.findByTokenHash(tokenHash)
                .orElseThrow(() -> new UnauthorizedException("Invalid refresh token"));

        if (storedToken.getExpiresAt().isBefore(LocalDateTime.now())) {
            refreshTokenRepository.delete(storedToken);
            throw new UnauthorizedException("Refresh token expired");
        }

        User user = storedToken.getUser();
        String newAccessToken = jwtService.generateAccessToken(user);
        String newRefreshToken = generateRefreshToken();

        // Удаляем старый и сохраняем новый
        refreshTokenRepository.delete(storedToken);
        saveRefreshToken(user, newRefreshToken);

        return new AuthResponse(newAccessToken, newRefreshToken);
    }

    @Transactional
    public void logout(LogoutRequest request) {
        String tokenHash = hashToken(request.refreshToken());
        refreshTokenRepository.findByTokenHash(tokenHash)
                .ifPresent(refreshTokenRepository::delete);
        log.info("User logged out");
    }

    @Transactional(readOnly = true)
    public UserResponse getCurrentUser(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found"));
        return toUserResponse(user);
    }

    private void saveRefreshToken(User user, String refreshToken) {
        String tokenHash = hashToken(refreshToken);
        RefreshToken token = RefreshToken.builder()
                .user(user)
                .tokenHash(tokenHash)
                .expiresAt(LocalDateTime.now().plusDays(7))
                .build();
        refreshTokenRepository.save(token);
    }

    private String generateRefreshToken() {
        return UUID.randomUUID().toString();
    }

    private String hashToken(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                hexString.append(String.format("%02x", 0xff & b));
            }
            return hexString.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 algorithm not found", e);
        }
    }

    private UserResponse toUserResponse(User user) {
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getFirstName(),
                user.getLastName(),
                user.getRole()
        );
    }
}

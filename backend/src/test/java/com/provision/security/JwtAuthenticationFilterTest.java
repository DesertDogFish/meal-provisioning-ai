package com.provision.security;

import com.provision.entity.User;
import com.provision.entity.UserRole;
import com.provision.repository.UserRepository;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Unit-тесты JwtAuthenticationFilter (аудит 29.10.2026, подзадача 7):
 * битый/просроченный JWT больше не «проглатывается» молча — SecurityContext
 * очищается, запрос продолжается анонимным (401 для защищённых эндпоинтов
 * выдаёт authenticationEntryPoint; контракт SEC-06 сохраняется).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("JwtAuthenticationFilter: явный отказ и очистка контекста (аудит 7)")
class JwtAuthenticationFilterTest {

    @Mock
    private JwtService jwtService;
    @Mock
    private UserRepository userRepository;

    private JwtAuthenticationFilter filter;

    @BeforeEach
    void setUp() {
        filter = new JwtAuthenticationFilter(jwtService, userRepository);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private User user() {
        return User.builder().id(1L).email("user@example.com")
                .firstName("Test").lastName("User").role(UserRole.USER).build();
    }

    private MockHttpServletRequest requestWithBearer(String token) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/trips");
        request.addHeader("Authorization", "Bearer " + token);
        return request;
    }

    @Test
    @DisplayName("валидный токен — аутентификация установлена с ROLE из БД")
    void validToken_setsAuthentication() throws Exception {
        when(jwtService.extractUsername("good-token")).thenReturn("user@example.com");
        when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(user()));
        when(jwtService.isTokenValid(org.mockito.ArgumentMatchers.eq("good-token"),
                org.mockito.ArgumentMatchers.any(User.class))).thenReturn(true);

        MockFilterChain chain = new MockFilterChain();
        filter.doFilter(requestWithBearer("good-token"), new MockHttpServletResponse(), chain);

        var auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth).isNotNull();
        assertThat(auth.getAuthorities()).extracting("authority").containsExactly("ROLE_USER");
        assertThat(chain.getRequest()).isNotNull(); // запрос прошёл дальше
    }

    @Test
    @DisplayName("битый токен — контекст очищен, запрос продолжает цепочку анонимным")
    void invalidToken_clearsContextAndContinues() throws Exception {
        // имитируем «грязный» контекст (например, leftover в переиспользованном потоке)
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("stale", null, List.of()));
        when(jwtService.extractUsername(anyString())).thenThrow(new JwtException("bad signature"));

        MockFilterChain chain = new MockFilterChain();
        filter.doFilter(requestWithBearer("broken-token"), new MockHttpServletResponse(), chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        assertThat(chain.getRequest()).isNotNull();
    }

    @Test
    @DisplayName("просроченный токен — контекст очищен, аутентификация не устанавливается")
    void expiredToken_clearsContext() throws Exception {
        when(jwtService.extractUsername(anyString()))
                .thenThrow(new ExpiredJwtException(null, null, "token expired"));

        MockFilterChain chain = new MockFilterChain();
        filter.doFilter(requestWithBearer("expired-token"), new MockHttpServletResponse(), chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        assertThat(chain.getRequest()).isNotNull();
    }

    @Test
    @DisplayName("токен валиден по подписи, но пользователь не найден — аутентификации нет")
    void unknownUser_noAuthentication() throws Exception {
        when(jwtService.extractUsername("orphan-token")).thenReturn("ghost@example.com");
        when(userRepository.findByEmail("ghost@example.com")).thenReturn(Optional.empty());

        MockFilterChain chain = new MockFilterChain();
        filter.doFilter(requestWithBearer("orphan-token"), new MockHttpServletResponse(), chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verify(jwtService, never()).isTokenValid(anyString(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    @DisplayName("нет Authorization-заголовка — фильтр прозрачен, jwtService не трогается")
    void noHeader_passThrough() throws Exception {
        MockFilterChain chain = new MockFilterChain();
        filter.doFilter(new MockHttpServletRequest("GET", "/api/v1/meta"),
                new MockHttpServletResponse(), chain);

        verifyNoInteractions(jwtService, userRepository);
        assertThat(chain.getRequest()).isNotNull();
    }
}

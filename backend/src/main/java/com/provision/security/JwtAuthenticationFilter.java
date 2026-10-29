package com.provision.security;

import com.provision.entity.User;
import com.provision.repository.UserRepository;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final UserRepository userRepository;

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        final String authHeader = request.getHeader("Authorization");
        
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        final String jwt = authHeader.substring(7);

        // FIX (подзадача 7 аудита, plans/2026-10-29-full-audit.md): раньше любой сбой
        // разбора глотался одним catch(Exception)+log.warn и запрос шёл дальше как
        // anonymous. Теперь SecurityContext явно очищается, а причина отказа логируется
        // (R10) с уровнем по типу ошибки; защищённые эндпоинты отвечают 401 через
        // authenticationEntryPoint (контракт SEC-06/AUTH-06 не меняется).
        try {
            final String userEmail = jwtService.extractUsername(jwt);

            if (userEmail != null && SecurityContextHolder.getContext().getAuthentication() == null) {
                User user = userRepository.findByEmail(userEmail).orElse(null);

                if (user != null && jwtService.isTokenValid(jwt, user)) {
                    var authorities = List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()));
                    var authToken = new UsernamePasswordAuthenticationToken(user, null, authorities);
                    authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(authToken);
                } else {
                    log.debug("JWT not accepted for principal (user missing or token invalid): {} {}",
                            request.getMethod(), request.getRequestURI());
                }
            }
        } catch (ExpiredJwtException e) {
            SecurityContextHolder.clearContext();
            log.warn("Expired JWT rejected: {} {} — {}",
                    request.getMethod(), request.getRequestURI(), e.getMessage());
        } catch (JwtException | IllegalArgumentException e) {
            SecurityContextHolder.clearContext();
            log.error("Invalid JWT rejected: {} {} — {}",
                    request.getMethod(), request.getRequestURI(), e.getMessage());
        }

        filterChain.doFilter(request, response);
    }
}

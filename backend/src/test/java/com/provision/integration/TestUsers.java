package com.provision.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.provision.dto.auth.LoginRequest;
import com.provision.dto.auth.RegisterRequest;
import com.provision.entity.User;
import com.provision.entity.UserRole;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;

/**
 * Хелпер интеграционных тестов: детерминированно создаёт пользователей и выдаёт JWT.
 *
 * Раньше ADMIN создавался с захардкоженным BCrypt-хэшем «password123», который на самом
 * деле не соответствует этому паролю (это хэш из Spring-доков, секрет — "password").
 * Логин под таким админом давал 401, и @BeforeEach в Security/Conflict падал целиком.
 * Теперь все пользователи заводятся через реальный /auth/register (пароль хэшируется
 * тем же PasswordEncoder, что и при проверке) либо с явно закодированным хэшем.
 */
public final class TestUsers {

    public static final String PASSWORD = "password123";

    private TestUsers() {}

    /** Регистрирует обычного USER через API и возвращает его accessToken. */
    public static String registerUser(MockMvc mockMvc, ObjectMapper om, String email) throws Exception {
        return register(mockMvc, om, new RegisterRequest(email, PASSWORD, "Test", email.substring(0, email.indexOf('@'))));
    }

    /** Регистрирует пользователя через API с произвольным RegisterRequest. */
    public static String register(MockMvc mockMvc, ObjectMapper om, RegisterRequest request) throws Exception {
        MvcResult result = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(om.writeValueAsString(request)))
                .andReturn();
        int status = result.getResponse().getStatus();
        if (status != 201 && status != 409) {
            throw new IllegalStateException("register failed, status=" + status + ", body=" + result.getResponse().getContentAsString());
        }
        return login(mockMvc, om, request.email(), request.password());
    }

    /** Логинит существующего пользователя и возвращает accessToken. */
    public static String login(MockMvc mockMvc, ObjectMapper om, String email, String password) throws Exception {
        MvcResult result = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(om.writeValueAsString(new LoginRequest(email, password))))
                .andReturn();
        if (result.getResponse().getStatus() != 200) {
            throw new IllegalStateException("login failed for " + email + ", status=" + result.getResponse().getStatus()
                    + ", body=" + result.getResponse().getContentAsString());
        }
        Map<?, ?> tokens = om.readValue(result.getResponse().getContentAsString(), Map.class);
        return (String) tokens.get("accessToken");
    }

    /** Создаёт ADMIN напрямую в БД с корректным хэшем PASSWORD и возвращает accessToken. */
    public static String createAdmin(MockMvc mockMvc, ObjectMapper om,
                                     com.provision.repository.UserRepository userRepository,
                                     String email) {
        try {
            var encoder = new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder();
            User admin = User.builder()
                    .email(email)
                    .passwordHash(encoder.encode(PASSWORD))
                    .firstName("Admin")
                    .lastName("Test")
                    .role(UserRole.ADMIN)
                    .build();
            if (!userRepository.findByEmail(email).isPresent()) {
                userRepository.save(admin);
            }
            return login(mockMvc, om, email, PASSWORD);
        } catch (Exception e) {
            throw new IllegalStateException("cannot create admin " + email, e);
        }
    }
}

package com.provision.config;

import com.provision.entity.User;
import com.provision.entity.UserRole;
import com.provision.repository.UserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Unit-тесты DevDataInitializer (аудит 29.10.2026, подзадача 1, CRITICAL):
 * хардкод provision123 устранён — пароли из DevProperties (env ADMIN_PASSWORD /
 * DEMO_USER_PASSWORD), при пустом значении генерируется случайный (SecureRandom).
 * Сид по-прежнему хэширует через PasswordEncoder (BCrypt в реальном контексте).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("DevDataInitializer: демо-пароли из env/генерация (аудит 1)")
class DevDataInitializerTest {

    @Mock
    private UserRepository userRepository;
    @Mock
    private PasswordEncoder passwordEncoder;

    private final DevDataInitializer initializer = new DevDataInitializer();

    private CommandLineRunner runner(DevProperties props) {
        return initializer.seedDevUsers(userRepository, passwordEncoder, props);
    }

    @Test
    @DisplayName("сид выключен (SEED_DEMO_USERS != true) — репозиторий не трогается")
    void seedingDisabled_noInteraction() throws Exception {
        DevProperties props = new DevProperties();
        props.setSeedDemoUsers(false);

        runner(props).run();

        verifyNoInteractions(userRepository, passwordEncoder);
    }

    @Test
    @DisplayName("пароли из env — encode() получает ровно их, пользователи созданы")
    void configuredPasswords_used() throws Exception {
        DevProperties props = new DevProperties();
        props.setSeedDemoUsers(true);
        props.setAdminPassword("adm-pass-from-env");
        props.setUserPassword("usr-pass-from-env");
        when(userRepository.findByEmail(anyString())).thenReturn(Optional.empty());
        when(passwordEncoder.encode(anyString())).thenAnswer(inv -> "BCRYPT(" + inv.getArgument(0) + ")");

        runner(props).run();

        ArgumentCaptor<String> rawPasswords = ArgumentCaptor.forClass(String.class);
        verify(passwordEncoder, org.mockito.Mockito.times(2)).encode(rawPasswords.capture());
        assertThat(rawPasswords.getAllValues())
                .containsExactly("adm-pass-from-env", "usr-pass-from-env");

        ArgumentCaptor<User> users = ArgumentCaptor.forClass(User.class);
        verify(userRepository, org.mockito.Mockito.times(2)).save(users.capture());
        assertThat(users.getAllValues())
                .extracting(User::getEmail)
                .containsExactly("admin@provision.app", "user@provision.app");
        assertThat(users.getAllValues().get(0).getRole()).isEqualTo(UserRole.ADMIN);
        assertThat(users.getAllValues().get(1).getRole()).isEqualTo(UserRole.USER);
        assertThat(users.getAllValues()).allSatisfy(u ->
                assertThat(u.getPasswordHash()).startsWith("BCRYPT("));
    }

    @Test
    @DisplayName("пустой ADMIN_PASSWORD — генерируется случайный пароль (не provision123)")
    void blankPassword_generatedRandom() throws Exception {
        DevProperties props = new DevProperties();
        props.setSeedDemoUsers(true);
        props.setAdminPassword("");   // env не задан
        props.setUserPassword(null);  // и так тоже
        when(userRepository.findByEmail(anyString())).thenReturn(Optional.empty());
        when(passwordEncoder.encode(anyString())).thenAnswer(inv -> "BCRYPT(" + inv.getArgument(0) + ")");

        runner(props).run();

        ArgumentCaptor<String> rawPasswords = ArgumentCaptor.forClass(String.class);
        verify(passwordEncoder, org.mockito.Mockito.times(2)).encode(rawPasswords.capture());
        assertThat(rawPasswords.getAllValues())
                .allSatisfy(p -> assertThat(p)
                        .isNotBlank()
                        .isNotEqualTo("provision123")
                        .hasSize(16)
                        .matches("[A-Za-z2-9]+"));
        assertThat(rawPasswords.getAllValues().get(0))
                .isNotEqualTo(rawPasswords.getAllValues().get(1)); // независимая генерация
    }

    @Test
    @DisplayName("существующий пользователь не пересоздаётся (сид идемпотентен)")
    void existingUser_skipped() throws Exception {
        DevProperties props = new DevProperties();
        props.setSeedDemoUsers(true);
        props.setAdminPassword("adm");
        props.setUserPassword("usr");
        when(userRepository.findByEmail("admin@provision.app"))
                .thenReturn(Optional.of(User.builder().email("admin@provision.app").build()));
        when(userRepository.findByEmail("user@provision.app")).thenReturn(Optional.empty());
        when(passwordEncoder.encode(anyString())).thenAnswer(inv -> "BCRYPT");

        runner(props).run();

        ArgumentCaptor<User> users = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(users.capture());
        assertThat(users.getValue().getEmail()).isEqualTo("user@provision.app");
        verify(passwordEncoder, never()).encode("adm");
    }

    @Test
    @DisplayName("generateRandomPassword: 16 символов, безопасный алфавит, без повторов")
    void randomPasswordShape() {
        String a = DevDataInitializer.generateRandomPassword();
        String b = DevDataInitializer.generateRandomPassword();

        assertThat(a).hasSize(16).matches("[A-HJ-NP-Za-km-z2-9]+");
        assertThat(b).hasSize(16);
        assertThat(a).isNotEqualTo(b);
    }
}

package com.provision.config;

import com.provision.entity.User;
import com.provision.entity.UserRole;
import com.provision.repository.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
@Profile("dev")
public class DevDataInitializer {

    @Bean
    CommandLineRunner seedDevUsers(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        return args -> {
            String seedEnabled = System.getenv("SEED_DEMO_USERS");
            if (!"true".equalsIgnoreCase(seedEnabled)) {
                System.out.println("Demo users seeding disabled (set SEED_DEMO_USERS=true to enable)");
                return;
            }

            seedUser(userRepository, passwordEncoder, "admin@provision.app", "provision123", "Admin User", UserRole.ADMIN);
            seedUser(userRepository, passwordEncoder, "user@provision.app", "provision123", "Regular User", UserRole.USER);
        };
    }

    private void seedUser(UserRepository userRepository, PasswordEncoder passwordEncoder,
                          String email, String password, String name, UserRole role) {
        if (userRepository.findByEmail(email).isEmpty()) {
            User user = User.builder()
                    .email(email)
                    .passwordHash(passwordEncoder.encode(password))
                    .firstName(name)
                    .lastName("")
                    .role(role)
                    .build();
            userRepository.save(user);
            System.out.println("Created demo user: " + email);
        }
    }
}

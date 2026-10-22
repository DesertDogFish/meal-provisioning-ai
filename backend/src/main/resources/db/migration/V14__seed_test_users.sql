-- V14__seed_test_users.sql
-- Добавление тестовых пользователей для локальной разработки и тестирования.
-- Пароль для обоих пользователей в plaintext: provision123
-- Хеш сгенерирован через BCrypt (strength 10).
-- Примечание: роли/пароли также принудительно выставляются в V15__update_test_users_passwords.sql,
-- т.к. при ON CONFLICT DO NOTHING ранее существовавшие строки здесь не обновляются.

INSERT INTO users (email, password_hash, first_name, last_name, role, created_at, updated_at)
VALUES
    ('admin@provision.app', '$2a$10$/5FmOEvwdoARHm0657e1nOtTaJBb3VmR0XolXpXt/s3EtZfspnCOO', 'Test', 'Admin', 'ADMIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('user@provision.app', '$2a$10$/5FmOEvwdoARHm0657e1nOtTaJBb3VmR0XolXpXt/s3EtZfspnCOO', 'Test', 'User', 'USER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (email) DO NOTHING;

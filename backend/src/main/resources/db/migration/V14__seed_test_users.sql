-- V14__seed_test_users.sql
-- Добавление тестовых пользователей для локальной разработки и тестирования.
-- Пароль для обоих пользователей в plaintext: provision123
-- Хеш сгенерирован через BCrypt (strength 10).

INSERT INTO users (email, password_hash, first_name, last_name, role, created_at, updated_at)
VALUES
    ('admin@provision.app', '$2a$10$hQT5AXLGMIP8SGAh2pZkbezsvgBBSZIF.qp8G0d4304Ad44ggelDe', 'Test', 'Admin', 'ADMIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('user@provision.app', '$2a$10$hQT5AXLGMIP8SGAh2pZkbezsvgBBSZIF.qp8G0d4304Ad44ggelDe', 'Test', 'User', 'USER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (email) DO NOTHING;

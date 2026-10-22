-- V15__update_test_users_passwords.sql
-- Обновление паролей и ролей тестовых пользователей (гарантированно применяется
-- даже если строки уже существовали до V14 — там использовался ON CONFLICT DO NOTHING).
-- Пароль для обоих пользователей в plaintext: provision123
-- Хеш сгенерирован через BCrypt (strength 10), проверен bcrypt.checkpw -> True.

UPDATE users
SET password_hash = '$2a$10$/5FmOEvwdoARHm0657e1nOtTaJBb3VmR0XolXpXt/s3EtZfspnCOO',
    role = 'ADMIN'
WHERE email = 'admin@provision.app';

UPDATE users
SET password_hash = '$2a$10$/5FmOEvwdoARHm0657e1nOtTaJBb3VmR0XolXpXt/s3EtZfspnCOO',
    role = 'USER'
WHERE email = 'user@provision.app';

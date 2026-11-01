-- V33__trip_checklist_bought_fk_cascade.sql
-- KB-15 fix (MAJOR, аудит): V32 создала ingredient_id REFERENCES ingredients(id)
-- БЕЗ ON DELETE CASCADE, поэтому удаление ингредиента с отметкой «взято» падало
-- на FK-нарушении -> GlobalExceptionHandler отдавал 409 с нерелевантным текстом.
-- Приводим поведение к остальным trip-таблицам (V6/V7/V19): ON DELETE CASCADE.
-- V32 не правим (Flyway checksum), поэтому пересоздаём constraint отдельной миграцией.
-- trip_id уже имеет ON DELETE CASCADE в V32 — здесь не трогаем.

ALTER TABLE trip_checklist_bought
    DROP CONSTRAINT IF EXISTS trip_checklist_bought_ingredient_id_fkey;

ALTER TABLE trip_checklist_bought
    ADD CONSTRAINT trip_checklist_bought_ingredient_id_fkey
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE;

-- V29__reunit_packing_and_new_emis_links.sql
-- Решения владельца от 29.10.2026 по разделам «Не привязано» (A, C) и «Сверка цен» (3)
-- из plans/done/2026-10-28-emis-local-copy-and-product-linking.md:
--
--   1) «Антисептик для рук 100 мл» (PCS, piece_weight_g=100) — цена ЕМИСС 8016 указана
--      ЗА 100 мл, а наша штука и есть 100 мл, поэтому пересчёт возможен 1:1 → привязываем.
--      Привязку обеспечивает новое правило конвертера «плотность ≈ 1» (EmisUnit.pricePerUnit:
--      piece_weight_g штучного продукта читается как миллилитры, если цена ряда за объём).
--   2) «Туалетная бумага, 4 рулона» — ЕМИСС 6502 даёт цену ЗА РУЛОН, поэтому наш продукт
--      переводится на штучный рулон: имя по номенклатуре ЕМИСС, piece_weight_g 300/4,
--      история цен делится на 4 (иначе в ряду осталась бы цена упаковки из 4 рулонов).
--   3) «Газовый баллон резьбовой 220 г» и «Газ сжиженный в баллонах, 50 л» (9453) — РАЗНЫЕ
--      объекты: бытовой 50-литровый баллон против туристического резьбового 220 г. Цену
--      для такой пары считать нельзя (газ в маленькой фасовке кратно дороже), привязки нет.
--   4) Плотность принимается равной 1 по всему приложению: 1 кг ≈ 1 л, масса и объём
--      приводятся один к одному. Правило живёт в коде (EmisUnit), изменений схемы не требует.
--   5) «Солнцезащитный крем SPF50 100 мл» считается как крем для лица → ЕМИСС 5311
--      «Крем для лица, 100 г (100 мл)»: наша штука 100 (г/мл) = единица наблюдения ЕМИСС.
--   6) Фасовка приведена к номенклатуре ЕМИСС там, где она расходилась:
--      «Влажные салфетки, упаковка 100 шт» → «Салфетки влажные, упаковка 20 шт.» (6505),
--      «Спички влагозащищённые (20 шт)» → «Спички, коробок» (5701). piece_weight_g и
--      история цен пересчитаны на новую фасовку (÷5 и ÷20).
--
--   Соус соевый 100 мл и Уксус 9% 100 мл владелец решил НЕ привязывать: в классификаторе
--   есть только «Кетчуп, кг» (1305) и «Майонез, кг» (2001) — это другой товар по сути,
--   цена ведётся вручную (emis_code = NULL, priceSyncStatus = NOT_LINKED).
--   Кофе «3 в 1» и сублиматы остаются на ценах своих категорий (решение «оставить как есть»):
--   их фасовка уже совпадает с ЕМИСС, расхождение даёт форма продукта, а не упаковка.
--
-- Касается ТОЛЬКО глобальных строк каталога (trip_id IS NULL): снимки каталога походов —
-- неизменяемая история, их имена, фасовка и цены не трогаются (V20).
-- Повторный прогон безопасен: пересчёт цен и фасовки выполняется, ПОКА продукт ещё в старой
-- фасовке (условие по piece_weight_g), поэтому дважды не делится; привязки и имена —
-- идемпотентные UPDATE по code.

-- 1) Туалетная бумага: упаковка 4 рулона → ОДИН рулон (фасовка позиции ЕМИСС 6502).
--    Сначала пересчитываем историю цен (24 среза V17), пока фасовка ещё старая.
UPDATE ingredient_prices p
   SET price_per_unit = ROUND(p.price_per_unit / 4, 2)
  FROM ingredients i
 WHERE i.id = p.ingredient_id
   AND i.code = 'toilet_paper' AND i.trip_id IS NULL
   AND i.piece_weight_g = 300.00;

UPDATE ingredients
   SET name = 'Бумага туалетная, рулон',
       piece_weight_g = 75.00,   -- 300 г упаковки / 4 рулона
       emis_code = '6502',       -- Бумага туалетная, рулон (COUNT, amount=1)
       updated_at = NOW()
 WHERE code = 'toilet_paper' AND trip_id IS NULL;

-- 2) Влажные салфетки: упаковка 100 шт → упаковка 20 шт (фасовка позиции ЕМИСС 6505).
UPDATE ingredient_prices p
   SET price_per_unit = ROUND(p.price_per_unit / 5, 2)
  FROM ingredients i
 WHERE i.id = p.ingredient_id
   AND i.code = 'wipes_wet' AND i.trip_id IS NULL
   AND i.piece_weight_g = 350.00;

UPDATE ingredients
   SET name = 'Салфетки влажные, упаковка 20 шт.',
       piece_weight_g = 70.00,   -- 350 г упаковки / 5 (100 шт → 20 шт)
       emis_code = '6505',       -- Салфетки влажные, упаковка 20 шт. (COUNT, amount=1)
       updated_at = NOW()
 WHERE code = 'wipes_wet' AND trip_id IS NULL;

-- 3) Спички: блок из 20 коробков → ОДИН коробок (фасовка позиции ЕМИСС 5701).
--    Прежние 30 г на блок из 20 коробков физически неверны (блок весит 200–300 г);
--    для одного коробка ставим реальную массу ~15 г. На цену не влияет: позиция ЕМИСС
--    штучная (COUNT), piece_weight_g участвует только в расчёте ккал (у спичек их нет).
UPDATE ingredient_prices p
   SET price_per_unit = ROUND(p.price_per_unit / 20, 2)
  FROM ingredients i
 WHERE i.id = p.ingredient_id
   AND i.code = 'matches_waterproof' AND i.trip_id IS NULL
   AND i.piece_weight_g = 30.00;

UPDATE ingredients
   SET name = 'Спички, коробок',
       piece_weight_g = 15.00,
       emis_code = '5701',       -- Спички, коробок (COUNT, amount=1) — привязка была и в V28
       updated_at = NOW()
 WHERE code = 'matches_waterproof' AND trip_id IS NULL;

-- 4) Новые привязки: штука продукта совпадает с единицей наблюдения ЕМИСС.
--    Антисептик — имя приведено к формулировке ЕМИСС (как в V28 для 7 продуктов).
UPDATE ingredients
   SET name = 'Антисептик для рук, 100 мл',
       emis_code = '8016',       -- Антисептик для рук, 100 мл (VOLUME, amount=100)
       updated_at = NOW()
 WHERE code = 'antiseptic' AND trip_id IS NULL;

UPDATE ingredients
   SET emis_code = '5311',       -- Крем для лица, 100 г (100 мл) (MASS, amount=100)
       updated_at = NOW()
 WHERE code = 'sunscreen' AND trip_id IS NULL;

-- 5) Явный отказ от привязки (решение владельца): цена ведётся вручную.
--    UPDATE нужен как защита: если код был проставлен руками через UI, снимаем его.
UPDATE ingredients
   SET emis_code = NULL, updated_at = NOW()
 WHERE trip_id IS NULL
   AND code IN ('gas_canister', 'soy_sauce', 'vinegar')
   AND emis_code IS NOT NULL;

-- name_norm пересчитывается формулой V8, иначе проверка дублей existsByNameNormAndUnit()
-- и частичный уникальный индекс uniq_product_identity_global сработали бы по старому ключу.
UPDATE ingredients SET name_norm =
  lower(btrim(regexp_replace(replace(replace(name, 'Ё', 'Е'), 'ё', 'е'), '\s+', ' ', 'g')))
 WHERE trip_id IS NULL;

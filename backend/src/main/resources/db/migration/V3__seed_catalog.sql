-- V3__seed_catalog.sql
-- Сид-данные: 60 компонентов + цены + 61 блюдо

-- Вставляем компоненты напрямую
INSERT INTO ingredients (code, name, unit, category) VALUES
 ('oat_flakes','Овсяные хлопья','KG','Крупы'),
 ('millet','Пшено','KG','Крупы'),
 ('buckwheat','Гречка','KG','Крупы'),
 ('rice','Рис','KG','Крупы'),
 ('pasta','Макароны','KG','Крупы'),
 ('semolina','Манная крупа','KG','Крупы'),
 ('couscous','Кускус','KG','Крупы'),
 ('bulgur','Булгур','KG','Крупы'),
 ('lentils','Чечевица','KG','Бобовые'),
 ('peas','Горох колотый','KG','Бобовые'),
 ('flour','Мука пшеничная','KG','Бакалея'),
 ('powdered_milk','Сухое молоко','KG','Молочные'),
 ('egg_powder','Яичный порошок','KG','Бакалея'),
 ('mash_powder','Пюре быстрорастворимое','KG','Овощи'),
 ('sugar','Сахар','KG','Бакалея'),
 ('salt','Соль','KG','Бакалея'),
 ('spices','Специи (микс)','KG','Бакалея'),
 ('dried_fruits','Сухофрукты (микс)','KG','Сухофрукты'),
 ('raisins','Изюм','KG','Сухофрукты'),
 ('apricots','Курага','KG','Сухофрукты'),
 ('prunes','Чернослив','KG','Сухофрукты'),
 ('walnuts','Орехи грецкие','KG','Орехи'),
 ('peanuts','Арахис','KG','Орехи'),
 ('chocolate','Шоколад','KG','Сладости'),
 ('halva','Халва','KG','Сладости'),
 ('honey','Мёд','KG','Сладости'),
 ('cocoa','Какао','KG','Напитки'),
 ('tea','Чай чёрный','KG','Напитки'),
 ('coffee','Кофе растворимый','KG','Напитки'),
 ('cheese','Сыр твёрдый','KG','Молочные'),
 ('sausage','Колбаса сырокопчёная','KG','Мясо'),
 ('salo','Сало','KG','Мясо'),
 ('butter','Масло сливочное','KG','Молочные'),
 ('sunflower_oil','Масло подсолнечное','L','Масла'),
 ('soy_meat','Соевый текстурат','KG','Бобовые'),
 ('dried_mushrooms','Грибы сушёные','KG','Грибы'),
 ('dried_tomatoes','Томаты сушёные','KG','Овощи'),
 ('dried_herbs','Зелень сушёная','KG','Бакалея'),
 ('onion','Лук репчатый','KG','Овощи'),
 ('carrot','Морковь','KG','Овощи'),
 ('potato_dried','Картофель сублимированный','KG','Овощи'),
 ('garlic','Чеснок','KG','Овощи'),
 ('lemon','Лимон','PCS','Фрукты'),
 ('beef_stew','Тушенка говяжья 325 г','PCS','Консервы'),
 ('chicken_stew','Тушенка куриная 325 г','PCS','Консервы'),
 ('fish_canned','Рыбные консервы 250 г','PCS','Консервы'),
 ('pate','Паштет мясной 100 г','PCS','Консервы'),
 ('condensed_milk','Сгущёнка 380 г','PCS','Консервы'),
 ('processed_cheese','Сыр плавленый 90 г','PCS','Молочные'),
 ('beans_canned','Фасоль консерв. 400 г','PCS','Консервы'),
 ('instant_noodles','Лапша б/п 60 г','PCS','Крупы'),
 ('crispbread','Хлебцы зерновые 10 г','PCS','Хлеб'),
 ('galetas','Галеты армейские 25 г','PCS','Хлеб'),
 ('croutons','Сухарики 50 г','PCS','Хлеб'),
 ('cookies','Печенье овсяное','KG','Сладости'),
 ('soup_borsch','Борщ сублимированный','KG','Супы'),
 ('soup_chicken','Суп сублим. куриный с лапшой','KG','Супы'),
 ('water','Вода питьевая','L','Жидкости'),
 ('tomato_paste','Томатная паста','KG','Овощи'),
 ('kozinaki','Козинаки','KG','Сладости');

-- Вставляем цены на 01.01.2026
INSERT INTO ingredient_prices (ingredient_id, effective_from, price_per_unit, currency)
SELECT i.id, DATE '2026-01-01', 
       CASE i.code
           WHEN 'oat_flakes' THEN 150 WHEN 'millet' THEN 140 WHEN 'buckwheat' THEN 180
           WHEN 'rice' THEN 160 WHEN 'pasta' THEN 120 WHEN 'semolina' THEN 110
           WHEN 'couscous' THEN 320 WHEN 'bulgur' THEN 260 WHEN 'lentils' THEN 240
           WHEN 'peas' THEN 130 WHEN 'flour' THEN 90 WHEN 'powdered_milk' THEN 650
           WHEN 'egg_powder' THEN 900 WHEN 'mash_powder' THEN 400 WHEN 'sugar' THEN 110
           WHEN 'salt' THEN 60 WHEN 'spices' THEN 1200 WHEN 'dried_fruits' THEN 480
           WHEN 'raisins' THEN 350 WHEN 'apricots' THEN 520 WHEN 'prunes' THEN 560
           WHEN 'walnuts' THEN 900 WHEN 'peanuts' THEN 420 WHEN 'chocolate' THEN 1400
           WHEN 'halva' THEN 700 WHEN 'honey' THEN 800 WHEN 'cocoa' THEN 600
           WHEN 'tea' THEN 1200 WHEN 'coffee' THEN 2500 WHEN 'cheese' THEN 850
           WHEN 'sausage' THEN 1100 WHEN 'salo' THEN 700 WHEN 'butter' THEN 950
           WHEN 'sunflower_oil' THEN 180 WHEN 'soy_meat' THEN 550 WHEN 'dried_mushrooms' THEN 2200
           WHEN 'dried_tomatoes' THEN 900 WHEN 'dried_herbs' THEN 1500 WHEN 'onion' THEN 70
           WHEN 'carrot' THEN 60 WHEN 'potato_dried' THEN 450 WHEN 'garlic' THEN 400
           WHEN 'lemon' THEN 40 WHEN 'beef_stew' THEN 210 WHEN 'chicken_stew' THEN 190
           WHEN 'fish_canned' THEN 160 WHEN 'pate' THEN 95 WHEN 'condensed_milk' THEN 150
           WHEN 'processed_cheese' THEN 65 WHEN 'beans_canned' THEN 120 WHEN 'instant_noodles' THEN 45
           WHEN 'crispbread' THEN 6 WHEN 'galetas' THEN 10 WHEN 'croutons' THEN 35
           WHEN 'cookies' THEN 400 WHEN 'soup_borsch' THEN 1800 WHEN 'soup_chicken' THEN 1700
           WHEN 'water' THEN 45 WHEN 'tomato_paste' THEN 250 WHEN 'kozinaki' THEN 800
       END,
       'RUB'
FROM ingredients i
WHERE i.code IS NOT NULL;

-- Вставляем рецепты напрямую
-- ЗАВТРАКИ (15)
INSERT INTO recipes (name, meal_type, category, cook_minutes, calories_per_serving, base_servings, source) VALUES
 ('Овсянка на воде с сухофруктами','BREAKFAST','КАШИ',10,320,1,'MANUAL'),
 ('Овсянка на сухом молоке','BREAKFAST','КАШИ',10,360,1,'MANUAL'),
 ('Мюсли-каша с орехами и изюмом','BREAKFAST','КАШИ',8,410,1,'MANUAL'),
 ('Пшённая каша с курагой','BREAKFAST','КАШИ',25,380,1,'MANUAL'),
 ('Рисовая каша на сухом молоке','BREAKFAST','КАШИ',25,370,1,'MANUAL'),
 ('Манная каша с изюмом','BREAKFAST','КАШИ',15,350,1,'MANUAL'),
 ('Каша Дружба','BREAKFAST','КАШИ',25,365,1,'MANUAL'),
 ('Гороховая каша с маслом','BREAKFAST','КАШИ',30,340,1,'MANUAL'),
 ('Гречневая каша с маслом','BREAKFAST','КАШИ',20,350,1,'MANUAL'),
 ('Омлет из яичного порошка с салом','BREAKFAST','ВТОРОЕ',15,420,1,'MANUAL'),
 ('Походный омлет с сыром','BREAKFAST','ВТОРОЕ',15,400,1,'MANUAL'),
 ('Блины походные','BREAKFAST','ВЫПЕЧКА',25,430,1,'MANUAL'),
 ('Хлебцы с сыром и колбасой','BREAKFAST','БУТЕРБРОДЫ',0,390,1,'MANUAL'),
 ('Хлебцы с мёдом и орехами','BREAKFAST','БУТЕРБРОДЫ',0,330,1,'MANUAL'),
 ('Овсянка с шоколадом и арахисом','BREAKFAST','КАШИ',10,450,1,'MANUAL');
-- ОБЕДЫ (15)
INSERT INTO recipes (name, meal_type, category, cook_minutes, calories_per_serving, base_servings, source) VALUES
 ('Борщ сублимированный','LUNCH','СУПЫ',10,210,1,'MANUAL'),
 ('Куриный суп с лапшой','LUNCH','СУПЫ',10,230,1,'MANUAL'),
 ('Грибной суп-пюре походный','LUNCH','СУПЫ',15,240,1,'MANUAL'),
 ('Гороховый суп с копчёной колбасой','LUNCH','СУПЫ',30,320,1,'MANUAL'),
 ('Лапша б/п с сыром','LUNCH','ВТОРОЕ',5,350,1,'MANUAL'),
 ('Лапша б/п с куриной тушенкой','LUNCH','ВТОРОЕ',5,420,1,'MANUAL'),
 ('Кускус с соевым мясом и томатами','LUNCH','ВТОРОЕ',10,360,1,'MANUAL'),
 ('Булгур с говяжьей тушенкой','LUNCH','ВТОРОЕ',20,450,1,'MANUAL'),
 ('Рис с рыбными консервами','LUNCH','ВТОРОЕ',20,430,1,'MANUAL'),
 ('Пюре с паштетом','LUNCH','ВТОРОЕ',10,380,1,'MANUAL'),
 ('Пюре с плавленым сыром','LUNCH','ВТОРОЕ',10,360,1,'MANUAL'),
 ('Сэндвич на хлебцах с паштетом','LUNCH','БУТЕРБРОДЫ',0,300,1,'MANUAL'),
 ('Сэндвич на хлебцах с сыром и колбасой','LUNCH','БУТЕРБРОДЫ',0,410,1,'MANUAL'),
 ('Галеты с салом и чесноком','LUNCH','БУТЕРБРОДЫ',0,380,1,'MANUAL'),
 ('Фасолевый салат с сухариками','LUNCH','ВТОРОЕ',0,260,1,'MANUAL');
-- УЖИНЫ (15)
INSERT INTO recipes (name, meal_type, category, cook_minutes, calories_per_serving, base_servings, source) VALUES
 ('Гречка с тушенкой и луком','DINNER','ВТОРОЕ',25,480,1,'MANUAL'),
 ('Плов походный','DINNER','ВТОРОЕ',40,520,1,'MANUAL'),
 ('Макароны по-флотски','DINNER','ВТОРОЕ',25,500,1,'MANUAL'),
 ('Рис с куриной тушенкой и морковью','DINNER','ВТОРОЕ',30,470,1,'MANUAL'),
 ('Пюре с тушенкой и луком','DINNER','ВТОРОЕ',15,460,1,'MANUAL'),
 ('Чечевица с копчёной колбасой','DINNER','ВТОРОЕ',30,440,1,'MANUAL'),
 ('Фасоль в томате с рисом','DINNER','ВТОРОЕ',25,420,1,'MANUAL'),
 ('Гуляш из соевого мяса с пюре','DINNER','ВТОРОЕ',30,400,1,'MANUAL'),
 ('Уха из рыбных консервов','DINNER','СУПЫ',25,300,1,'MANUAL'),
 ('Паста с сыром и салом','DINNER','ВТОРОЕ',20,520,1,'MANUAL'),
 ('Гречка с сушёными грибами','DINNER','ВТОРОЕ',30,410,1,'MANUAL'),
 ('Пшено с тушенкой','DINNER','ВТОРОЕ',30,460,1,'MANUAL'),
 ('Кускус с тушенкой и томатами','DINNER','ВТОРОЕ',15,470,1,'MANUAL'),
 ('Лапша с куриной тушенкой и овощами','DINNER','ВТОРОЕ',25,480,1,'MANUAL'),
 ('Карри походное с рисом','DINNER','ВТОРОЕ',35,490,1,'MANUAL');
-- ПЕРЕКУСЫ И НАПИТКИ (16)
INSERT INTO recipes (name, meal_type, category, cook_minutes, calories_per_serving, base_servings, source) VALUES
 ('Ореховый микс с изюмом','SNACK','ПЕРЕКУСЫ',0,520,1,'MANUAL'),
 ('Шоколад с арахисом','SNACK','ПЕРЕКУСЫ',0,560,1,'MANUAL'),
 ('Халва с галетами','SNACK','ПЕРЕКУСЫ',0,510,1,'MANUAL'),
 ('Козинаки','SNACK','ПЕРЕКУСЫ',0,530,1,'MANUAL'),
 ('Курага и чернослив','SNACK','ПЕРЕКУСЫ',0,340,1,'MANUAL'),
 ('Сыр с хлебцами','SNACK','ПЕРЕКУСЫ',0,400,1,'MANUAL'),
 ('Колбаса с галетами','SNACK','ПЕРЕКУСЫ',0,430,1,'MANUAL'),
 ('Сало с сухариками и чесноком','SNACK','ПЕРЕКУСЫ',0,480,1,'MANUAL'),
 ('Мёд с орехами','SNACK','ПЕРЕКУСЫ',0,550,1,'MANUAL'),
 ('Энергетические шарики','SNACK','ПЕРЕКУСЫ',0,470,1,'MANUAL'),
 ('Печенье овсяное','SNACK','ПЕРЕКУСЫ',0,440,1,'MANUAL'),
 ('Сгущёнка с хлебцами','SNACK','ПЕРЕКУСЫ',0,420,1,'MANUAL'),
 ('Какао на сухом молоке','SNACK','НАПИТКИ',10,180,1,'MANUAL'),
 ('Компот из сухофруктов','SNACK','НАПИТКИ',15,120,1,'MANUAL'),
 ('Чай с лимоном','SNACK','НАПИТКИ',5,60,1,'MANUAL'),
 ('Кофе со сгущёнкой','SNACK','НАПИТКИ',5,140,1,'MANUAL');

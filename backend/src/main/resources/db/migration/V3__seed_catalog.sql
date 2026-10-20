-- V3__seed_catalog.sql
-- Сид-данные: 60 компонентов + цены + 61 блюдо

-- Временная таблица для компонентов
CREATE TEMP TABLE tmp_ing (code text, name text, unit text, price numeric);

INSERT INTO tmp_ing VALUES
 ('oat_flakes','Овсяные хлопья','KG',150),('millet','Пшено','KG',140),
 ('buckwheat','Гречка','KG',180),('rice','Рис','KG',160),('pasta','Макароны','KG',120),
 ('semolina','Манная крупа','KG',110),('couscous','Кускус','KG',320),('bulgur','Булгур','KG',260),
 ('lentils','Чечевица','KG',240),('peas','Горох колотый','KG',130),('flour','Мука пшеничная','KG',90),
 ('powdered_milk','Сухое молоко','KG',650),('egg_powder','Яичный порошок','KG',900),
 ('mash_powder','Пюре быстрорастворимое','KG',400),('sugar','Сахар','KG',110),('salt','Соль','KG',60),
 ('spices','Специи (микс)','KG',1200),('dried_fruits','Сухофрукты (микс)','KG',480),
 ('raisins','Изюм','KG',350),('apricots','Курага','KG',520),('prunes','Чернослив','KG',560),
 ('walnuts','Орехи грецкие','KG',900),('peanuts','Арахис','KG',420),('chocolate','Шоколад','KG',1400),
 ('halva','Халва','KG',700),('honey','Мёд','KG',800),('cocoa','Какао','KG',600),('tea','Чай чёрный','KG',1200),
 ('coffee','Кофе растворимый','KG',2500),('cheese','Сыр твёрдый','KG',850),
 ('sausage','Колбаса сырокопчёная','KG',1100),('salo','Сало','KG',700),('butter','Масло сливочное','KG',950),
 ('sunflower_oil','Масло подсолнечное','L',180),('soy_meat','Соевый текстурат','KG',550),
 ('dried_mushrooms','Грибы сушёные','KG',2200),('dried_tomatoes','Томаты сушёные','KG',900),
 ('dried_herbs','Зелень сушёная','KG',1500),('onion','Лук репчатый','KG',70),('carrot','Морковь','KG',60),
 ('potato_dried','Картофель сублимированный','KG',450),('garlic','Чеснок','KG',400),('lemon','Лимон','PCS',40),
 ('beef_stew','Тушенка говяжья 325 г','PCS',210),('chicken_stew','Тушенка куриная 325 г','PCS',190),
 ('fish_canned','Рыбные консервы 250 г','PCS',160),('pate','Паштет мясной 100 г','PCS',95),
 ('condensed_milk','Сгущёнка 380 г','PCS',150),('processed_cheese','Сыр плавленый 90 г','PCS',65),
 ('beans_canned','Фасоль консерв. 400 г','PCS',120),('instant_noodles','Лапша б/п 60 г','PCS',45),
 ('crispbread','Хлебцы зерновые 10 г','PCS',6),('galetas','Галеты армейские 25 г','PCS',10),
 ('croutons','Сухарики 50 г','PCS',35),('cookies','Печенье овсяное','KG',400),
 ('soup_borsch','Борщ сублимированный','KG',1800),('soup_chicken','Суп сублим. куриный с лапшой','KG',1700),
 ('water','Вода питьевая','L',45),('tomato_paste','Томатная паста','KG',250),('kozinaki','Козинаки','KG',800);

-- Вставляем компоненты
INSERT INTO ingredients (code, name, unit) SELECT code, name, unit FROM tmp_ing;

-- Вставляем цены на 01.01.2026
INSERT INTO ingredient_prices (ingredient_id, effective_from, price_per_unit, currency)
SELECT i.id, DATE '2026-01-01', t.price, 'RUB'
FROM tmp_ing t JOIN ingredients i USING (code);

-- Временная таблица для рецептов
CREATE TEMP TABLE tmp_recipe (name text, meal_type text, category text, cook int, kcal int, ing jsonb);

INSERT INTO tmp_recipe VALUES
-- ЗАВТРАКИ (15)
 ('Овсянка на воде с сухофруктами','BREAKFAST','КАШИ',10,320,'[["oat_flakes",0.08],["water",0.25],["dried_fruits",0.02],["sugar",0.01],["salt",0.002]]'),
 ('Овсянка на сухом молоке','BREAKFAST','КАШИ',10,360,'[["oat_flakes",0.08],["powdered_milk",0.02],["water",0.25],["sugar",0.01]]'),
 ('Мюсли-каша с орехами и изюмом','BREAKFAST','КАШИ',8,410,'[["oat_flakes",0.06],["walnuts",0.02],["raisins",0.02],["powdered_milk",0.015],["water",0.2]]'),
 ('Пшённая каша с курагой','BREAKFAST','КАШИ',25,380,'[["millet",0.09],["apricots",0.025],["water",0.3],["sugar",0.01],["butter",0.01]]'),
 ('Рисовая каша на сухом молоке','BREAKFAST','КАШИ',25,370,'[["rice",0.08],["powdered_milk",0.025],["water",0.3],["sugar",0.015],["salt",0.002]]'),
 ('Манная каша с изюмом','BREAKFAST','КАШИ',15,350,'[["semolina",0.07],["raisins",0.02],["powdered_milk",0.02],["water",0.3],["sugar",0.015]]'),
 ('Каша «Дружба» (рис и пшено)','BREAKFAST','КАШИ',25,365,'[["rice",0.04],["millet",0.04],["powdered_milk",0.02],["water",0.3],["sugar",0.01]]'),
 ('Гороховая каша с маслом','BREAKFAST','КАШИ',30,340,'[["peas",0.1],["water",0.3],["butter",0.01],["salt",0.003]]'),
 ('Гречневая каша с маслом','BREAKFAST','КАШИ',20,350,'[["buckwheat",0.09],["water",0.25],["butter",0.01],["salt",0.002]]'),
 ('Омлет из яичного порошка с салом','BREAKFAST','ВТОРОЕ',15,420,'[["egg_powder",0.03],["water",0.09],["salo",0.02],["onion",0.02],["salt",0.002]]'),
 ('Походный омлет с сыром','BREAKFAST','ВТОРОЕ',15,400,'[["egg_powder",0.035],["powdered_milk",0.01],["water",0.1],["cheese",0.03],["butter",0.005]]'),
 ('Блины походные','BREAKFAST','ВЫПЕЧКА',25,430,'[["flour",0.08],["egg_powder",0.015],["powdered_milk",0.02],["water",0.2],["sugar",0.015],["sunflower_oil",0.01]]'),
 ('Хлебцы с сыром и колбасой','BREAKFAST','БУТЕРБРОДЫ',0,390,'[["crispbread",2],["cheese",0.04],["sausage",0.03]]'),
 ('Хлебцы с мёдом и орехами','BREAKFAST','БУТЕРБРОДЫ',0,330,'[["crispbread",2],["honey",0.03],["walnuts",0.02]]'),
 ('Овсянка с шоколадом и арахисом','BREAKFAST','КАШИ',10,450,'[["oat_flakes",0.08],["chocolate",0.02],["peanuts",0.015],["water",0.25],["sugar",0.005]]'),
-- ОБЕДЫ (15)
 ('Борщ сублимированный','LUNCH','СУПЫ',10,210,'[["soup_borsch",0.08],["water",0.4],["salt",0.001]]'),
 ('Куриный суп с лапшой (сублимированный)','LUNCH','СУПЫ',10,230,'[["soup_chicken",0.07],["water",0.4]]'),
 ('Грибной суп-пюре походный','LUNCH','СУПЫ',15,240,'[["dried_mushrooms",0.02],["mash_powder",0.06],["water",0.4],["salt",0.002],["dried_herbs",0.001]]'),
 ('Гороховый суп с копчёной колбасой','LUNCH','СУПЫ',30,320,'[["peas",0.09],["sausage",0.03],["onion",0.02],["water",0.45],["salt",0.003]]'),
 ('Лапша б/п с сыром','LUNCH','ВТОРОЕ',5,350,'[["instant_noodles",1],["cheese",0.02],["water",0.4]]'),
 ('Лапша б/п с куриной тушенкой','LUNCH','ВТОРОЕ',5,420,'[["instant_noodles",1],["chicken_stew",0.5],["water",0.4]]'),
 ('Кускус с соевым мясом и томатами','LUNCH','ВТОРОЕ',10,360,'[["couscous",0.09],["soy_meat",0.03],["dried_tomatoes",0.01],["dried_herbs",0.003],["water",0.25],["sunflower_oil",0.005]]'),
 ('Булгур с говяжьей тушенкой','LUNCH','ВТОРОЕ',20,450,'[["bulgur",0.09],["beef_stew",0.5],["onion",0.02],["water",0.3]]'),
 ('Рис с рыбными консервами','LUNCH','ВТОРОЕ',20,430,'[["rice",0.09],["fish_canned",0.5],["onion",0.02],["water",0.3]]'),
 ('Пюре с паштетом','LUNCH','ВТОРОЕ',10,380,'[["mash_powder",0.08],["water",0.25],["pate",0.04]]'),
 ('Пюре с плавленым сыром','LUNCH','ВТОРОЕ',10,360,'[["mash_powder",0.08],["processed_cheese",0.5],["water",0.25]]'),
 ('Сэндвич на хлебцах с паштетом','LUNCH','БУТЕРБРОДЫ',0,300,'[["crispbread",2],["pate",0.05],["dried_herbs",0.001]]'),
 ('Сэндвич на хлебцах с сыром и колбасой','LUNCH','БУТЕРБРОДЫ',0,410,'[["crispbread",2],["cheese",0.04],["sausage",0.04]]'),
 ('Галеты с салом и чесноком','LUNCH','БУТЕРБРОДЫ',0,380,'[["galetas",3],["salo",0.03],["garlic",0.005]]'),
 ('Фасолевый салат с сухариками','LUNCH','ВТОРОЕ',0,260,'[["beans_canned",0.5],["croutons",0.03],["onion",0.02],["sunflower_oil",0.01]]'),
-- УЖИНЫ (15)
 ('Гречка с тушенкой и луком','DINNER','ВТОРОЕ',25,480,'[["buckwheat",0.1],["beef_stew",0.25],["onion",0.02],["sunflower_oil",0.005],["salt",0.002]]'),
 ('Плов походный','DINNER','ВТОРОЕ',40,520,'[["rice",0.1],["beef_stew",0.25],["carrot",0.03],["onion",0.02],["sunflower_oil",0.01],["salt",0.002],["spices",0.001]]'),
 ('Макароны по-флотски','DINNER','ВТОРОЕ',25,500,'[["pasta",0.11],["beef_stew",0.25],["onion",0.02],["sunflower_oil",0.005]]'),
 ('Рис с куриной тушенкой и морковью','DINNER','ВТОРОЕ',30,470,'[["rice",0.1],["chicken_stew",0.25],["carrot",0.02],["onion",0.02],["dried_herbs",0.002]]'),
 ('Пюре с тушенкой и луком','DINNER','ВТОРОЕ',15,460,'[["mash_powder",0.1],["beef_stew",0.25],["water",0.3],["onion",0.015]]'),
 ('Чечевица с копчёной колбасой','DINNER','ВТОРОЕ',30,440,'[["lentils",0.1],["sausage",0.04],["onion",0.02],["sunflower_oil",0.005]]'),
 ('Фасоль в томате с рисом','DINNER','ВТОРОЕ',25,420,'[["beans_canned",0.5],["rice",0.06],["tomato_paste",0.02],["onion",0.02]]'),
 ('Гуляш из соевого мяса с пюре','DINNER','ВТОРОЕ',30,400,'[["soy_meat",0.04],["mash_powder",0.09],["tomato_paste",0.015],["onion",0.02],["spices",0.001]]'),
 ('Уха из рыбных консервов','DINNER','СУПЫ',25,300,'[["fish_canned",0.5],["potato_dried",0.06],["onion",0.02],["water",0.4],["salt",0.002]]'),
 ('Паста с сыром и салом','DINNER','ВТОРОЕ',20,520,'[["pasta",0.11],["cheese",0.03],["salo",0.02]]'),
 ('Гречка с сушёными грибами','DINNER','ВТОРОЕ',30,410,'[["buckwheat",0.1],["dried_mushrooms",0.015],["onion",0.03],["sunflower_oil",0.01]]'),
 ('Пшено с тушенкой','DINNER','ВТОРОЕ',30,460,'[["millet",0.1],["beef_stew",0.25],["onion",0.02]]'),
 ('Кускус с тушенкой и томатами','DINNER','ВТОРОЕ',15,470,'[["couscous",0.09],["beef_stew",0.25],["dried_tomatoes",0.015],["water",0.25]]'),
 ('Лапша с куриной тушенкой и овощами','DINNER','ВТОРОЕ',25,480,'[["pasta",0.1],["chicken_stew",0.25],["carrot",0.02],["onion",0.02]]'),
 ('Карри походное с рисом','DINNER','ВТОРОЕ',35,490,'[["rice",0.1],["soy_meat",0.035],["powdered_milk",0.015],["spices",0.003],["sunflower_oil",0.005]]'),
-- ПЕРЕКУСЫ И НАПИТКИ (16)
 ('Ореховый микс с изюмом','SNACK','ПЕРЕКУСЫ',0,520,'[["walnuts",0.03],["peanuts",0.02],["raisins",0.03]]'),
 ('Шоколад с арахисом','SNACK','ПЕРЕКУСЫ',0,560,'[["chocolate",0.05],["peanuts",0.02]]'),
 ('Халва с галетами','SNACK','ПЕРЕКУСЫ',0,510,'[["halva",0.05],["galetas",2]]'),
 ('Козинаки','SNACK','ПЕРЕКУСЫ',0,530,'[["kozinaki",0.06]]'),
 ('Курага и чернослив','SNACK','ПЕРЕКУСЫ',0,340,'[["apricots",0.04],["prunes",0.04]]'),
 ('Сыр с хлебцами','SNACK','ПЕРЕКУСЫ',0,400,'[["cheese",0.04],["crispbread",2]]'),
 ('Колбаса с галетами','SNACK','ПЕРЕКУСЫ',0,430,'[["sausage",0.04],["galetas",2]]'),
 ('Сало с сухариками и чесноком','SNACK','ПЕРЕКУСЫ',0,480,'[["salo",0.04],["croutons",0.03],["garlic",0.004]]'),
 ('Мёд с орехами','SNACK','ПЕРЕКУСЫ',0,550,'[["honey",0.03],["walnuts",0.03]]'),
 ('Энергетические шарики','SNACK','ПЕРЕКУСЫ',0,470,'[["dried_fruits",0.04],["walnuts",0.03],["honey",0.01],["cocoa",0.005]]'),
 ('Печенье овсяное','SNACK','ПЕРЕКУСЫ',0,440,'[["cookies",0.06]]'),
 ('Сгущёнка с хлебцами','SNACK','ПЕРЕКУСЫ',0,420,'[["condensed_milk",0.25],["crispbread",2]]'),
 ('Какао на сухом молоке','SNACK','НАПИТКИ',10,180,'[["cocoa",0.015],["powdered_milk",0.02],["sugar",0.015],["water",0.3]]'),
 ('Компот из сухофруктов','SNACK','НАПИТКИ',15,120,'[["dried_fruits",0.04],["sugar",0.01],["water",0.4]]'),
 ('Чай с лимоном','SNACK','НАПИТКИ',5,60,'[["tea",0.003],["lemon",0.1],["sugar",0.01],["water",0.3]]'),
 ('Кофе со сгущёнкой','SNACK','НАПИТКИ',5,140,'[["coffee",0.008],["condensed_milk",0.15],["water",0.25]]');

-- Вставляем рецепты
INSERT INTO recipes (name, meal_type, category, cook_minutes, calories_per_serving, base_servings, source)
SELECT name, meal_type, category, cook, kcal, 1, 'MANUAL' FROM tmp_recipe;

-- Вставляем ингредиенты рецептов
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, (x.value->>1)::numeric
FROM tmp_recipe t
JOIN recipes r ON r.name = t.name
CROSS JOIN LATERAL jsonb_array_elements(t.ing) AS x(value)
JOIN ingredients i ON i.code = (x.value->>0);

-- Очистка временных таблиц
DROP TABLE tmp_recipe;
DROP TABLE tmp_ing;

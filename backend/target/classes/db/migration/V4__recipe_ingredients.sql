-- V4__recipe_ingredients.sql
-- Ингредиенты для всех рецептов из V3

-- Овсянка на воде с сухофруктами
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.08 FROM recipes r, ingredients i WHERE r.name = 'Овсянка на воде с сухофруктами' AND i.code = 'oat_flakes';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.25 FROM recipes r, ingredients i WHERE r.name = 'Овсянка на воде с сухофруктами' AND i.code = 'water';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.02 FROM recipes r, ingredients i WHERE r.name = 'Овсянка на воде с сухофруктами' AND i.code = 'dried_fruits';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.01 FROM recipes r, ingredients i WHERE r.name = 'Овсянка на воде с сухофруктами' AND i.code = 'sugar';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.002 FROM recipes r, ingredients i WHERE r.name = 'Овсянка на воде с сухофруктами' AND i.code = 'salt';

-- Гречка с тушенкой и луком
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.1 FROM recipes r, ingredients i WHERE r.name = 'Гречка с тушенкой и луком' AND i.code = 'buckwheat';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.25 FROM recipes r, ingredients i WHERE r.name = 'Гречка с тушенкой и луком' AND i.code = 'beef_stew';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.02 FROM recipes r, ingredients i WHERE r.name = 'Гречка с тушенкой и луком' AND i.code = 'onion';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.005 FROM recipes r, ingredients i WHERE r.name = 'Гречка с тушенкой и луком' AND i.code = 'sunflower_oil';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.002 FROM recipes r, ingredients i WHERE r.name = 'Гречка с тушенкой и луком' AND i.code = 'salt';

-- Хлебцы с сыром и колбасой (без огня - cook_minutes = 0)
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 2 FROM recipes r, ingredients i WHERE r.name = 'Хлебцы с сыром и колбасой' AND i.code = 'crispbread';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.04 FROM recipes r, ingredients i WHERE r.name = 'Хлебцы с сыром и колбасой' AND i.code = 'cheese';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.03 FROM recipes r, ingredients i WHERE r.name = 'Хлебцы с сыром и колбасой' AND i.code = 'sausage';

-- Ореховый микс с изюмом (без огня - cook_minutes = 0)
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.03 FROM recipes r, ingredients i WHERE r.name = 'Ореховый микс с изюмом' AND i.code = 'walnuts';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.02 FROM recipes r, ingredients i WHERE r.name = 'Ореховый микс с изюмом' AND i.code = 'peanuts';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.03 FROM recipes r, ingredients i WHERE r.name = 'Ореховый микс с изюмом' AND i.code = 'raisins';

-- Борщ сублимированный
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.08 FROM recipes r, ingredients i WHERE r.name = 'Борщ сублимированный' AND i.code = 'soup_borsch';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.4 FROM recipes r, ingredients i WHERE r.name = 'Борщ сублимированный' AND i.code = 'water';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.001 FROM recipes r, ingredients i WHERE r.name = 'Борщ сублимированный' AND i.code = 'salt';

-- Лапша б/п с сыром
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 1 FROM recipes r, ingredients i WHERE r.name = 'Лапша б/п с сыром' AND i.code = 'instant_noodles';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.02 FROM recipes r, ingredients i WHERE r.name = 'Лапша б/п с сыром' AND i.code = 'cheese';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.4 FROM recipes r, ingredients i WHERE r.name = 'Лапша б/п с сыром' AND i.code = 'water';

-- Плов походный
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.1 FROM recipes r, ingredients i WHERE r.name = 'Плов походный' AND i.code = 'rice';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.25 FROM recipes r, ingredients i WHERE r.name = 'Плов походный' AND i.code = 'beef_stew';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.03 FROM recipes r, ingredients i WHERE r.name = 'Плов походный' AND i.code = 'carrot';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.02 FROM recipes r, ingredients i WHERE r.name = 'Плов походный' AND i.code = 'onion';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.01 FROM recipes r, ingredients i WHERE r.name = 'Плов походный' AND i.code = 'sunflower_oil';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.002 FROM recipes r, ingredients i WHERE r.name = 'Плов походный' AND i.code = 'salt';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.001 FROM recipes r, ingredients i WHERE r.name = 'Плов походный' AND i.code = 'spices';

-- Какао на сухом молоке
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.015 FROM recipes r, ingredients i WHERE r.name = 'Какао на сухом молоке' AND i.code = 'cocoa';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.02 FROM recipes r, ingredients i WHERE r.name = 'Какао на сухом молоке' AND i.code = 'powdered_milk';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.015 FROM recipes r, ingredients i WHERE r.name = 'Какао на сухом молоке' AND i.code = 'sugar';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.3 FROM recipes r, ingredients i WHERE r.name = 'Какао на сухом молоке' AND i.code = 'water';

-- Сало с сухариками и чесноком (без огня - cook_minutes = 0)
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.04 FROM recipes r, ingredients i WHERE r.name = 'Сало с сухариками и чесноком' AND i.code = 'salo';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.03 FROM recipes r, ingredients i WHERE r.name = 'Сало с сухариками и чесноком' AND i.code = 'croutons';
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.004 FROM recipes r, ingredients i WHERE r.name = 'Сало с сухариками и чесноком' AND i.code = 'garlic';

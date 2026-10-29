package com.provision.config;

import com.provision.entity.Ingredient;
import com.provision.entity.MealType;
import com.provision.entity.Recipe;
import com.provision.entity.Trip;
import com.provision.entity.TripDay;
import com.provision.entity.TripIngredientSubstitution;
import com.provision.entity.TripMeal;
import com.provision.entity.TripPriceOverride;
import com.provision.entity.User;
import com.provision.repository.IngredientRepository;
import com.provision.repository.RecipeRepository;
import com.provision.repository.TripIngredientSubstitutionRepository;
import com.provision.repository.TripPriceOverrideRepository;
import com.provision.repository.TripMealRepository;
import com.provision.repository.TripRepository;
import com.provision.repository.UserRepository;
import com.provision.service.TripCatalogSnapshotService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Демо-походы для тестовых пользователей (dev-профиль, SEED_DEMO_USERS=true).
 *
 * Создаёт три наполненных похода после {@link DevDataInitializer} (@Order(2)):
 *   1. admin — «Осенний Кавказ: Архыз — Софийские озёра» (прошедший, 5 дней, 4 чел.)
 *      с фактическими ценами (план/факт) и одной заменой компонента — демо оверрайдов;
 *   2. admin — «Яхта Хорватия: Сплит — Хвар — Вис» (предстоящий, 7 дней, 6 чел.)
 *      со свежими продуктами первых дней и peopleOverride на ходовой день;
 *   3. user  — «ПВД Карелия: Ладожские шхеры» (предстоящий, 2 дня, 2 чел.).
 *
 * Идемпотентно: если у пользователя уже есть походы — сид пропускается.
 * Рецепты ищутся по имени из каталога (V3 + V17/V18); отсутствующий рецепт
 * логируется и пропускается, чтобы сид не ронял старт приложения.
 */
@Configuration
@Profile("dev")
@Slf4j
public class DevTripsInitializer {

    /** Один день меню: дата, опциональный peopleOverride, пункты «B=название рецепта». */
    private record DayPlan(LocalDate date, Integer peopleOverride, List<String> items) {}

    @Bean
    @Order(2)
    CommandLineRunner seedDemoTrips(UserRepository userRepository,
                                    RecipeRepository recipeRepository,
                                    IngredientRepository ingredientRepository,
                                    TripRepository tripRepository,
                                    TripMealRepository tripMealRepository,
                                    TripPriceOverrideRepository priceOverrideRepository,
                                    TripIngredientSubstitutionRepository substitutionRepository,
                                    TripCatalogSnapshotService snapshotService,
                                    DevProperties devProperties) {
        return args -> {
            // FIX (аудит 29.10.2026, подзадача 1): гейт сида — из единого источника
            // (DevProperties.seedDemoUsers), а не повторным чтением System.getenv.
            if (!devProperties.isSeedDemoUsers()) {
                return; // тот же гейт, что и у демо-пользователей
            }

            User admin = userRepository.findByEmail("admin@provision.app").orElse(null);
            User user = userRepository.findByEmail("user@provision.app").orElse(null);
            if (admin == null || user == null) {
                log.warn("Demo users not found — skipping demo trips seeding");
                return;
            }

            Map<String, Recipe> recipes = recipeRepository.findAllOrderByName().stream()
                    .collect(Collectors.toMap(Recipe::getName, Function.identity(), (a, b) -> a));

            if (!tripRepository.findByUserId(admin.getId()).isEmpty()
                    || !tripRepository.findByUserId(user.getId()).isEmpty()) {
                log.info("Demo trips already exist — skipping");
                return;
            }

            Trip mountains = createTrip(admin, tripRepository, tripMealRepository, snapshotService, recipes,
                    "Осенний Кавказ: Архыз — Софийские озёра",
                    LocalDate.of(2026, 10, 10), LocalDate.of(2026, 10, 14), 4,
                    "Пеший, автономка 5 дней. Нитка: поляна Таулу — Софийские озёра — перевал — спуск к морю.",
                    mountainsMenu());
            seedPriceOverrides(mountains, ingredientRepository, priceOverrideRepository, snapshotService, admin);
            seedSubstitution(mountains, recipes, ingredientRepository, substitutionRepository, snapshotService, admin);

            createTrip(admin, tripRepository, tripMealRepository, snapshotService, recipes,
                    "Яхта Хорватия: Сплит — Хвар — Вис",
                    LocalDate.of(2026, 11, 14), LocalDate.of(2026, 11, 20), 6,
                    "Переход ок. 60 миль. Свежие продукты — на первые 2 дня (есть холодильник), дальше только стабильный запас.",
                    yachtMenu());

            createTrip(user, tripRepository, tripMealRepository, snapshotService, recipes,
                    "ПВД Карелия: Ладожские шхеры",
                    LocalDate.of(2026, 11, 7), LocalDate.of(2026, 11, 8), 2,
                    "Поход выходного дня, лёгкая раскладка на горелке.",
                    pvdMenu());

            log.info("Seeded 3 demo trips for admin@provision.app / user@provision.app");
        };
    }

    // ---------------------------------------------------------------- trip 1: горы
    private List<DayPlan> mountainsMenu() {
        return List.of(
                new DayPlan(LocalDate.of(2026, 10, 10), null, List.of(
                        "B=Гречневая каша молочная", "B=Чай с сахаром",
                        "L=Борщ с тушёнкой (полевой)", "L=Хлеб с аджикой и сыром",
                        "S=Trail mix «Энергия»",
                        "D=Плов с говяжьей тушёнкой", "D=Чай с чабрецом (горный)")),
                new DayPlan(LocalDate.of(2026, 10, 11), null, List.of(
                        "B=Гранола с сухим молоком", "B=Кофе с сахаром",
                        "L=Суп сырный с сухариками", "L=Бутерброд со шпротами и лимоном",
                        "S=Арахисовая паста с хлебцами",
                        "D=Гречка по-купечески", "D=Иван-чай с сушёными яблоками")),
                new DayPlan(LocalDate.of(2026, 10, 12), null, List.of(
                        "B=Овсяноблин с сыром", "B=Чай с лимоном",
                        "L=Кулеш с пшеном и тушёнкой",
                        "S=Батончики мюсли к чаю",
                        "D=Спагетти по-флотски с томатной пастой", "D=Отвар шиповника")),
                new DayPlan(LocalDate.of(2026, 10, 13), null, List.of(
                        "B=Омлет сублимированный с сыром", "B=Кофе без сахара",
                        "L=Суп харчо из пакетика", "L=Ролл из лаваша с тушёнкой и сыром",
                        "S=Ореховый микс с финиками",
                        "D=Жаркое походное из сублимированного картофеля", "D=Чай с имбирём и лимоном")),
                new DayPlan(LocalDate.of(2026, 10, 14), null, List.of(
                        "B=Каша гречневая б/п с сушёным луком", "B=Чай с сахаром",
                        "L=Суп-гуляш сублимированный",
                        "S=Шоколад с фундуком"))
        );
    }

    // ---------------------------------------------------------------- trip 2: яхта
    private List<DayPlan> yachtMenu() {
        return List.of(
                new DayPlan(LocalDate.of(2026, 11, 14), null, List.of(
                        "B=Какао на молоке (яхтенное)", "B=Бисквит глазированный к чаю",
                        "L=Салат из свежих овощей (яхта)", "L=Бутерброд с тунцом и майонезом",
                        "S=Фруктовая тарелка (яхта)",
                        "D=Паста с тунцом и оливками (яхта)", "D=Глинтвейн безалкогольный (яхта)")),
                new DayPlan(LocalDate.of(2026, 11, 15), null, List.of(
                        "B=Овсянка с бананом", "B=Кофе «3 в 1»",
                        "L=Уха яхтенская из сайры", "L=Оливки с сыром (яхтенный аперитив)",
                        "S=Гематоген",
                        "D=Картофель отварной с салом и чесноком", "D=Чай с мятой")),
                new DayPlan(LocalDate.of(2026, 11, 16), null, List.of(
                        "B=Творог сублимированный с изюмом и мёдом", "B=Чай без сахара",
                        "L=Суп сырный с сухариками", "L=Хлеб ржаной с салом и горчицей",
                        "S=Мармелад с грецким орехом",
                        "D=Сельдь с отварным картофелем (яхта)", "D=Отвар шиповника")),
                new DayPlan(LocalDate.of(2026, 11, 17), 4, List.of( // двое сошли на берег
                        "B=Омлет сублимированный с сыром", "B=Кофе с сахаром",
                        "L=Суп из красной чечевицы с томатной пастой",
                        "S=Сухари ржаные со сгущёнкой",
                        "D=Плов яхтенный с куриной тушёнкой и изюмом", "D=Чай со сгущёнкой")),
                new DayPlan(LocalDate.of(2026, 11, 18), null, List.of(
                        "B=Манная каша с джемом", "B=Чай из пакетика с сахаром",
                        "L=Кускус с тунцом и кукурузой (яхта)", "L=Салат из капусты с огурцом",
                        "S=Джерки с хлебцами",
                        "D=Скумбрия консервированная с картофелем (яхта)", "D=Иван-чай с сушёными яблоками")),
                new DayPlan(LocalDate.of(2026, 11, 19), null, List.of(
                        "B=Гранола с сухим молоком", "B=Кофе молотый в турке",
                        "L=Солянка походная сборная", "L=Лаваш с салом и чесноком",
                        "S=Халва с галетами",
                        "D=Макароны с сыром и зеленью", "D=Чай с сушёной смородиной")),
                new DayPlan(LocalDate.of(2026, 11, 20), null, List.of(
                        "B=Сырная лепёшка с зеленью", "B=Чай с сахаром",
                        "L=Макароны с сардинами и лимоном"))
        );
    }

    // ---------------------------------------------------------------- trip 3: ПВД
    private List<DayPlan> pvdMenu() {
        return List.of(
                new DayPlan(LocalDate.of(2026, 11, 7), null, List.of(
                        "B=Овсянка на воде с сухофруктами", "B=Чай с сахаром",
                        "L=Суп-лапша на бульонном кубике", "L=Горячий бутерброд на костре",
                        "S=Печенье овсяное",
                        "D=Макароны по-флотски", "D=Чай с мятой")),
                new DayPlan(LocalDate.of(2026, 11, 8), null, List.of(
                        "B=Каша овсяная быстрорастворимая", "B=Кофе с сахаром",
                        "L=Уха из рыбных консервов", "L=Сыр с хлебцами",
                        "S=Козинаки"))
        );
    }

    // ---------------------------------------------------------------- сборка Trip-графа
    private Trip createTrip(User owner,
                            TripRepository tripRepository,
                            TripMealRepository tripMealRepository,
                            TripCatalogSnapshotService snapshotService,
                            Map<String, Recipe> recipes,
                            String name,
                            LocalDate start,
                            LocalDate end,
                            int defaultPeople,
                            String notes,
                            List<DayPlan> dayPlans) {
        Trip trip = Trip.builder()
                .user(owner)
                .name(name)
                .startDate(start)
                .endDate(end)
                .defaultPeople(defaultPeople)
                .notes(notes)
                .days(new LinkedHashSet<>())
                .build();

        for (DayPlan plan : dayPlans) {
            trip.getDays().add(TripDay.builder()
                    .trip(trip)
                    .dayDate(plan.date())
                    .peopleOverride(plan.peopleOverride())
                    .meals(new LinkedHashSet<>())
                    .build());
        }
        // V20: сохраняем поход и дни ДО блюд — снепшотам нужен trip.id
        trip = tripRepository.save(trip);

        for (DayPlan plan : dayPlans) {
            TripDay day = trip.getDays().stream()
                    .filter(d -> d.getDayDate().equals(plan.date()))
                    .findFirst()
                    .orElseThrow();
            int sort = 0;
            for (String item : plan.items()) {
                MealType mealType = mealTypeOf(item.charAt(0));
                String recipeName = item.substring(item.indexOf('=') + 1);
                Recipe global = recipes.get(recipeName);
                if (global == null) {
                    log.warn("Demo trip '{}': recipe '{}' not found in catalog — meal skipped", name, recipeName);
                    continue;
                }
                // V20: демо-походы, как и пользовательские, работают со снепшот-копиями
                Recipe copy = snapshotService.snapshotRecipeForTrip(trip, global);
                tripMealRepository.save(TripMeal.builder()
                        .tripDay(day)
                        .mealType(mealType)
                        .recipe(copy)
                        .sortOrder(sort++)
                        .build());
            }
        }
        return trip;
    }

    private static MealType mealTypeOf(char prefix) {
        return switch (prefix) {
            case 'B' -> MealType.BREAKFAST;
            case 'L' -> MealType.LUNCH;
            case 'D' -> MealType.DINNER;
            default -> MealType.SNACK;
        };
    }

    // ---------------------------------------------------------------- план/факт и замены (trip 1)
    private void seedPriceOverrides(Trip trip,
                                    IngredientRepository ingredientRepository,
                                    TripPriceOverrideRepository overrideRepository,
                                    TripCatalogSnapshotService snapshotService,
                                    User admin) {
        record PriceOverrideSeed(String code, String price, String comment) {}
        List<PriceOverrideSeed> overrides = List.of(
                new PriceOverrideSeed("beef_stew", "235.00", "Пятёрочка в Архызе — дороже плана"),
                new PriceOverrideSeed("buckwheat", "195.00", "Ашан, закупка до похода"),
                new PriceOverrideSeed("cheese", "890.00", null),
                new PriceOverrideSeed("tea", "1250.00", null)
        );
        for (PriceOverrideSeed o : overrides) {
            ingredientRepository.findByCode(o.code()).ifPresent(global -> {
                Ingredient ing = snapshotService.snapshotIngredient(trip, global);
                overrideRepository.save(TripPriceOverride.builder()
                            .trip(trip)
                            .ingredient(ing)
                            .actualPrice(new BigDecimal(o.price()))
                            .currency("RUB")
                            .comment(o.comment())
                            .updatedBy(admin)
                            .build());
            });
        }
    }

    private void seedSubstitution(Trip trip,
                                  Map<String, Recipe> recipes,
                                  IngredientRepository ingredientRepository,
                                  TripIngredientSubstitutionRepository substitutionRepository,
                                  TripCatalogSnapshotService snapshotService,
                                  User admin) {
        Recipe globalRecipe = recipes.get("Спагетти по-флотски с томатной пастой");
        if (globalRecipe == null) {
            return;
        }
        Ingredient fromGlobal = ingredientRepository.findByCode("beef_stew").orElse(null);
        Ingredient toGlobal = ingredientRepository.findByCode("chicken_stew").orElse(null);
        if (fromGlobal == null || toGlobal == null) {
            return;
        }
        // V20: замены в походе указывают на trip-scoped копии (их же видит UI в закупках)
        Recipe recipe = snapshotService.snapshotRecipeForTrip(trip, globalRecipe);
        Ingredient from = snapshotService.snapshotIngredient(trip, fromGlobal);
        Ingredient to = snapshotService.snapshotIngredient(trip, toGlobal);
        substitutionRepository.save(TripIngredientSubstitution.builder()
                .trip(trip)
                .recipe(recipe)
                .fromIngredient(from)
                .toIngredient(to)
                .ratio(BigDecimal.ONE)
                .comment("Говяжья тушёнка закончилась в магазине — заменили куриной")
                .createdBy(admin)
                .build());
    }
}

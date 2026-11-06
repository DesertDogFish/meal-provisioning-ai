package com.provision.integration;


import static com.provision.integration.EconomicConsistencySupport.*;
import static org.assertj.core.api.Assertions.assertThat;
import java.math.BigDecimal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class EconomicConsistencyShoppingTest extends EconomicConsistencyTestBase {

    // ==================== ЭКРАН: ЗАКУПКА НА ПОХОД ====================

    @Test
    @DisplayName("EK-02 Закупка: SCALED/EXTRA/SUBST/EXCLUDED досчитаны, цены заморожены, итог 1410")
    void shoppingList() throws Exception {
        createFixtures();
        var list = parseShopping(objectMapper, getTrip("/summary/shopping"));

        assertThat(list.hasMissingPrices()).as("у всех снепшотов есть замороженная цена").isFalse();
        assertThat(list.items()).as("ровно 6 продуктов сценария, без сид-примесей").hasSize(6);

        assertThat(list.amount("ЭК Гречка")).isEqualByComparingTo("5.700");
        assertThat(list.amount("ЭК Тушёнка")).isEqualByComparingTo("0.000");
        assertThat(list.amount("ЭК Масло")).isEqualByComparingTo("0.500");
        assertThat(list.amount("ЭК Рис")).isEqualByComparingTo("0.800");
        assertThat(list.amount("ЭК Соль")).isEqualByComparingTo("0.000");
        assertThat(list.amount("ЭК Сгущёнка")).as("EXTRA — абсолют на приём: (1.0+0.3)+(0.4+0.3)")
                .isEqualByComparingTo("2.000");

        assertThat(list.planned("ЭК Гречка")).isEqualByComparingTo("570.00");
        assertThat(list.planned("ЭК Тушёнка")).isEqualByComparingTo("0.00");
        assertThat(list.planned("ЭК Масло")).isEqualByComparingTo("200.00");
        assertThat(list.planned("ЭК Рис")).isEqualByComparingTo("40.00");
        assertThat(list.planned("ЭК Соль")).isEqualByComparingTo("0.00");
        assertThat(list.planned("ЭК Сгущёнка")).isEqualByComparingTo("600.00");

        // План заморожен на дате старта: глобальная цена 130.00 @07-02 в план НЕ просачивается.
        assertThat(list.unit("ЭК Гречка", true)).isEqualByComparingTo("100.00");

        // Упаковки: Масло pack 0.2, roundToPacks → ceil(0.5/0.2)=3, купить 0.6, излишек 0.1.
        var maslo = list.byName("ЭК Масло");
        assertThat(maslo.packSize()).isEqualByComparingTo("0.200");
        assertThat(maslo.packsToBuy()).isEqualTo(3);
        assertThat(maslo.buyAmount()).isEqualByComparingTo("0.600");
        assertThat(maslo.leftoverAmount()).isEqualByComparingTo("0.100");

        // Без чеков факт == план.
        assertThat(list.totalPlannedCost()).isEqualByComparingTo("1410");
        assertThat(list.totalActualCost()).isEqualByComparingTo("1410");
        assertThat(list.deltaPercent()).isEqualByComparingTo("0.00");
        assertThat(list.overriddenCount()).isZero();
        assertThat(exactSum(list.items(), true)).isEqualByComparingTo("1410.00");
    }

    // ==================== ЭКРАН: ЗАКУПКА ПО ДНЯМ ====================

    @Test
    @DisplayName("EK-03 По дням: 690 + 390 + 330 = 1410; строка закупки == сумма её дней")
    void shoppingByDays() throws Exception {
        createFixtures();
        var days = parseDayShopping(objectMapper, getTrip("/summary/shopping/by-days"));
        assertThat(days).hasSize(3);

        assertThat(days.get(0).dayDate()).isEqualTo("2026-07-01");
        assertThat(exactSum(days.get(0).items(), true)).isEqualByComparingTo("690.00");
        assertThat(days.get(0).plannedCost()).isEqualByComparingTo("690");
        assertThat(days.get(0).amount("ЭК Гречка")).isEqualByComparingTo("3.000");
        assertThat(days.get(0).amount("ЭК Сгущёнка")).isEqualByComparingTo("1.300");

        assertThat(exactSum(days.get(1).items(), true)).isEqualByComparingTo("390.00");
        assertThat(days.get(1).plannedCost()).isEqualByComparingTo("390");
        assertThat(days.get(1).amount("ЭК Масло")).as("два приёма одного дня агрегируются").isEqualByComparingTo("0.500");

        assertThat(exactSum(days.get(2).items(), true)).isEqualByComparingTo("330.00");
        assertThat(days.get(2).plannedCost()).isEqualByComparingTo("330");

        // Каждая строка общей закупки == сумма той же строки по дням (до копейки и до грамма).
        var total = parseShopping(objectMapper, getTrip("/summary/shopping"));
        for (var item : total.items()) {
            var byDaysQty = BigDecimal.ZERO;
            var byDaysCost = BigDecimal.ZERO;
            for (var d : days) {
                for (var di : d.items()) {
                    if (di.ingredientId().equals(item.ingredientId())) {
                        byDaysQty = byDaysQty.add(di.totalAmount());
                        if (di.plannedCost() != null) byDaysCost = byDaysCost.add(di.plannedCost());
                    }
                }
            }
            assertThat(byDaysQty).as("количество %s по дням", item.ingredientName())
                    .isEqualByComparingTo(item.totalAmount());
            assertThat(byDaysCost).as("плановая стоимость %s по дням", item.ingredientName())
                    .isEqualByComparingTo(item.plannedCost() == null ? BigDecimal.ZERO : item.plannedCost());
        }
        var roundedDays = days.stream()
                .map(DayShopping::plannedCost)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(roundedDays).isEqualByComparingTo(total.totalPlannedCost());
    }

    // ==================== ЭКРАН: ЗАКУПКА И ЧЕКИ (ОВЕРРАЙДЫ) ====================

    @Test
    @DisplayName("EK-06 Чеки: Гр→120 (глоб id редиректится), Сг→250 (снепшот id): факт 1424, дельта 0.99")
    void priceOverrides() throws Exception {
        createFixtures();

        // Чек на продукт из справочника: UI/API может отправить ГЛОБАЛЬНЫЙ id —
        // сервер обязан применить его к trip-снепшоту (иначе ввод чека молча ничего не меняет).
        setOverride(grechkaId, "120.00");
        // И прямой snapshot-id путь (так шлёт вкладка «Закупка и чеки»).
        setOverride(snapshotOf(sgushId), "250.00");

        var list = parseShopping(objectMapper, getTrip("/summary/shopping"));
        assertThat(list.overriddenCount()).isEqualTo(2);
        assertThat(list.unit("ЭК Гречка", false)).isEqualByComparingTo("120.00");
        assertThat(list.actual("ЭК Гречка")).isEqualByComparingTo("684.00");
        assertThat(list.actual("ЭК Сгущёнка")).isEqualByComparingTo("500.00");
        assertThat(list.actual("ЭК Рис")).isEqualByComparingTo("40.00");
        assertThat(list.actual("ЭК Масло")).isEqualByComparingTo("200.00");
        // Чек меняет только цену — количества прежние.
        assertThat(list.amount("ЭК Гречка")).isEqualByComparingTo("5.700");
        assertThat(list.amount("ЭК Сгущёнка")).isEqualByComparingTo("2.000");

        assertThat(exactSum(list.items(), false)).isEqualByComparingTo("1424.00");
        assertThat(list.totalPlannedCost()).isEqualByComparingTo("1410");
        assertThat(list.totalActualCost()).isEqualByComparingTo("1424");
        assertThat(list.deltaPercent()).isEqualByComparingTo("0.99");

        // Факт проброшен в по-дневную разбивку: 685 + 420 + 319 = 1424.
        var days = parseDayShopping(objectMapper, getTrip("/summary/shopping/by-days"));
        assertThat(exactSum(days.get(0).items(), false)).isEqualByComparingTo("685.00");
        assertThat(exactSum(days.get(1).items(), false)).isEqualByComparingTo("420.00");
        assertThat(exactSum(days.get(2).items(), false)).isEqualByComparingTo("319.00");
        assertThat(days.get(0).actualCost()).isEqualByComparingTo("685");

        // «На человека» по факту: round(1424/4)=356; round(1424/24=59.33)=59.
        var p = parsePerson(objectMapper, getTrip("/summary/person"));
        assertThat(p.actualCostPerDefaultPerson()).isEqualByComparingTo("356");
        assertThat(p.actualCostPerPersonMeal()).isEqualByComparingTo("59");
    }

}

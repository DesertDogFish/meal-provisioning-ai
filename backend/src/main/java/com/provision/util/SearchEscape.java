package com.provision.util;

/**
 * Экранирование пользовательского ввода для LIKE-предикатов
 * (аудит 29.10.2026, подзадачи 20/30, plans/2026-10-29-full-audit.md).
 *
 * <p>SQL-injection через LIKE в проекте невозможен (все предикаты параметризованы:
 * Criteria API и JPQL {@code :param}-биндинги), но НЕэкранированные {@code %} и {@code _}
 * в поисковой строке меняют семантику выборки: запрос «100%» матчил бы весь каталог,
 * а «_» — любую строку. Экранирование делает поиск буквальным; SQL-запросы обязаны
 * использовать {@code ESCAPE '\'} (см. RecipeRepository, EmisProductRepository,
 * ProductSpecifications.matchesQuery).</p>
 */
public final class SearchEscape {

    /**
     * Символ экранирования — совпадает с ESCAPE-клаузулой в запросах.
     * ВЫБРАН '!' , а не backslash: HQL-литерал Hibernate 6 не умеет одиночный
     * backslash (SemanticException «escape literal must have exactly a single
     * character»), а Criteria API и JPQL должны использовать ОДИН символ.
     */
    public static final char ESCAPE_CHAR = '!';

    private SearchEscape() {
    }

    /**
     * Экранирует {@code !}, {@code %} и {@code _} для использования внутри
     * {@code LIKE '%...%'}; {@code null} возвращает как есть (JPQL-ветка
     * «фильтр не задан» опирается на NULL).
     */
    public static String like(String input) {
        if (input == null) {
            return null;
        }
        return input
                .replace("!", "!!")
                .replace("%", "!%")
                .replace("_", "!_");
    }
}

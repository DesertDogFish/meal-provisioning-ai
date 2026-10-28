package com.provision.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Единица измерения позиции ЕМИСС и приведение её цены к единице нашего продукта.
 *
 * <p>В классификаторе ЕМИСС единица зашита в название: «Фарш мясной, кг», «Консервы мясные,
 * 350 г», «Яйца куриные, 10 шт.», «Молоко питьевое…, л». Цена ряда всегда указана ЗА ЭТУ
 * единицу, поэтому без разбора суффикса цену нельзя ни показать корректно, ни переложить
 * в {@code ingredient_prices} (она легла бы «за кг» продукту, который продаётся штуками).</p>
 *
 * <p>Три машиночитаемых поля ({@code kind}/{@code amount}/{@code scale}) хранятся в
 * {@code emis_products} (V26); {@code label} — исходный суффикс для подписи в UI.
 * Правила разбора совпадают с сидом V27, сгенерированным из реальной выгрузки
 * (расхождения сида исправлены V28).</p>
 *
 * <p>Важно про {@code amount} у штучных позиций: «10 шт.» / «25 пакетиков» — цена указана
 * ЗА N ШТУК (amount=N, «Яйца куриные, 10 шт.» = 113,85 ₽ за десяток), а «упаковка 100 шт.» /
 * «упаковка 500 листов» — цена ЗА УПАКОВКУ (amount=1, «Бумага офисная, упаковка 500 листов»
 * = 423,07 ₽ за пачку). Различает их слово-упаковка в начале суффикса; без этого правила
 * пачка салфеток стоила бы как одна салфетка.</p>
 *
 * @param kind   MASS | VOLUME | COUNT | OTHER
 * @param amount сколько {@code scale} в единице, за которую указана цена
 * @param scale  KG | G | L | ML | PCS
 * @param label  исходный суффикс названия («кг», «350 г», «шт.») или null
 */
public record EmisUnit(String kind, BigDecimal amount, String scale, String label) {

    public static final EmisUnit OTHER = new EmisUnit("OTHER", BigDecimal.ONE, "PCS", null);

    private static final BigDecimal THOUSAND = BigDecimal.valueOf(1000);
    private static final Pattern SUFFIX = Pattern.compile(",\\s*([^,]+?)\\s*$");
    private static final Pattern NUM = Pattern.compile("[\\d.,]+");
    private static final Pattern MASS_KG = Pattern.compile("(\\d+(?:[.,]\\d+)?)\\s*кг");
    private static final Pattern MASS_G = Pattern.compile("(\\d+(?:[.,]\\d+)?)\\s*г(?:\\s*\\(\\d+\\s*мл\\))?");
    private static final Pattern VOL_ML = Pattern.compile("(\\d+(?:[.,]\\d+)?)\\s*мл");
    private static final Pattern VOL_L = Pattern.compile("(\\d+(?:[.,]\\d+)?)\\s*л");
    private static final Pattern AMP_ML = Pattern.compile("ампула\\s*(\\d+(?:[.,]\\d+)?)\\s*мл");
    private static final Pattern COUNT_PCS = Pattern.compile("(\\d+(?:[.,]\\d+)?)\\s*шт");
    private static final Pattern COUNT_PACK = Pattern.compile(
            "(\\d+)\\s*(таблеток|таблетка|капсул|капсула|драже|пакетиков|пакетов|штук|листов|"
                    + "ампул|доз|порций|бутылок|флаконов|свечей|колес|слов)");
    // «упаковка 100 шт.», «Бумага офисная, упаковка 500 листов»: впереди СЛОВО-УПАКОВКА,
    // значит единица наблюдения ЕМИСС — сама упаковка, а цена ряда относится к ней ЦЕЛИКОМ
    // (amount=1), а не к одной салфетке/листу. Проверяется реальными ценами выгрузки 28.10.2026:
    // 6509 «Бумага офисная, упаковка 500 листов» = 423,07 ₽ (цена пачки, не листа),
    // 6506 «Бумажные столовые салфетки, упаковка 100 шт.» = 55,98 ₽ (цена упаковки).
    // Противоположный случай — «Яйца куриные, 10 шт.» (113,85 ₽ за десяток) и «Чай …
    // 25 пакетиков» (84,14 ₽ за коробку): там слово-упаковки нет, число и есть количество
    // штук в наблюдаемой единице, поэтому amount=N (см. COUNT_PCS/COUNT_PACK).
    private static final Pattern PACK_OF = Pattern.compile(
            "(?:коробок|коробка|упаковка|упаковке|пачка|банка|блок|набор|флакон|бутылка|рулон|"
                    + "ампула|комплект|пакет|лист|пара|доза|порция|штука|капсула|таблетка|драже|свеча)\\s+"
                    + "\\d+(?:[.,]\\d+)?\\s*(?:шт\\.?|штук|листов|лист|капсул|капсулы|таблеток|таблетка|"
                    + "пакетиков|пакетов|доз|порций|бутылок|флаконов|свечей|драже|ампул|колес|слов|пар)?");

    private static final java.util.Set<String> COUNT_WORDS = java.util.Set.of(
            "коробок", "упаковка", "рулон", "полис", "комплект", "пакет", "доза", "порция",
            "банка", "бутылка", "ампула", "флакон", "пара", "лист", "штука", "набор", "блок",
            "пачка", "капсула", "таблетка", "драже", "свеча");

    /** Разбор суффикса названия позиции ЕМИСС; нераспознанное — {@link #OTHER}. */
    public static EmisUnit of(String productName) {
        if (productName == null) {
            return OTHER;
        }
        Matcher suffix = SUFFIX.matcher(productName);
        if (!suffix.find()) {
            return OTHER;
        }
        String raw = suffix.group(1).trim();
        String s = raw.replaceAll("\\s+", " ").toLowerCase();
        while (s.endsWith(".")) {
            s = s.substring(0, s.length() - 1).trim();
        }

        Matcher m = MASS_KG.matcher(s);
        if (m.matches()) return new EmisUnit("MASS", decimal(m.group(1)), "KG", raw);
        if (s.equals("кг") || s.equals("килограмм")) return new EmisUnit("MASS", BigDecimal.ONE, "KG", raw);
        m = MASS_G.matcher(s);
        if (m.matches()) return new EmisUnit("MASS", decimal(m.group(1)), "G", raw);
        if (s.equals("г") || s.equals("грамм")) return new EmisUnit("MASS", BigDecimal.ONE, "G", raw);
        if (s.equals("т")) return new EmisUnit("MASS", THOUSAND, "KG", raw);

        m = VOL_ML.matcher(s);
        if (m.matches()) return new EmisUnit("VOLUME", decimal(m.group(1)), "ML", raw);
        if (s.equals("мл")) return new EmisUnit("VOLUME", BigDecimal.ONE, "ML", raw);
        m = VOL_L.matcher(s);
        if (m.matches()) return new EmisUnit("VOLUME", decimal(m.group(1)), "L", raw);
        if (s.equals("л") || s.equals("литр")) return new EmisUnit("VOLUME", BigDecimal.ONE, "L", raw);
        m = AMP_ML.matcher(s);
        if (m.matches()) return new EmisUnit("VOLUME", decimal(m.group(1)), "ML", raw);

        m = COUNT_PCS.matcher(s);
        if (m.matches()) return new EmisUnit("COUNT", decimal(m.group(1)), "PCS", raw);
        if (s.equals("шт")) return new EmisUnit("COUNT", BigDecimal.ONE, "PCS", raw);
        m = COUNT_PACK.matcher(s);
        if (m.matches()) return new EmisUnit("COUNT", decimal(m.group(1)), "PCS", raw);
        if (PACK_OF.matcher(s).matches()) return new EmisUnit("COUNT", BigDecimal.ONE, "PCS", raw);
        if (COUNT_WORDS.contains(s)) return new EmisUnit("COUNT", BigDecimal.ONE, "PCS", raw);

        return new EmisUnit("OTHER", BigDecimal.ONE, "PCS", raw);
    }

    /**
     * Цена за единицу нашего продукта из цены позиции ЕМИСС.
     *
     * <p>Правила (совпадают с ARCHITECTURE, секция цен): вес/объём приводятся парами, для
     * штучного продукта нужен его вес {@code pieceWeightG}; несовместимые единицы дают
     * {@code null} — точка отбрасывается и попадает в детали синка как «отброшено»,
     * а не молча искажает цену.</p>
     *
     * @param emisPrice      цена ряда ЕМИСС (за {@link #amount} × {@link #scale})
     * @param ingredientUnit единица продукта: KG | L | PCS | PACK
     * @param pieceWeightG   вес штуки в граммах (нужен для PCS при цене ЕМИСС за вес)
     * @return цена за единицу продукта либо null, если пересчёт невозможен
     */
    public BigDecimal pricePerUnit(BigDecimal emisPrice, String ingredientUnit, BigDecimal pieceWeightG) {
        if (emisPrice == null || ingredientUnit == null || emisPrice.compareTo(BigDecimal.ZERO) <= 0
                || amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }
        String unit = ingredientUnit.toUpperCase();
        return switch (kind) {
            case "MASS" -> {
                BigDecimal grams = "KG".equals(scale) ? amount.multiply(THOUSAND) : amount;
                BigDecimal perGram = emisPrice.divide(grams, 8, RoundingMode.HALF_UP);
                yield switch (unit) {
                    case "KG" -> perGram.multiply(THOUSAND);
                    case "PCS", "PACK" -> pieceWeightG == null ? null : perGram.multiply(pieceWeightG);
                    default -> null;
                };
            }
            case "VOLUME" -> {
                BigDecimal millis = "L".equals(scale) ? amount.multiply(THOUSAND) : amount;
                BigDecimal perMl = emisPrice.divide(millis, 8, RoundingMode.HALF_UP);
                // Штучному продукту объём не восстановить: piece_weight_g — граммы, не миллилитры.
                yield "L".equals(unit) ? perMl.multiply(THOUSAND) : null;
            }
            case "COUNT" -> ("PCS".equals(unit) || "PACK".equals(unit))
                    ? emisPrice.divide(amount, 2, RoundingMode.HALF_UP)
                    : null;
            default -> null;
        };
    }

    /** Итог — копейки, HALF_UP (как в {@code ingredient_prices}). */
    public BigDecimal rounded(BigDecimal pricePerUnit) {
        return pricePerUnit == null ? null : pricePerUnit.setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal decimal(String raw) {
        return new BigDecimal(NUM.matcher(raw).results().findFirst()
                .map(mr -> mr.group().replace(',', '.'))
                .orElse("1"));
    }
}

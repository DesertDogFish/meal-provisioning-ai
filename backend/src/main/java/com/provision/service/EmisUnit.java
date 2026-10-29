package com.provision.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
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
     * <p>Правила (совпадают с ARCHITECTURE, секция цен): вес и объём приводятся парами, для
     * штучного продукта нужен его {@code pieceWeightG}; несовместимые единицы дают
     * {@code null} — точка отбрасывается и попадает в детали синка как «отброшено»,
     * а не молча искажает цену.</p>
     *
     * <p><b>Плотность ≈ 1</b> (решение владельца 29.10.2026): масса и объём пересчитываются
     * один к одному — 1 кг ≈ 1 л, поэтому {@code MASS→L} и {@code VOLUME→KG} разрешены,
     * а {@code piece_weight_g} штучного продукта трактуется как миллилитры, если цена ряда
     * указана за объём («Антисептик для рук, 100 мл» → наша штука 100 мл = цена ряда).
     * Правило пригодно для пищевых жидкостей и бытовой химии; для сжиженного газа,
     * аэрозолей и прочих «далеко не единичных» сред оно неверно физически — такие позиции
     * не привязываются вовсе (решение по «Газовому баллону», см. V29 и файл плана).</p>
     *
     * <p>По-прежнему НЕ приводятся пары, где не хватает данных: {@code COUNT→KG/L}
     * (нужен вес штуки, которого в классификаторе нет: «Яйца куриные, 10 шт.» против
     * яичного порошка в кг) и {@code OTHER} (услуга либо нераспознанная единица).</p>
     *
     * @param emisPrice      цена ряда ЕМИСС (за {@link #amount} × {@link #scale})
     * @param ingredientUnit единица продукта: KG | L | PCS | PACK
     * @param pieceWeightG   вес штуки в граммах (для PCS при цене ЕМИСС за вес; при цене
     *                       за объём то же число трактуется как миллилитры — плотность ≈ 1)
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
                    // Плотность ≈ 1: цена за кг переносится и в литр (1 кг ≈ 1 л).
                    case "KG", "L" -> perGram.multiply(THOUSAND);
                    case "PCS", "PACK" -> pieceWeightG == null ? null : perGram.multiply(pieceWeightG);
                    default -> null;
                };
            }
            case "VOLUME" -> {
                BigDecimal millis = "L".equals(scale) ? amount.multiply(THOUSAND) : amount;
                BigDecimal perMl = emisPrice.divide(millis, 8, RoundingMode.HALF_UP);
                yield switch (unit) {
                    // Плотность ≈ 1: цена за литр переносится и в килограмм (1 л ≈ 1 кг).
                    case "L", "KG" -> perMl.multiply(THOUSAND);
                    // Штучному продукту цена ряда за объём приводится через piece_weight_g,
                    // прочитанный как миллилитры: «Антисептик для рук, 100 мл» (VOLUME, 100)
                    // и наша штука piece_weight_g=100 → цена ряда и есть цена штуки.
                    case "PCS", "PACK" -> pieceWeightG == null ? null : perMl.multiply(pieceWeightG);
                    default -> null;
                };
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

    // ==================== Предупреждение о сомнительной привязке (KB-5) ====================

    /**
     * «Масштаб не сопоставим»: позиция ЕМИСС крупнее штуки продукта в это число раз и более.
     * Порог выбран по фактическим данным каталога 29.10.2026: принятые владельцем привязки
     * «цена категории» (KB-8) дают разницу до 25 раз (кг против пакетика 40 г) и молчат,
     * а ошибочная пара «Газ сжиженный в баллонах, 50 л» против баллона 220 г — 227 раз и звучит.
     */
    private static final BigDecimal MAGNITUDE_LIMIT = BigDecimal.valueOf(100);

    /**
     * «Цена уехала»: пересчёт даёт цену, отличающуюся от текущей цены продукта в это число раз
     * и более (в любую сторону). Намеренно мягче коридора сверки 0,5–2×: 13 принятых привязок
     * «цена категории» дают ×0,18–4,7 и не должны дёргать админа при каждом открытии пикера.
     */
    private static final BigDecimal DEVIATION_LIMIT = BigDecimal.valueOf(10);

    /**
     * Предупреждение для админа о сомнительной привязке продукта к этой позиции ЕМИСС.
     *
     * <p>Решение владельца 29.10.2026 по KB-5: «нужно предупреждение, остальное на откуп админа» —
     * привязка НЕ блокируется ни в UI, ни в {@code ProductService}; система только показывает,
     * к чему она приведёт. Проверяются три признака, каждый из которых был причиной реальной
     * ошибки в каталоге:</p>
     * <ol>
     *   <li><b>Пересчёт невозможен</b> ({@link #pricePerUnit} = null): единица позиции не
     *       распознана (услуга/«прочее»), пара не приводится (позиция в штуках против продукта
     *       в кг — «Яйца куриные, 10 шт.» против яичного порошка), либо у штучного продукта не
     *       задан {@code piece_weight_g}. Синхронизация такую точку отбросит, цена останется
     *       ручной — админу полезно знать это ДО сохранения.</li>
     *   <li><b>Масштаб не сопоставим</b>: единица наблюдения позиции крупнее штуки продукта в
     *       100 раз и более ({@code MAGNITUDE_LIMIT}). Правило «плотность ≈ 1» на такой паре
     *       физически неверно (сжиженный газ, аэрозоли), поэтому цена оказывается заниженной
     *       на порядки.</li>
     *   <li><b>Цена уехала</b>: после пересчёта цена отличается от текущей цены продукта в
     *       10 раз и более ({@code DEVIATION_LIMIT}) — общая страховка для случаев, которые не описаны
     *       правилами 1–2 (например, позиция за упаковку 100 шт. против нашей одной штуки).</li>
     * </ol>
     *
     * @param emisPrice      свежая цена позиции; null или ≤ 0 — цен в копии ещё нет (KB-7).
     *                       На признаки 1 и 2 это не влияет (они структурные: привязать баллон
     *                       220 г к «Газ сжиженный в баллонах, 50 л» нельзя и без цены),
     *                       признак 3 без цены просто не проверяется
     * @param ingredientUnit единица продукта: KG | L | PCS | PACK
     * @param pieceWeightG   вес штуки в граммах (для цены за объём трактуется как мл)
     * @param currentPrice   текущая цена продукта за ту же единицу; null — цены ещё нет
     * @return null, если пара выглядит правдоподобно, иначе текст предупреждения (ru)
     */
    public String linkWarning(BigDecimal emisPrice, String ingredientUnit, BigDecimal pieceWeightG,
                              BigDecimal currentPrice) {
        if (ingredientUnit == null || ingredientUnit.isBlank()) {
            return null;
        }
        List<String> notes = new ArrayList<>(2);

        // 1) Пересчёт невозможен — проверяем СТРУКТУРНО (convertsTo), а не по pricePerUnit:
        // у позиции может ещё не быть цен в копии (9453 «Газ сжиженный в баллонах, 50 л»),
        // но привязка от этого правильнее не становится.
        if (!convertsTo(ingredientUnit, pieceWeightG)) {
            notes.add(notConvertible(ingredientUnit, pieceWeightG));
        } else {
            // 2) Масштаб: сравниваем физический размер единицы наблюдения с фасовкой продукта.
            BigDecimal positionSize = observationSize();
            if (positionSize != null && isPiece(ingredientUnit) && pieceWeightG != null
                    && pieceWeightG.compareTo(BigDecimal.ZERO) > 0) {
                BigDecimal times = positionSize.divide(pieceWeightG, 0, RoundingMode.HALF_UP);
                if (times.compareTo(MAGNITUDE_LIMIT) >= 0) {
                    notes.add("Масштаб не сопоставим: позиция указана за " + unitInQuotes()
                            + ", а штука продукта — " + plain(pieceWeightG) + " г (разница в " + plain(times)
                            + " раз). Правило «плотность ≈ 1» на такой паре физически неверно"
                            + " (пример владельца: «Газ сжиженный в баллонах, 50 л» ≠ резьбовой баллон 220 г),"
                            + " поэтому цена будет занижена на порядки.");
                }
            }
        }

        // 3) Отклонение пересчитанной цены от текущей цены продукта — только если есть обе цены.
        BigDecimal perUnit = pricePerUnit(emisPrice, ingredientUnit, pieceWeightG);
        if (perUnit != null) {
            if (rounded(perUnit).compareTo(BigDecimal.ZERO) == 0) {
                notes.add("После пересчёта цена продукта округляется до 0,00 ₽ за "
                        + unitWord(ingredientUnit) + " — позиция " + unitInQuotes()
                        + " слишком крупная для такой фасовки.");
            } else if (currentPrice != null && currentPrice.compareTo(BigDecimal.ZERO) > 0
                    && perUnit.compareTo(BigDecimal.ZERO) > 0) {
                BigDecimal up = perUnit.divide(currentPrice, 2, RoundingMode.HALF_UP);
                BigDecimal down = currentPrice.divide(perUnit, 2, RoundingMode.HALF_UP);
                if (up.compareTo(DEVIATION_LIMIT) >= 0 || down.compareTo(DEVIATION_LIMIT) >= 0) {
                    notes.add("Цена после привязки — " + kopecks(perUnit) + " ₽ за "
                            + unitWord(ingredientUnit) + " против текущей " + kopecks(currentPrice)
                            + " ₽: отличается в " + plain(up.max(down).setScale(0, RoundingMode.HALF_UP))
                            + " раз. Проверьте, та ли это позиция и та ли фасовка.");
                }
            }
        }
        return notes.isEmpty() ? null : String.join(" ", notes);
    }

    /**
     * Приводится ли цена этой позиции к единице продукта В ПРИНЦИПЕ — то же правило, что и в
     * {@link #pricePerUnit}, но без требования иметь цену (см. {@link #linkWarning}).
     *
     * @param ingredientUnit единица продукта: KG | L | PCS | PACK
     * @param pieceWeightG   вес штуки в граммах (для цены за объём трактуется как мл)
     */
    public boolean convertsTo(String ingredientUnit, BigDecimal pieceWeightG) {
        if (ingredientUnit == null || ingredientUnit.isBlank()
                || amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            return false;
        }
        return switch (kind == null ? "" : kind) {
            case "MASS", "VOLUME" -> switch (ingredientUnit.toUpperCase()) {
                case "KG", "L" -> true;
                case "PCS", "PACK" -> pieceWeightG != null && pieceWeightG.compareTo(BigDecimal.ZERO) > 0;
                default -> false;
            };
            case "COUNT" -> isPiece(ingredientUnit);
            default -> false;
        };
    }

    /** Текст для случая, когда цена позиции не переносится на продукт ({@link #convertsTo} = false). */
    private String notConvertible(String ingredientUnit, BigDecimal pieceWeightG) {
        String ours = unitWord(ingredientUnit);
        if ("OTHER".equals(kind)) {
            return "Единица позиции не распознана" + unitSuffix() + " — обычно это услуга или «прочее»."
                    + " Цена ряда на продукт не переносится, синхронизация её пропустит.";
        }
        if ("COUNT".equals(kind) && !isPiece(ingredientUnit)) {
            return "Позиция указана в штуках" + unitSuffix() + ", а продукт — в " + ours
                    + ": веса штуки в классификаторе нет, перенести цену нельзя"
                    + " (пример: «Яйца куриные, 10 шт.» против яичного порошка в кг).";
        }
        if (isPiece(ingredientUnit) && (pieceWeightG == null || pieceWeightG.compareTo(BigDecimal.ZERO) <= 0)) {
            return "Для пересчёта нужен вес одной штуки (piece_weight_g) — у продукта он не задан."
                    + " Без него цена позиции" + unitSuffix() + " на штуку не переносится.";
        }
        return "Единицы несовместимы: позиция" + unitSuffix() + ", продукт — в " + ours
                + ". Цена ряда на продукт не переносится, синхронизация её пропустит.";
    }

    /**
     * Физический размер единицы наблюдения в граммах (для MASS) или миллилитрах (для VOLUME)
     * — с учётом правила «плотность ≈ 1» величины сравнимы. Для COUNT/OTHER — null: штуки
     * классификатора не имеют физического размера.
     */
    private BigDecimal observationSize() {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }
        return switch (kind == null ? "" : kind) {
            case "MASS" -> "KG".equals(scale) ? amount.multiply(THOUSAND) : amount;
            case "VOLUME" -> "L".equals(scale) ? amount.multiply(THOUSAND) : amount;
            default -> null;
        };
    }

    private static boolean isPiece(String ingredientUnit) {
        String u = ingredientUnit.toUpperCase();
        return "PCS".equals(u) || "PACK".equals(u);
    }

    private static String unitWord(String ingredientUnit) {
        return switch (ingredientUnit.toUpperCase()) {
            case "KG" -> "кг";
            case "L" -> "л";
            case "PCS" -> "шт";
            case "PACK" -> "уп";
            default -> ingredientUnit;
        };
    }

    /** «(«50 л»)» — подпись единицы позиции в скобках; пусто, если {@link #label} не задан. */
    private String unitSuffix() {
        return label == null || label.isBlank() ? "" : " («" + label.trim() + "»)";
    }

    private String unitInQuotes() {
        return label == null || label.isBlank() ? "нераспознанную единицу" : "«" + label.trim() + "»";
    }

    private static String plain(BigDecimal v) {
        return v.stripTrailingZeros().toPlainString();
    }

    /** Копейки через запятую — как их показывает UI («177,53»). */
    private static String kopecks(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP).toPlainString().replace('.', ',');
    }

    private static BigDecimal decimal(String raw) {
        return new BigDecimal(NUM.matcher(raw).results().findFirst()
                .map(mr -> mr.group().replace(',', '.'))
                .orElse("1"));
    }
}

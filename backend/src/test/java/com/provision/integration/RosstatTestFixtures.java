package com.provision.integration;

import com.provision.exception.IntegrationUnavailableException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.net.ConnectException;
import java.net.UnknownHostException;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicInteger;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Фикстуры и вспомогательные классы для тестов RosstatEmisProvider.
 *
 * <p>Вынесено из монолита RosstatEmisProviderTest (845 строк, правило R8):
 * фикс-дата, HTML/XML-фикстуры портала, FakeTransport, билдер провайдера и
 * читатели ресурсов. Поведение тестов не менялось.</p>
 */
final class RosstatTestFixtures {

    private RosstatTestFixtures() {}

    /** Фиксированная «сегодняшня» дата: окно месяцев в buildFormBody обязано быть
     *  детерминированным, иначе тесты плывут в зависимости от дня запуска. */
    static final LocalDate TODAY = LocalDate.of(2026, 10, 28);

    /** Фикстура страницы показателя: токен + JS-словарь фильтров + оси.
     *
     *  <p>Форма разметки сверена с живым fedstat.ru/indicator/31448 (curl-зонд владельца,
     *  28.10.2026, см. plans/done/2026-10-28-emis-download-csrf-and-volume.md):</p>
     *  <ul>
     *    <li>значение {@code struts.token.name} на портале — <b>{@code token}</b>, а не
     *        «struts.token». Прежняя фикстура выдумала «struts.token», из-за чего
     *        захардкоженное имя CSRF-поля в {@code buildFormBody} проходило тесты,
     *        а прод получал от портала страницу «CSRF блокировка» (127 байт);</li>
     *    <li>обе оси колонок на портале — {@code top_columns:[3, 33560]}: «Год» (2000…2026)
     *        и «Период» (12 месяцев, id значений 1540228…1540283). Сужает провайдер только
     *        «Период»: сужение «Года» портал отклоняет (302), см. дефект №6 плана. Здесь
     *        оба поля в осях и с несколькими значениями, чтобы
     *        проверять сужение глубины истории;</li>
     *    <li>поле 30611 «Единица измерения» на портале есть в {@code filters}, но НЕ
     *        упомянуто в осях (оно приходит в JS-массиве {@code filterObjectIds}, который
     *        эталон переименовывает в lineObjectIds) — в фикстуре оно воспроизводит
     *        fallback-ветку {@code buildFormBody}.</li>
     *  </ul> */
    static final String PAGE_HTML = """
            <html><head><title>Средние потребительские цены на товары и услуги — ЕМИСС</title></head>
            <body>
            <div id="downloadTokenHolder">
              <input type="hidden" name="struts.token.name" value="token">
              <input type="hidden" name="token" value="TOKEN123">
            </div>
            <script type="text/javascript">
            var grid = {
              filters: {
                '0': { title: 'Средние потребительские цены', values: { '31448': { title: 'Средние потребительские цены на товары и услуги' } } },
                '30': { title: 'Классификатор объектов административно-территориального деления (ОКАТО)', values: { '1': { title: 'Российская Федерация' }, '2': { title: 'Белгородская область' } } },
                '32': { title: 'Виды товаров и услуг', values: { '101': { title: 'Гречневая крупа' }, '102': { title: 'Молоко питьевое' }, '103': { title: 'Яйца куриные' } } },
                '33': { title: 'Год', values: { '2000': { title: '2000' }, '2001': { title: '2001' }, '2024': { title: '2024' }, '2025': { title: '2025' }, '2026': { title: '2026' } } },
                '33560': { title: 'Период', values: { '1540283': { title: 'январь' }, '1540282': { title: 'февраль' }, '1540236': { title: 'март' }, '1540229': { title: 'апрель' }, '1540235': { title: 'май' }, '1540234': { title: 'июнь' }, '1540233': { title: 'июль' }, '1540228': { title: 'август' }, '1540276': { title: 'сентябрь' }, '1540273': { title: 'октябрь' }, '1540272': { title: 'ноябрь' }, '1540230': { title: 'декабрь' } } },
                '30611': { title: 'Единица измерения', values: { '950351': { title: 'рубль' } } }
              },
              left_columns: ['30'],
              top_columns: ['33', '33560'],
              groups: ['32']
            };
            grid.init();
            </script>
            </body></html>
            """;

    /** Фикстура SDMX GenericData: RF + регион-конкурент, две категории, запятая-десятичная. */
    static final String SDMX_XML = """
            <?xml version="1.0" encoding="UTF-8"?>
            <GenericData xmlns="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message"
                         xmlns:generic="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/data/generic"
                         xmlns:structure="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/structure">
             <CodeLists>
              <structure:CodeList id="30"><structure:Name>ОКАТО</structure:Name>
                <structure:Code value="1">Российская Федерация</structure:Code>
                <structure:Code value="2">Белгородская область</structure:Code>
              </structure:CodeList>
              <structure:CodeList id="32"><structure:Name>Виды товаров и услуг</structure:Name>
                <structure:Code value="101">Гречневая крупа</structure:Code>
                <structure:Code value="102">Молоко питьевое</structure:Code>
                <!-- CodeList в ответе ЕМИСС — ПОЛНЫЙ словарь номенклатуры (на боевом
                     индикаторе 885 позиций), включая категории без рядов данных:
                     ряды в DataSet есть не для каждого кода. -->
                <structure:Code value="103">Яйца куриные</structure:Code>
              </structure:CodeList>
              <structure:CodeList id="33"><structure:Name>Период</structure:Name>
                <structure:Code value="2025-08">Август 2025</structure:Code>
                <structure:Code value="2025-09">Сентябрь 2025</structure:Code>
              </structure:CodeList>
             </CodeLists>
             <DataSet>
              <generic:Series>
               <generic:SeriesKey>
                 <generic:Value concept="30" value="1"/>
                 <generic:Value concept="32" value="101"/>
               </generic:SeriesKey>
               <generic:Obs><generic:ObsDimension value="2025-08"/><generic:ObsValue value="87.4"/></generic:Obs>
               <generic:Obs><generic:ObsDimension value="2025-09"/><generic:ObsValue value="89.1"/></generic:Obs>
              </generic:Series>
              <generic:Series>
               <generic:SeriesKey>
                 <generic:Value concept="30" value="2"/>
                 <generic:Value concept="32" value="101"/>
               </generic:SeriesKey>
               <generic:Obs><generic:ObsDimension value="2025-09"/><generic:ObsValue value="80.0"/></generic:Obs>
              </generic:Series>
              <generic:Series>
               <generic:SeriesKey>
                 <generic:Value concept="30" value="1"/>
                 <generic:Value concept="32" value="102"/>
               </generic:SeriesKey>
               <generic:Obs><generic:ObsDimension value="2025-09"/><generic:ObsValue value="91,5"/></generic:Obs>
              </generic:Series>
             </DataSet>
            </GenericData>
            """;

    /** Фейковый транспорт: страница + SDMX, счётчики вызовов, режим отказа. */
    static class FakeTransport implements Transport {
        int gets;
        int posts;
        String lastFormBody;
        int pageStatus = 200;
        int dataStatus = 200;
        String pageBody = PAGE_HTML;
        String dataBody = SDMX_XML;
        String dataContentType = "text/xml";
        String dataLocation;
        boolean ioFailure;

        @Override
        public Session open() {
            return new Session() {
                @Override
                public PageResult get(String url) throws IOException {
                    gets++;
                    if (ioFailure) throw new IOException("connection reset");
                    return new PageResult(pageStatus, pageBody);
                }

                @Override
                public PageResult postForm(String url, String formBody) throws IOException {
                    posts++;
                    lastFormBody = formBody;
                    if (ioFailure) throw new IOException("connection reset");
                    return new PageResult(dataStatus, dataBody,
                            dataContentType, dataLocation);
                }

                @Override
                public void close() { }
            };
        }
    }

    static RosstatEmisProvider provider(FakeTransport t) {
        // Кэша больше нет: единственная точка входа — downloadSnapshot() («Синхронизировать»).
        return new RosstatEmisProvider("https://www.fedstat.ru", "31448",
                "Российская Федерация", 2, 33_554_432L, t);
    }

    static String resource(String path) throws IOException {
        try (var in = RosstatEmisProviderTest.class.getClassLoader().getResourceAsStream(path)) {
            if (in == null) throw new IOException("нет тестового ресурса: " + path);
            return new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        }
    }

    // ==================== Загрузка выгрузки файлом (parseSnapshot, KB-1) ====================

    /** Байты тестового ресурса — путь ручной загрузки выгрузки админом. */
    static byte[] resourceBytes(String path) throws IOException {
        try (var in = RosstatEmisProviderTest.class.getClassLoader().getResourceAsStream(path)) {
            if (in == null) throw new IOException("нет тестового ресурса: " + path);
            return in.readAllBytes();
        }
    }

    // ============ AU-05: потоковый контракт parseSnapshot(InputStream, size, name) ============
    //
    // Байтовый делегат (тесты выше) проверяет СООБЩЕНИЯ и распознавание формата. Здесь —
    // только то, что байтами в принципе не проверяется: что файл не материализуется в heap.
    // Дублировать 6 тестов формата на потоке смысла нет (делегат идёт в тот же код).

    /** Поток, который считает обращения к read(): отказ по declared-размеру не должен читать. */
    static final class CountingStream extends FilterInputStream {
        final AtomicInteger reads = new AtomicInteger();
        boolean failOnRead;

        CountingStream(byte[] data) {
            super(new ByteArrayInputStream(data));
        }

        @Override
        public int read() throws IOException {
            reads.incrementAndGet();
            if (failOnRead) throw new IOException("Connection reset");
            return super.read();
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            reads.incrementAndGet();
            if (failOnRead) throw new IOException("Connection reset");
            return super.read(b, off, len);
        }
    }

    // ==================== Диагностика сетевых отказов (R10) ====================

    /** Провайдер, у которого сессия бросает заданное исключение на любом запросе. */
    static RosstatEmisProvider providerFailingWith(IOException e) {
        return new RosstatEmisProvider("https://www.fedstat.ru", "31448",
                "Российская Федерация", 2, 33_554_432L, () -> new Session() {
                    @Override
                    public PageResult get(String url) throws IOException {
                        throw e;
                    }

                    @Override
                    public PageResult postForm(String url, String formBody) throws IOException {
                        throw e;
                    }

                    @Override
                    public void close() { }
                });
    }
}

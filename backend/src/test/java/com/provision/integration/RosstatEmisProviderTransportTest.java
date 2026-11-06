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

import static com.provision.integration.RosstatTestFixtures.*;

/**
 * Fix-13: testConnection, полный конвейер downloadSnapshot, HTML вместо выгрузки,
 * 302 при сужении оси, потоковые отказы (лимиты, обрыв).
 */
@DisplayName("RosstatEmisProvider: транспорт и отказы портала")
class RosstatEmisProviderTransportTest {

    @Test
    @DisplayName("testConnection: 200 + токен → успех с числом категорий (один GET, без ретраев)")
    void testConnectionSuccess() {
        FakeTransport t = new FakeTransport();
        var status = provider(t).testConnection();
        assertThat(status.available()).isTrue();
        assertThat(status.message()).contains("31448").contains("категорий в справочнике: 3");
        assertThat(t.gets).isEqualTo(1);
        assertThat(t.posts).isZero(); // проверка подключения НЕ качает SDMX
    }

    @Test
    @DisplayName("testConnection: 403 → понятная ошибка про анти-бот/сеть РФ")
    void testConnection403() {
        FakeTransport t = new FakeTransport();
        t.pageStatus = 403;
        t.pageBody = "<h1>Forbidden</h1>";
        var status = provider(t).testConnection();
        assertThat(status.available()).isFalse();
        assertThat(status.message()).contains("403").contains("анти-бот");
    }

    @Test
    @DisplayName("testConnection: страница без токена → ошибка с диагностикой содержимого")
    void testConnectionNoToken() {
        FakeTransport t = new FakeTransport();
        t.pageBody = "<html><head><title>ЕМИСС</title></head><body><h1>Показатель не найден</h1></body></html>";
        var status = provider(t).testConnection();
        assertThat(status.available()).isFalse();
        assertThat(status.message())
                .contains("не найден одноразовый токен")
                .contains("Показатель не найден")
                .contains("ROSSTAT_INDICATOR_ID"); // справочника фильтров тоже нет → подсказка про id
    }

    @Test
    @DisplayName("downloadSnapshot: полная выгрузка SDMX, POST-тело с токеном, справочник и цены по месяцам")
    void downloadSnapshotFullPipeline() {
        FakeTransport t = new FakeTransport();
        var p = provider(t);

        EmisSnapshot snapshot = p.downloadSnapshot();
        assertThat(t.posts).isEqualTo(1);
        // CSRF-токен уходит в поле с именем, прочитанным со страницы, и запрос содержит id показателя
        assertThat(t.lastFormBody).contains("struts.token.name=token");
        assertThat(t.lastFormBody).contains("token=TOKEN123");
        assertThat(t.lastFormBody).contains("id=31448");
        assertThat(t.lastFormBody).doesNotContain("struts.token=TOKEN123");
        // справочник (CodeList товаров) и ряды цен — то, что укладывается в локальную копию
        assertThat(snapshot.catalog()).containsEntry("101", "Гречневая крупа");
        assertThat(snapshot.prices().get("101")).hasSize(2);
        assertThat(snapshot.prices().get("101").get(0).price()).isEqualByComparingTo("87.4");
        assertThat(snapshot.prices().get("101").get(0).date()).isEqualTo(LocalDate.of(2025, 8, 1));
        // неизвестная позиция — просто отсутствует, без ошибки
        assertThat(snapshot.prices()).doesNotContainKey("999");

        // кэша нет: каждый запуск синхронизации — новая выгрузка
        p.downloadSnapshot();
        assertThat(t.posts).isEqualTo(2);
    }

    @Test
    @DisplayName("ДЕФЕКТ №1/№4: страница «CSRF блокировка» (живые 127 байт портала) → в ошибке видны Content-Type и текст заглушки")
    void htmlInsteadOfSdmx() {
        FakeTransport t = new FakeTransport();
        // Дословный ответ fedstat.ru на POST с CSRF-токеном в поле не с тем именем (зонд A).
        t.dataBody = """
                <!DOCTYPE html>
                <html>
                <title>ЕМИСС</title>
                <body>
                <p align="center">CSRF блокировка\040
                </body>
                </html>""";
        t.dataContentType = "text/html;charset=UTF-8";
        var p = provider(t);

        assertThatThrownBy(p::downloadSnapshot)
                .isInstanceOf(IntegrationUnavailableException.class)
                // R10: по сообщению должно быть понятно, ЧТО именно ответил портал
                .hasMessageContaining("CSRF блокировка")
                .hasMessageContaining("text/html");
    }

    @Test
    @DisplayName("ДЕФЕКТ №3: 302 на POST — это отказ портала по фильтрам, а не «истёкший токен»; Location виден в ошибке")
    void redirect302IsReportedAsRejection() {
        FakeTransport t = new FakeTransport();
        t.dataStatus = 302;
        t.dataBody = "";
        t.dataContentType = null;
        t.dataLocation = "/indicator/31448.do";
        var p = provider(t);

        assertThatThrownBy(p::downloadSnapshot)
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("302")
                .hasMessageContaining("/indicator/31448.do")
                .hasMessageContaining("фильтр")
                .hasMessageNotContaining("истёк");
    }

    @Test
    @DisplayName("extractBalanced: строки со скобками внутри не ломают балансировку")
    void balancedExtractionWithStrings() {
        String text = "filters: { 'a': { title: 'Виды {не поле}', values: {} } } хвост";
        String block = EmisPortalPage.extractBalanced(text, "filters:", '{');
        assertThat(block).isEqualTo("{ 'a': { title: 'Виды {не поле}', values: {} } }");
    }

    @Test
    @DisplayName("testConnection: сетевой отказ — статус ошибки, а не исключение (UI не блокируется)")
    void testConnectionReportsIoFailureAsStatus() {
        var status = providerFailingWith(new UnknownHostException("www.fedstat.ru")).testConnection();

        assertThat(status.available()).isFalse();
        assertThat(status.message()).contains("ЕМИСС недоступен")
                .contains("не удалось определить адрес fedstat.ru");
    }
}

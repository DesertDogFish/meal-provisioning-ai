package com.provision.integration;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.PushbackInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Locale;

/** Ответ портала текстом: страница показателя и прочие не-выгрузки. */
/** Ответ портала. `contentType` и `location` обязательны для диагностики (R10):
 *  отказ ЕМИСС различается именно по ним — `302` + `Location` означает «набор фильтров
 *  отклонён», а `200` + `text/html` — CSRF-блокировку или перерисованную страницу
 *  показателя. Без них обе ситуации выглядят одинаково («пришёл HTML»). */
record PageResult(int status, String body, String contentType, String location) {
    /** Совместимость с тестовыми фейками, которым заголовки не нужны. */
    public PageResult(int status, String body) {
        this(status, body, null, null);
    }
}

/**
 * Ответ выгрузки, тело которого НЕ материализуется в строку (дефект KB-1): полный ряд
 * SDMX — 65 МБ, а {@code String} из них делает ~130 МБ heap ещё до разбора. Для
 * диагностики достаточно начала ответа (несколько КБ, см. RosstatEmisProvider.HEAD_BYTES).
 */
record StreamResult(int status, InputStream body, String contentType, String location) {}

interface Session extends AutoCloseable {
    PageResult get(String url) throws IOException;
    PageResult postForm(String url, String formBody) throws IOException;

    /**
     * POST формы с потоковым телом ответа — путь выгрузки SDMX. Реализация по умолчанию
     * сохраняет совместимость с тестовыми фейками, которые отдают тело строкой;
     * {@code JdkTransport} переопределяет её настоящим потоком.
     */
    default StreamResult postFormStream(String url, String formBody) throws IOException {
        PageResult result = postForm(url, formBody);
        byte[] bytes = result.body() == null
                ? new byte[0] : result.body().getBytes(StandardCharsets.UTF_8);
        return new StreamResult(result.status(), new ByteArrayInputStream(bytes),
                result.contentType(), result.location());
    }

    @Override void close();
}

interface Transport {
    Session open();
}

/**
 * Транспорт портала ЕМИСС и диагностика его ответов.
 *
 * <p>Вынесено из {@link RosstatEmisProvider} (BL-15): seam для тестов ({@link Session}/
 * {@link Transport}) и помощники «что именно прислал портал» живут отдельно от протокола
 * выгрузки. Диагностика обязательна (R10): отказ ЕМИСС различается по статусу, Content-Type
 * и началу тела, и без неё в журнале было «истёк CSRF-токен» вместо «CSRF блокировка».</p>
 */
final class EmisTransport {

    private EmisTransport() { }

    static boolean looksLikeHtml(String body) {
        String head = body == null ? "" : body.stripLeading();
        String lower = head.length() > 200 ? head.substring(0, 200).toLowerCase() : head.toLowerCase();
        return lower.startsWith("<!doctype html") || lower.startsWith("<html");
    }

    /** Content-Type похож на данные выгрузки. Эталон (fedstatAPIr) принимает
     *  {@code text/xml} и {@code application/vnd.ms-excel}. Отсутствие заголовка
     *  не блокирует: тестовые фейки и старые ответы заголовков не несут. */
    static boolean looksLikeData(String contentType) {
        if (contentType == null || contentType.isBlank()) return true;
        String ct = contentType.toLowerCase(Locale.ROOT);
        return ct.contains("xml") || ct.contains("excel") || ct.contains("octet-stream");
    }

    /**
     * Фрагмент ПОТОКОВОГО ответа для сообщения об ошибке (R10):
     * фактический Content-Type и начало тела. Тело не дочитывается, поэтому размер честно
     * описан как «прочитано начало».
     */
    static String describeHead(StreamResult r, String headText, boolean wholeBody) {
        String head = headText.strip().replaceAll("\\s+", " ").strip();
        if (head.length() > 300) {
            head = head.substring(0, 300);
        }
        return " (Content-Type: " + (r.contentType() == null ? "<нет>" : r.contentType())
                + ", размер: " + headText.length()
                + (wholeBody ? " симв." : " симв. прочитано, ответ не дочитан")
                + (head.isEmpty() ? "" : ", начало тела: «" + head + "»") + ")";
    }

    /**
     * Прочитать до {@code size} байт начала потока и вернуть их обратно
     * ({@link PushbackInputStream#unread}) — разбор продолжится с того же места.
     */
    static byte[] readHead(PushbackInputStream in, int size) throws IOException {
        byte[] buf = new byte[size];
        int read = 0;
        while (read < size) {
            int n = in.read(buf, read, size - read);
            if (n < 0) {
                break;
            }
            read += n;
        }
        if (read > 0) {
            in.unread(buf, 0, read);
        }
        return read == size ? buf : Arrays.copyOf(buf, read);
    }

    static String friendlyIo(IOException e) {
        String m = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        if (e instanceof java.net.http.HttpTimeoutException || m.toLowerCase().contains("timed out")) {
            return "превышен таймаут (fedstat.ru отвечает медленно — попробуйте позже)";
        }
        if (e instanceof java.net.UnknownHostException) {
            return "не удалось определить адрес fedstat.ru (проверьте DNS/интернет контейнера)";
        }
        if (e instanceof java.net.ConnectException) {
            return "не удалось установить соединение с fedstat.ru";
        }
        return m;
    }
}

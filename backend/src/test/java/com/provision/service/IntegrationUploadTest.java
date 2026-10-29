package com.provision.service;

import com.provision.entity.SyncLog;
import com.provision.entity.User;
import com.provision.exception.ConflictException;
import com.provision.exception.NotFoundException;
import com.provision.exception.ValidationException;
import com.provision.integration.PriceProvider;
import com.provision.repository.IntegrationRepository;
import com.provision.repository.SyncLogRepository;
import com.provision.repository.UserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.RejectedExecutionException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Приём файла выгрузки ЕМИСС: AU-03 (гонка «уже бежит») и AU-05 (файл на диске, не в heap).
 *
 * <p><b>AU-03.</b> Прежняя пара «SELECT status='RUNNING' → INSERT» была гонкой check-then-act:
 * два одновременных запуска давали два SyncLog(RUNNING) и два параллельных синка цен. Теперь
 * источник истины — частичный уникальный индекс {@code uq_sync_logs_running} (миграция V31),
 * а {@code DataIntegrityViolationException} приводится к тому же 409
 * {@code SYNC_ALREADY_RUNNING}, что и быстрый путь через SELECT: контракт клиента не меняется.</p>
 *
 * <p><b>AU-05.</b> Содержимое приезжает {@link Path}, и во всех ветках, где синк НЕ стартовал
 * (пустой файл, провайдер не найден, гонка за RUNNING, отказ пула), временный файл удаляет
 * сервис: после успешного dispatch владельцем становится
 * {@link PriceSyncService#runPriceSyncFromFile} (см. {@code PriceSyncPayloadTest}). Иначе
 * на диске контейнера копились бы 65-мегабайтные сироты.</p>
 *
 * <p>Слой — сервис (R2): репозитории и фоновый синк — моки, БД и Spring-контекст не нужны.</p>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("IntegrationService: приём файла выгрузки — 409 на гонку и владение временным файлом")
class IntegrationUploadTest {

    private static final String PROVIDER = "ROSSTAT";
    private static final long USER_ID = 7L;
    private static final long SYNC_LOG_ID = 99L;

    @Mock
    private PriceProvider provider;
    @Mock
    private IntegrationRepository integrationRepository;
    @Mock
    private SyncLogRepository syncLogRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private PriceSyncService priceSyncService;
    @Mock
    private SyncLogService syncLogService;

    @TempDir
    Path tempDir;

    private IntegrationService service() {
        when(provider.code()).thenReturn(PROVIDER);
        return new IntegrationService(List.of(provider), integrationRepository, syncLogRepository,
                userRepository, priceSyncService, syncLogService);
    }

    private Path payload(String content) throws IOException {
        Path file = tempDir.resolve("emis-upload.sdmx");
        Files.writeString(file, content, StandardCharsets.UTF_8);
        return file;
    }

    private static User admin() {
        return User.builder().id(USER_ID).email("admin@example.com").build();
    }

    private static SyncLog runningLog() {
        return SyncLog.builder().id(SYNC_LOG_ID).provider(PROVIDER).type("PRICES")
                .status("RUNNING").triggeredBy("MANUAL").build();
    }

    // ==================== assertUploadCanStart: отказ до чтения тела (AU-05) ====================

    @Test
    @DisplayName("assertUploadCanStart: неизвестный провайдер — 404, а не 96 МБ на диске впустую")
    void rejectsUnknownProviderBeforeUpload() {
        assertThatThrownBy(() -> service().assertUploadCanStart("NO_SUCH_PROVIDER"))
                .isInstanceOf(NotFoundException.class)
                .hasMessageContaining("NO_SUCH_PROVIDER");
        verifyNoInteractions(syncLogRepository);
    }

    @Test
    @DisplayName("assertUploadCanStart: синк уже бежит — 409 SYNC_ALREADY_RUNNING до загрузки файла")
    void rejectsWhenSyncAlreadyRunning() {
        when(syncLogRepository.findRunningByProvider(PROVIDER)).thenReturn(Optional.of(runningLog()));

        assertThatThrownBy(() -> service().assertUploadCanStart(PROVIDER))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("SYNC_ALREADY_RUNNING");
    }

    // ==================== uploadSnapshot: владение временным файлом ====================

    @Test
    @DisplayName("uploadSnapshot: пустой файл — EMPTY_FILE, временный файл удалён, журнал не создаётся")
    void rejectsEmptyFileAndCleansUp() throws IOException {
        Path file = payload("");

        assertThatThrownBy(() -> service().uploadSnapshot(PROVIDER, USER_ID, file, 0L, "empty.xml"))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("EMPTY_FILE");

        assertThat(file).doesNotExist();
        verifyNoInteractions(syncLogRepository, priceSyncService);
    }

    @Test
    @DisplayName("AU-03: гонку за RUNNING ловит уникальный индекс — 409 SYNC_ALREADY_RUNNING, второй синк не стартует")
    void uniqueRunningIndexTurnsRaceIntoConflict() throws IOException {
        Path file = payload("<GenericData/>");
        when(syncLogRepository.findRunningByProvider(PROVIDER)).thenReturn(Optional.empty());
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(admin()));
        // Так выглядит проигрыш гонки: SELECT сказал «не бежит», а INSERT уперся в uq_sync_logs_running (V31).
        when(syncLogRepository.save(any(SyncLog.class))).thenThrow(new DataIntegrityViolationException(
                "duplicate key value violates unique constraint \"uq_sync_logs_running\""));

        assertThatThrownBy(() -> service().uploadSnapshot(
                PROVIDER, USER_ID, file, Files.size(file), "data-31448.xml"))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("SYNC_ALREADY_RUNNING");

        assertThat(file).doesNotExist();
        verify(priceSyncService, never()).runPriceSyncFromFile(anyString(), anyLong(), any(Path.class), anyString());
    }

    @Test
    @DisplayName("AU-05: пул насыщен — 409 EXECUTOR_SATURATED, журнал FAILED, временный файл удалён")
    void saturatedExecutorReleasesPayload() throws IOException {
        Path file = payload("<GenericData/>");
        when(syncLogRepository.findRunningByProvider(PROVIDER)).thenReturn(Optional.empty());
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(admin()));
        when(syncLogRepository.save(any(SyncLog.class))).thenReturn(runningLog());
        // Отказ пула (AbortPolicy при заполненной очереди) приходит из границы @Async:
        // в unit-тесте self() == this, поэтому подменяем его отказом фонового вызова.
        org.mockito.Mockito.doThrow(new RejectedExecutionException("queue is full"))
                .when(priceSyncService)
                .runPriceSyncFromFile(anyString(), anyLong(), any(Path.class), anyString());

        assertThatThrownBy(() -> service().uploadSnapshot(
                PROVIDER, USER_ID, file, Files.size(file), "data-31448.xml"))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("EXECUTOR_SATURATED");

        assertThat(file).doesNotExist();
        verify(syncLogService).markRejected(SYNC_LOG_ID, "EXECUTOR_SATURATED: пул синхронизации перегружен");
    }

    @Test
    @DisplayName("успех: файл уходит в фоновый синк и НЕ удаляется сервисом (владелец — PriceSyncService)")
    void handsPayloadOverToBackgroundSync() throws IOException {
        Path file = payload("<GenericData/>");
        long size = Files.size(file);
        when(syncLogRepository.findRunningByProvider(PROVIDER)).thenReturn(Optional.empty());
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(admin()));
        when(syncLogRepository.save(any(SyncLog.class))).thenReturn(runningLog());

        SyncLog started = service().uploadSnapshot(PROVIDER, USER_ID, file, size, "data-31448.xml");

        assertThat(started.getId()).isEqualTo(SYNC_LOG_ID);
        verify(priceSyncService).runPriceSyncFromFile(PROVIDER, SYNC_LOG_ID, file, "data-31448.xml");
        // Файл жив, пока фоновое задание его не разобрало: удалять здесь — значит читать пустоту.
        assertThat(file).exists();
    }
}

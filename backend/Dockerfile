# Build stage
FROM maven:3.9-eclipse-temurin-21@sha256:99e61abcff91a9b1333463bd8451fb18495d6eba9250ac66a338b518f8278320 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
# -U: принудительно обновлять артефакты — защищает от залипших 502-ответов Maven Central,
# которые кэшируются в ~/.m2 как "absent" и ломают сборку до следующей пересборки образа
RUN mvn -B -U clean package -DskipTests

# Runtime stage
FROM eclipse-temurin:21-jre-alpine@sha256:82cf3d9ccbe1ed46252008d51b2f2329e6b9e8a2f4394c4bebefc3ea7f4b1372
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
USER 1000
# Память JVM задаём явно (BL-18): без настроек JVM берёт 25 % лимита контейнера, и при
# mem_limit: 1g синхронизация выгрузки ЕМИСС жила бы в ~256 МБ heap. MaxRAMPercentage
# считается от лимита cgroup, JAVA_OPTS переопределяет всё без пересборки образа.
# Потоковый разбор SDMX (KB-1) укладывается в 128 МБ даже на ответе 66 МБ, поэтому 1 ГБ
# контейнеру хватает с запасом; HeapDump оставляем — OOM должен быть расследуем.
# BL-50: HeapDumpPath на writable-том (/tmp, tmpfs при read_only).
ENV JAVA_OPTS="-XX:MaxRAMPercentage=70.0 -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/tmp"
# BL-50: healthcheck
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/v1/meta || exit 1
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]

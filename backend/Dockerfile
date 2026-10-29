# Build stage
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
# -U: принудительно обновлять артефакты — защищает от залипших 502-ответов Maven Central,
# которые кэшируются в ~/.m2 как "absent" и ломают сборку до следующей пересборки образа
RUN mvn -B -U clean package -DskipTests

# Runtime stage
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
USER 1000
# Память JVM задаём явно (BL-18): без настроек JVM берёт 25 % лимита контейнера, и при
# mem_limit: 1g синхронизация выгрузки ЕМИСС жила бы в ~256 МБ heap. MaxRAMPercentage
# считается от лимита cgroup, JAVA_OPTS переопределяет всё без пересборки образа.
# Потоковый разбор SDMX (KB-1) укладывается в 128 МБ даже на ответе 66 МБ, поэтому 1 ГБ
# контейнеру хватает с запасом; HeapDump оставляем — OOM должен быть расследуем.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=70.0 -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/tmp"
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]

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
ENTRYPOINT ["java", "-jar", "app.jar"]

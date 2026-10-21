package com.provision.dto.error;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ErrorResponse(
    String type,
    String title,
    int status,
    String detail,
    String instance,
    LocalDateTime timestamp,
    List<FieldError> errors,
    List<UsedInResource> usedIn,
    Map<String, Object> extensions
) {
    public record FieldError(
        String field,
        String message,
        Object rejectedValue
    ) {}
    
    public record UsedInResource(
        String resourceType,
        Long resourceId,
        String resourceName
    ) {}
}

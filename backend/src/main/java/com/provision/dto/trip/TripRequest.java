package com.provision.dto.trip;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public record TripRequest(
    @NotBlank @Size(min = 1, max = 255)
    String name,
    
    @NotNull
    LocalDate startDate,
    
    @NotNull
    LocalDate endDate,
    
    @NotNull @Min(1)
    Integer defaultPeople,
    
    @Size(max = 2000)
    String notes
) {}

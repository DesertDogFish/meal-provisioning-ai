package com.provision.dto.auth;

import com.provision.entity.UserRole;

public record UserResponse(
    Long id,
    String email,
    String firstName,
    String lastName,
    UserRole role
) {}

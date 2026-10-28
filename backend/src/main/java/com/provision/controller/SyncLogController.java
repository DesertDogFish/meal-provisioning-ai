package com.provision.controller;

import com.provision.dto.sync.SyncKpiResponse;
import com.provision.dto.sync.SyncLogResponse;
import com.provision.entity.User;
import com.provision.service.SyncLogService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin/sync-logs")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class SyncLogController {

    private final SyncLogService syncLogService;

    @GetMapping
    public List<SyncLogResponse> getSyncLogs(
            @RequestParam(required = false) String provider,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to
    ) {
        return syncLogService.getSyncLogs(provider, type, status, from, to);
    }

    @GetMapping("/{id}")
    public SyncLogResponse getSyncLog(@PathVariable Long id) {
        return syncLogService.getSyncLog(id);
    }

    @GetMapping("/kpi")
    public SyncKpiResponse getKpi(
            @RequestParam(required = false) String provider,
            @RequestParam(required = false, defaultValue = "7") Integer days
    ) {
        return syncLogService.getKpi(provider, days);
    }
}

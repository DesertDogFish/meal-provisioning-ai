package com.provision.service;

import com.provision.dto.staging.IngredientMappingRequest;
import com.provision.dto.staging.IngredientMappingResponse;
import com.provision.entity.Ingredient;
import com.provision.entity.IngredientMapping;
import com.provision.entity.RecipeSource;
import com.provision.exception.ConflictException;
import com.provision.exception.NotFoundException;
import com.provision.repository.IngredientMappingRepository;
import com.provision.repository.IngredientRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class IngredientMappingService {

    private final IngredientMappingRepository mappingRepository;
    private final IngredientRepository ingredientRepository;

    @Transactional(readOnly = true)
    public List<IngredientMappingResponse> getAllMappings() {
        // FIX P2 (аудит): было findAll() + ленивый getInternalIngredient() на каждую
        // строку (N+1). Берём JOIN FETCH; distinct — из-за дедупликации join'а.
        return mappingRepository.findAllWithIngredients().stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<IngredientMappingResponse> getMappingsBySource(RecipeSource source) {
        // FIX P2 (аудит): то же, что выше, но со фильтром по источнику.
        return mappingRepository.findBySourceWithIngredients(source).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public IngredientMappingResponse createMapping(IngredientMappingRequest request) {
        // Проверка дубликата
        if (mappingRepository.existsByExternalNameAndSource(request.externalName(), request.source())) {
            throw new ConflictException(
                    "Mapping already exists for external name: " + request.externalName() + 
                    " and source: " + request.source()
            );
        }

        Ingredient ingredient = ingredientRepository.findById(request.internalIngredientId())
                .orElseThrow(() -> new NotFoundException(
                        "Ingredient not found with id: " + request.internalIngredientId()
                ));

        IngredientMapping mapping = IngredientMapping.builder()
                .externalName(request.externalName())
                .source(request.source())
                .internalIngredient(ingredient)
                .build();

        mapping = mappingRepository.save(mapping);
        log.info("Created ingredient mapping: {} -> {}", request.externalName(), ingredient.getName());
        return toResponse(mapping);
    }

    @Transactional
    public void deleteMapping(Long id) {
        if (!mappingRepository.existsById(id)) {
            throw new NotFoundException("Mapping not found with id: " + id);
        }
        mappingRepository.deleteById(id);
        log.info("Deleted ingredient mapping: {}", id);
    }

    private IngredientMappingResponse toResponse(IngredientMapping mapping) {
        return new IngredientMappingResponse(
                mapping.getId(),
                mapping.getExternalName(),
                mapping.getSource(),
                mapping.getInternalIngredient().getId(),
                mapping.getInternalIngredient().getName(),
                mapping.getCreatedAt()
        );
    }
}

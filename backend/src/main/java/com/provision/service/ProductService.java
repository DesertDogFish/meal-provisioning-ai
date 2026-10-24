package com.provision.service;

import com.provision.dto.error.ErrorResponse;
import com.provision.dto.product.*;
import com.provision.entity.*;
import com.provision.exception.ConflictException;
import com.provision.exception.NotFoundException;
import com.provision.exception.ProductInUseConflictException;
import com.provision.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import com.provision.specification.ProductSpecifications;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class ProductService {

    private final IngredientRepository ingredientRepository;
    private final ProductCategoryRepository categoryRepository;
    private final IngredientPriceRepository priceRepository;
    private final RecipeIngredientRepository recipeIngredientRepository;
    private final RecipeRepository recipeRepository;

    @Transactional(readOnly = true)
    public List<ProductCategoryDto> getAllCategories() {
        return categoryRepository.findAllByOrderBySortOrderAsc().stream()
                .map(this::toCategoryDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public CheckNameResponse checkName(String name, UnitOfMeasure unit) {
        String nameNorm = normalizeName(name);
        List<Ingredient> existing = ingredientRepository.findByNameNorm(nameNorm);
        
        if (existing.isEmpty()) {
            return new CheckNameResponse(false, null, null, false);
        }
        
        // Ищем точный дубль (то же имя + та же единица)
        Optional<Ingredient> hardDuplicate = existing.stream()
                .filter(i -> i.getUnit() == unit)
                .findFirst();
        
        if (hardDuplicate.isPresent()) {
            Ingredient dup = hardDuplicate.get();
            return new CheckNameResponse(true, dup.getId(), dup.getName(), true);
        }
        
        // Мягкое предупреждение: то же имя, но другая единица
        Ingredient softDuplicate = existing.get(0);
        return new CheckNameResponse(true, softDuplicate.getId(), softDuplicate.getName(), false);
    }

    @Transactional(readOnly = true)
    public Page<ProductResponse> getProducts(
            String query,
            List<Long> categoryIds,
            List<UnitOfMeasure> units,
            String priceStatus,
            String bindingStatus,
            String usageStatus,
            String sort,
            String direction,
            int page,
            int size
    ) {
        // FIX P0 (аудит): раньше все фильтры игнорировались ("Упрощенная реализация")
        // и возвращался весь справочник. Теперь фильтрация выполняется на БД через Specification.
        PageRequest pageRequest = PageRequest.of(page, size,
                Sort.by(Sort.Direction.fromString(direction != null ? direction : "asc"),
                        sort != null ? sort : "name"));

        Specification<Ingredient> spec = Specification.where(ProductSpecifications.isGlobal())
                .and(ProductSpecifications.matchesQuery(query))
                .and(ProductSpecifications.hasCategoryIn(categoryIds))
                .and(ProductSpecifications.hasUnitIn(units))
                .and(ProductSpecifications.hasPriceStatus(priceStatus))
                .and(ProductSpecifications.hasBindingStatus(bindingStatus))
                .and(ProductSpecifications.hasUsageStatus(usageStatus));

        Page<Ingredient> ingredients = ingredientRepository.findAll(spec, pageRequest);

        // FIX P1 (аудит): раньше toProductResponse делал по 2 доп. запроса на каждый
        // элемент страницы (эффективная цена + использование в рецептах) — классический N+1.
        // Теперь цена и usageCount грузятся пакетно: по одному запросу на всю страницу.
        List<Long> ids = ingredients.getContent().stream().map(Ingredient::getId).toList();
        Map<Long, IngredientPrice> priceByIngredient = new HashMap<>();
        for (IngredientPrice p : priceRepository.findLatestPricesAsOfForIngredients(LocalDate.now(), ids)) {
            priceByIngredient.put(p.getIngredient().getId(), p);
        }
        Map<Long, Integer> usageCountByIngredient = new HashMap<>();
        if (!ids.isEmpty()) {
            for (Object[] row : recipeIngredientRepository.countRecipesByIngredientIds(ids)) {
                usageCountByIngredient.put((Long) row[0], ((Number) row[1]).intValue());
            }
        }

        return ingredients.map(i -> toProductResponse(i, priceByIngredient.get(i.getId()),
                usageCountByIngredient.getOrDefault(i.getId(), 0)));
    }

    @Transactional
    public ProductResponse createProduct(ProductRequest request) {
        // Проверка категории
        ProductCategory category = categoryRepository.findById(request.categoryId())
                .orElseThrow(() -> new NotFoundException("Category not found"));

        // CR-1: валидация piece_weight_g для PCS/PACK при наличии ккал
        if ((request.unit() == UnitOfMeasure.PCS || request.unit() == UnitOfMeasure.PACK)
                && request.kcalPer100g() != null
                && request.pieceWeightG() == null) {
            throw new com.provision.exception.ValidationException(
                "VALIDATION_ERROR: pieceWeightG is required for PCS/PACK when kcalPer100g is set");
        }

        // Проверка дубля
        String nameNorm = normalizeName(request.name());
        if (ingredientRepository.existsByNameNormAndUnit(nameNorm, request.unit())) {
            throw new ConflictException("DUPLICATE_PRODUCT: Product with this name and unit already exists");
        }

        Ingredient ingredient = Ingredient.builder()
                .name(request.name())
                .nameNorm(nameNorm)
                .category(category)
                .unit(request.unit())
                .packSize(request.packSize())
                .roundToPacks(request.roundToPacks() != null ? request.roundToPacks() : false)
                .kcalPer100g(request.kcalPer100g())
                .pieceWeightG(request.pieceWeightG())
                .build();

        ingredient = ingredientRepository.save(ingredient);
        log.info("Created product: {} (id={})", ingredient.getName(), ingredient.getId());
        
        return toProductResponse(ingredient);
    }

    @Transactional
    public ProductResponse updateProduct(Long id, ProductRequest request) {
        Ingredient ingredient = ingredientRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Product not found"));

        // Проверка категории
        ProductCategory category = categoryRepository.findById(request.categoryId())
                .orElseThrow(() -> new NotFoundException("Category not found"));

        // CR-1: валидация piece_weight_g для PCS/PACK при наличии ккал
        if ((request.unit() == UnitOfMeasure.PCS || request.unit() == UnitOfMeasure.PACK)
                && request.kcalPer100g() != null
                && request.pieceWeightG() == null) {
            throw new com.provision.exception.ValidationException(
                "VALIDATION_ERROR: pieceWeightG is required for PCS/PACK when kcalPer100g is set");
        }

        String newNameNorm = normalizeName(request.name());
        
        // Проверка занятости
        List<Long> recipeIds = recipeIngredientRepository.findRecipeIdsByIngredientId(id);
        boolean isUsed = !recipeIds.isEmpty();

        if (isUsed) {
            // Занятый продукт: нельзя менять имя и единицу
            if (!ingredient.getNameNorm().equals(newNameNorm) || ingredient.getUnit() != request.unit()) {
                // FIX (P1): PRODUCT_IN_USE теперь отдаёт заполненный usedIn (список рецептов),
                // фронт показывает, что блокирует переименование.
                throw new ProductInUseConflictException(
                        "PRODUCT_IN_USE: Cannot change name or unit of product used in recipes",
                        buildUsedInRecipes(recipeIds));
            }
        } else {
            // Свободный продукт: проверяем дубль при изменении имени/единицы
            if (!ingredient.getNameNorm().equals(newNameNorm) || ingredient.getUnit() != request.unit()) {
                if (ingredientRepository.existsByNameNormAndUnit(newNameNorm, request.unit())) {
                    throw new ConflictException("DUPLICATE_PRODUCT: Product with this name and unit already exists");
                }
            }
        }

        ingredient.setName(request.name());
        ingredient.setNameNorm(newNameNorm);
        ingredient.setCategory(category);
        ingredient.setUnit(request.unit());
        ingredient.setPackSize(request.packSize());
        ingredient.setRoundToPacks(request.roundToPacks() != null ? request.roundToPacks() : false);
        ingredient.setKcalPer100g(request.kcalPer100g());
        ingredient.setPieceWeightG(request.pieceWeightG());

        ingredient = ingredientRepository.save(ingredient);
        log.info("Updated product: {} (id={})", ingredient.getName(), ingredient.getId());
        
        return toProductResponse(ingredient);
    }

    @Transactional
    public void deleteProduct(Long id) {
        Ingredient ingredient = ingredientRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Product not found"));

        // Проверка занятости
        List<Long> recipeIds = recipeIngredientRepository.findRecipeIdsByIngredientId(id);
        if (!recipeIds.isEmpty()) {
            // FIX (P1): заполняем usedIn — фронт показывает список блокирующих рецептов.
            throw new ProductInUseConflictException(
                    "PRODUCT_IN_USE: Product is used in recipes",
                    buildUsedInRecipes(recipeIds));
        }

        ingredientRepository.deleteById(id);
        log.info("Deleted product: {} (id={})", ingredient.getName(), id);
    }

    /**
     * FIX (P1, аудит Phase 11): один batch-запрос за названиями рецептов по id
     * (не N+1) и сборка списка для ErrorResponse.usedIn.
     */
    private List<ErrorResponse.UsedInResource> buildUsedInRecipes(List<Long> recipeIds) {
        return recipeRepository.findAllById(recipeIds).stream()
                .map(r -> new ErrorResponse.UsedInResource("RECIPE", r.getId(), r.getName()))
                .toList();
    }

    private ProductResponse toProductResponse(Ingredient ingredient) {
        // Одиночный путь (create/update/get-by-id): 2 точечных запроса допустимы.
        Optional<IngredientPrice> currentPrice = priceRepository.findEffectivePrice(
                ingredient.getId(), LocalDate.now());
        int usageCount = recipeIngredientRepository.findRecipeIdsByIngredientId(ingredient.getId()).size();
        return toProductResponse(ingredient, currentPrice.orElse(null), usageCount);
    }

    private ProductResponse toProductResponse(Ingredient ingredient, IngredientPrice currentPrice, int usageCount) {
        // FIX P1 (аудит): N+1-версия этого метода делала findEffectivePrice +
        // findRecipeIdsByIngredientId на каждый элемент страницы. Теперь цена и
        // usageCount приходят параметрами (пакетная загрузка в getProducts).

        ProductResponse.CurrentPriceDto priceDto = currentPrice != null ?
                new ProductResponse.CurrentPriceDto(
                        currentPrice.getPricePerUnit(),
                        currentPrice.getCurrency(),
                        currentPrice.getEffectiveFrom(),
                        currentPrice.getSource() != null ? currentPrice.getSource() : "MANUAL"
                )
                : null;

        // Определяем статус привязки
        String bindingStatus = ingredient.getCode() != null ? "BOUND" : "UNBOUND";

        // Проверяем, что категория не null
        if (ingredient.getCategory() == null) {
            log.warn("Ingredient {} has null category, using 'Прочее'", ingredient.getId());
        }

        // CR-2: unitLabel
        String unitLabel = ProductResponse.UNIT_LABELS.getOrDefault(ingredient.getUnit(), ingredient.getUnit().name());

        return new ProductResponse(
                ingredient.getId(),
                ingredient.getName(),
                ingredient.getCategory() != null ? toCategoryDto(ingredient.getCategory()) : null,
                ingredient.getUnit(),
                unitLabel,
                ingredient.getPackSize(),
                ingredient.getRoundToPacks(),
                ingredient.getKcalPer100g(),
                ingredient.getPieceWeightG(),
                null, // description
                priceDto,
                usageCount,
                bindingStatus,
                ingredient.getUpdatedAt()
        );
    }

    private ProductCategoryDto toCategoryDto(ProductCategory category) {
        return new ProductCategoryDto(
                category.getId(),
                category.getName(),
                category.getSlug(),
                category.getSortOrder()
        );
    }

    private String normalizeName(String name) {
        return name.toLowerCase()
                .replace('ё', 'е')
                .replaceAll("\\s+", " ")
                .trim();
    }
}

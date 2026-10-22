package com.provision.entity;

public enum RecipeSource {
    MANUAL,
    OFF, // Open Food Facts (код провайдера = "OFF", см. OpenFoodFactsProvider.code())
    API,
    AI
}

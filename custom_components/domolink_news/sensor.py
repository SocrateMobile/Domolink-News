"""Sensors for DomoLink-News."""
from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import CATEGORY_METADATA, DOMAIN, NAME
from .coordinator import DomoLinkNewsCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up DomoLink-News sensors based on a config entry."""
    coordinator: DomoLinkNewsCoordinator = hass.data[DOMAIN][entry.entry_id]["coordinator"]

    entities: list[SensorEntity] = [
        DomoLinkNewsFeedSensor(coordinator, entry),
    ]

    for cat in coordinator.categories:
        entities.append(DomoLinkNewsCategorySensor(coordinator, entry, cat))

    async_add_entities(entities)


class DomoLinkNewsFeedSensor(CoordinatorEntity[DomoLinkNewsCoordinator], SensorEntity):
    """Main unified news feed sensor."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:newspaper-variant-outline"

    def __init__(
        self,
        coordinator: DomoLinkNewsCoordinator,
        entry: ConfigEntry,
    ) -> None:
        """Initialize main feed sensor."""
        super().__init__(coordinator)
        self._entry = entry
        self._attr_name = "Fil d'actualités"
        self._attr_unique_id = f"{entry.entry_id}_main_feed"

    @property
    def native_value(self) -> str:
        """Return the headline of the top priority news article."""
        if not self.coordinator.data:
            return "Aucune actualité"
        articles = self.coordinator.data.get("all_articles", [])
        if articles:
            return articles[0].get("title", "Aucune actualité")[:250]
        return "Aucune actualité"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return full news list, sync status and weight metadata."""
        data = self.coordinator.data or {}
        all_articles = data.get("all_articles", [])
        return {
            "integration": NAME,
            "total_articles": data.get("total_articles", 0),
            "categories": data.get("categories", []),
            "category_weights": data.get("category_weights", {}),
            "last_updated": data.get("last_updated"),
            "status": data.get("status", "ok"),
            "top_articles": all_articles[:10],
        }


class DomoLinkNewsCategorySensor(
    CoordinatorEntity[DomoLinkNewsCoordinator], SensorEntity
):
    """Category-specific news sensor."""

    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: DomoLinkNewsCoordinator,
        entry: ConfigEntry,
        category: str,
    ) -> None:
        """Initialize category sensor."""
        super().__init__(coordinator)
        self._entry = entry
        self._category = category
        meta = CATEGORY_METADATA.get(category, {"label": category.capitalize(), "icon": "mdi:newspaper"})
        self._attr_name = meta["label"]
        self._attr_icon = meta["icon"]
        self._attr_unique_id = f"{entry.entry_id}_category_{category}"

    @property
    def native_value(self) -> str:
        """Return the latest headline for this category."""
        if not self.coordinator.data:
            return "Aucune actualité"
        by_cat = self.coordinator.data.get("articles_by_category", {})
        articles = by_cat.get(self._category, [])
        if articles:
            return articles[0].get("title", "Aucune actualité")[:250]
        return "Aucune actualité"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return articles and weight for this specific category."""
        if not self.coordinator.data:
            return {"category": self._category, "weight": 3, "count": 0, "articles": []}
        by_cat = self.coordinator.data.get("articles_by_category", {})
        articles = by_cat.get(self._category, [])
        weight = self.coordinator.category_weights.get(self._category, 3)
        return {
            "category": self._category,
            "weight": weight,
            "count": len(articles),
            "articles": articles[:15],
        }

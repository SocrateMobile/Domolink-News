"""Init for DomoLink-News integration."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components import frontend, websocket_api
try:
    from homeassistant.components.http import StaticPathConfig
except ImportError:
    StaticPathConfig = None  # type: ignore[misc,assignment]

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, callback
import homeassistant.helpers.config_validation as cv

from .const import (
    CONF_API_KEY,
    CONF_CATEGORIES,
    CONF_CATEGORY_WEIGHTS,
    CONF_COUNTRY,
    CONF_KEYWORDS,
    CONF_LANGUAGE,
    DOMAIN,
    FRONTEND_FILE_NAME,
    FRONTEND_URL_PATH,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL_PATH,
    VERSION,
)
from .coordinator import DomoLinkNewsCoordinator

_LOGGER = logging.getLogger(__name__)
PLATFORMS: list[Platform] = [Platform.SENSOR]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up DomoLink-News from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    # 1. Initialize data update coordinator
    coordinator = DomoLinkNewsCoordinator(hass, entry.data)
    await coordinator.async_config_entry_first_refresh()

    hass.data[DOMAIN][entry.entry_id] = {
        "coordinator": coordinator,
    }

    # 2. Forward entry setup to platforms (sensor)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # 3. Register static HTTP path for frontend files
    frontend_dir = Path(__file__).parent / "frontend"
    if frontend_dir.exists():
        if hasattr(hass.http, "async_register_static_paths") and StaticPathConfig is not None:
            await hass.http.async_register_static_paths(
                [
                    StaticPathConfig(
                        FRONTEND_URL_PATH,
                        str(frontend_dir),
                        cache_headers=False,
                    )
                ]
            )
        elif hasattr(hass.http, "register_static_path"):
            try:
                hass.http.register_static_path(
                    FRONTEND_URL_PATH,
                    str(frontend_dir),
                    cache_headers=False,
                )
            except Exception:
                pass

    # 4. Register left sidebar custom panel
    try:
        frontend.async_register_built_in_panel(
            hass,
            component_name="custom",
            sidebar_title=PANEL_TITLE,
            sidebar_icon=PANEL_ICON,
            frontend_url_path=PANEL_URL_PATH,
            config={
                "_panel_custom": {
                    "name": "domolink-news-panel",
                    "module_url": f"{FRONTEND_URL_PATH}/{FRONTEND_FILE_NAME}?v={VERSION}",
                }
            },
            require_admin=False,
            update=True,
        )
        _LOGGER.info("DomoLink-News sidebar panel successfully registered at /%s", PANEL_URL_PATH)
    except Exception as err:  # pylint: disable=broad-except
        _LOGGER.error("Failed to register DomoLink-News panel: %s", err)

    # 5. Register WebSocket API commands for the custom panel
    websocket_api.async_register_command(hass, ws_get_news_data)
    websocket_api.async_register_command(hass, ws_refresh_news_data)
    websocket_api.async_register_command(hass, ws_save_config)

    # 6. Register HA service
    async def async_handle_refresh_service(call: ServiceCall) -> None:
        """Handle manual refresh service call."""
        _LOGGER.info("DomoLink-News service refresh called")
        for item in hass.data[DOMAIN].values():
            if "coordinator" in item:
                await item["coordinator"].async_request_refresh()

    hass.services.async_register(
        DOMAIN, "refresh", async_handle_refresh_service, schema=vol.Schema({})
    )

    entry.async_on_unload(entry.add_update_listener(async_reload_entry))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload DomoLink-News config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)

        # If no more entries remain, remove the sidebar panel
        if not hass.data[DOMAIN]:
            frontend.async_remove_panel(hass, PANEL_URL_PATH)
            hass.data.pop(DOMAIN, None)

    return unload_ok


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload entry when options are updated."""
    coordinator: DomoLinkNewsCoordinator = hass.data[DOMAIN][entry.entry_id]["coordinator"]
    if entry.options:
        coordinator.update_options(entry.options)
        await coordinator.async_request_refresh()
    else:
        await hass.config_entries.async_reload(entry.entry_id)


# ---------------------------------------------------------------------------
# WebSocket API Handlers
# ---------------------------------------------------------------------------

@websocket_api.websocket_command(
    {
        vol.Required("type"): "domolink_news/get_data",
    }
)
@callback
def ws_get_news_data(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return latest news data across active categories and weights."""
    if DOMAIN not in hass.data or not hass.data[DOMAIN]:
        connection.send_error(msg["id"], "not_found", "DomoLink-News is not initialized")
        return

    # Use first available coordinator
    first_key = next(iter(hass.data[DOMAIN]))
    coordinator: DomoLinkNewsCoordinator = hass.data[DOMAIN][first_key]["coordinator"]
    connection.send_result(msg["id"], coordinator.data)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "domolink_news/refresh",
    }
)
@websocket_api.async_response
async def ws_refresh_news_data(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Trigger immediate NewsAPI refresh and return updated data."""
    if DOMAIN not in hass.data or not hass.data[DOMAIN]:
        connection.send_error(msg["id"], "not_found", "DomoLink-News is not initialized")
        return

    first_key = next(iter(hass.data[DOMAIN]))
    coordinator: DomoLinkNewsCoordinator = hass.data[DOMAIN][first_key]["coordinator"]
    await coordinator.async_request_refresh()
    connection.send_result(msg["id"], coordinator.data)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "domolink_news/save_config",
        vol.Optional("api_key"): cv.string,
        vol.Optional("country"): cv.string,
        vol.Optional("language"): cv.string,
        vol.Optional("categories"): vol.All(cv.ensure_list, [cv.string]),
        vol.Optional("category_weights"): vol.Schema({cv.string: vol.Coerce(int)}),
        vol.Optional("keywords"): cv.string,
    }
)
@websocket_api.async_response
async def ws_save_config(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Save updated DomoLink-News configuration live from the panel."""
    if DOMAIN not in hass.data or not hass.data[DOMAIN]:
        connection.send_error(msg["id"], "not_found", "DomoLink-News is not initialized")
        return

    first_entry_id = next(iter(hass.data[DOMAIN]))
    coordinator: DomoLinkNewsCoordinator = hass.data[DOMAIN][first_entry_id]["coordinator"]
    entry = hass.config_entries.async_get_entry(first_entry_id)
    if not entry:
        connection.send_error(msg["id"], "not_found", "Config entry not found")
        return

    new_data = dict(entry.data)
    if "api_key" in msg and msg["api_key"] is not None:
        new_data[CONF_API_KEY] = str(msg["api_key"]).strip()
    if "country" in msg and msg["country"] is not None:
        new_data[CONF_COUNTRY] = str(msg["country"]).strip().lower()
    if "language" in msg and msg["language"] is not None:
        new_data[CONF_LANGUAGE] = str(msg["language"]).strip().lower()
    if "categories" in msg and msg["categories"] is not None:
        new_data[CONF_CATEGORIES] = list(msg["categories"])
    if "category_weights" in msg and msg["category_weights"] is not None:
        new_data[CONF_CATEGORY_WEIGHTS] = dict(msg["category_weights"])
    if "keywords" in msg and msg["keywords"] is not None:
        new_data[CONF_KEYWORDS] = str(msg["keywords"]).strip()

    # Update HA config entry data
    hass.config_entries.async_update_entry(entry, data=new_data)

    # Update coordinator in place and trigger fresh fetch
    coordinator.api_key = new_data.get(CONF_API_KEY, coordinator.api_key)
    coordinator.update_options(new_data)
    await coordinator.async_request_refresh()

    connection.send_result(msg["id"], {"success": True, "data": coordinator.data})

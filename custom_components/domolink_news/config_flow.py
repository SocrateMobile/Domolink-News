"""Config flow for DomoLink-News integration."""
from __future__ import annotations

import hashlib
import logging
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers import selector
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import (
    ALL_CATEGORIES,
    CATEGORY_METADATA,
    CONF_API_KEY,
    CONF_CATEGORIES,
    CONF_CATEGORY_WEIGHTS,
    CONF_COUNTRY,
    CONF_KEYWORDS,
    CONF_LANGUAGE,
    DEFAULT_CATEGORIES,
    DEFAULT_COUNTRY,
    DEFAULT_LANGUAGE,
    DEFAULT_WEIGHT,
    DOMAIN,
    NAME,
    SUPPORTED_COUNTRIES,
    SUPPORTED_LANGUAGES,
)

_LOGGER = logging.getLogger(__name__)
TEST_URL = "https://newsapi.org/v2/top-headlines"


class DomoLinkNewsConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for DomoLink-News."""

    VERSION = 1

    def __init__(self) -> None:
        """Initialize flow state."""
        self._user_inputs: dict[str, Any] = {}

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Step 1: Prompt for API key, country, language, active categories and optional keywords."""
        errors: dict[str, str] = {}

        if user_input is not None:
            # Check unique instance or duplicate API key
            raw_key = user_input[CONF_API_KEY].strip()
            unique_key = hashlib.sha256(raw_key.encode()).hexdigest()[:16]
            await self.async_set_unique_id(unique_key)
            self._abort_if_unique_id_configured()

            # Test API credentials against NewsAPI
            session = async_get_clientsession(self.hass)
            try:
                headers = {"X-Api-Key": user_input[CONF_API_KEY].strip()}
                params = {"country": user_input[CONF_COUNTRY], "pageSize": "1"}
                async with session.get(
                    TEST_URL,
                    params=params,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    if resp.status == 401:
                        errors["base"] = "invalid_auth"
                    elif resp.status == 429:
                        errors["base"] = "rate_limited"
                    elif resp.status != 200:
                        errors["base"] = "cannot_connect"
            except (aiohttp.ClientError, TimeoutError):
                errors["base"] = "cannot_connect"

            if not errors:
                self._user_inputs = dict(user_input)
                # Proceed to Step 2: Assign weights for selected categories
                return await self.async_step_weights()

        categories_options = [
            selector.SelectOptionDict(
                value=cat,
                label=f"{CATEGORY_METADATA[cat]['label']}",
            )
            for cat in ALL_CATEGORIES
        ]

        language_options = [
            selector.SelectOptionDict(value=k, label=v)
            for k, v in SUPPORTED_LANGUAGES.items()
        ]

        country_options = [
            selector.SelectOptionDict(value=k, label=v)
            for k, v in SUPPORTED_COUNTRIES.items()
        ]

        schema = vol.Schema(
            {
                vol.Required(CONF_API_KEY): selector.TextSelector(
                    selector.TextSelectorConfig(type=selector.TextSelectorType.PASSWORD)
                ),
                vol.Required(CONF_COUNTRY, default=DEFAULT_COUNTRY): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=country_options,
                        mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
                vol.Required(CONF_LANGUAGE, default=DEFAULT_LANGUAGE): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=language_options,
                        mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
                vol.Required(CONF_CATEGORIES, default=DEFAULT_CATEGORIES): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=categories_options,
                        multiple=True,
                        mode=selector.SelectSelectorMode.LIST,
                    )
                ),
                vol.Optional(CONF_KEYWORDS, default=""): selector.TextSelector(
                    selector.TextSelectorConfig(type=selector.TextSelectorType.TEXT)
                ),
            }
        )

        return self.async_show_form(
            step_id="user",
            data_schema=schema,
            errors=errors,
            description_placeholders={"name": NAME},
        )

    async def async_step_weights(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Step 2: Assign a preference weight (1 to 5) for each selected category."""
        selected_cats: list[str] = self._user_inputs.get(CONF_CATEGORIES, DEFAULT_CATEGORIES)

        if user_input is not None:
            weights = {cat: user_input.get(f"weight_{cat}", DEFAULT_WEIGHT) for cat in selected_cats}
            self._user_inputs[CONF_CATEGORY_WEIGHTS] = weights
            return self.async_create_entry(
                title=f"{NAME} ({SUPPORTED_COUNTRIES.get(self._user_inputs.get(CONF_COUNTRY, 'fr'), 'FR')})",
                data=self._user_inputs,
            )

        weight_fields = {}
        for cat in selected_cats:
            meta = CATEGORY_METADATA.get(cat, {"label": cat.capitalize()})
            weight_fields[vol.Required(f"weight_{cat}", default=DEFAULT_WEIGHT)] = (
                selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=1,
                        max=5,
                        step=1,
                        mode=selector.NumberSelectorMode.SLIDER,
                    )
                )
            )

        return self.async_show_form(
            step_id="weights",
            data_schema=vol.Schema(weight_fields),
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        """Return options flow handler."""
        return DomoLinkNewsOptionsFlowHandler(config_entry)


class DomoLinkNewsOptionsFlowHandler(config_entries.OptionsFlow):
    """Handle options for DomoLink-News."""

    def __init__(self, config_entry: config_entries.ConfigEntry | None = None) -> None:
        """Initialize options flow defensively."""
        if config_entry is not None:
            self._config_entry = config_entry

    @property
    def config_entry(self) -> config_entries.ConfigEntry:
        """Return config entry."""
        if hasattr(self, "_config_entry") and self._config_entry is not None:
            return self._config_entry
        return super().config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Manage preferences and category weights."""
        current_options = dict(self.config_entry.data)
        if self.config_entry.options:
            current_options.update(self.config_entry.options)

        if user_input is not None:
            selected_cats = user_input.get(CONF_CATEGORIES, current_options.get(CONF_CATEGORIES, []))
            weights = {
                cat: user_input.get(f"weight_{cat}", DEFAULT_WEIGHT) for cat in selected_cats
            }
            new_data = {
                **current_options,
                CONF_COUNTRY: user_input[CONF_COUNTRY],
                CONF_LANGUAGE: user_input[CONF_LANGUAGE],
                CONF_CATEGORIES: selected_cats,
                CONF_CATEGORY_WEIGHTS: weights,
                CONF_KEYWORDS: user_input.get(CONF_KEYWORDS, ""),
            }
            if user_input.get(CONF_API_KEY):
                new_data[CONF_API_KEY] = user_input[CONF_API_KEY].strip()

            self.hass.config_entries.async_update_entry(self.config_entry, data=new_data)
            return self.async_create_entry(title="", data=new_data)

        current_cats = current_options.get(CONF_CATEGORIES, DEFAULT_CATEGORIES)
        current_weights = current_options.get(CONF_CATEGORY_WEIGHTS, {})

        categories_options = [
            selector.SelectOptionDict(
                value=cat,
                label=f"{CATEGORY_METADATA[cat]['label']}",
            )
            for cat in ALL_CATEGORIES
        ]

        schema_dict: dict[Any, Any] = {
            vol.Optional(
                CONF_API_KEY, default=current_options.get(CONF_API_KEY, "")
            ): selector.TextSelector(
                selector.TextSelectorConfig(type=selector.TextSelectorType.PASSWORD)
            ),
            vol.Required(
                CONF_COUNTRY, default=current_options.get(CONF_COUNTRY, DEFAULT_COUNTRY)
            ): selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=[
                        selector.SelectOptionDict(value=k, label=v)
                        for k, v in SUPPORTED_COUNTRIES.items()
                    ],
                    mode=selector.SelectSelectorMode.DROPDOWN,
                )
            ),
            vol.Required(
                CONF_LANGUAGE, default=current_options.get(CONF_LANGUAGE, DEFAULT_LANGUAGE)
            ): selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=[
                        selector.SelectOptionDict(value=k, label=v)
                        for k, v in SUPPORTED_LANGUAGES.items()
                    ],
                    mode=selector.SelectSelectorMode.DROPDOWN,
                )
            ),
            vol.Required(CONF_CATEGORIES, default=current_cats): selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=categories_options,
                    multiple=True,
                    mode=selector.SelectSelectorMode.LIST,
                )
            ),
            vol.Optional(
                CONF_KEYWORDS, default=current_options.get(CONF_KEYWORDS, "")
            ): selector.TextSelector(
                selector.TextSelectorConfig(type=selector.TextSelectorType.TEXT)
            ),
        }

        # Dynamic sliders for weights
        for cat in ALL_CATEGORIES:
            meta = CATEGORY_METADATA.get(cat, {"label": cat.capitalize()})
            cur_w = current_weights.get(cat, DEFAULT_WEIGHT)
            schema_dict[vol.Required(f"weight_{cat}", default=cur_w)] = (
                selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=1,
                        max=5,
                        step=1,
                        mode=selector.NumberSelectorMode.SLIDER,
                    )
                )
            )

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(schema_dict),
        )

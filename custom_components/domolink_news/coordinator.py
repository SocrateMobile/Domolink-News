"""DataUpdateCoordinator for DomoLink-News."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
import hashlib
import logging
from typing import Any

import aiohttp

from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
import homeassistant.util.dt as dt_util

from .const import (
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
    POLL_INTERVAL_DAY,
    POLL_INTERVAL_NIGHT,
)

_LOGGER = logging.getLogger(__name__)
NEWSAPI_TOP_HEADLINES_URL = "https://newsapi.org/v2/top-headlines"
NEWSAPI_EVERYTHING_URL = "https://newsapi.org/v2/everything"


def get_adaptive_polling_interval() -> timedelta:
    """Return 30 mins during day (07:00-23:00) and 120 mins at night."""
    now = dt_util.now()
    if 7 <= now.hour < 23:
        return timedelta(minutes=POLL_INTERVAL_DAY)
    return timedelta(minutes=POLL_INTERVAL_NIGHT)


class DomoLinkNewsCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Manages fetching news from NewsAPI with adaptive polling and local caching."""

    def __init__(self, hass: HomeAssistant, entry_data: dict[str, Any]) -> None:
        """Initialize coordinator."""
        self.entry_data = entry_data
        self.api_key: str = entry_data.get(CONF_API_KEY, "")
        self.country: str = entry_data.get(CONF_COUNTRY, DEFAULT_COUNTRY)
        self.language: str = entry_data.get(CONF_LANGUAGE, DEFAULT_LANGUAGE)
        self.categories: list[str] = entry_data.get(CONF_CATEGORIES, DEFAULT_CATEGORIES)
        self.category_weights: dict[str, int] = entry_data.get(
            CONF_CATEGORY_WEIGHTS, {cat: DEFAULT_WEIGHT for cat in self.categories}
        )
        self.keywords: str = entry_data.get(CONF_KEYWORDS, "")

        self._cached_data: dict[str, Any] = {
            "categories": self.categories,
            "category_weights": self.category_weights,
            "articles_by_category": {},
            "all_articles": [],
            "last_updated": None,
            "total_articles": 0,
            "status": "initial",
        }

        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=get_adaptive_polling_interval(),
        )

    def update_options(self, options: dict[str, Any]) -> None:
        """Update runtime options without full reload."""
        if CONF_CATEGORIES in options:
            self.categories = options[CONF_CATEGORIES]
        if CONF_CATEGORY_WEIGHTS in options:
            self.category_weights = options[CONF_CATEGORY_WEIGHTS]
        if CONF_KEYWORDS in options:
            self.keywords = options[CONF_KEYWORDS]
        if CONF_COUNTRY in options:
            self.country = options[CONF_COUNTRY]
        if CONF_LANGUAGE in options:
            self.language = options[CONF_LANGUAGE]

    async def _async_update_data(self) -> dict[str, Any]:
        """Fetch news from NewsAPI according to selected categories and weights."""
        # Adjust next polling interval dynamically based on current time
        self.update_interval = get_adaptive_polling_interval()

        session = async_get_clientsession(self.hass)
        articles_by_category: dict[str, list[dict[str, Any]]] = {}
        all_articles: list[dict[str, Any]] = []

        headers = {
            "X-Api-Key": self.api_key,
            "User-Agent": "DomoLink-News-HomeAssistant/1.0.0",
        }

        # 1. Fetch top headlines for each active category
        for cat in self.categories:
            params = {
                "country": self.country,
                "category": cat,
                "pageSize": "15",
            }
            try:
                async with session.get(
                    NEWSAPI_TOP_HEADLINES_URL,
                    params=params,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=15),
                ) as resp:
                    if resp.status == 200:
                        json_resp = await resp.json()
                        raw_articles = json_resp.get("articles", [])
                        weight = self.category_weights.get(cat, DEFAULT_WEIGHT)
                        cleaned = self._clean_articles(raw_articles, cat, weight)
                        articles_by_category[cat] = cleaned
                        all_articles.extend(cleaned)
                    elif resp.status == 429:
                        _LOGGER.warning(
                            "NewsAPI rate limit reached (status 429). Retaining cached news."
                        )
                        self._cached_data["status"] = "rate_limited"
                        return self._cached_data
                    else:
                        _LOGGER.warning(
                            "NewsAPI error for category %s: HTTP %s", cat, resp.status
                        )
            except (asyncio.TimeoutError, aiohttp.ClientError) as err:
                _LOGGER.warning(
                    "Network error fetching NewsAPI category %s: %s", cat, err
                )
                if self._cached_data["articles_by_category"]:
                    self._cached_data["status"] = "network_error"
                    return self._cached_data
                raise UpdateFailed(f"Error communicating with NewsAPI: {err}") from err

        # 2. Fetch custom keywords if configured
        if self.keywords.strip():
            params = {
                "q": self.keywords.strip(),
                "language": self.language,
                "sortBy": "publishedAt",
                "pageSize": "15",
            }
            try:
                async with session.get(
                    NEWSAPI_EVERYTHING_URL,
                    params=params,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=15),
                ) as resp:
                    if resp.status == 200:
                        json_resp = await resp.json()
                        raw_articles = json_resp.get("articles", [])
                        custom_weight = 5  # Custom keywords default to highest interest
                        cleaned = self._clean_articles(raw_articles, "custom", custom_weight)
                        articles_by_category["custom"] = cleaned
                        all_articles.extend(cleaned)
            except Exception as err:  # pylint: disable=broad-except
                _LOGGER.warning("Could not fetch custom keyword articles: %s", err)

        # Remove duplicates across categories by url or title
        seen_urls = set()
        deduped_all: list[dict[str, Any]] = []
        for art in all_articles:
            u = art.get("url") or art.get("title")
            if u not in seen_urls:
                seen_urls.add(u)
                deduped_all.append(art)

        # Sort all_articles by category weight (descending) then publishedAt (descending)
        deduped_all.sort(
            key=lambda x: (x.get("weight", 1), x.get("publishedAt", "")),
            reverse=True,
        )

        now_iso = dt_util.utcnow().isoformat()
        self._cached_data = {
            "categories": self.categories,
            "category_weights": self.category_weights,
            "articles_by_category": articles_by_category,
            "all_articles": deduped_all,
            "last_updated": now_iso,
            "total_articles": len(deduped_all),
            "status": "ok",
        }
        return self._cached_data

    def _clean_articles(
        self, raw_articles: list[dict[str, Any]], category: str, weight: int
    ) -> list[dict[str, Any]]:
        """Filter out removed articles and clean metadata."""
        cleaned: list[dict[str, Any]] = []
        for a in raw_articles:
            title = (a.get("title") or "").strip()
            # NewsAPI returns "[Removed]" for deleted articles
            if not title or title == "[Removed]":
                continue

            desc = (a.get("description") or "").strip()
            if desc == "[Removed]":
                desc = ""

            url = a.get("url") or ""
            source_name = (a.get("source") or {}).get("name") or "Presse"
            published_at = a.get("publishedAt") or ""
            image_url = a.get("urlToImage") or ""

            # Deterministic article hash for unique keys in UI
            article_id = hashlib.md5(f"{url}_{title}".encode()).hexdigest()[:12]

            cleaned.append(
                {
                    "id": article_id,
                    "title": title,
                    "description": desc,
                    "source": source_name,
                    "url": url,
                    "image": image_url,
                    "publishedAt": published_at,
                    "category": category,
                    "weight": weight,
                }
            )
        return cleaned

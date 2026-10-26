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
    CATEGORY_BUSINESS,
    CATEGORY_ENTERTAINMENT,
    CATEGORY_GENERAL,
    CATEGORY_HEALTH,
    CATEGORY_SCIENCE,
    CATEGORY_SPORTS,
    CATEGORY_TECH,
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

# Search queries fallback for categories that have 0 or few top-headlines in non-US countries
CATEGORY_FALLBACK_QUERIES = {
    CATEGORY_TECH: "technologie OR IA OR smartphone OR Apple OR Google OR informatique OR logiciel",
    CATEGORY_BUSINESS: "economie OR bourse OR finance OR entreprises OR marche OR CAC40",
    CATEGORY_SCIENCE: "science OR espace OR recherche OR climat OR astronomie OR planete",
    CATEGORY_HEALTH: "sante OR medecine OR virus OR hopital OR vaccin OR bien-etre",
    CATEGORY_SPORTS: "sport OR football OR rugby OR tennis OR ligue1 OR cyclisme",
    CATEGORY_ENTERTAINMENT: "cinema OR film OR musique OR culture OR serie OR spectacle",
    CATEGORY_GENERAL: "actualite OR france OR societe OR politique OR monde",
}


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
        self.api_key: str = (entry_data.get(CONF_API_KEY) or "").strip()
        self.country: str = (entry_data.get(CONF_COUNTRY) or DEFAULT_COUNTRY).strip().lower()
        self.language: str = (entry_data.get(CONF_LANGUAGE) or DEFAULT_LANGUAGE).strip().lower()
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
            "last_error": None,
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
            self.country = options[CONF_COUNTRY].strip().lower()
        if CONF_LANGUAGE in options:
            self.language = options[CONF_LANGUAGE].strip().lower()

    async def _async_update_data(self) -> dict[str, Any]:
        """Fetch news from NewsAPI according to selected categories and weights."""
        self.update_interval = get_adaptive_polling_interval()

        session = async_get_clientsession(self.hass)
        articles_by_category: dict[str, list[dict[str, Any]]] = {}
        all_articles: list[dict[str, Any]] = []
        last_error: str | None = None

        # Redundant headers to bypass proxy/WAF header stripping
        headers = {
            "X-Api-Key": self.api_key,
            "Authorization": f"Bearer {self.api_key}",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) DomoLinkNews/1.0",
            "Accept": "application/json",
        }

        # 1. First fetch general top-headlines for the country (always has news)
        try:
            params = {
                "country": self.country,
                "pageSize": "25",
                "apiKey": self.api_key,
            }
            async with session.get(
                NEWSAPI_TOP_HEADLINES_URL,
                params=params,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status == 200:
                    json_resp = await resp.json()
                    raw = json_resp.get("articles", [])
                    gen_w = self.category_weights.get(CATEGORY_GENERAL, DEFAULT_WEIGHT)
                    cleaned_gen = self._clean_articles(raw, CATEGORY_GENERAL, gen_w)
                    if cleaned_gen:
                        articles_by_category[CATEGORY_GENERAL] = cleaned_gen
                        all_articles.extend(cleaned_gen)
                        _LOGGER.info("DomoLink-News: Retrieved %d general headlines for %s", len(cleaned_gen), self.country)
                else:
                    err_body = await resp.text()
                    _LOGGER.error("DomoLink-News: NewsAPI top-headlines error (HTTP %s): %s", resp.status, err_body)
                    last_error = f"HTTP {resp.status}: {err_body[:120]}"
        except Exception as err:
            _LOGGER.error("DomoLink-News: Connection error on country headlines: %s", err)
            last_error = str(err)

        # 2. Fetch specific top headlines or fallback query for each selected category
        for cat in self.categories:
            if cat == CATEGORY_GENERAL and articles_by_category.get(CATEGORY_GENERAL):
                continue

            params = {
                "country": self.country,
                "category": cat,
                "pageSize": "15",
                "apiKey": self.api_key,
            }
            cat_articles: list[dict[str, Any]] = []
            try:
                async with session.get(
                    NEWSAPI_TOP_HEADLINES_URL,
                    params=params,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=15),
                ) as resp:
                    if resp.status == 200:
                        json_resp = await resp.json()
                        raw = json_resp.get("articles", [])
                        w = self.category_weights.get(cat, DEFAULT_WEIGHT)
                        cat_articles = self._clean_articles(raw, cat, w)
                    else:
                        _LOGGER.warning("DomoLink-News: top-headlines for %s returned HTTP %s", cat, resp.status)
            except Exception as err:
                _LOGGER.warning("DomoLink-News: error fetching category %s: %s", cat, err)

            # Fallback to /everything with thematic query if top-headlines returned 0 for this category
            if len(cat_articles) == 0 and cat in CATEGORY_FALLBACK_QUERIES:
                fallback_query = CATEGORY_FALLBACK_QUERIES[cat]
                everything_params = {
                    "q": fallback_query,
                    "language": self.language,
                    "sortBy": "publishedAt",
                    "pageSize": "15",
                    "apiKey": self.api_key,
                }
                try:
                    async with session.get(
                        NEWSAPI_EVERYTHING_URL,
                        params=everything_params,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=15),
                    ) as resp:
                        if resp.status == 200:
                            json_resp = await resp.json()
                            raw = json_resp.get("articles", [])
                            w = self.category_weights.get(cat, DEFAULT_WEIGHT)
                            cat_articles = self._clean_articles(raw, cat, w)
                            _LOGGER.info("DomoLink-News: Fallback query retrieved %d articles for category %s", len(cat_articles), cat)
                except Exception as err:
                    _LOGGER.warning("DomoLink-News: Fallback query failed for %s: %s", cat, err)

            if cat_articles:
                articles_by_category[cat] = cat_articles
                all_articles.extend(cat_articles)

        # 3. Fetch custom keywords if configured
        if self.keywords.strip():
            params = {
                "q": self.keywords.strip(),
                "language": self.language,
                "sortBy": "publishedAt",
                "pageSize": "15",
                "apiKey": self.api_key,
            }
            try:
                async with session.get(
                    NEWSAPI_EVERYTHING_URL,
                    params=params,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=15),
                ) as resp:
                    if resp.status == 200:
                        raw_articles = json_resp.get("articles", [])
                        custom_weight = 5
                        cleaned = self._clean_articles(raw_articles, "custom", custom_weight)
                        articles_by_category["custom"] = cleaned
                        all_articles.extend(cleaned)
            except Exception as err:
                _LOGGER.warning("DomoLink-News: Could not fetch custom keyword articles: %s", err)

        # Deduplicate all articles by url and title
        seen_keys = set()
        deduped_all: list[dict[str, Any]] = []
        for art in all_articles:
            k = art.get("url") or art.get("title")
            if k and k not in seen_keys:
                seen_keys.add(k)
                deduped_all.append(art)

        # Sort all_articles by weight (descending) then publishedAt (descending)
        deduped_all.sort(
            key=lambda x: (x.get("weight", 1), x.get("publishedAt", "")),
            reverse=True,
        )

        now_iso = dt_util.utcnow().isoformat()
        status_val = "ok" if deduped_all else ("error" if last_error else "empty")

        self._cached_data = {
            "categories": self.categories,
            "category_weights": self.category_weights,
            "articles_by_category": articles_by_category,
            "all_articles": deduped_all,
            "last_updated": now_iso,
            "total_articles": len(deduped_all),
            "status": status_val,
            "last_error": last_error,
        }

        _LOGGER.info(
            "DomoLink-News update completed: %d total unique articles across %d categories (status: %s)",
            len(deduped_all),
            len(articles_by_category),
            status_val,
        )
        return self._cached_data

    def _clean_articles(
        self, raw_articles: list[dict[str, Any]], category: str, weight: int
    ) -> list[dict[str, Any]]:
        """Filter out removed articles and clean metadata."""
        cleaned: list[dict[str, Any]] = []
        for a in raw_articles:
            title = (a.get("title") or "").strip()
            if not title or title == "[Removed]":
                continue

            desc = (a.get("description") or "").strip()
            if desc == "[Removed]":
                desc = ""

            url = a.get("url") or ""
            source_name = (a.get("source") or {}).get("name") or "Presse"
            published_at = a.get("publishedAt") or ""
            image_url = a.get("urlToImage") or ""

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

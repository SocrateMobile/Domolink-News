"""Constants for the DomoLink-News integration."""
from __future__ import annotations

DOMAIN = "domolink_news"
NAME = "DomoLink-News"
VERSION = "1.0.0"

# Configuration keys
CONF_API_KEY = "api_key"
CONF_LANGUAGE = "language"
CONF_COUNTRY = "country"
CONF_CATEGORIES = "categories"
CONF_CATEGORY_WEIGHTS = "category_weights"
CONF_KEYWORDS = "keywords"

# Defaults
DEFAULT_LANGUAGE = "fr"
DEFAULT_COUNTRY = "fr"
DEFAULT_CATEGORIES = ["general", "technology", "business", "science"]
DEFAULT_WEIGHT = 3

# Adaptive Polling intervals in minutes
POLL_INTERVAL_DAY = 30    # 07:00 -> 23:00 (32 calls/day)
POLL_INTERVAL_NIGHT = 120 # 23:00 -> 07:00 (4 calls/night)
# Total: ~36 calls/day, safely below 100 calls/day NewsAPI free quota.

# NewsAPI Official Categories
CATEGORY_GENERAL = "general"
CATEGORY_TECH = "technology"
CATEGORY_BUSINESS = "business"
CATEGORY_SCIENCE = "science"
CATEGORY_HEALTH = "health"
CATEGORY_SPORTS = "sports"
CATEGORY_ENTERTAINMENT = "entertainment"

ALL_CATEGORIES = [
    CATEGORY_GENERAL,
    CATEGORY_TECH,
    CATEGORY_BUSINESS,
    CATEGORY_SCIENCE,
    CATEGORY_HEALTH,
    CATEGORY_SPORTS,
    CATEGORY_ENTERTAINMENT,
]

CATEGORY_METADATA = {
    CATEGORY_GENERAL: {
        "label": "Général & Société",
        "icon": "mdi:earth",
        "color": "#38bdf8",
    },
    CATEGORY_TECH: {
        "label": "Tech & Intelligence Artificielle",
        "icon": "mdi:cpu-64-bit",
        "color": "#818cf8",
    },
    CATEGORY_BUSINESS: {
        "label": "Économie & Marchés",
        "icon": "mdi:trending-up",
        "color": "#34d399",
    },
    CATEGORY_SCIENCE: {
        "label": "Sciences & Espace",
        "icon": "mdi:flask-outline",
        "color": "#c084fc",
    },
    CATEGORY_HEALTH: {
        "label": "Santé & Bien-être",
        "icon": "mdi:heart-pulse",
        "color": "#f87171",
    },
    CATEGORY_SPORTS: {
        "label": "Sports",
        "icon": "mdi:trophy-outline",
        "color": "#fb923c",
    },
    CATEGORY_ENTERTAINMENT: {
        "label": "Culture & Divertissement",
        "icon": "mdi:filmstrip",
        "color": "#f472b6",
    },
}

SUPPORTED_LANGUAGES = {
    "fr": "Français",
    "en": "English",
    "de": "Deutsch",
    "es": "Español",
    "it": "Italiano",
    "pt": "Português",
    "nl": "Nederlands",
}

SUPPORTED_COUNTRIES = {
    "fr": "France (FR)",
    "be": "Belgique (BE)",
    "ch": "Suisse (CH)",
    "ca": "Canada (CA)",
    "us": "États-Unis (US)",
    "gb": "Royaume-Uni (GB)",
    "de": "Allemagne (DE)",
    "es": "Espagne (ES)",
    "it": "Italie (IT)",
}

# Frontend Panel Registration
PANEL_TITLE = "DomoLink News"
PANEL_ICON = "mdi:newspaper-variant-outline"
PANEL_URL_PATH = "domolink-news"
FRONTEND_URL_PATH = "/domolink_news_frontend"
FRONTEND_FILE_NAME = "domolink-news-panel.js"

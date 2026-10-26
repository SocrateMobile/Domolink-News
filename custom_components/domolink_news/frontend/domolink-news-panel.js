/**
 * DomoLink-News Custom Panel for Home Assistant
 * Version 1.0.4
 *
 * Features:
 * - Real-time news feed aggregated from NewsAPI.org
 * - High-contrast, vivid category badges
 * - Curated categories including "Actualité politique" and "Journal d'information"
 * - Live Settings Tab (⚙️ Paramètres) to edit API key, country, language, filters and 1-5 star weights
 * - Explicit source attribution citing NewsAPI.org and press publishers
 */
class DomoLinkNewsPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._data = null;
    this._activeTab = 'all';
    this._searchQuery = '';
    this._isRefreshing = false;
    this._isSaving = false;
    this._showApiKey = false;
    this._saveSuccessMessage = '';
    this._configForm = null;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._data && !this._isFetching) {
      this._loadData();
    }
  }

  connectedCallback() {
    this._render();
  }

  async _loadData() {
    if (!this._hass) return;
    this._isFetching = true;
    try {
      const res = await this._hass.callWS({ type: 'domolink_news/get_data' });
      this._data = res;
      this._initFormFromData();
    } catch (e) {
      console.warn('[DomoLink-News] WS get_data error:', e);
    } finally {
      this._isFetching = false;
      this._render();
    }
  }

  _initFormFromData() {
    if (!this._data) return;
    const cfg = this._data.config || {};
    const defaultCats = this._data.categories || ['general', 'journal', 'politics', 'technology', 'business', 'science'];
    const defaultWeights = this._data.category_weights || {};

    this._configForm = {
      api_key: cfg.api_key || '',
      country: cfg.country || 'fr',
      language: cfg.language || 'fr',
      categories: [...defaultCats],
      category_weights: { ...defaultWeights },
      keywords: cfg.keywords || '',
    };
  }

  async _refreshNews() {
    if (!this._hass || this._isRefreshing) return;
    this._isRefreshing = true;
    this._render();
    try {
      const res = await this._hass.callWS({ type: 'domolink_news/refresh' });
      this._data = res;
      this._initFormFromData();
    } catch (e) {
      console.warn('[DomoLink-News] WS refresh error:', e);
    } finally {
      this._isRefreshing = false;
      this._render();
    }
  }

  async _saveConfig() {
    if (!this._hass || this._isSaving || !this._configForm) return;
    this._isSaving = true;
    this._saveSuccessMessage = '';
    this._render();

    try {
      const payload = {
        type: 'domolink_news/save_config',
        api_key: this._configForm.api_key.trim(),
        country: this._configForm.country,
        language: this._configForm.language,
        categories: this._configForm.categories,
        category_weights: this._configForm.category_weights,
        keywords: this._configForm.keywords.trim(),
      };
      const res = await this._hass.callWS(payload);
      if (res && res.data) {
        this._data = res.data;
        this._initFormFromData();
      }
      this._saveSuccessMessage = '✅ Configuration enregistrée et actualités rechargées avec succès !';
      // Switch back to "all" after 1.5 seconds if on settings tab
      setTimeout(() => {
        this._saveSuccessMessage = '';
        this._activeTab = 'all';
        this._render();
      }, 1800);
    } catch (e) {
      console.error('[DomoLink-News] Error saving configuration:', e);
      this._saveSuccessMessage = `❌ Erreur : ${e.message || 'Impossible d\'enregistrer les modifications'}`;
    } finally {
      this._isSaving = false;
      this._render();
    }
  }

  _formatTimeAgo(isoString) {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMin = Math.round((now - date) / 60000);
      if (diffMin < 1) return "À l'instant";
      if (diffMin < 60) return `Il y a ${diffMin} min`;
      const diffHours = Math.round(diffMin / 60);
      if (diffHours < 24) return `Il y a ${diffHours} h`;
      const diffDays = Math.round(diffHours / 24);
      return `Il y a ${diffDays} j`;
    } catch {
      return '';
    }
  }

  _renderStars(weight) {
    const w = Math.max(1, Math.min(5, weight || 3));
    let stars = '';
    for (let i = 1; i <= 5; i++) {
      stars += i <= w ? '★' : '☆';
    }
    return stars;
  }

  _getAllAvailableCategories() {
    return [
      { id: 'general', label: 'Général & Société', icon: '🌍', color: '#0284c7', desc: 'Faits marquants nationaux et société' },
      { id: 'journal', label: 'Journal d\'information', icon: '📰', color: '#2563eb', desc: 'Grands quotidiens et titres de référence' },
      { id: 'politics', label: 'Actualité politique', icon: '🏛️', color: '#d97706', desc: 'Gouvernement, Parlement, élections et partis' },
      { id: 'technology', label: 'Tech & Intelligence Artificielle', icon: '⚡', color: '#6366f1', desc: 'IA, innovations, logiciels et cybersécurité' },
      { id: 'business', label: 'Économie & Marchés', icon: '📈', color: '#059669', desc: 'Entreprises, marchés financiers, inflation et emploi' },
      { id: 'science', label: 'Sciences & Espace', icon: '🔬', color: '#9333ea', desc: 'Découvertes scientifiques, espace, CNRS et NASA' },
      { id: 'health', label: 'Santé & Bien-être', icon: '❤️', color: '#dc2626', desc: 'Médecine, santé publique, recherche et prévention' },
      { id: 'sports', label: 'Sports', icon: '🏆', color: '#ea580c', desc: 'Football, tennis, rugby, cyclisme et résultats' },
      { id: 'entertainment', label: 'Culture & Divertissement', icon: '🎬', color: '#db2777', desc: 'Cinéma, musique, séries, livres et arts' },
    ];
  }

  _getCategoryMeta(category) {
    const metas = {
      general: { label: 'Général', color: '#0284c7', icon: '🌍' },
      journal: { label: 'Journal Info', color: '#2563eb', icon: '📰' },
      politics: { label: 'Politique', color: '#d97706', icon: '🏛️' },
      technology: { label: 'Tech & IA', color: '#6366f1', icon: '⚡' },
      business: { label: 'Économie', color: '#059669', icon: '📈' },
      science: { label: 'Sciences', color: '#9333ea', icon: '🔬' },
      health: { label: 'Santé', color: '#dc2626', icon: '❤️' },
      sports: { label: 'Sports', color: '#ea580c', icon: '🏆' },
      entertainment: { label: 'Culture', color: '#db2777', icon: '🎬' },
      custom: { label: 'Veille', color: '#0d9488', icon: '🔍' }
    };
    return metas[category] || { label: category, color: '#475569', icon: '📌' };
  }

  _render() {
    const data = this._data || {
      categories: [],
      category_weights: {},
      articles_by_category: {},
      all_articles: [],
      total_articles: 0
    };

    if (!this._configForm && this._data) {
      this._initFormFromData();
    }

    const categories = data.categories || [];
    const weights = data.category_weights || {};
    const allArticles = data.all_articles || [];
    const articlesByCat = data.articles_by_category || {};

    // Filter by selected Tab
    let displayed = [];
    if (this._activeTab === 'all') {
      displayed = allArticles;
    } else if (this._activeTab !== 'settings') {
      displayed = articlesByCat[this._activeTab] || [];
    }

    // Filter by Search Query (if not in settings)
    if (this._activeTab !== 'settings' && this._searchQuery.trim()) {
      const q = this._searchQuery.toLowerCase().trim();
      displayed = displayed.filter(a =>
        (a.title && a.title.toLowerCase().includes(q)) ||
        (a.description && a.description.toLowerCase().includes(q)) ||
        (a.source && a.source.toLowerCase().includes(q))
      );
    }

    const lastSyncStr = data.last_updated
      ? `Synchronisé à ${new Date(data.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : 'Initialisation...';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          height: 100vh;
          overflow-y: auto;
          background: var(--primary-background-color, #0b1120);
          color: var(--primary-text-color, #f8fafc);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          box-sizing: border-box;
        }

        * {
          box-sizing: border-box;
        }

        .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 24px 28px 60px 28px;
        }

        /* HEADER */
        .header {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding-bottom: 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          margin-bottom: 24px;
        }

        .title-block {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .logo-icon {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          background: linear-gradient(135deg, #0ea5e9, #6366f1);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          box-shadow: 0 4px 16px rgba(14, 165, 233, 0.35);
          flex-shrink: 0;
        }

        .title {
          margin: 0;
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.02em;
          background: linear-gradient(135deg, #ffffff 40%, #93c5fd);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .subtitle {
          margin: 4px 0 0 0;
          font-size: 13px;
          color: var(--secondary-text-color, #94a3b8);
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          display: inline-block;
          box-shadow: 0 0 8px #10b981;
        }

        .api-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border-radius: 12px;
          background: rgba(14, 165, 233, 0.15);
          border: 1px solid rgba(56, 189, 248, 0.3);
          color: #38bdf8;
          font-weight: 700;
          font-size: 11px;
        }

        /* CONTROLS (SEARCH & REFRESH) */
        .controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .search-box {
          position: relative;
          min-width: 260px;
        }

        .search-input {
          width: 100%;
          padding: 10px 14px 10px 36px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: #fff;
          font-size: 13px;
          outline: none;
          transition: border-color 0.2s, background 0.2s;
        }

        .search-input:focus {
          border-color: #38bdf8;
          background: rgba(255, 255, 255, 0.08);
        }

        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 14px;
          color: #64748b;
          pointer-events: none;
        }

        .refresh-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          border-radius: 10px;
          border: 1px solid rgba(56, 189, 248, 0.3);
          background: rgba(56, 189, 248, 0.1);
          color: #38bdf8;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .refresh-btn:hover {
          background: rgba(56, 189, 248, 0.2);
          border-color: #38bdf8;
        }

        .refresh-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .spin {
          display: inline-block;
          animation: rotation 1s infinite linear;
        }

        @keyframes rotation {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* CATEGORY TABS */
        .tabs-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .tabs-wrapper {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 4px;
          scrollbar-width: thin;
          flex: 1;
        }

        .tab-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 16px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: var(--secondary-text-color, #94a3b8);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s;
        }

        .tab-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }

        .tab-btn.active {
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(99, 102, 241, 0.25));
          border-color: #38bdf8;
          color: #fff;
          box-shadow: 0 4px 14px rgba(56, 189, 248, 0.2);
        }

        .tab-btn-settings {
          background: rgba(245, 158, 11, 0.1);
          border-color: rgba(245, 158, 11, 0.25);
          color: #fbbf24;
        }

        .tab-btn-settings:hover {
          background: rgba(245, 158, 11, 0.2);
          border-color: #f59e0b;
          color: #fff;
        }

        .tab-btn-settings.active {
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.3), rgba(217, 119, 6, 0.3));
          border-color: #f59e0b;
          color: #fff;
          box-shadow: 0 4px 14px rgba(245, 158, 11, 0.25);
        }

        .tab-stars {
          font-size: 11px;
          color: #facc15;
          letter-spacing: -1px;
        }

        .tab-badge {
          padding: 2px 7px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.12);
          font-size: 11px;
          font-weight: 700;
        }

        /* GRID ARTICLES */
        .articles-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
          gap: 24px;
        }

        .card {
          display: flex;
          flex-direction: column;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          overflow: hidden;
          transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
          position: relative;
        }

        .card:hover {
          transform: translateY(-4px);
          border-color: rgba(56, 189, 248, 0.35);
          box-shadow: 0 14px 30px rgba(0, 0, 0, 0.45);
        }

        .card-img-wrap {
          height: 190px;
          width: 100%;
          background: #0f172a;
          position: relative;
          overflow: hidden;
        }

        .card-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.3s ease;
        }

        .card:hover .card-img {
          transform: scale(1.04);
        }

        .card-img-fallback {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 48px;
          background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95));
        }

        /* ULTRA VISIBLE CATEGORY BADGE */
        .card-category-badge {
          position: absolute;
          top: 12px;
          left: 12px;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #ffffff !important;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.3);
          z-index: 2;
        }

        .card-body {
          padding: 18px 20px 20px 20px;
          display: flex;
          flex-direction: column;
          flex: 1;
        }

        .card-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          color: var(--secondary-text-color, #94a3b8);
          margin-bottom: 10px;
        }

        .card-source-wrap {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .source-api-badge {
          font-size: 10px;
          font-weight: 800;
          padding: 1px 6px;
          border-radius: 4px;
          background: rgba(14, 165, 233, 0.2);
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.3);
          letter-spacing: 0.02em;
        }

        .card-source {
          font-weight: 700;
          color: #cbd5e1;
        }

        .card-time {
          font-size: 11px;
        }

        .card-title {
          font-size: 16px;
          font-weight: 700;
          line-height: 1.4;
          margin: 0 0 10px 0;
          color: #fff;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .card-desc {
          font-size: 13px;
          line-height: 1.5;
          color: var(--secondary-text-color, #94a3b8);
          margin: 0 0 16px 0;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
          flex: 1;
        }

        .card-footer {
          margin-top: auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .card-stars {
          font-size: 12px;
          color: #facc15;
          letter-spacing: -1px;
        }

        .card-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 8px;
          background: rgba(56, 189, 248, 0.15);
          color: #38bdf8;
          font-size: 12px;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s;
        }

        .card-btn:hover {
          background: #38bdf8;
          color: #020617;
        }

        /* EMPTY STATE */
        .empty-state {
          text-align: center;
          padding: 80px 20px;
          color: var(--secondary-text-color, #94a3b8);
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
          opacity: 0.6;
        }

        .empty-title {
          font-size: 18px;
          font-weight: 700;
          color: #fff;
          margin-bottom: 8px;
        }

        /* SETTINGS VIEW */
        .settings-container {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 32px;
          max-width: 900px;
          margin: 0 auto;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.3);
        }

        .settings-header {
          display: flex;
          align-items: center;
          gap: 16px;
          padding-bottom: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          margin-bottom: 28px;
        }

        .settings-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: rgba(245, 158, 11, 0.15);
          border: 1px solid rgba(245, 158, 11, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
        }

        .settings-title {
          margin: 0;
          font-size: 20px;
          font-weight: 700;
          color: #fff;
        }

        .settings-subtitle {
          margin: 4px 0 0 0;
          font-size: 13px;
          color: #94a3b8;
        }

        .form-section {
          margin-bottom: 28px;
        }

        .section-title {
          font-size: 14px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #38bdf8;
          margin-bottom: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .input-group {
          margin-bottom: 16px;
        }

        .input-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: #e2e8f0;
          margin-bottom: 6px;
        }

        .input-help {
          font-size: 12px;
          color: #94a3b8;
          margin-top: 4px;
        }

        .input-help a {
          color: #38bdf8;
          text-decoration: underline;
        }

        .text-input {
          width: 100%;
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.04);
          color: #fff;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        }

        .text-input:focus {
          border-color: #38bdf8;
          background: rgba(255, 255, 255, 0.07);
        }

        .api-input-wrap {
          display: flex;
          gap: 8px;
        }

        .toggle-btn {
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          cursor: pointer;
          font-size: 14px;
        }

        .select-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .select-input {
          width: 100%;
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: #1e293b;
          color: #fff;
          font-size: 14px;
          outline: none;
        }

        /* CATEGORIES CONFIG LIST */
        .categories-config-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .category-config-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.08);
          transition: background 0.2s, border-color 0.2s;
        }

        .category-config-item:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.15);
        }

        .cat-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .cat-checkbox {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .cat-label {
          font-size: 14px;
          font-weight: 600;
          color: #fff;
          cursor: pointer;
        }

        .cat-desc {
          font-size: 12px;
          color: #94a3b8;
        }

        .cat-weight-controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .weight-label {
          font-size: 12px;
          color: #94a3b8;
        }

        .weight-slider {
          width: 100px;
          cursor: pointer;
        }

        .weight-stars-display {
          font-size: 14px;
          color: #facc15;
          letter-spacing: -1px;
          min-width: 75px;
          text-align: right;
        }

        /* ACTIONS */
        .settings-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 14px;
          padding-top: 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .btn-cancel {
          padding: 11px 20px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: transparent;
          color: #94a3b8;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-cancel:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.05);
        }

        .btn-save {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 11px 24px;
          border-radius: 10px;
          border: none;
          background: linear-gradient(135deg, #0ea5e9, #6366f1);
          color: #fff;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(14, 165, 233, 0.3);
          transition: all 0.2s;
        }

        .btn-save:hover {
          box-shadow: 0 6px 20px rgba(14, 165, 233, 0.45);
          transform: translateY(-1px);
        }

        .btn-save:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .toast-msg {
          padding: 12px 18px;
          border-radius: 10px;
          margin-bottom: 20px;
          font-size: 13px;
          font-weight: 600;
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid #10b981;
          color: #34d399;
        }

        /* ATTRIBUTION FOOTER */
        .footer-attribution {
          margin-top: 48px;
          padding-top: 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          text-align: center;
          font-size: 12px;
          color: #64748b;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }

        .footer-attribution strong {
          color: #38bdf8;
        }

        .footer-attribution a {
          color: #38bdf8;
          text-decoration: none;
        }

        @media (max-width: 640px) {
          .container {
            padding: 16px 16px 36px 16px;
          }
          .articles-grid {
            grid-template-columns: 1fr;
          }
          .search-box {
            min-width: 100%;
          }
          .select-grid {
            grid-template-columns: 1fr;
          }
          .settings-container {
            padding: 20px;
          }
          .category-config-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 10px;
          }
          .cat-weight-controls {
            width: 100%;
            justify-content: space-between;
          }
        }
      </style>

      <div class="container">
        <!-- HEADER -->
        <header class="header">
          <div class="title-block">
            <div class="logo-icon">📰</div>
            <div>
              <h1 class="title">DomoLink News</h1>
              <p class="subtitle">
                <span class="status-dot"></span>
                <span>${displayed.length} articles disponibles</span>
                <span>•</span>
                <span class="api-pill">Source : NewsAPI.org</span>
                <span>•</span>
                <span>${lastSyncStr}</span>
              </p>
            </div>
          </div>

          <div class="controls">
            ${this._activeTab !== 'settings' ? `
              <div class="search-box">
                <span class="search-icon">🔍</span>
                <input 
                  type="text" 
                  class="search-input" 
                  placeholder="Rechercher une actualité..." 
                  value="${this._searchQuery}"
                  id="searchInput"
                />
              </div>
            ` : ''}
            <button class="refresh-btn" id="refreshBtn" ${this._isRefreshing ? 'disabled' : ''}>
              <span class="${this._isRefreshing ? 'spin' : ''}">🔄</span>
              <span>${this._isRefreshing ? 'Actualisation...' : 'Actualiser'}</span>
            </button>
          </div>
        </header>

        <!-- TABS BAR -->
        <div class="tabs-bar">
          <nav class="tabs-wrapper">
            <button class="tab-btn ${this._activeTab === 'all' ? 'active' : ''}" data-tab="all">
              <span>✨ Tous les flux</span>
              <span class="tab-badge">${allArticles.length}</span>
            </button>
            ${categories.map(cat => {
              const meta = this._getCategoryMeta(cat);
              const count = (articlesByCat[cat] || []).length;
              const w = weights[cat] || 3;
              return `
                <button class="tab-btn ${this._activeTab === cat ? 'active' : ''}" data-tab="${cat}">
                  <span>${meta.icon} ${meta.label}</span>
                  <span class="tab-stars" title="Priorité ${w}/5">${this._renderStars(w)}</span>
                  <span class="tab-badge">${count}</span>
                </button>
              `;
            }).join('')}
            ${articlesByCat['custom'] ? `
              <button class="tab-btn ${this._activeTab === 'custom' ? 'active' : ''}" data-tab="custom">
                <span>🔍 Veille Mots-clés</span>
                <span class="tab-stars">★★★★★</span>
                <span class="tab-badge">${articlesByCat['custom'].length}</span>
              </button>
            ` : ''}
          </nav>

          <!-- SETTINGS TAB BUTTON -->
          <button class="tab-btn tab-btn-settings ${this._activeTab === 'settings' ? 'active' : ''}" data-tab="settings">
            <span>⚙️ Paramètres & Filtres</span>
          </button>
        </div>

        <!-- MAIN VIEW (ARTICLES OR SETTINGS) -->
        ${this._activeTab === 'settings' ? this._renderSettingsView() : this._renderArticlesView(displayed, data)}

        <!-- ATTRIBUTION FOOTER -->
        <footer class="footer-attribution">
          <div>
            Flux d'informations propulsé par l'API officielle <strong>NewsAPI.org</strong> et les rédactions partenaires.
          </div>
          <div>DomoLink-News v1.0.4 • Domotique intelligente Home Assistant</div>
        </footer>
      </div>
    `;

    this._attachEventListeners();
  }

  _renderSettingsView() {
    const form = this._configForm || {
      api_key: '',
      country: 'fr',
      language: 'fr',
      categories: ['general', 'journal', 'politics', 'technology', 'business', 'science'],
      category_weights: {},
      keywords: '',
    };

    const allAvailable = this._getAllAvailableCategories();

    return `
      <div class="settings-container">
        ${this._saveSuccessMessage ? `
          <div class="toast-msg">${this._saveSuccessMessage}</div>
        ` : ''}

        <div class="settings-header">
          <div class="settings-icon">⚙️</div>
          <div>
            <h2 class="settings-title">Paramètres de DomoLink-News</h2>
            <p class="settings-subtitle">Modifiez vos filtres thématiques, votre clé API, votre pays et les poids de priorité en temps réel.</p>
          </div>
        </div>

        <!-- 1. API KEY -->
        <div class="form-section">
          <div class="section-title">🔑 Clé API NewsAPI.org</div>
          <div class="input-group">
            <label class="input-label">Clé d'authentification NewsAPI</label>
            <div class="api-input-wrap">
              <input 
                type="${this._showApiKey ? 'text' : 'password'}" 
                class="text-input" 
                id="cfgApiKey" 
                value="${form.api_key}" 
                placeholder="Ex: 8f492b6a9e144a1bb674..." 
              />
              <button type="button" class="toggle-btn" id="toggleApiKeyBtn" title="Afficher/Masquer">
                ${this._showApiKey ? '🙈' : '👁️'}
              </button>
            </div>
            <div class="input-help">
              Obtenez gratuitement une clé d'accès sur <a href="https://newsapi.org/register" target="_blank" rel="noopener">NewsAPI.org/register</a> (100 requêtes/jour offertes).
            </div>
          </div>
        </div>

        <!-- 2. LOCALISATION ET LANGUE -->
        <div class="form-section">
          <div class="section-title">🌍 Localisation & Langue</div>
          <div class="select-grid">
            <div class="input-group">
              <label class="input-label">Pays des actualités</label>
              <select class="select-input" id="cfgCountry">
                <option value="fr" ${form.country === 'fr' ? 'selected' : ''}>France (FR)</option>
                <option value="be" ${form.country === 'be' ? 'selected' : ''}>Belgique (BE)</option>
                <option value="ch" ${form.country === 'ch' ? 'selected' : ''}>Suisse (CH)</option>
                <option value="ca" ${form.country === 'ca' ? 'selected' : ''}>Canada (CA)</option>
                <option value="us" ${form.country === 'us' ? 'selected' : ''}>États-Unis (US)</option>
                <option value="gb" ${form.country === 'gb' ? 'selected' : ''}>Royaume-Uni (GB)</option>
                <option value="de" ${form.country === 'de' ? 'selected' : ''}>Allemagne (DE)</option>
                <option value="es" ${form.country === 'es' ? 'selected' : ''}>Espagne (ES)</option>
                <option value="it" ${form.country === 'it' ? 'selected' : ''}>Italie (IT)</option>
              </select>
            </div>
            <div class="input-group">
              <label class="input-label">Langue des flux</label>
              <select class="select-input" id="cfgLanguage">
                <option value="fr" ${form.language === 'fr' ? 'selected' : ''}>Français</option>
                <option value="en" ${form.language === 'en' ? 'selected' : ''}>English</option>
                <option value="de" ${form.language === 'de' ? 'selected' : ''}>Deutsch</option>
                <option value="es" ${form.language === 'es' ? 'selected' : ''}>Español</option>
                <option value="it" ${form.language === 'it' ? 'selected' : ''}>Italiano</option>
                <option value="pt" ${form.language === 'pt' ? 'selected' : ''}>Português</option>
                <option value="nl" ${form.language === 'nl' ? 'selected' : ''}>Nederlands</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 3. FILTRES THÉMATIQUES ET POIDS (1-5) -->
        <div class="form-section">
          <div class="section-title">🎯 Centres d'intérêt & Pondération (1 à 5 ★)</div>
          <p class="input-help" style="margin-bottom:14px;">
            Cochez les flux souhaités et ajustez le curseur d'importance relative (de 1 à 5 étoiles) pour équilibrer votre fil d'actualités.
          </p>

          <div class="categories-config-list">
            ${allAvailable.map(cat => {
              const isChecked = form.categories.includes(cat.id);
              const weight = form.category_weights[cat.id] || 3;
              return `
                <div class="category-config-item">
                  <div class="cat-info">
                    <input 
                      type="checkbox" 
                      class="cat-checkbox" 
                      id="cat_${cat.id}" 
                      data-cat="${cat.id}" 
                      ${isChecked ? 'checked' : ''} 
                    />
                    <div>
                      <label class="cat-label" for="cat_${cat.id}">
                        <span>${cat.icon}</span> <span>${cat.label}</span>
                      </label>
                      <div class="cat-desc">${cat.desc}</div>
                    </div>
                  </div>

                  <div class="cat-weight-controls" style="${isChecked ? '' : 'opacity:0.35; pointer-events:none;'}">
                    <span class="weight-label">Poids :</span>
                    <input 
                      type="range" 
                      min="1" 
                      max="5" 
                      step="1" 
                      value="${weight}" 
                      class="weight-slider" 
                      data-cat="${cat.id}" 
                    />
                    <span class="weight-stars-display" id="stars_${cat.id}">${this._renderStars(weight)}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- 4. MOTS-CLÉS DE VEILLE -->
        <div class="form-section">
          <div class="section-title">🔍 Veille personnalisée par mots-clés</div>
          <div class="input-group">
            <label class="input-label">Mots-clés ciblés (optionnel)</label>
            <input 
              type="text" 
              class="text-input" 
              id="cfgKeywords" 
              value="${form.keywords}" 
              placeholder="Ex: domotique OR Home Assistant OR photovoltaïque" 
            />
            <div class="input-help">
              Recherche directe d'articles spécifiques. Les articles issus de cette veille reçoivent automatiquement une priorité maximale (5 étoiles).
            </div>
          </div>
        </div>

        <!-- 5. ACTIONS -->
        <div class="settings-actions">
          <button type="button" class="btn-cancel" id="cancelSettingsBtn">Annuler</button>
          <button type="button" class="btn-save" id="saveSettingsBtn" ${this._isSaving ? 'disabled' : ''}>
            <span class="${this._isSaving ? 'spin' : ''}">💾</span>
            <span>${this._isSaving ? 'Enregistrement...' : 'Enregistrer & Recharger'}</span>
          </button>
        </div>
      </div>
    `;
  }

  _renderArticlesView(displayed, data) {
    if (displayed.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">${data.last_error ? '⚠️' : (this._isRefreshing ? '🔄' : '📭')}</div>
          <div class="empty-title">${data.last_error ? 'Information NewsAPI' : (this._isRefreshing ? 'Chargement des actualités...' : 'Aucune actualité disponible')}</div>
          <p>${data.last_error ? data.last_error : (this._isRefreshing ? 'Interrogation des flux NewsAPI.org en cours...' : 'Cliquez sur « Actualiser » ci-dessus ou configurez vos centres d\'intérêt dans l\'onglet « Paramètres ».')}</p>
        </div>
      `;
    }

    return `
      <div class="articles-grid">
        ${displayed.map(a => {
          const meta = this._getCategoryMeta(a.category);
          const timeAgo = this._formatTimeAgo(a.publishedAt);
          return `
            <article class="card">
              <div class="card-img-wrap">
                ${a.image ? `
                  <img class="card-img" src="${a.image}" alt="${a.title}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'card-img-fallback\\'>${meta.icon}</div>';" />
                ` : `
                  <div class="card-img-fallback">${meta.icon}</div>
                `}
                <!-- HIGH CONTRAST SOLID BADGE -->
                <div class="card-category-badge" style="background:${meta.color};">
                  <span>${meta.icon}</span>
                  <span>${meta.label}</span>
                </div>
              </div>

              <div class="card-body">
                <div class="card-meta">
                  <div class="card-source-wrap">
                    <span class="source-api-badge">NewsAPI</span>
                    <span class="card-source">• ${a.source || 'Presse'}</span>
                  </div>
                  <span class="card-time">${timeAgo}</span>
                </div>

                <h2 class="card-title">${a.title}</h2>
                <p class="card-desc">${a.description || 'Consultez l\'article complet pour plus de détails.'}</p>

                <div class="card-footer">
                  <span class="card-stars" title="Priorité accordée : ${a.weight || 3}/5">${this._renderStars(a.weight || 3)}</span>
                  <a class="card-btn" href="${a.url}" target="_blank" rel="noopener noreferrer">
                    <span>Lire l'article</span>
                    <span>→</span>
                  </a>
                </div>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  _attachEventListeners() {
    // 1. Tab buttons
    this.shadowRoot.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-tab');
        if (tab) {
          this._activeTab = tab;
          this._render();
        }
      });
    });

    // 2. Refresh button
    const refreshBtn = this.shadowRoot.getElementById('refreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this._refreshNews();
      });
    }

    // 3. Search input (articles view)
    const searchInput = this.shadowRoot.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this._searchQuery = e.target.value;
        this._render();
        const updated = this.shadowRoot.getElementById('searchInput');
        if (updated) {
          updated.focus();
          updated.selectionStart = updated.selectionEnd = updated.value.length;
        }
      });
    }

    // 4. Settings view listeners
    if (this._activeTab === 'settings') {
      const toggleApiKeyBtn = this.shadowRoot.getElementById('toggleApiKeyBtn');
      if (toggleApiKeyBtn) {
        toggleApiKeyBtn.addEventListener('click', () => {
          this._showApiKey = !this._showApiKey;
          this._render();
        });
      }

      const cfgApiKey = this.shadowRoot.getElementById('cfgApiKey');
      if (cfgApiKey) {
        cfgApiKey.addEventListener('input', (e) => {
          if (this._configForm) this._configForm.api_key = e.target.value;
        });
      }

      const cfgCountry = this.shadowRoot.getElementById('cfgCountry');
      if (cfgCountry) {
        cfgCountry.addEventListener('change', (e) => {
          if (this._configForm) this._configForm.country = e.target.value;
        });
      }

      const cfgLanguage = this.shadowRoot.getElementById('cfgLanguage');
      if (cfgLanguage) {
        cfgLanguage.addEventListener('change', (e) => {
          if (this._configForm) this._configForm.language = e.target.value;
        });
      }

      const cfgKeywords = this.shadowRoot.getElementById('cfgKeywords');
      if (cfgKeywords) {
        cfgKeywords.addEventListener('input', (e) => {
          if (this._configForm) this._configForm.keywords = e.target.value;
        });
      }

      // Checkboxes
      this.shadowRoot.querySelectorAll('.cat-checkbox').forEach(chk => {
        chk.addEventListener('change', (e) => {
          const cat = e.target.getAttribute('data-cat');
          if (!this._configForm) return;
          if (e.target.checked) {
            if (!this._configForm.categories.includes(cat)) {
              this._configForm.categories.push(cat);
            }
          } else {
            this._configForm.categories = this._configForm.categories.filter(c => c !== cat);
          }
          this._render();
        });
      });

      // Weight sliders
      this.shadowRoot.querySelectorAll('.weight-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
          const cat = e.target.getAttribute('data-cat');
          const val = parseInt(e.target.value, 10);
          if (!this._configForm) return;
          this._configForm.category_weights[cat] = val;
          const starsSpan = this.shadowRoot.getElementById(`stars_${cat}`);
          if (starsSpan) {
            starsSpan.textContent = this._renderStars(val);
          }
        });
      });

      // Save button
      const saveBtn = this.shadowRoot.getElementById('saveSettingsBtn');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          this._saveConfig();
        });
      }

      // Cancel button
      const cancelBtn = this.shadowRoot.getElementById('cancelSettingsBtn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          this._activeTab = 'all';
          this._render();
        });
      }
    }
  }
}

if (!customElements.get('domolink-news-panel')) {
  customElements.define('domolink-news-panel', DomoLinkNewsPanel);
  console.info('[DomoLink-News] Custom Panel Web Component v1.0.4 registered');
}

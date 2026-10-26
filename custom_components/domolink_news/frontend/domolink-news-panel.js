/**
 * DomoLink-News Custom Panel for Home Assistant
 * Modern, responsive news feed with category tabs, weighted priority stars (1-5), and real-time search.
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
    } catch (e) {
      console.warn('[DomoLink-News] WS get_data error:', e);
    } finally {
      this._isFetching = false;
      this._render();
    }
  }

  async _refreshNews() {
    if (!this._hass || this._isRefreshing) return;
    this._isRefreshing = true;
    this._render();
    try {
      const res = await this._hass.callWS({ type: 'domolink_news/refresh' });
      this._data = res;
    } catch (e) {
      console.warn('[DomoLink-News] WS refresh error:', e);
    } finally {
      this._isRefreshing = false;
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

  _getCategoryMeta(category) {
    const metas = {
      general: { label: 'Général', color: '#0284c7', bg: 'rgba(2, 132, 199, 0.15)', icon: '🌍' },
      technology: { label: 'Tech & IA', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)', icon: '⚡' },
      business: { label: 'Économie', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', icon: '📈' },
      science: { label: 'Sciences', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', icon: '🔬' },
      health: { label: 'Santé', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', icon: '❤️' },
      sports: { label: 'Sports', color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', icon: '🏆' },
      entertainment: { label: 'Culture', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: '🎬' },
      custom: { label: 'Veille', color: '#14b8a6', bg: 'rgba(20, 184, 166, 0.15)', icon: '🔍' }
    };
    return metas[category] || { label: category, color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', icon: '📰' };
  }

  _render() {
    const data = this._data || {
      categories: [],
      category_weights: {},
      articles_by_category: {},
      all_articles: [],
      total_articles: 0
    };

    const categories = data.categories || [];
    const weights = data.category_weights || {};
    const allArticles = data.all_articles || [];
    const articlesByCat = data.articles_by_category || {};

    // Filter by selected Tab
    let displayed = this._activeTab === 'all'
      ? allArticles
      : (articlesByCat[this._activeTab] || []);

    // Filter by Search Query
    if (this._searchQuery.trim()) {
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
          background: var(--primary-background-color, #0a0f1d);
          color: var(--primary-text-color, #f1f5f9);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          box-sizing: border-box;
        }

        * {
          box-sizing: border-box;
        }

        .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 24px 28px 48px 28px;
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
          gap: 14px;
        }

        .logo-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: linear-gradient(135deg, #0ea5e9, #6366f1);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          box-shadow: 0 4px 14px rgba(14, 165, 233, 0.35);
        }

        .title {
          margin: 0;
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.02em;
          background: linear-gradient(135deg, #ffffff 40%, #93c5fd);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .subtitle {
          margin: 2px 0 0 0;
          font-size: 13px;
          color: var(--secondary-text-color, #94a3b8);
          display: flex;
          align-items: center;
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
        .tabs-wrapper {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 8px;
          margin-bottom: 24px;
          scrollbar-width: thin;
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
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(99, 102, 241, 0.2));
          border-color: #38bdf8;
          color: #fff;
          box-shadow: 0 4px 12px rgba(56, 189, 248, 0.15);
        }

        .tab-stars {
          font-size: 11px;
          color: #facc15;
          letter-spacing: -1px;
        }

        .tab-badge {
          padding: 2px 7px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.1);
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
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.4);
        }

        .card-img-wrap {
          height: 180px;
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
          background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.9));
        }

        .card-category-badge {
          position: absolute;
          top: 12px;
          left: 12px;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #fff;
          display: flex;
          align-items: center;
          gap: 5px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
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

        .card-source {
          font-weight: 700;
          color: #38bdf8;
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
                <span>${lastSyncStr}</span>
              </p>
            </div>
          </div>

          <div class="controls">
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
            <button class="refresh-btn" id="refreshBtn" ${this._isRefreshing ? 'disabled' : ''}>
              <span class="${this._isRefreshing ? 'spin' : ''}">🔄</span>
              <span>${this._isRefreshing ? 'Actualisation...' : 'Actualiser'}</span>
            </button>
          </div>
        </header>

        <!-- TABS (CENTRES D'INTÉRÊT & POIDS) -->
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

        <!-- ARTICLES GRID -->
        ${displayed.length === 0 ? `
          <div class="empty-state">
            <div class="empty-icon">${data.last_error ? '⚠️' : (this._isRefreshing ? '🔄' : '📭')}</div>
            <div class="empty-title">${data.last_error ? 'Information NewsAPI' : (this._isRefreshing ? 'Chargement des actualités...' : 'Aucune actualité disponible')}</div>
            <p>${data.last_error ? data.last_error : (this._isRefreshing ? 'Interrogation des flux NewsAPI en cours...' : 'Cliquez sur « Actualiser » ci-dessus pour forcer une première synchronisation.')}</p>
          </div>
        ` : `
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
                    <div class="card-category-badge" style="background:${meta.bg}; color:${meta.color};">
                      <span>${meta.icon}</span>
                      <span>${meta.label}</span>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="card-meta">
                      <span class="card-source">${a.source || 'Presse'}</span>
                      <span class="card-time">${timeAgo}</span>
                    </div>
                    <h2 class="card-title">${a.title}</h2>
                    <p class="card-desc">${a.description || 'Consultez l\'article complet pour plus de détails.'}</p>
                    <div class="card-footer">
                      <span class="card-stars" title="Poids d'intérêt : ${a.weight || 3}/5">${this._renderStars(a.weight || 3)}</span>
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
        `}
      </div>
    `;

    // Event listeners
    this.shadowRoot.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-tab');
        if (tab) {
          this._activeTab = tab;
          this._render();
        }
      });
    });

    const searchInput = this.shadowRoot.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this._searchQuery = e.target.value;
        this._render();
        // Restore focus and cursor position
        const updated = this.shadowRoot.getElementById('searchInput');
        if (updated) {
          updated.focus();
          updated.selectionStart = updated.selectionEnd = updated.value.length;
        }
      });
    }

    const refreshBtn = this.shadowRoot.getElementById('refreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this._refreshNews();
      });
    }
  }
}

if (!customElements.get('domolink-news-panel')) {
  customElements.define('domolink-news-panel', DomoLinkNewsPanel);
  console.info('[DomoLink-News] Custom Panel Web Component defined: <domolink-news-panel>');
}

(function () {
  'use strict';

  const Store = window.AndersenStorage;
  const Search = window.AndersenSearch;
  const catalog = window.stories;
  const app = document.getElementById('main-app');
  const reader = document.getElementById('content-area');
  const sidebar = document.getElementById('sidebar');
  const shelfButton = document.getElementById('menu-toggle');
  let view = document.getElementById('app-view');
  let searchLayer = null;
  let confirmLayer = null;
  let currentStory = null;
  let scrollTimer = null;
  let restoringScroll = false;
  let lastNonSearchHash = '#/';
  let searchOpenedFromApp = false;

  const icons = {
    bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4V3Z"/></svg>',
    book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4.5A3.5 3.5 0 0 1 7.5 4H12v16H7.5A3.5 3.5 0 0 0 4 20.5v-16ZM20 4.5A3.5 3.5 0 0 0 16.5 4H12v16h4.5a3.5 3.5 0 0 1 3.5.5v-16Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>'
  };

  const categoryNames = {
    ocean: '奇幻', lake: '成长', snow_night: '温情', castle: '寓言', forest: '自然',
    garden: '童趣', river: '冒险', autumn: '人生', ice_palace: '勇气', flower_field: '希望'
  };

  catalog.forEach(story => {
    story.cover = story.cover || story.id;
    story.category = story.category || categoryNames[story.background] || '童话';
    story.estimatedReadingTime = Math.max(2, Math.ceil(Search.plainText(story.content).length / 320));
  });

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function formatTime(timestamp) {
    if (!timestamp) return '刚刚';
    const date = new Date(timestamp);
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    return sameDay
      ? `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`
      : date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
  }

  function getStory(id) {
    return catalog.find(story => story.id === id) || null;
  }

  function getRoute() {
    const raw = location.hash.slice(1) || '/';
    const [path, query = ''] = raw.split('?');
    return { path: path.startsWith('/') ? path : `/${path}`, params: new URLSearchParams(query) };
  }

  function navigate(path, replace) {
    const hash = path.startsWith('#') ? path : `#${path.startsWith('/') ? path : `/${path}`}`;
    if (replace) {
      history.replaceState(null, '', hash);
      renderRoute();
    } else if (location.hash === hash) {
      renderRoute();
    } else {
      location.hash = hash;
    }
  }

  function setNavigation(section) {
    document.querySelectorAll('[data-nav]').forEach(link => {
      const active = link.dataset.nav === section;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
  }

  function closeMenus() {
    sidebar.classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('show');
    document.getElementById('mobile-nav').classList.remove('open');
    document.getElementById('nav-backdrop').classList.remove('show');
  }

  function showPage(html, section) {
    flushReadingProgress();
    sidebar.hidden = true;
    reader.hidden = true;
    shelfButton.hidden = true;
    view.hidden = false;
    view.innerHTML = html;
    view.scrollTop = 0;
    setNavigation(section);
  }

  function cover(story) {
    return `<span class="book-cover" role="img" aria-label="《${escapeHtml(story.title)}》绘本封面"></span>`;
  }

  function progressFor(storyId) {
    return Store.getHistoryItem(storyId)?.progress || 0;
  }

  function storyCard(story) {
    const progress = Math.round(progressFor(story.id));
    const favorite = Store.isFavorite(story.id);
    return `<article class="story-card" data-story-card="${story.id}">
      ${cover(story)}
      <div class="story-card-body">
        <div class="story-card-top"><h3>${escapeHtml(story.title)}</h3><button class="card-icon-btn${favorite ? ' active' : ''}" data-favorite="${story.id}" aria-label="${favorite ? '取消收藏' : '收藏'}《${escapeHtml(story.title)}》">${icons.bookmark}</button></div>
        <p>${escapeHtml(story.summary)}</p>
        <div class="story-card-actions"><span class="reading-state">${progress ? `已读 ${progress}%` : `约 ${story.estimatedReadingTime} 分钟`}</span><button class="btn" data-open-story="${story.id}">${progress ? '继续阅读' : '开始阅读'}</button></div>
      </div>
    </article>`;
  }

  function continueCard(record) {
    const story = getStory(record.storyId);
    if (!story) return '';
    return `<article class="continue-card">
      ${cover(story)}
      <div><h3>${escapeHtml(story.title)}</h3><p>${formatTime(record.updatedAt)} · 第 ${record.page} 页 · 已读 ${Math.round(record.progress)}%</p><div class="mini-progress" aria-label="阅读进度 ${Math.round(record.progress)}%"><span style="width:${record.progress}%"></span></div></div>
      <button class="btn sage" data-open-story="${story.id}">继续阅读</button>
    </article>`;
  }

  function renderHome() {
    const recent = Store.getHistory()[0];
    const primaryLabel = recent ? '继续上次阅读' : '开始阅读';
    const primaryId = recent?.storyId || catalog[0].id;
    const continueSection = recent
      ? `<section class="section-block"><div class="section-title"><div><h2>继续阅读</h2><p>故事还在上次停下的地方等你</p></div></div>${continueCard(recent)}</section>`
      : `<section class="section-block"><div class="empty-state"><div>${icons.book}</div><h2>挑一本故事，开始今天的阅读</h2><p>你的阅读进度会自动保存在这里。</p><button class="btn sage" data-open-story="${catalog[0].id}">去读第一个故事</button></div></section>`;
    showPage(`<div class="page-shell home-page">
      <section class="welcome-panel"><div><p class="eyebrow">WELCOME HOME</p><h1>安徒生童话屋</h1><p>在温暖的故事里认识勇气、善良与想象力。每次翻开，都会遇见一个新的朋友。</p><button class="btn primary" data-open-story="${primaryId}">${primaryLabel}</button></div></section>
      ${continueSection}
      <section class="section-block"><div class="section-title"><div><h2>推荐故事</h2><p>从书架上为你挑选的经典童话</p></div><button class="btn" data-route="/stories">查看书架</button></div><div class="story-grid">${catalog.slice(0, 6).map(storyCard).join('')}</div></section>
    </div>`, 'home');
  }

  function emptyState(title, text, buttonText) {
    return `<div class="empty-state"><svg class="empty-illustration" viewBox="0 0 90 70" fill="none" stroke="currentColor" stroke-width="2"><path d="M45 62c-10-10-23-14-38-11V12c15-3 28 1 38 11m0 39c10-10 23-14 38-11V12c-15-3-28 1-38 11m0 0v39"/></svg><div><h2>${title}</h2><p>${text}</p><button class="btn primary" data-route="/stories">${buttonText}</button></div></div>`;
  }

  function renderFavorites() {
    const favorites = Store.getFavorites();
    const content = favorites.length ? `<div class="list-grid">${favorites.map(item => {
      const story = getStory(item.storyId);
      const progress = Math.round(progressFor(story.id));
      return `<article class="list-card">${cover(story)}<div><h3>${escapeHtml(story.title)}</h3><p>${escapeHtml(story.summary)}</p><p>收藏于 ${formatTime(item.addedAt)} · ${progress ? `已读 ${progress}%` : '尚未开始'}</p></div><div class="list-actions"><button class="btn sage" data-open-story="${story.id}">${progress ? '继续阅读' : '开始阅读'}</button><button class="btn danger" data-favorite="${story.id}">${icons.trash}<span>取消收藏</span></button></div></article>`;
    }).join('')}</div>` : emptyState('还没有收藏故事', '遇到喜欢的故事，点一下书签就能在这里找到它。', '去故事书架看看');
    showPage(`<div class="page-shell"><header class="page-heading"><div><h1>我的收藏</h1><p>把想一读再读的故事留在这里</p></div></header>${content}</div>`, 'favorites');
  }

  function renderHistory() {
    const records = Store.getHistory();
    const content = records.length ? `<div class="list-grid">${records.map(record => {
      const story = getStory(record.storyId);
      return `<article class="list-card">${cover(story)}<div><h3>${escapeHtml(story.title)}</h3><p>最后阅读：${formatTime(record.updatedAt)} · 第 ${record.chapter} 章 / 第 ${record.page} 页</p><p>阅读进度 ${Math.round(record.progress)}%</p><div class="mini-progress" aria-label="阅读进度 ${Math.round(record.progress)}%"><span style="width:${record.progress}%"></span></div></div><div class="list-actions"><button class="btn sage" data-open-story="${story.id}">继续阅读</button><button class="btn danger" data-remove-history="${story.id}">${icons.trash}<span>删除记录</span></button></div></article>`;
    }).join('')}</div>` : emptyState('还没有阅读足迹', '打开一本故事书，阅读旅程就会从这里开始。', '开始阅读');
    showPage(`<div class="page-shell"><header class="page-heading"><div><h1>阅读足迹</h1><p>每一次停留，都是阅读旅程的一页</p></div>${records.length ? '<button class="btn danger" id="clear-history">清空全部</button>' : ''}</header>${content}</div>`, 'history');
  }

  function buildSidebar() {
    document.getElementById('story-list').innerHTML = catalog.slice(0, 10).map(story => {
      const record = Store.getHistoryItem(story.id);
      const active = currentStory?.id === story.id;
      return `<button class="story-item${active ? ' active' : ''}" data-open-story="${story.id}" aria-current="${active ? 'page' : 'false'}"><span class="story-cover" aria-hidden="true"></span><span class="story-meta"><span class="name">${escapeHtml(story.title)}</span><span class="story-status">${active ? `阅读中 · ${Math.round(record?.progress || 0)}%` : record ? `已读 ${Math.round(record.progress)}%` : '未开始'}</span></span></button>`;
    }).join('');
  }

  function setReaderProgress(percent) {
    const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    document.getElementById('progress-bar').style.width = `${value}%`;
    document.getElementById('progress-percent').textContent = `${value}%`;
    document.getElementById('progress-text').textContent = `阅读进度 ${value}%`;
    document.getElementById('time-left').textContent = `预计剩余 ${Math.max(1, Math.ceil(currentStory.estimatedReadingTime * (100 - value) / 100))} 分钟`;
  }

  function updateFavoriteButton() {
    if (!currentStory) return;
    const button = document.getElementById('btn-favorite');
    const favorite = Store.isFavorite(currentStory.id);
    button.classList.toggle('active', favorite);
    button.setAttribute('aria-pressed', String(favorite));
    button.querySelector('span').textContent = favorite ? '已收藏' : '收藏';
  }

  function currentReadingRecord() {
    if (!currentStory) return null;
    const body = document.getElementById('card-body');
    const max = Math.max(0, body.scrollHeight - body.clientHeight);
    const progress = max ? body.scrollTop / max * 100 : 100;
    return { progress, scrollTop: body.scrollTop, chapter: 1, page: Math.max(1, Math.ceil((body.scrollTop + 1) / Math.max(1, body.clientHeight * .82))) };
  }

  function flushReadingProgress() {
    clearTimeout(scrollTimer);
    if (currentStory && !reader.hidden) Store.updateHistory(currentStory.id, currentReadingRecord());
  }

  function showReader(story) {
    currentStory = story;
    view.hidden = true;
    sidebar.hidden = false;
    reader.hidden = false;
    shelfButton.hidden = false;
    setNavigation('stories');
    document.getElementById('story-title').textContent = story.title;
    const body = document.getElementById('card-body');
    body.innerHTML = story.content;
    Store.setPreferences({ currentStoryId: story.id });
    const record = Store.updateHistory(story.id, Store.getHistoryItem(story.id) || { progress: 0, scrollTop: 0, chapter: 1, page: 1 });
    setReaderProgress(record.progress);
    updateFavoriteButton();
    buildSidebar();
    restoringScroll = true;
    requestAnimationFrame(() => {
      body.scrollTop = Math.min(record.scrollTop, Math.max(0, body.scrollHeight - body.clientHeight));
      restoringScroll = false;
    });
  }

  function renderError() {
    showPage('<div class="page-shell"><div class="error-page"><h1>这本故事暂时不在书架上</h1><p>故事可能已经移动，回到书架再挑一本吧。</p><button class="btn primary" data-route="/stories">返回故事书架</button></div></div>', 'stories');
  }

  function openSearch(query) {
    if (!searchLayer) searchLayer = document.getElementById('search-overlay');
    searchLayer.hidden = false;
    document.getElementById('search-input').value = query;
    renderSearchResults(query);
    document.getElementById('search-input').focus();
  }

  function closeSearch() {
    document.getElementById('search-overlay').hidden = true;
    if (searchOpenedFromApp) {
      searchOpenedFromApp = false;
      location.hash = lastNonSearchHash.slice(1) || '/';
    } else {
      navigate(lastNonSearchHash.slice(1) || '/');
    }
  }

  function highlight(text, query) {
    const safe = escapeHtml(text);
    const escaped = String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped ? safe.replace(new RegExp(`(${escaped})`, 'ig'), '<mark>$1</mark>') : safe;
  }

  function renderSearchResults(query) {
    const container = document.getElementById('search-results');
    const keyword = String(query || '').trim();
    if (!keyword) {
      container.innerHTML = '<div class="search-note"><strong>找一本想读的故事</strong>可以搜索标题、简介、正文或分类。</div>';
      return;
    }
    const results = Search.searchStories(catalog, keyword);
    if (!results.length) {
      container.innerHTML = '<div class="search-note"><strong>没有找到相关故事</strong>换一个关键词试试看吧。</div>';
      return;
    }
    container.innerHTML = results.map(result => {
      const favorite = Store.isFavorite(result.story.id);
      const progress = Math.round(progressFor(result.story.id));
      return `<button class="search-result" data-open-story="${result.story.id}">${cover(result.story)}<span><h3>${highlight(result.story.title, keyword)}</h3><p>${highlight(result.excerpt, keyword)}</p><p>${progress ? `已读 ${progress}%` : '尚未开始'} · ${favorite ? '已收藏' : '未收藏'}</p></span><span class="match-label">${result.matchType}匹配</span></button>`;
    }).join('');
  }

  function renderRoute() {
    closeMenus();
    const route = getRoute();
    if (route.path !== '/search') {
      lastNonSearchHash = location.hash || '#/';
      searchOpenedFromApp = false;
      if (searchLayer) searchLayer.hidden = true;
    }
    if (route.path === '/' || route.path === '/home') return renderHome();
    if (route.path === '/favorites') return renderFavorites();
    if (route.path === '/history') return renderHistory();
    if (route.path === '/search') {
      if (!currentStory && view.hidden) renderHome();
      setNavigation('');
      return openSearch(route.params.get('q') || '');
    }
    if (route.path === '/stories') {
      const preferred = Store.getPreferences().currentStoryId;
      return showReader(getStory(preferred) || catalog[0]);
    }
    if (route.path.startsWith('/story/')) {
      const story = getStory(decodeURIComponent(route.path.slice(7)));
      return story ? showReader(story) : renderError();
    }
    renderError();
  }

  function openConfirm() {
    confirmLayer.hidden = false;
    document.getElementById('confirm-cancel').focus();
  }

  function closeConfirm() {
    confirmLayer.hidden = true;
  }

  function setupEvents() {
    document.addEventListener('click', event => {
      const route = event.target.closest('[data-route]');
      const open = event.target.closest('[data-open-story]');
      const favorite = event.target.closest('[data-favorite]');
      const remove = event.target.closest('[data-remove-history]');
      if (route) navigate(route.dataset.route);
      if (open) navigate(`/story/${encodeURIComponent(open.dataset.openStory)}`);
      if (favorite) {
        const active = Store.toggleFavorite(favorite.dataset.favorite);
        favorite.classList.toggle('active', active);
        favorite.setAttribute('aria-label', `${active ? '取消收藏' : '收藏'}《${getStory(favorite.dataset.favorite).title}》`);
        if (getRoute().path === '/favorites') renderFavorites(); else if (getRoute().path === '/') renderHome();
        updateFavoriteButton();
      }
      if (remove) { Store.removeHistory(remove.dataset.removeHistory); renderHistory(); }
      if (event.target.closest('#clear-history')) openConfirm();
    });

    document.getElementById('btn-search').addEventListener('click', () => {
      lastNonSearchHash = location.hash || '#/';
      searchOpenedFromApp = true;
      history.pushState(null, '', '#/search');
      openSearch('');
    });
    document.getElementById('nav-toggle').addEventListener('click', () => {
      document.getElementById('mobile-nav').classList.toggle('open');
      document.getElementById('nav-backdrop').classList.toggle('show');
    });
    document.getElementById('nav-backdrop').addEventListener('click', closeMenus);
    shelfButton.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      document.getElementById('sidebar-overlay').classList.toggle('show');
    });
    document.getElementById('sidebar-overlay').addEventListener('click', closeMenus);

    const body = document.getElementById('card-body');
    body.addEventListener('scroll', () => {
      if (!currentStory || restoringScroll) return;
      const record = currentReadingRecord();
      setReaderProgress(record.progress);
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => { Store.updateHistory(currentStory.id, record); buildSidebar(); }, 280);
    }, { passive: true });

    document.getElementById('btn-prev').addEventListener('click', () => body.scrollBy({ top: -body.clientHeight * .82, behavior: 'smooth' }));
    document.getElementById('btn-next').addEventListener('click', () => body.scrollBy({ top: body.clientHeight * .82, behavior: 'smooth' }));
    document.getElementById('btn-favorite').addEventListener('click', event => {
      if (!currentStory) return;
      Store.toggleFavorite(currentStory.id);
      updateFavoriteButton();
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) event.currentTarget.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { duration: 260 });
    });
    document.getElementById('btn-font').addEventListener('click', () => {
      const preferences = Store.getPreferences();
      const sizes = ['small', 'medium', 'large'];
      Store.setPreferences({ fontSize: sizes[(sizes.indexOf(preferences.fontSize) + 1) % sizes.length] });
      applyPreferences();
    });
    document.getElementById('btn-night').addEventListener('click', () => {
      const preferences = Store.getPreferences();
      Store.setPreferences({ darkMode: !preferences.darkMode });
      applyPreferences();
    });
    document.getElementById('btn-music').addEventListener('click', toggleReading);

    const searchInput = document.getElementById('search-input');
    let searchTimer;
    searchInput.addEventListener('input', event => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const query = event.target.value.trim();
        history.replaceState(null, '', `#/search${query ? `?q=${encodeURIComponent(query)}` : ''}`);
        renderSearchResults(query);
      }, 240);
    });
    document.getElementById('search-form').addEventListener('submit', event => {
      event.preventDefault();
      const query = searchInput.value.trim();
      navigate(`/search${query ? `?q=${encodeURIComponent(query)}` : ''}`, true);
    });
    document.getElementById('search-close').addEventListener('click', closeSearch);
    document.getElementById('search-overlay').addEventListener('click', event => { if (event.target.id === 'search-overlay') closeSearch(); });

    document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);
    document.getElementById('confirm-clear').addEventListener('click', () => { Store.clearHistory(); closeConfirm(); renderHistory(); });
    window.addEventListener('hashchange', renderRoute);
    window.addEventListener('beforeunload', flushReadingProgress);
    window.addEventListener('andersen:storage', () => { if (currentStory) updateFavoriteButton(); });
    window.addEventListener('storage', renderRoute);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !document.getElementById('search-overlay').hidden) closeSearch();
    });
  }

  function applyPreferences() {
    const preferences = Store.getPreferences();
    document.body.classList.toggle('night', preferences.darkMode);
    const sizes = { small: '18px', medium: '21px', large: '23px' };
    document.documentElement.style.setProperty('--reader-size', sizes[preferences.fontSize]);
    document.getElementById('btn-night').classList.toggle('active', preferences.darkMode);
    document.getElementById('btn-font').title = `正文字号：${{ small: '小', medium: '中', large: '大' }[preferences.fontSize]}`;
  }

  function toggleReading() {
    const button = document.getElementById('btn-music');
    const playing = button.classList.toggle('reading');
    button.querySelector('span').textContent = playing ? '暂停' : '朗读';
    if (!('speechSynthesis' in window)) {
      button.classList.remove('reading');
      button.querySelector('span').textContent = '朗读';
      return;
    }
    window.speechSynthesis.cancel();
    if (playing && currentStory) {
      const utterance = new SpeechSynthesisUtterance(document.getElementById('card-body').innerText);
      utterance.lang = 'zh-CN';
      utterance.rate = .85;
      utterance.onend = () => { button.classList.remove('reading'); button.querySelector('span').textContent = '朗读'; };
      window.speechSynthesis.speak(utterance);
    }
  }

  function init() {
    if (!view) {
      view = document.createElement('main');
      view.id = 'app-view';
      view.className = 'app-view';
      view.hidden = true;
      app.appendChild(view);
    }
    searchLayer = document.getElementById('search-overlay');
    confirmLayer = document.getElementById('confirm-overlay');
    applyPreferences();
    setupEvents();
    renderRoute();
    document.body.classList.add('loaded');
  }

  window.AndersenApp = { navigate, renderRoute, renderSearchResults, flushReadingProgress };
  document.addEventListener('DOMContentLoaded', init);
})();

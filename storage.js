(function () {
  'use strict';

  const KEYS = {
    favorites: 'andersen:favorites:v1',
    history: 'andersen:history:v1',
    preferences: 'andersen:preferences:v1'
  };

  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('andersen:storage', { detail: { key } }));
    return value;
  }

  function validIds() {
    return new Set((window.stories || []).map(story => story.id));
  }

  function clamp(value, min, max) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
  }

  function getFavorites() {
    const ids = validIds();
    const raw = read(KEYS.favorites, []);
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    return raw
      .filter(item => item && typeof item.storyId === 'string' && ids.has(item.storyId))
      .map(item => ({ storyId: item.storyId, addedAt: Number(item.addedAt) || Date.now() }))
      .filter(item => !seen.has(item.storyId) && seen.add(item.storyId))
      .sort((a, b) => b.addedAt - a.addedAt);
  }

  function isFavorite(storyId) {
    return getFavorites().some(item => item.storyId === storyId);
  }

  function setFavorite(storyId, favorite) {
    const items = getFavorites().filter(item => item.storyId !== storyId);
    if (favorite && validIds().has(storyId)) items.unshift({ storyId, addedAt: Date.now() });
    write(KEYS.favorites, items);
    return favorite;
  }

  function toggleFavorite(storyId) {
    return setFavorite(storyId, !isFavorite(storyId));
  }

  function normalizeHistory(item) {
    if (!item || !validIds().has(item.storyId)) return null;
    return {
      storyId: item.storyId,
      chapter: Math.max(1, Math.round(Number(item.chapter) || 1)),
      page: Math.max(1, Math.round(Number(item.page) || 1)),
      progress: clamp(item.progress, 0, 100),
      scrollTop: Math.max(0, Number(item.scrollTop) || 0),
      updatedAt: Number(item.updatedAt) || Date.now()
    };
  }

  function getHistory() {
    const raw = read(KEYS.history, []);
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    return raw
      .map(normalizeHistory)
      .filter(Boolean)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter(item => !seen.has(item.storyId) && seen.add(item.storyId));
  }

  function getHistoryItem(storyId) {
    return getHistory().find(item => item.storyId === storyId) || null;
  }

  function updateHistory(storyId, patch) {
    if (!validIds().has(storyId)) return null;
    const items = getHistory();
    const current = items.find(item => item.storyId === storyId) || { storyId, chapter: 1, page: 1, progress: 0, scrollTop: 0 };
    const next = normalizeHistory({ ...current, ...patch, storyId, updatedAt: Date.now() });
    write(KEYS.history, [next, ...items.filter(item => item.storyId !== storyId)]);
    return next;
  }

  function removeHistory(storyId) {
    write(KEYS.history, getHistory().filter(item => item.storyId !== storyId));
  }

  function clearHistory() {
    write(KEYS.history, []);
  }

  function getPreferences() {
    const raw = read(KEYS.preferences, {});
    return {
      currentStoryId: validIds().has(raw.currentStoryId) ? raw.currentStoryId : 'little-mermaid',
      darkMode: Boolean(raw.darkMode),
      fontSize: ['small', 'medium', 'large'].includes(raw.fontSize) ? raw.fontSize : 'medium'
    };
  }

  function setPreferences(patch) {
    return write(KEYS.preferences, { ...getPreferences(), ...patch });
  }

  window.AndersenStorage = {
    KEYS,
    getFavorites,
    isFavorite,
    setFavorite,
    toggleFavorite,
    getHistory,
    getHistoryItem,
    updateHistory,
    removeHistory,
    clearHistory,
    getPreferences,
    setPreferences,
    _test: { read, clamp, normalizeHistory }
  };
})();

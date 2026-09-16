(function () {
  'use strict';
  const results = document.getElementById('results');
  const backups = {};
  Object.values(AndersenStorage.KEYS).forEach(key => { backups[key] = localStorage.getItem(key); localStorage.removeItem(key); });
  let passed = 0;
  let failed = 0;

  function test(name, run) {
    const item = document.createElement('li');
    try {
      run();
      item.className = 'pass'; item.textContent = `通过：${name}`; passed += 1;
    } catch (error) {
      item.className = 'fail'; item.textContent = `失败：${name} (${error.message})`; failed += 1;
    }
    results.appendChild(item);
  }

  function equal(actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }

  test('损坏的收藏 JSON 返回空列表', () => { localStorage.setItem(AndersenStorage.KEYS.favorites, '{bad'); equal(AndersenStorage.getFavorites(), []); });
  test('收藏去重并忽略已删除故事', () => { localStorage.setItem(AndersenStorage.KEYS.favorites, JSON.stringify([{ storyId: 'sea', addedAt: 1 }, { storyId: 'sea', addedAt: 2 }, { storyId: 'missing', addedAt: 3 }])); equal(AndersenStorage.getFavorites().map(item => item.storyId), ['sea']); });
  test('收藏可以添加和取消', () => { AndersenStorage.setFavorite('duck', true); equal(AndersenStorage.isFavorite('duck'), true); AndersenStorage.setFavorite('duck', false); equal(AndersenStorage.isFavorite('duck'), false); });
  test('阅读进度限制在 0 到 100', () => { AndersenStorage.updateHistory('sea', { progress: 140, scrollTop: -9 }); const item = AndersenStorage.getHistoryItem('sea'); equal([item.progress, item.scrollTop], [100, 0]); });
  test('单条足迹删除不影响收藏', () => { AndersenStorage.setFavorite('sea', true); AndersenStorage.removeHistory('sea'); equal([AndersenStorage.getHistoryItem('sea'), AndersenStorage.isFavorite('sea')], [null, true]); });
  test('空关键词不返回结果', () => equal(AndersenSearch.searchStories(window.stories, '  '), []));
  test('标题匹配优先于正文匹配', () => equal(AndersenSearch.searchStories(window.stories, '海').map(item => item.story.id), ['sea']));
  test('简介和正文均可搜索', () => equal(AndersenSearch.searchStories(window.stories, '勇气').map(item => item.story.id), ['duck']));

  Object.values(AndersenStorage.KEYS).forEach(key => { if (backups[key] == null) localStorage.removeItem(key); else localStorage.setItem(key, backups[key]); });
  document.getElementById('summary').textContent = `${passed} 项通过，${failed} 项失败`;
  document.body.dataset.failed = String(failed);
})();

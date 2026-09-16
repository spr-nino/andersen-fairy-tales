(function () {
  'use strict';

  function plainText(html) {
    const template = document.createElement('template');
    template.innerHTML = html || '';
    return (template.content.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function excerpt(text, query, length) {
    const source = text || '';
    const index = source.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
    const start = Math.max(0, index < 0 ? 0 : index - 34);
    const result = source.slice(start, start + (length || 110));
    return `${start > 0 ? '…' : ''}${result}${start + result.length < source.length ? '…' : ''}`;
  }

  function searchStories(stories, keyword) {
    const query = String(keyword || '').trim().toLocaleLowerCase();
    if (!query) return [];
    return stories.map(story => {
      const title = story.title || '';
      const summary = story.summary || '';
      const category = story.category || '';
      const content = plainText(story.content);
      const fields = [title, summary, category, content].map(value => value.toLocaleLowerCase());
      const rank = fields[0].includes(query) ? 0 : fields[1].includes(query) ? 1 : fields[2].includes(query) ? 2 : fields[3].includes(query) ? 3 : -1;
      if (rank < 0) return null;
      const labels = ['标题', '简介', '分类', '正文'];
      const source = rank === 0 ? summary || title : [title, summary, category, content][rank];
      return { story, rank, matchType: labels[rank], excerpt: excerpt(source, query, 118) };
    }).filter(Boolean).sort((a, b) => a.rank - b.rank || a.story.title.localeCompare(b.story.title, 'zh-CN'));
  }

  window.AndersenSearch = { plainText, excerpt, searchStories };
})();

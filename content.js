(() => {
  function flattenJsonLd(value, out = []) {
    if (!value) return out;
    if (Array.isArray(value)) value.forEach(v => flattenJsonLd(v, out));
    else if (typeof value === 'object') {
      out.push(value);
      if (value['@graph']) flattenJsonLd(value['@graph'], out);
    }
    return out;
  }

  function typeFromJsonLd(items) {
    for (const x of items) {
      const t = x?.['@type'];
      const types = Array.isArray(t) ? t : [t];
      if (types.includes('Movie')) return 'movie';
      if (types.includes('TVSeries') || types.includes('TVEpisode') || types.includes('TVMiniSeries')) return 'tv';
    }
    return null;
  }

  function typeFromMeta() {
    const values = [
      document.querySelector('meta[property="og:type"]')?.content,
      document.querySelector('meta[name="twitter:card"]')?.content,
      document.querySelector('meta[property="og:title"]')?.content,
      document.title,
      document.querySelector('h1')?.textContent
    ].filter(Boolean).join(' ');
    if (/tv\s*(series|mini-series)|tv\s*show|television\s*series|season\s*\d+/i.test(values)) return 'tv';
    return null;
  }

  function getTitleData() {
    const match = location.pathname.match(/\/title\/(tt\d+)/i);
    if (!match) return null;
    const imdbId = match[1];
    const jsonItems = [];
    for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { flattenJsonLd(JSON.parse(el.textContent), jsonItems); } catch {}
    }
    const ld = jsonItems.find(x => x?.name) || {};
    const type = typeFromJsonLd(jsonItems) || typeFromMeta() || null;
    const title = ld.name || document.querySelector('h1')?.textContent?.trim() || document.title.replace(/\s*-\s*IMDb.*$/i, '').trim();
    const year = String(ld.datePublished || ld.dateCreated || '').slice(0, 4);
    const rating = ld.aggregateRating?.ratingValue || '';
    return { imdbId, title, year, rating, type, url: location.href };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'getImdbTitle') sendResponse(getTitleData());
  });
})();

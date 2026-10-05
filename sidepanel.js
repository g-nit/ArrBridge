let current = null, activeTabId = null, cfg = {}, detectedType = null;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function loadConfig() { cfg = await chrome.storage.local.get(['radarr','sonarr','tmdb']); }

async function getActiveImdb() {
  const tabs = await chrome.tabs.query({active:true,currentWindow:true});
  const tab = tabs[0]; if (!tab) return null;
  activeTabId = tab.id;
  if (!/https?:\/\/(www\.)?imdb\.com\/title\/tt\d+/i.test(tab.url || '')) return null;

  try {
    const data = await chrome.tabs.sendMessage(tab.id, {type:'getImdbTitle'});
    if (data?.imdbId) return data;
  } catch {}

  try {
    const results = await chrome.scripting.executeScript({target:{tabId:tab.id}, func:() => {
      const id = location.pathname.match(/\/title\/(tt\d+)/i)?.[1] || null;
      if (!id) return null;
      const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
      let types = [];
      for (const el of scripts) {
        try {
          const raw = JSON.parse(el.textContent);
          const walk = x => {
            if (!x) return;
            if (Array.isArray(x)) return x.forEach(walk);
            if (typeof x === 'object') {
              const t = x['@type'];
              if (Array.isArray(t)) types.push(...t); else if (t) types.push(t);
              if (x['@graph']) walk(x['@graph']);
            }
          };
          walk(raw);
        } catch {}
      }
      let type = types.includes('Movie') ? 'movie' : (types.some(x => ['TVSeries','TVMiniSeries','TVEpisode'].includes(x)) ? 'tv' : null);
      const text = [document.title, document.querySelector('h1')?.textContent || '', document.querySelector('meta[property="og:title"]')?.content || ''].join(' ');
      if (!type && /tv\s*(series|mini-series)|tv\s*show|television\s*series|season\s*\d+/i.test(text)) type = 'tv';
      return {imdbId:id,title:document.querySelector('h1')?.textContent?.trim() || document.title.replace(/\s*-\s*IMDb.*$/i,'').trim() || id,year:'',rating:'',type,url:location.href};
    }});
    return results?.[0]?.result || null;
  } catch { return null; }
}

async function refresh() {
  await loadConfig();
  const data = await getActiveImdb();
  if (!data) { current = null; detectedType = null; render(); return; }
  detectedType = data.type || null;
  const saved = await chrome.storage.local.get('lastManualType');
  current = {...data, type: detectedType || saved.lastManualType || 'movie'};
  render();
  await checkLibrary();
  await loadMediaPoster();
}

async function loadMediaPoster() {
  const wrapper = $('#posterWrapper');
  const imgNode = $('#poster');
  
  if (!current || !current.imdbId) {
    wrapper.classList.add('hidden');
    imgNode.src = '';
    return;
  }

  try {
    const tmdbKey = cfg.tmdb?.apiKey?.trim();
    if (!tmdbKey) {
      wrapper.classList.add('hidden');
      return;
    }

    const searchResult = await TMDB.findByImdb(current.imdbId, tmdbKey);
    let targetData = null;

    // Grab the first object from the response array wrappers safely
    if (current.type === 'movie' && searchResult.movie_results?.length > 0) {
      targetData = searchResult.movie_results[0];
    } else if (current.type === 'tv' && searchResult.tv_results?.length > 0) {
      targetData = searchResult.tv_results[0];
    }

    if (targetData && targetData.poster_path) {
      // 1. Core image base configuration URL
      const baseUrl = "https://image.tmdb.org/t/p/";
      
      // 2. Size value selector
      const size = "w500"; 
      let filePath = String(targetData.poster_path).trim();

      // Ensure the file path starts with a leading slash '/' exactly like your logic
      if (filePath && !filePath.startsWith('/')) {
        filePath = '/' + filePath;
      }

      // 3. String concatenation to form the final source URL
      const finalImageUrl = `${baseUrl}${size}${filePath}`;

      // 4. Bind the generated string to the element src property
      imgNode.src = finalImageUrl;
      wrapper.classList.remove('hidden');
    } else {
      wrapper.classList.add('hidden');
    }
  } catch (err) {
    console.error('Poster loader failed:', err);
    wrapper.classList.add('hidden');
  }
}

function render() {
  if (!current) {
    $('#empty').classList.remove('hidden'); 
    $('#titleCard').classList.add('hidden'); 
    $('#details').classList.add('hidden');
    $('#posterWrapper').classList.add('hidden'); 
    $('#poster').src = '';
    return;
  }
  $('#empty').classList.add('hidden'); 
  $('#titleCard').classList.remove('hidden'); 
  $('#details').classList.remove('hidden');
  $('#title').textContent = current.title || current.imdbId;
  $('#kind').textContent = detectedType ? `Detected: ${current.type === 'movie' ? 'Movie' : 'TV Series'}` : 'Choose type';
  $('#meta').textContent = [current.year,current.rating ? `IMDb ★ ${current.rating}` : '',current.imdbId].filter(Boolean).join(' · ');
  $('#detailsText').innerHTML = `<div>IMDb ID: <b>${esc(current.imdbId)}</b></div><div><a id="imdbLink" href="${esc(current.url || `https://imdb.com{current.imdbId}/`)}">Open on IMDb</a></div>`;
  $('#imdbLink').onclick = e => { e.preventDefault(); chrome.tabs.create({url:current.url || `https://imdb.com{current.imdbId}/`}); };

  document.querySelectorAll('.typeBtn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.type === current.type);
    btn.onclick = () => setType(btn.dataset.type);
  });
  $('#targetLabel').textContent = current.type === 'movie' ? 'Send to Radarr' : 'Send to Sonarr';
  $('#add').disabled = false; 
  $('#add').textContent = `＋ Add to ${current.type === 'movie' ? 'Radarr' : 'Sonarr'}`; 
  $('#add').onclick = () => addCurrent(current);
  $('#open').textContent = `Open ${current.type === 'movie' ? 'Radarr' : 'Sonarr'}`; 
  $('#open').onclick = () => openManager();
  updateDiscoverState();
}

async function setType(type) {
  if (!current || !['movie','tv'].includes(type)) return;
  current.type = type;
  await chrome.storage.local.set({lastManualType:type});
  render();
  await checkLibrary();
  await loadMediaPoster();
}

async function checkLibrary() {
  if (!current) return;
  const type = current.type === 'movie' ? 'movie' : 'series';
  const service = current.type === 'movie' ? cfg.radarr : cfg.sonarr;
  if (!service?.url || !service?.apiKey) { setStatus(`⚙ Configure ${current.type === 'movie' ? 'Radarr' : 'Sonarr'} in Settings.`, false); return; }
  try {
    const arr = await API.librarySearch(service,type,current.imdbId);
    const found = Array.isArray(arr) && arr.find(x => String(x.imdbId || '').toLowerCase() === current.imdbId.toLowerCase());
    if (found) {
      setStatus(`✓ Already in ${current.type === 'movie' ? 'Radarr' : 'Sonarr'}${found.title ? ' — ' + found.title : ''}`, true);
      $('#add').disabled = true; 
      $('#add').textContent = 'Already Added';
    } else setStatus(`✕ Not in ${current.type === 'movie' ? 'Radarr' : 'Sonarr'}`, false);
  } catch (e) { setStatus(`Connection failed: ${e.message}. Check Settings.`, false); }
}

function setStatus(t,good) { 
  $('#status').textContent = t; 
  $('#status').className = 'status ' + (good ? 'good' : 'bad'); 
}

async function addTitle(title) {
  const type = title.type === 'movie' ? 'movie' : 'series';
  const service = title.type === 'movie' ? cfg.radarr : cfg.sonarr;
  if (!service?.url || !service?.apiKey) { await chrome.runtime.openOptionsPage(); throw Error(`Configure ${title.type === 'movie' ? 'Radarr' : 'Sonarr'} in Settings first`); }
  if (!service.qualityProfileId || !service.rootFolderPath) throw Error(`Choose a Quality Profile and Root Folder for ${title.type === 'movie' ? 'Radarr' : 'Sonarr'} in Settings`);
  const results = await API.lookup(service,type,title.imdbId);
  const found = (results || []).find(x => String(x.imdbId || '').toLowerCase() === title.imdbId.toLowerCase()) || results?.[0];
  if (!found) throw Error('IMDb title was not found by '+(type === 'movie' ? 'Radarr' : 'Sonarr'));
  const payload = {...found,qualityProfileId:Number(service.qualityProfileId),rootFolderPath:service.rootFolderPath,monitored:true};
  if (service.tagId) payload.tags = [Number(service.tagId)];
  if (type === 'movie') payload.addOptions = {...(found.addOptions||{}),searchForMovie:true};
  else { payload.seasons=(found.seasons||[]).map(s=>({...s,monitored:true})); payload.addOptions={...(found.addOptions||{}),searchForMissingEpisodes:true}; }
  await API.add(service,type,payload);
}

async function addCurrent(title) {
  $('#add').disabled = true; 
  $('#add').textContent = 'Adding…';
  try { 
    await addTitle(title); 
    setStatus(`✓ Added to ${title.type === 'movie' ? 'Radarr' : 'Sonarr'} and search requested.`,true); 
    $('#add').textContent='Added ✓'; 
  } catch(e) { 
    $('#add').disabled=false; 
    $('#add').textContent=`＋ Try Again`; 
    setStatus('Add failed: '+e.message,false); 
  }
}

function openManager() { const s=current?.type==='movie'?cfg.radarr:cfg.sonarr; if(s?.url) chrome.tabs.create({url:s.url}); else chrome.runtime.openOptionsPage(); }

function updateDiscoverState() {
  const key=cfg.tmdb?.apiKey?.trim(), button=$('#discover'); button.disabled=!current||!key;
  if(!current) $('#discoverHint').textContent='Open an IMDb movie or TV series to get recommendations.';
  else if(!key) $('#discoverHint').textContent='Add an optional TMDB API key in Settings to enable recommendations.';
  else $('#discoverHint').textContent=`TMDB will find similar ${current.type==='movie'?'movies':'TV shows'} and filter your ${current.type==='movie'?'Radarr':'Sonarr'} library.`;
}

async function findRecommendations() {
  await loadConfig();
  const resultsDiv = $('#results');
  if(!current){ resultsDiv.innerHTML='<div class="muted">Open an IMDb title first.</div>'; return; }


  const tmdbKey = cfg.tmdb?.apiKey?.trim();
  if (!tmdbKey) {
    updateDiscoverState();
    resultsDiv.innerHTML = '<div class="muted">Add a TMDB API key in Settings.</div>';
    return;
  }

  resultsDiv.innerHTML = '<div class="muted">Searching recommendations...</div>';

  try {
    const tmdbLookup = await TMDB.findByImdb(current.imdbId, tmdbKey);
    let tmdbId = null;

    if (current.type === 'movie' && tmdbLookup.movie_results?.length > 0) {
      tmdbId = tmdbLookup.movie_results[0].id;
    } else if (current.type === 'tv' && tmdbLookup.tv_results?.length > 0) {
      tmdbId = tmdbLookup.tv_results[0].id;
    }

    if (!tmdbId) {
      resultsDiv.innerHTML = 'Could not map title on TMDb.';
      return;
    }

    const data = await TMDB.similar(current.type, tmdbId, tmdbKey);
    const items = data.results || [];
    if (items.length === 0) {
      resultsDiv.innerHTML = 'No dynamic recommendations found.';
      return;
    }

    resultsDiv.innerHTML = `
      <div class="rec-grid" style="display:grid; grid-template-columns: repeat(2, 1fr); gap:10px; margin-top:10px;">
        ${items.slice(0, 6).map(item => {
          const title = item.title || item.name;
          let pPath = item.poster_path ? item.poster_path.trim() : '';
          if (pPath && !pPath.startsWith('/')) pPath = '/' + pPath;
          const poster = pPath ? `https://image.tmdb.org/t/p/w200${pPath}` : 'icons/icon-128.png';

          return `
            <div class="rec-item" style="display:flex; flex-direction:column; align-items:center; gap:6px;">
              <img src="${esc(poster)}" alt="${esc(title)}" style="width:100%; max-width:120px; border-radius:6px;">
              <div>${esc(title)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch (e) {
    console.error(e);
    resultsDiv.innerHTML = `<div class="muted" style="color:red;">Failed: ${esc(e.message)}</div>`;
  }
}

$('#settings').onclick = () => { chrome.runtime.sendMessage({ type: 'openOptions' }); };
$('#discover').onclick = findRecommendations;
chrome.tabs.onActivated.addListener(() => refresh());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => { if (changeInfo.url || changeInfo.status === 'complete') refresh(); });
refresh();
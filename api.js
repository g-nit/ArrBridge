const API = {
  base(s) { return String(s.url || "").replace(/\/+$/, "") + "/api/v3"; },
  headers(s) { return {"X-Api-Key": s.apiKey, "Accept":"application/json","Content-Type":"application/json"}; },
  async request(s, path, opts={}) {
    const r = await fetch(this.base(s)+path, {...opts, headers:{...this.headers(s),...(opts.headers||{})}});
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) throw new Error((data && (data.message || data.error)) || `HTTP ${r.status}`);
    return data;
  },
  async status(s) { return this.request(s, "/system/status"); },
  async profiles(s) { return this.request(s, "/qualityprofile"); },
  async roots(s) { return this.request(s, "/rootfolder"); },
  async tags(s) { return this.request(s, "/tag"); },
  async librarySearch(s, type, imdbId) {
    return this.request(s, `/${type}?term=${encodeURIComponent(imdbId)}`);
  },
  async lookup(s, type, imdbId) {
    return this.request(s, `/${type}/lookup?term=${encodeURIComponent("imdbId:"+imdbId)}`);
  },
  async add(s, type, item) {
    return this.request(s, `/${type}`, {method:"POST", body:JSON.stringify(item)});
  }
};

const TMDB = {
  base: "https://api.themoviedb.org/3",
  authHeaders(key) {
    const value = String(key || "").trim();
    // TMDB API Read Access Tokens are Bearer tokens. Classic v3 API keys use api_key.
    if (/^eyJ/i.test(value) || value.length > 60) {
      return {Authorization: `Bearer ${value}`, Accept: "application/json"};
    }
    return {Accept: "application/json"};
  },
  async request(path, key) {
    const value = String(key || "").trim();
    if (!value) throw new Error("TMDB API key is not configured");
    const bearer = this.authHeaders(value);
    let url = this.base + path;
    if (!(bearer.Authorization)) {
      url += (url.includes("?") ? "&" : "?") + "api_key=" + encodeURIComponent(value);
    }
    let r = await fetch(url, {headers: bearer});
    let text = await r.text();
    let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    // If the value looked like a token but was actually a classic API key, retry once.
    if (!r.ok && bearer.Authorization) {
      const retryUrl = this.base + path + (path.includes("?") ? "&" : "?") + "api_key=" + encodeURIComponent(value);
      r = await fetch(retryUrl, {headers:{Accept:"application/json"}});
      text = await r.text();
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    }
    if (!r.ok) throw new Error((data && (data.status_message || data.message || data.error)) || `TMDB HTTP ${r.status}`);
    return data;
  },
  async findByImdb(imdbId, key) {
    return this.request(`/find/${encodeURIComponent(imdbId)}?external_source=imdb_id&language=en-US`, key);
  },
  async similar(kind, tmdbId, key) {
    return this.request(`/${kind === "movie" ? "movie" : "tv"}/${encodeURIComponent(tmdbId)}/similar?language=en-US&page=1`, key);
  },
  async details(kind, tmdbId, key) {
    return this.request(`/${kind === "movie" ? "movie" : "tv"}/${encodeURIComponent(tmdbId)}?language=en-US&append_to_response=external_ids`, key);
  }
};

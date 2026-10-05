const $ = s => document.querySelector(s);

async function load() {
  const x = await chrome.storage.local.get(["radarr", "sonarr", "tmdb"]);
  const r = x.radarr || {}, s = x.sonarr || {};

  // Leave value empty if not saved, relying on the HTML placeholder to show layout formatting
  $("#rurl").value = r.url || "";
  $("#rkey").value = r.apiKey || "";
  $("#surl").value = s.url || "";
  $("#skey").value = s.apiKey || "";
  $("#tmdb").value = x.tmdb?.apiKey || "";

  if (r.url && r.apiKey) await loadArr("radarr", r, true);
  if (s.url && s.apiKey) await loadArr("sonarr", s, true);
}

function fill(which, profiles, roots, current, tags) {
  const p = $(which === "radarr" ? "#rq" : "#sq"),
        rt = $(which === "radarr" ? "#rroot" : "#sroot"),
        tg = $(which === "radarr" ? "#rtag" : "#stag");

  p.innerHTML = profiles.map(x => `<option value="${x.id}">${x.name}</option>`).join("");
  rt.innerHTML = roots.map(x => `<option value="${x.path}">${x.path}</option>`).join("");
  tg.innerHTML = '<option value="">No tag</option>' + ((tags || []).sort((a, b) => String(a.label || a.name).localeCompare(String(b.label || b.name))).map(x => `<option value="${x.id}">${x.label || x.name}</option>`).join(""));

  if (current?.qualityProfileId) p.value = String(current.qualityProfileId);
  if (current?.rootFolderPath) rt.value = current.rootFolderPath;
  if (current?.tagId) tg.value = String(current.tagId);
}

async function loadArr(which, s, silent = false) {
  const state = $(which === "radarr" ? "#rstate" : "#sstate");

  try {
    const [status, profiles, roots, tags] = await Promise.all([
      API.status(s),
      API.profiles(s),
      API.roots(s),
      API.tags(s)
    ]);

    fill(which, profiles, roots, s, tags);
    state.textContent = `Connected: ${status.version || "OK"}`;
    state.className = "ok";
    return true;
  } catch (e) {
    state.textContent = "Connection failed";
    state.className = "err";
    if (!silent) alert(`${which}: ${e.message}`);
    return false;
  }
}

$("#rtest").onclick = async () => {
  const s = {
    url: $("#rurl").value.trim(),
    apiKey: $("#rkey").value.trim(),
    qualityProfileId: $("#rq").value,
    rootFolderPath: $("#rroot").value,
    tagId: $("#rtag").value
  };

  await loadArr("radarr", s);
};

$("#stest").onclick = async () => {
  const s = {
    url: $("#surl").value.trim(),
    apiKey: $("#skey").value.trim(),
    qualityProfileId: $("#sq").value,
    rootFolderPath: $("#sroot").value,
    tagId: $("#stag").value
  };

  await loadArr("sonarr", s);
};

$("#save").onclick = async () => {
  // Helper to ensure protocols exist and trailing slashes are removed
  const sanitizeUrl = (url) => {
    let u = url.trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) {
      u = "http://" + u;
    }
    return u.replace(/\/+$/, "");
  };

  const r = {
    url: sanitizeUrl($("#rurl").value),
    apiKey: $("#rkey").value.trim(),
    qualityProfileId: $("#rq").value,
    rootFolderPath: $("#rroot").value,
    tagId: $("#rtag").value
  };

  const s = {
    url: sanitizeUrl($("#surl").value),
    apiKey: $("#skey").value.trim(),
    qualityProfileId: $("#sq").value,
    rootFolderPath: $("#sroot").value,
    tagId: $("#stag").value
  };

  await chrome.storage.local.set({
    radarr: r,
    sonarr: s,
    tmdb: { apiKey: $("#tmdb").value.trim() }
  });

  // Update the text fields with the polished URLs so the user sees the clean version
  $("#rurl").value = r.url;
  $("#surl").value = s.url;

  $("#msg").textContent = "Saved ✓";
  setTimeout(() => $("#msg").textContent = "", 2000);
};


load();

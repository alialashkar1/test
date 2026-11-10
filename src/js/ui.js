/* UI core: render loop, data binding, dialogs, uploads, shell. Views return HTML strings; actions mutate state through Ops. */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r) => (r || document).querySelector(s);
const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const IC = {
  check: svg('<path d="M20 6 9 17l-5-5"/>'), lock: svg('<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'), plus: svg('<path d="M12 5v14M5 12h14"/>'), warn: svg('<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>'), up: svg('<path d="M12 16V4M8 8l4-4 4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
  back: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>'), trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'), menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>'), grid: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  book: svg('<path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M8 8h6M8 12h8M8 16h8"/>'), cog: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'),
  bolt: svg('<path d="M13 2 3 14h7l-1 8 10-12h-7z"/>'), down: svg('<path d="M12 4v12M8 12l4 4 4-4"/><path d="M4 20h16"/>'), arrowUp: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'), arrowDn: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  list: svg('<path d="M4 7h16M4 12h16M4 17h10"/>'), clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'), copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>'),
};
const UI = { modal: null, cb: null, busy: '', tab: {}, lastKey: '' };
const Views = {}, Act = {}, Cap = { sample: null, downloads: null };

/* ---------- small builders ---------- */
const chip = (tone, text, dot) => `<span class="chip c-${tone}">${dot === false ? '' : '<span class="dot"></span>'}${esc(text)}</span>`;
const banner = (kind, html, icon) => `<div class="banner ${kind}">${icon || (kind === 'lock' ? IC.lock : kind === 'good' ? IC.check : kind === 'info' ? IC.info : IC.warn)}<div>${html}</div></div>`;
const guardList = rs => `<ul class="guard-list">${rs.map(r => `<li>${esc(r)}</li>`).join('')}</ul>`;
const bindAttrs = (c, id, f, o) => `${c ? `data-c="${c}"` : ''} ${id ? `data-id="${esc(id)}"` : ''} data-f="${f}" ${o && o.num ? 'data-num="1"' : ''} ${o && o.dis ? 'disabled' : ''} ${o && o.change ? `data-change="${o.change}"` : ''}`;
const inp = (c, id, f, v, o) => `<input class="inp ${(o && o.cls) || ''}" type="${(o && o.type) || 'text'}" value="${esc(v)}" placeholder="${esc((o && o.ph) || '')}" ${bindAttrs(c, id, f, o)} ${o && o.min != null ? `min="${o.min}"` : ''} ${o && o.list ? `list="${o.list}"` : ''} aria-label="${esc((o && o.label) || (o && o.ph) || f)}">`;
const ta = (c, id, f, v, o) => `<textarea class="inp ${(o && o.cls) || ''}" rows="${(o && o.rows) || 3}" placeholder="${esc((o && o.ph) || '')}" ${bindAttrs(c, id, f, o)} aria-label="${esc((o && o.label) || (o && o.ph) || f)}">${esc(v)}</textarea>`;
const sel = (c, id, f, v, opts, o) => `<select class="inp ${(o && o.cls) || ''}" ${bindAttrs(c, id, f, o)} aria-label="${esc((o && o.label) || f)}">${o && o.ph != null ? `<option value="">${esc(o.ph)}</option>` : ''}${opts.map(x => { const [val, lab, dis] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(val)}" ${String(val) === String(v ?? '') ? 'selected' : ''} ${dis ? 'disabled' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
const chk = (c, id, f, v, label, o) => `<label class="chk"><input type="checkbox" ${v ? 'checked' : ''} ${bindAttrs(c, id, f, o)}>${esc(label)}</label>`;
const fld = (label, html, hint) => `<label class="fld"><span>${esc(label)}${hint ? ` <span class="hint">· ${esc(hint)}</span>` : ''}</span>${html}</label>`;
const btn = (label, act, o) => `<button class="btn ${(o && o.cls) || ''}" data-act="${act}" ${o && o.data ? Object.entries(o.data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ') : ''} ${o && o.dis ? 'disabled' : ''} ${o && o.title ? `title="${esc(o.title)}"` : ''}>${(o && o.icon) || ''}${esc(label)}</button>`;
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtDT = iso => iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const fmtNum = n => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmtSize = b => b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? Math.round(b / 1e3) + ' KB' : b + ' B';
const scoreChip = (L, I) => { const s = Engine.riskScore(L, I, S.meth); return s ? `<span class="score t-${s.tone}" title="${esc(s.band)}">${s.score}</span> <span class="small muted">${esc(s.band)}</span>` : '<span class="small faint">not rated</span>'; };
const empty = (title, text, actions) => `<div class="card empty"><h3>${esc(title)}</h3><p>${esc(text)}</p>${actions ? `<div class="row" style="justify-content:center;margin-top:14px">${actions}</div>` : ''}</div>`;

/* ---------- toast, dialogs, files ---------- */
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3800); }
function ask(o, cb) { UI.modal = o; UI.cb = cb; render(); const f = $('.modal .inp'); if (f) f.focus(); }
function closeModal() { UI.modal = null; UI.cb = null; }
function modalHTML() {
  const m = UI.modal; if (!m) return '';
  return `<div class="overlay" data-act="modal-bg"><div class="modal" role="dialog" aria-modal="true"><div class="mh">${esc(m.title)}</div><div class="mb">${m.text ? `<p class="muted">${esc(m.text)}</p>` : ''}${m.html || ''}
    ${(m.fields || []).map(f => fld(f.label, f.type === 'textarea' ? `<textarea class="inp" id="m-${f.id}" rows="3" placeholder="${esc(f.ph || '')}">${esc(f.value || '')}</textarea>` : f.type === 'select' ? `<select class="inp" id="m-${f.id}">${f.options.map(x => `<option value="${esc(Array.isArray(x) ? x[0] : x)}">${esc(Array.isArray(x) ? x[1] : x)}</option>`).join('')}</select>` : `<input class="inp" id="m-${f.id}" type="${f.type || 'text'}" value="${esc(f.value || '')}" placeholder="${esc(f.ph || '')}">`, f.hint)).join('')}
    <div id="m-err" class="small" style="color:var(--crit)" hidden></div></div>
    <div class="mf"><button class="btn ghost" data-act="modal-cancel">Cancel</button>${m.ok === false ? '' : `<button class="btn ${m.danger ? 'danger' : 'primary'}" data-act="modal-ok">${esc(m.ok || 'Confirm')}</button>`}</div></div></div>`;
}
Act['modal-cancel'] = () => { closeModal(); render(); };
Act['modal-bg'] = (d, el, ev) => { if (ev.target === el) { closeModal(); render(); } };
Act['modal-ok'] = () => {
  const m = UI.modal, vals = {};
  for (const f of m.fields || []) { vals[f.id] = ($('#m-' + f.id).value || '').trim(); if (f.required !== false && !vals[f.id]) { const e = $('#m-err'); e.hidden = false; e.textContent = `${f.label} is required.`; $('#m-' + f.id).focus(); return; } }
  const cb = UI.cb; closeModal(); if (cb) cb(vals); commit();
};
async function saveFile(filename, data) {
  if (Cap.downloads) { try { await Cap.downloads.save({ filename, data }); toast('Saved ' + filename); return; } catch (e) { if (e && e.code === 'declined') return; } }
  try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'text/plain' })); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); toast('Download started: ' + filename); } catch (e) { toast('Could not save the file here — use Copy instead.'); }
}
async function copyText(text) { try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch (e) { toast('Copy was blocked by the browser'); } }
const toCSV = rows => rows.map(r => r.map(v => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\n');
async function takeFiles(files) {
  const eng = E(); if (!eng || !files || !files.length) return;
  UI.busy = `Reading ${files.length} file${files.length > 1 ? 's' : ''}…`; render();
  let n = 0;
  for (const f of files) {
    try {
      const isText = /\.(csv|tsv|txt)$/i.test(f.name) || /^text\//.test(f.type);
      const buf = await f.slice(0, 8e6).arrayBuffer();
      const text = isText && f.size < 6e6 ? await f.text() : null;
      await Ops.ingest(eng, f.name, f.size, f.type, text, buf); n++;
    } catch (e) { toast(`Could not read ${f.name}`); }
  }
  UI.busy = ''; commit(); toast(`${n} document${n === 1 ? '' : 's'} received and classified`);
}
async function askAI(prompt, label) {
  if (!Cap.sample) return null;
  UI.busy = label || 'Working…'; render();
  try { return await Cap.sample.json(prompt, { cache: false }); }
  catch (e) { const c = e && e.code; toast(c === 'not_granted' ? 'Assistant access was declined.' : c === 'rate_limited' ? 'Usage limit reached — try again later.' : c === 'invalid_json' ? 'The draft could not be read — try again.' : 'The assistant is unavailable right now.'); return null; }
  finally { UI.busy = ''; render(); }
}

/* ---------- binding ---------- */
function setPath(obj, path, v) { const ks = path.split('.'); let o = obj; for (let i = 0; i < ks.length - 1; i++) { const k = /^\d+$/.test(ks[i]) ? +ks[i] : ks[i]; if (o[k] == null) o[k] = {}; o = o[k]; } const last = ks[ks.length - 1]; o[/^\d+$/.test(last) ? +last : last] = v; }
function target(eng, c, id) {
  if (c === 'meth') return S.meth;
  if (!c) return eng;
  const coll = eng[c];
  if (Array.isArray(coll)) return coll.find(x => x.id === id);
  return coll[id] || (coll[id] = c === 'dtests' ? Ops.blankD() : c === 'etests' ? Ops.blankE() : {});
}
function onChange(ev) {
  const el = ev.target;
  if (el.matches('input[type=file]')) { takeFiles([...el.files]); return; }
  if (el.dataset.change && !el.dataset.f) { Act[el.dataset.change](el.dataset, el, ev); commit(); return; }
  if (!el.dataset.f) return;
  const eng = E(), c = el.dataset.c || '', id = el.dataset.id || '', f = el.dataset.f;
  let v = el.type === 'checkbox' ? el.checked : el.value; if (el.dataset.num) v = Number(v) || 0;
  const t = target(eng, c, id); if (!t) return;
  setPath(t, f, v);
  if (c === 'controls' && f === 'type' && v === 'Automated') t.itDep = true;
  if (c === 'etests') { t.reviewer = ''; }
  if (c === 'gaps' && f === 'cleared') { t.clearedAt = v ? new Date().toISOString() : ''; }
  if (eng && c !== 'meth') { const d = `${c || 'scope'}${id ? ' ' + id : ''} · ${f.replace(/\.\d+/g, '')}`, last = eng.trail[eng.trail.length - 1]; if (!(last && last.a === 'Edited' && last.d === d && last.u === me().name)) Ops.log(eng, 'Edited', d); }
  if (el.dataset.change) Act[el.dataset.change](el.dataset, el, ev);
  commit();
}
/* Re-render is deferred while a pointer press is in flight, so a click that follows an edit still lands on its button. */
let renderPending = false;
const pressed = () => UI.ptr && Date.now() - UI.ptr < 600;
function commit() {
  Store.save(); if (renderPending) return; renderPending = true;
  const run = () => { if (pressed()) { setTimeout(run, 40); return; } renderPending = false; render(); };
  setTimeout(run, 0);
}

/* ---------- render ---------- */
function sig(el) { if (!el || !el.dataset) return ''; const d = el.dataset; return d.f ? `[data-f="${d.f}"]${d.c ? `[data-c="${d.c}"]` : ''}${d.id ? `[data-id="${CSS.escape(d.id)}"]` : ''}` : ''; }
function render() {
  const main = $('.main'), key = S.ui.view + '/' + S.ui.engId + '/' + S.ui.stage + '/' + (S.ui.sub || '') + '/' + (S.ui.ctl || '');
  const top = main && key === UI.lastKey ? main.scrollTop : 0, fs = UI.modal ? '' : sig(document.activeElement);
  const railOpen = $('.rail') && $('.rail').classList.contains('open') && key === UI.lastKey;
  UI.lastKey = key;
  $('#app').innerHTML = shell();
  const m2 = $('.main'); if (m2) m2.scrollTop = top;
  if (railOpen) { $('.rail').classList.add('open'); $('.scrim').classList.add('on'); }
  if (fs) { const el = $(fs); if (el) { try { el.focus({ preventScroll: true }); } catch (e) {} } }
}
function go(view, stage, extra) { S.ui.view = view; if (stage) S.ui.stage = stage; Object.assign(S.ui, extra || {}); Store.save(); render(); }
Act.nav = d => { if (d.view === 'home') S.ui.engId = S.ui.engId; go(d.view, d.stage); };
const resetView = () => { UI.tab = {}; S.ui.sub = ''; S.ui.ctl = ''; Object.assign(UI.an, { src: ['', '', ''], keys: [['', ''], ['', ''], ['', '']], amt: ['', '', ''], tol: 0, open: '', dup: { ds: '', c1: '', c2: '' }, thr: { ds: '', col: '', thr: '', pct: 5 } }); };
Act.open = d => { S.ui.engId = d.id; resetView(); go('eng', 'overview'); };
Act.stage = d => go('eng', d.stage, d.sub ? { sub: d.sub } : d.ctl ? { ctl: d.ctl } : {});
Act.tab = d => { UI.tab[d.group] = d.tab; render(); };
Act.theme = () => { const r = document.documentElement, cur = r.getAttribute('data-theme'), dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches; r.setAttribute('data-theme', dark ? 'light' : 'dark'); try { localStorage.setItem('throughline.theme', dark ? 'light' : 'dark'); } catch (e) {} };
Act.menu = () => { $('.rail').classList.toggle('open'); $('.scrim').classList.toggle('on'); };
Act.user = () => ask({ title: 'Switch user', text: 'Working papers record who prepared and who reviewed them. A reviewer must be a different person from the preparer.',
  fields: [{ id: 'u', label: 'Signed in as', type: 'select', options: S.users.map(u => [u.id, `${u.name} — ${u.role}`]) }, { id: 'n', label: 'Or add a user (name)', required: false }, { id: 'r', label: 'Role', required: false, ph: 'e.g. Reviewer' }], ok: 'Switch' },
  v => { if (v.n) { const u = { id: 'u' + Date.now().toString(36), name: v.n, role: v.r || 'Auditor' }; S.users.push(u); S.userId = u.id; } else S.userId = v.u; toast('Signed in as ' + me().name); });

const tabs = (group, items, def) => { const cur = UI.tab[group] || def; return `<div class="tabs">${items.map(([id, label]) => `<button class="tab ${cur === id ? 'active' : ''}" data-act="tab" data-group="${group}" data-tab="${id}">${esc(label)}</button>`).join('')}</div>`; };
const curTab = (group, def) => UI.tab[group] || def;

function shell() {
  const eng = S.ui.view === 'eng' ? E() : null;
  if (S.ui.view === 'eng' && !eng) S.ui.view = 'home';
  const u = me(), stages = eng ? Engine.stages(eng) : [];
  const dot = st => `<span class="sdot sd-${st}">${st === 'done' ? IC.check : st === 'locked' ? IC.lock : st === 'active' ? IC.clock : ''}</span>`;
  const nav = eng ? `
      <button class="nav-item" data-act="nav" data-view="home">${IC.back}All engagements</button>
      <div class="eng-head"><div class="en">${esc(eng.scope.name || 'Untitled engagement')}</div><div class="ec">${esc(eng.scope.client || 'No client yet')} · ${esc(eng.id)}</div></div>
      <button class="nav-item ${S.ui.stage === 'overview' ? 'active' : ''}" data-act="stage" data-stage="overview">${IC.grid}Overview</button>
      <div class="nav-label">Engagement</div>
      ${stages.map(s => `<button class="nav-item ${S.ui.stage === s.id ? 'active' : ''} ${s.state === 'locked' ? 'locked' : ''}" data-act="stage" data-stage="${s.id}">${dot(s.state)}${esc(s.label)}</button>`).join('')}
      <div class="nav-label">Record</div>
      <button class="nav-item ${S.ui.stage === 'trail' ? 'active' : ''}" data-act="stage" data-stage="trail">${IC.clock}Audit trail<span class="count">${eng.trail.length}</span></button>`
    : `<div class="nav-label">Workspace</div>
      <button class="nav-item ${S.ui.view === 'home' ? 'active' : ''}" data-act="nav" data-view="home">${IC.grid}Engagements<span class="count">${S.engs.length}</span></button>
      <div class="nav-label">Configuration</div>
      <button class="nav-item ${S.ui.view === 'kb' ? 'active' : ''}" data-act="nav" data-view="kb">${IC.book}Knowledge base</button>
      <button class="nav-item ${S.ui.view === 'method' ? 'active' : ''}" data-act="nav" data-view="method">${IC.cog}Methodology</button>`;
  let body, crumb;
  if (eng) {
    const st = stages.find(s => s.id === S.ui.stage);
    crumb = `Engagements <span>/</span> <b>${esc(eng.scope.name || 'Untitled')}</b>${st ? ` <span>/</span> ${esc(st.label)}` : ''}`;
    const v = Views[S.ui.stage] || Views.overview;
    body = (st && st.state === 'locked') ? `<div class="page-head"><div><h1>${esc(st.label)}</h1></div></div>${banner('lock', `<b>Locked.</b>${guardList(st.reasons)}`)}` : v(eng, st);
  } else { crumb = `<b>${S.ui.view === 'kb' ? 'Knowledge base' : S.ui.view === 'method' ? 'Methodology' : 'Engagements'}</b>`; body = (Views[S.ui.view] || Views.home)(); }
  const q = eng ? Engine.quality(eng) : null;
  return `<div class="app"><div class="scrim" data-act="menu"></div>
    <aside class="rail"><div class="brand"><div class="logo"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18 9 11l5 3 6-9"/></svg></div><div><div class="brand-name">Throughline</div><div class="brand-sub">Internal audit</div></div></div>
      <nav class="nav">${nav}</nav>
      <div class="rail-foot"><div class="avatar">${esc(u.name.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase())}</div><button class="who" data-act="user" title="Switch user"><b>${esc(u.name)}</b><span>${esc(u.role)}</span></button><button class="icon-btn" data-act="theme" title="Toggle theme" aria-label="Toggle theme">${IC.moon}</button></div></aside>
    <main class="main"><div class="topbar"><button class="icon-btn menu-btn" data-act="menu" aria-label="Menu">${IC.menu}</button><div class="crumb">${crumb}</div><span class="sp"></span>
      ${UI.busy ? chip('info', UI.busy) : ''}${eng && eng.sample ? chip('mut', 'Sample data', false) : ''}${q && q.score != null ? `<button class="btn sm ghost" data-act="stage" data-stage="overview" title="File quality score">${chip(q.score >= 85 ? 'good' : q.score >= 60 ? 'warn' : 'crit', `Quality ${q.score}%`)}</button>` : ''}
      ${Store.memOnly ? chip('warn', 'Large files kept for this session only') : ''}</div>
      <section class="content">${body}</section></main>${modalHTML()}</div>`;
}

function boot() {
  try { const t = localStorage.getItem('throughline.theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {}
  const first = Store.load();
  document.addEventListener('click', ev => { const el = ev.target.closest('[data-act]'); if (!el || el.disabled) return; const fn = Act[el.dataset.act]; if (fn) fn(el.dataset, el, ev); });
  document.addEventListener('change', onChange);
  document.addEventListener('pointerdown', () => { UI.ptr = Date.now(); }, true);
  document.addEventListener('pointerup', () => { setTimeout(() => { UI.ptr = 0; }, 0); }, true);
  document.addEventListener('dragover', ev => { const z = ev.target.closest && ev.target.closest('.dropzone'); if (z) { ev.preventDefault(); z.classList.add('hot'); } });
  document.addEventListener('dragleave', ev => { const z = ev.target.closest && ev.target.closest('.dropzone'); if (z) z.classList.remove('hot'); });
  document.addEventListener('drop', ev => { const z = ev.target.closest && ev.target.closest('.dropzone'); if (z) { ev.preventDefault(); takeFiles([...ev.dataTransfer.files]); } });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && UI.modal) { closeModal(); render(); } });
  if (window.claude && window.claude.use) { ['sample', 'downloads'].forEach(n => window.claude.use(n).then(x => { Cap[n] = x || null; if (x && n === 'sample') render(); }).catch(() => {})); }
  if (first) { render(); Seed.engagement().then(() => { Store.save(); render(); }); } else render();
}

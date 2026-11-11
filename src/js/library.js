/* Document library: read what is dumped in, give each document an item card with its main points, and sort them into a hierarchy. */
/* Readers ship with the app in vendor/; the CDN copy is only a fallback. */
const LIBS = {
  xlsx: ['xlsx.full.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX'],
  pdf: ['pdf.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib'],
  pdfw: ['pdf.worker.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js', 'pdfjsWorker'],
  zip: ['jszip.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip'],
};
const libLoading = {}, Blobs = new Map();
const loadScript = url => new Promise((res, rej) => { const s = document.createElement('script'); s.src = url; s.onload = res; s.onerror = () => { s.remove(); rej(new Error('blocked')); }; document.head.appendChild(s); });
async function loadLibOnce(k) {
  const [file, cdn, g] = LIBS[k];
  for (const url of ['vendor/' + file, cdn]) {
    try { await Promise.race([loadScript(url), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000))]); if (window[g]) return window[g]; } catch (e) {}
  }
  throw new Error('blocked');
}
function loadLib(k) { const g = LIBS[k][2]; if (window[g]) return Promise.resolve(window[g]); return libLoading[k] || (libLoading[k] = loadLibOnce(k).catch(e => { delete libLoading[k]; throw e; })); }
/* Returns what could be read: csv (tabular text), text, and facts about the file. Never throws for an unreadable format. */
async function readContent(file) {
  const n = file.name.toLowerCase();
  try {
    if (/\.(csv|tsv)$/.test(n)) return { csv: await file.text() };
    if (/\.(txt|md|log|json|xml)$/.test(n) || /^text\//.test(file.type)) { const t = await file.text(); return { csv: t, text: t }; }
    if (/\.(xlsx|xlsm|xls)$/.test(n)) {
      const X = await loadLib('xlsx'), wb = X.read(await file.arrayBuffer(), { type: 'array' });
      let best = { csv: '', name: '' };
      wb.SheetNames.forEach(s => { const c = X.utils.sheet_to_csv(wb.Sheets[s], { blankrows: false }); if (c.length > best.csv.length) best = { csv: c, name: s }; });
      return { csv: best.csv, sheets: wb.SheetNames, sheet: best.name };
    }
    if (/\.pdf$/.test(n)) {
      await loadLib('pdfw'); const P = await loadLib('pdf');
      const pdf = await P.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableFontFace: true }).promise;
      let text = '';
      for (let p = 1; p <= Math.min(pdf.numPages, 40); p++) {
        const tc = await (await pdf.getPage(p)).getTextContent(); let last = null;
        tc.items.forEach(it => { const y = Math.round(it.transform[5]); text += last === null ? '' : Math.abs(y - last) > 2 ? '\n' : ' '; text += it.str; last = y; });
        text += '\n\n';
      }
      return { text, pages: pdf.numPages, note: text.trim().length < 20 ? 'Scanned PDF with no text layer — contents not read' : '' };
    }
    if (/\.docx$/.test(n)) {
      const Z = await loadLib('zip'), z = await Z.loadAsync(await file.arrayBuffer()), f = z.file('word/document.xml');
      if (!f) return { note: 'Not a readable Word document' };
      const xml = await f.async('string');
      return { text: xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'") };
    }
    if (/\.(png|jpe?g|gif|webp|heic)$/.test(n)) return { note: 'Image — contents are not read automatically' };
    return { note: 'Format not read — filed by name only' };
  } catch (e) { return { note: /blocked|timeout|not loaded/.test(String(e.message)) ? 'The reader for this format could not be loaded — filed by name only' : 'The file could not be read — filed by name only' }; }
}

const Lib = {
  cache: new WeakMap(),
  kind(d) { if (d.rows) return 'table'; if (/\.(png|jpe?g|gif|webp|heic)$/i.test(d.name)) return 'image'; if (d.text && d.text.trim().length > 20) return 'text'; return /\.pdf$/i.test(d.name) ? 'scan' : 'other'; },
  kindLabel: { table: 'Data set', text: 'Text document', image: 'Image', scan: 'Scanned PDF', other: 'File' },
  icon(k) { return { table: IC.grid, text: IC.list, image: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/>') }[k] || svg('<path d="M7 3h8l5 5v13H7z"/><path d="M14 3v6h6"/>'); },

  /* Main points of a data set, all computed from its rows. */
  profile(d) {
    const hs = d.headers, rows = d.rows, n = d.rowsDropped || rows.length, pts = [];
    pts.push(`${fmtNum(n)} rows · ${hs.length} columns: ${hs.slice(0, 6).join(', ')}${hs.length > 6 ? '…' : ''}`);
    const isNum = v => /^[\s(+-]?[\d][\d,.\s]*\)?$/.test(String(v));
    const cols = hs.map(h => { const vals = rows.map(r => String(r[h] ?? '').trim()), non = vals.filter(Boolean); return { h, non, blank: vals.length - non.length, numeric: non.length > 0 && non.filter(isNum).length / non.length > 0.9, distinct: new Set(non).size }; });
    const name = c => c.h.replace(/_/g, ' ');
    const pc = cols.find(c => /^(month|period|year_month)$/.test(c.h)) || cols.find(c => /date|month|period/.test(c.h) && c.non.some(v => /^\d{4}-\d{2}/.test(v)));
    if (pc) { const iso = pc.non.filter(v => /^\d{4}-\d{2}/.test(v)).sort(); if (iso.length) { const per = new Set(iso.map(v => v.slice(0, 7))).size; pts.push(/^(month|period|year_month)$/.test(pc.h) ? `Covers ${iso[0]} to ${iso[iso.length - 1]} · ${per} month${per === 1 ? '' : 's'}` : `${name(pc)} runs from ${iso[0]} to ${iso[iso.length - 1]}`); } }
    const kc = cols.find(c => /(^|_)(code|id|no|number|user)$/.test(c.h) && c.non.length);
    if (kc) pts.push(`${fmtNum(kc.distinct)} distinct ${name(kc)}${kc.distinct < kc.non.length ? ` across ${fmtNum(rows.length)} rows` : ' — one row each'}`);
    const pri = ['net', 'amount', 'total', 'gross', 'value', 'cost', 'salary', 'proceeds', 'deduct', 'limit', 'qty'];
    cols.filter(c => c.numeric && c !== kc && pri.some(p => c.h.includes(p))).sort((a, b) => pri.findIndex(p => a.h.includes(p)) - pri.findIndex(p => b.h.includes(p))).slice(0, 2).forEach(c => {
      const ns = c.non.map(Engine.num), sum = Math.round(ns.reduce((a, b) => a + b, 0) * 100) / 100;
      pts.push(`${name(c)}: total ${fmtNum(sum)} · range ${fmtNum(Math.min(...ns))} to ${fmtNum(Math.max(...ns))}`);
    });
    if (kc) { const keys = [kc.h].concat(pc && pc !== kc && /^(month|period)/.test(pc.h) ? [pc.h] : []); if (keys.length > 1 || kc.distinct >= rows.length * 0.9) { const dup = Engine.duplicates(rows, keys); if (dup.length) pts.push(`${dup.length} repeated ${keys.map(k => k.replace(/_/g, ' ')).join(' + ')} — possible duplicates`); } }
    cols.filter(c => c.blank > 0 && c.non.length > 0).slice(0, 2).forEach(c => pts.push(`${name(c)} is blank in ${fmtNum(c.blank)} of ${fmtNum(rows.length)} rows`));
    if (d.sheets && d.sheets.length > 1) pts.push(`Workbook has ${d.sheets.length} sheets — read from “${d.sheet}”`);
    return pts;
  },
  /* Main points of a text document, extracted — nothing is paraphrased. */
  textPoints(d) {
    const text = d.text, lines = text.split(/\n+/).map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l.length > 2), pts = [];
    if (!lines.length) return pts;
    pts.push(`Opens: “${lines[0].slice(0, 110)}”`);
    const uniq = a => [...new Set(a || [])];
    const dates = uniq(text.match(/\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s+\d{4})\b/gi)).slice(0, 5);
    if (dates.length) pts.push(`Dates: ${dates.join(' · ')}`);
    const amts = uniq(text.match(/(?:[$€£]|USD|EUR|EGP|SAR|AED|GBP)\s?\d[\d,]*(?:\.\d+)?|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g)).slice(0, 4);
    if (amts.length) pts.push(`Amounts: ${amts.join(' · ')}`);
    lines.filter(l => l.length > 30 && /\b(shall|must|required to|not exceed|limit of|threshold|within \d+)\b/i.test(l)).slice(0, 2).forEach(l => pts.push(`States: “${l.slice(0, 130)}”`));
    lines.filter(l => /\b(approved by|signed by|signature|authori[sz]ed by|prepared by|reviewed by)\b/i.test(l)).slice(0, 2).forEach(l => pts.push(`“${l.slice(0, 120)}”`));
    pts.push(`${fmtNum(text.split(/\s+/).filter(Boolean).length)} words${d.pages ? ` · ${d.pages} page${d.pages === 1 ? '' : 's'}` : ''}`);
    return pts;
  },
  points(d) {
    if (d.summary && d.summary.points.length) return { points: d.summary.points, by: 'assistant' };
    let c = Lib.cache.get(d);
    if (!c || c.n !== (d.rows ? d.rows.length : (d.text || '').length)) { const k = Lib.kind(d); c = { n: d.rows ? d.rows.length : (d.text || '').length, points: k === 'table' ? Lib.profile(d) : k === 'text' ? Lib.textPoints(d) : [] }; Lib.cache.set(d, c); }
    return { points: c.points, by: 'computed' };
  },
  filing(eng, d) { const q = eng.requests.find(x => x.id === d.requestId), s = q && q.sub ? KB.sub(q.sub) : null; return { q, sub: s }; },
  refile(eng) { let n = 0; eng.docs.filter(d => d.alloc === 'pending').forEach(d => { const s = Engine.suggestRequest(d, eng.requests.filter(q => q.status !== 'na')); d.tieConf = s.conf; if (s.id && s.conf >= 0.5) { Ops.tie(eng, d, s.id, true); n++; } }); return n; },

  tree(eng, mode) {
    const leaf = d => ({ t: 'doc', d }), by = (f, label) => { const g = {}; eng.docs.forEach(d => { const k = f(d) || label; (g[k] = g[k] || []).push(leaf(d)); }); return Object.keys(g).sort().map(k => ({ t: k === label ? 'unfiled' : 'sub', label: k, kids: g[k] })); };
    const root = { t: 'root', label: eng.scope.name || 'Engagement', sub: eng.scope.client };
    if (mode === 'type') { root.kids = by(d => d.docType === 'Unclassified' ? '' : d.docType, 'Unclassified'); return root; }
    if (mode === 'period') { root.kids = by(d => d.period, 'No period detected'); return root; }
    if (mode === 'source') { root.kids = by(d => d.strength, 'Source not recorded'); return root; }
    const reqNode = q => ({ t: 'req', label: q.item, q, kids: eng.docs.filter(d => d.requestId === q.id).map(leaf) });
    root.kids = KB.processes.map(p => ({ t: 'proc', label: p.name, kids: p.subs.filter(s => eng.scope.processes.includes(s.id)).map(s => ({ t: 'sub', label: s.name, kids: eng.requests.filter(q => q.sub === s.id).map(reqNode) })) })).filter(p => p.kids.length);
    const other = eng.requests.filter(q => !q.sub); if (other.length) root.kids.push({ t: 'proc', label: 'Other requests', kids: other.map(reqNode) });
    const pend = eng.docs.filter(d => !d.requestId && d.alloc !== 'reference'); if (pend.length) root.kids.push({ t: 'unfiled', label: 'Pending allocation', kids: pend.map(leaf) });
    const ref = eng.docs.filter(d => !d.requestId && d.alloc === 'reference'); if (ref.length) root.kids.push({ t: 'proc', label: 'Engagement papers — reference only', kids: ref.map(leaf) });
    return root;
  },
  count: n => n.t === 'doc' ? 1 : (n.kids || []).reduce((a, k) => a + Lib.count(k), 0),
};

/* ---------- view ---------- */
UI.lib = { mode: '', closed: {}, q: '', type: '' };
const docLeaf = (eng, d) => { const k = Lib.kind(d), p = Lib.points(d);
  return `<button class="hx-doc" data-act="doc-open" data-id="${d.id}"><span class="kind k-${k}">${Lib.icon(k)}</span><span style="min-width:0"><span class="dn">${esc(d.name)}</span><span class="ds">${esc(p.points[0] || d.note || Lib.kindLabel[k])}</span>${d.alloc === 'auto' ? `<span class="ds" style="color:var(--info)">linked automatically · ${Math.round(d.tieConf * 100)}% match · to approve</span>` : ''}</span></button>`; };
function treeHTML(eng, n, path) {
  if (n.t === 'doc') return `<div class="hx">${docLeaf(eng, n.d)}</div>`;
  const key = path + '/' + n.label, kids = n.kids || [], closed = UI.lib.closed[key], c = Lib.count(n);
  const st = n.q ? REQ_ST[n.q.status] : null;
  return `<div class="hx"><button class="hx-node hx-${n.t} ${n.t === 'req' && !kids.length ? 'empty' : ''}" data-act="tree-toggle" data-k="${esc(key)}" ${kids.length ? `aria-expanded="${!closed}"` : ''}>
      <span class="hl">${esc(n.label)}</span>${n.sub ? `<span class="hs">${esc(n.sub)}</span>` : ''}
      <span class="hm">${st ? `<span class="chip c-${st[0]}" style="font-size:10px;padding:0 6px">${st[1]}</span>` : ''}${n.t === 'req' && n.q.missing.length ? `<span class="hs" style="color:var(--crit)">missing ${esc(n.q.missing.join(', '))}</span>` : ''}${n.t !== 'req' || c ? `<span class="hc">${c} document${c === 1 ? '' : 's'}</span>` : ''}${kids.length ? `<span class="hc">${closed ? '▸' : '▾'}</span>` : ''}</span></button>
    ${kids.length && !closed ? `<div class="hx-kids">${kids.map(k => treeHTML(eng, k, key)).join('')}</div>` : ''}</div>`;
}
const filedLine = (eng, d) => { const f = Lib.filing(eng, d); return f.q ? `${f.sub ? esc(f.sub.processName) + ' › ' + esc(f.sub.name) + ' › ' : ''}${esc(f.q.item)}` : ''; };
const docCard = (eng, d) => { const k = Lib.kind(d), p = Lib.points(d), filed = filedLine(eng, d);
  return `<article class="card dcard"><div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="kind k-${k}">${Lib.icon(k)}</span><div style="min-width:0;flex:1"><div class="dn">${esc(d.name)}</div><div class="xs muted">${esc(Lib.kindLabel[k])} · ${fmtSize(d.size)}${d.period ? ' · ' + esc(d.period) : ''}${d.pages ? ` · ${d.pages} pages` : ''}</div></div></div>
    <div class="row">${chip(d.docType === 'Unclassified' ? 'warn' : 'prim', d.docType, false)}${d.conf < 0.5 && d.docType !== 'Unclassified' ? chip('warn', 'Confirm type', false) : ''}${d.strength ? '' : chip('warn', 'Source not recorded', false)}</div>
    <div class="xs ${filed || d.alloc === 'reference' ? 'muted' : ''}" ${filed || d.alloc === 'reference' ? '' : 'style="color:var(--warn);font-weight:600"'}>${filed ? 'Filed under ' + filed : d.alloc === 'reference' ? 'Reference only — answers no client request' : 'Pending allocation'}${d.alloc === 'auto' ? ` <span style="color:var(--info);font-weight:600">· linked automatically, to approve</span>` : ''}</div>
    ${p.points.length ? `<ul class="pts">${p.points.slice(0, 6).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : `<div class="small muted">${esc(d.note || 'No contents read.')}</div>`}
    <div class="row" style="margin-top:auto"><span class="xs faint">${p.points.length ? (p.by === 'assistant' ? 'Main points drafted by the assistant — check against the document' : 'Main points computed from the contents') : ''}</span><span class="sp"></span>${btn('Open', 'doc-open', { cls: 'sm', data: { id: d.id } })}</div></article>`; };

const ALLOC = { pending: ['warn', 'Pending allocation'], auto: ['info', 'Linked automatically'], approved: ['good', 'Approved'], reference: ['mut', 'Reference only'] };
function allocHTML(eng) {
  const open = eng.requests.filter(q => q.status !== 'na'), by = k => eng.docs.filter(d => d.alloc === k), pend = by('pending'), auto = by('auto'), done = by('approved'), ref = by('reference');
  const name = d => `<button class="btn ghost sm mono" style="padding:1px 0;font-weight:600;font-size:12px;text-align:left" data-act="doc-open" data-id="${d.id}">${esc(d.name)}</button><div class="xs muted">${esc(d.docType)}${d.period ? ' · ' + esc(d.period) : ''} · ${esc(Lib.points(d).points[0] || d.note || '')}</div>`;
  const pick = (d, ph) => `<select class="inp cell" style="max-width:230px" data-change="alloc-pick" data-id="${d.id}" aria-label="${ph}"><option value="">${ph}</option>${open.map(q => `<option value="${q.id}" ${d.requestId === q.id ? 'selected' : ''}>${q.sub ? esc(subName(q.sub)) + ' › ' : ''}${esc(q.item)}</option>`).join('')}</select>`;
  const sec = (title, sub, acts, body) => `<div class="card pad stack" style="gap:9px"><div class="row"><h3 style="font-size:14px">${title}</h3><span class="xs faint">${sub}</span><span class="sp"></span>${acts}</div>${body}</div>`;
  if (!eng.cp1) return banner('info', 'The request list is built when the scope is confirmed. Until then documents wait here; they are filed the moment the list exists.') + `<div class="stack" style="margin-top:12px">${eng.docs.map(d => `<div class="alloc-row">${name(d)}</div>`).join('')}</div>`;
  return `<div class="stack">
    ${sec(`Pending allocation (${pend.length})`, 'no confident match — choose the request, or mark the document as reference only', pend.length ? btn('Let the agent try', 'ag-run', { cls: 'sm', icon: IC.bolt, data: { what: 'allocate' }, dis: !!Agent.busy }) : '',
      pend.map(d => { const top = Engine.rankRequests(d, open).slice(0, 3);
        return `<div class="alloc-row"><div style="min-width:0">${name(d)}</div><div class="row">${top.map(r => { const q = eng.requests.find(x => x.id === r.id); return `<button class="btn sm" data-act="alloc-to" data-id="${d.id}" data-q="${r.id}" title="${esc(q.item)}">${esc(q.item.length > 34 ? q.item.slice(0, 34) + '…' : q.item)} <span class="faint">${Math.round(r.conf * 100)}%</span></button>`; }).join('') || '<span class="xs muted">No request resembles this document.</span>'}${pick(d, 'Other request…')}${btn('Reference only', 'alloc-ref', { cls: 'sm ghost', data: { id: d.id } })}</div></div>`; }).join('') || '<p class="small muted">Nothing is waiting.</p>')}
    ${sec(`Linked automatically (${auto.length})`, 'the platform filed these as they arrived — approve each link or change it', auto.length ? btn('Approve all', 'alloc-approve-all', { cls: 'sm primary' }) : '',
      auto.map(d => { const q = eng.requests.find(x => x.id === d.requestId) || {};
        return `<div class="alloc-row"><div style="min-width:0">${name(d)}</div><div class="row"><span class="small">→ <b>${esc(q.item || '')}</b> <span class="faint">${Math.round(d.tieConf * 100)}% match</span></span>${q.issue ? chip('crit', q.issue.length > 46 ? q.issue.slice(0, 46) + '…' : q.issue, false) : ''}<span class="sp"></span>${btn('Approve', 'alloc-approve', { cls: 'sm primary', data: { id: d.id } })}${pick(d, 'Change…')}${btn('Unlink', 'alloc-reopen', { cls: 'sm ghost', data: { id: d.id } })}</div></div>`; }).join('') || '<p class="small muted">Nothing to approve.</p>')}
    <details class="fold" ${done.length + ref.length && !pend.length && !auto.length ? 'open' : ''}><summary>Approved (${done.length}) and reference only (${ref.length})</summary><div class="stack" style="gap:6px;margin-top:8px">
      ${done.map(d => `<div class="alloc-row"><div style="min-width:0">${name(d)}</div><div class="row"><span class="small muted">→ ${esc((eng.requests.find(x => x.id === d.requestId) || {}).item || '')}</span><span class="sp"></span>${btn('Reopen', 'alloc-reopen', { cls: 'sm ghost', data: { id: d.id } })}</div></div>`).join('')}
      ${ref.map(d => `<div class="alloc-row"><div style="min-width:0">${name(d)}</div><div class="row">${chip('mut', 'Reference only', false)}<span class="sp"></span>${btn('Reopen', 'alloc-reopen', { cls: 'sm ghost', data: { id: d.id } })}</div></div>`).join('')}</div></details></div>`;
}
Views.library = eng => {
  const docs = eng.docs, mode = UI.lib.mode || (eng.requests.length ? 'process' : 'type'), t = curTab('lib', 'tree');
  const read = docs.filter(d => Lib.points(d).points.length).length, n = k => docs.filter(d => d.alloc === k).length, queue = n('pending') + n('auto');
  const canSum = Cap.sample && docs.some(d => !d.summary && (d.text || (Lib.kind(d) === 'image' && Cap.sampleImages && Blobs.has(d.id))));
  const drop = `<div class="dropzone" data-then="library" ${docs.length ? 'style="padding:14px"' : ''}><h4>Drop everything the client sent</h4><p>Excel, CSV, PDF, Word, text and images. Each file is read, classified, summarised and linked to the request it satisfies — or left pending for you to allocate.</p>
    <div class="row" style="justify-content:center"><label class="btn primary" for="file-inp">${IC.up}Choose files</label><input type="file" id="file-inp" data-then="library" multiple hidden>${docs.length ? '' : btn('Load sample files', 'sample-files', { cls: 'ghost' })}</div></div>`;
  if (!docs.length) return `<div class="page-head"><div><h1>Document library</h1><div class="sub">Everything the agent builds from. Each document gets an item card with its main points and a place in the hierarchy.</div></div></div>${drop}`;
  let body;
  if (t === 'alloc') body = allocHTML(eng);
  else if (t === 'tree') body = `<div class="row" style="margin-bottom:10px"><span class="small muted">Arrange by</span>${[['process', 'Process and request'], ['type', 'Document type'], ['period', 'Period'], ['source', 'Source strength']].map(m => `<button class="btn sm ${mode === m[0] ? 'primary' : ''}" data-act="lib-mode" data-mode="${m[0]}">${m[1]}</button>`).join('')}<span class="sp"></span>${btn('Expand all', 'tree-all', { cls: 'sm ghost' })}</div>
    ${mode === 'process' && !eng.cp1 ? banner('info', 'Confirm the scope to build the request list. Documents are then filed under the process and request they satisfy.') : ''}
    <div class="tree-wrap">${treeHTML(eng, Lib.tree(eng, mode), '')}</div>`;
  else { const q = UI.lib.q.toLowerCase(), list = docs.filter(d => (!UI.lib.type || d.docType === UI.lib.type) && (!q || (d.name + ' ' + d.docType + ' ' + Lib.points(d).points.join(' ') + ' ' + (d.text || '').slice(0, 4000)).toLowerCase().includes(q)));
    body = `<div class="row" style="margin-bottom:12px"><input class="inp" style="max-width:300px" type="search" placeholder="Search names, main points and contents" value="${esc(UI.lib.q)}" data-change="lib-q" aria-label="Search documents"><select class="inp" style="max-width:220px" data-change="lib-type" aria-label="Filter by type"><option value="">All types</option>${[...new Set(docs.map(d => d.docType))].sort().map(x => `<option ${UI.lib.type === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select><span class="small muted">${list.length} of ${docs.length}</span></div>
      <div class="dgrid">${list.map(d => docCard(eng, d)).join('') || '<p class="small muted">No documents match.</p>'}</div>`; }
  return `<div class="page-head"><div><h1>Document library</h1><div class="sub">Everything the agent builds from. Each document gets an item card with its main points and a place in the hierarchy.</div></div>
      <div class="acts">${n('pending') && eng.requests.length ? btn(`Allocate ${n('pending')} pending`, 'ag-run', { cls: 'sm', icon: IC.bolt, data: { what: 'allocate' }, dis: !!Agent.busy }) : ''}${canSum ? btn('Summarise with assistant', 'doc-sum-all', { cls: 'sm', icon: IC.bolt }) : ''}</div></div>
    ${drop}<div class="row" style="margin:14px 0 4px">${chip('mut', `${docs.length} documents`, false)}${Object.entries(ALLOC).map(([k, v]) => n(k) ? chip(v[0], `${n(k)} ${v[1].toLowerCase()}`) : '').join('')}${chip(read === docs.length ? 'good' : 'info', `${read} read`)}${docs.length - read ? chip('mut', `${docs.length - read} filed by name only`, false) : ''}</div>
    ${tabs('lib', [['tree', 'Hierarchy'], ['cards', 'Item cards'], ['alloc', `Allocation${queue ? ` (${queue})` : ''}`]], 'tree')}${body}`;
};
const allocDoc = d => { const eng = E(); return [eng, eng.docs.find(x => x.id === d.id)]; };
Act['alloc-to'] = d => { const [eng, doc] = allocDoc(d); Ops.tie(eng, doc, d.q); Ops.log(eng, 'Document allocated by the auditor', `${doc.name} → ${(eng.requests.find(q => q.id === d.q) || {}).item}`); commit(); };
Act['alloc-pick'] = (d, el) => { if (!el.value) return; const [eng, doc] = allocDoc(d); Ops.tie(eng, doc, el.value); Ops.log(eng, 'Document allocated by the auditor', `${doc.name} → ${(eng.requests.find(q => q.id === el.value) || {}).item}`); };
Act['alloc-approve'] = d => { const [eng, doc] = allocDoc(d); doc.alloc = 'approved'; Ops.log(eng, 'Automatic allocation approved', `${doc.name} → ${(eng.requests.find(q => q.id === doc.requestId) || {}).item}`); commit(); };
Act['alloc-approve-all'] = () => { const eng = E(), list = eng.docs.filter(x => x.alloc === 'auto'); list.forEach(x => { x.alloc = 'approved'; }); Ops.log(eng, 'Automatic allocations approved', `${list.length} documents`); commit(); toast(`${list.length} allocation${list.length === 1 ? '' : 's'} approved`); };
Act['alloc-ref'] = d => { const [eng, doc] = allocDoc(d); Ops.tie(eng, doc, ''); doc.alloc = 'reference'; Ops.log(eng, 'Document marked reference only', doc.name); commit(); };
Act['alloc-reopen'] = d => { const [eng, doc] = allocDoc(d); Ops.tie(eng, doc, ''); doc.alloc = 'pending'; Ops.log(eng, 'Allocation reopened', doc.name); commit(); };
Act['lib-mode'] = d => { UI.lib.mode = d.mode; render(); };
Act['tree-toggle'] = d => { UI.lib.closed[d.k] = !UI.lib.closed[d.k]; render(); };
Act['tree-all'] = () => { UI.lib.closed = {}; render(); };
Act['lib-q'] = (d, el) => { UI.lib.q = el.value; };
Act['lib-type'] = (d, el) => { UI.lib.type = el.value; };

/* The item card, opened in full. Rendered live so edits made inside it show immediately. */
Act['doc-open'] = d => ask({ title: 'Item card', ok: false, wide: true, render: () => { const eng = E(), doc = eng.docs.find(x => x.id === d.id); if (!doc) return '<p class="muted">This document was removed.</p>';
  const k = Lib.kind(doc), p = Lib.points(doc), f = Lib.filing(eng, doc), canAI = Cap.sample && (doc.text || doc.rows || (k === 'image' && Cap.sampleImages && Blobs.has(doc.id)));
  return `<div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="kind k-${k}" style="width:34px;height:34px">${Lib.icon(k)}</span><div style="min-width:0"><div class="dn" style="font-size:13.5px">${esc(doc.name)}</div><div class="xs muted">${esc(Lib.kindLabel[k])} · ${fmtSize(doc.size)}${doc.pages ? ` · ${doc.pages} pages` : ''}${doc.rows ? ` · ${fmtNum(doc.rowsDropped || doc.rows.length)} rows` : ''} · received ${fmtDT(doc.uploadedAt)} by ${esc(doc.by)}</div>${doc.hash ? `<div class="xs mono faint" style="overflow-wrap:anywhere">sha-256 ${esc(doc.hash)}</div>` : ''}</div></div>
    <div class="form-grid">${fld('Classified as', sel('docs', doc.id, 'docType', doc.docType, ['Unclassified', ...KB.docTypes.map(x => x.t)]), doc.conf ? Math.round(doc.conf * 100) + '% confidence' : '')}${fld('Period', inp('docs', doc.id, 'period', doc.period, { ph: 'e.g. 2024-03' }))}${fld('Source strength', sel('docs', doc.id, 'strength', doc.strength, KB.strengths, { ph: 'Record the source…' }))}</div>
    ${fld('Filed under', `<select class="inp" data-change="tie-doc" data-id="${doc.id}" aria-label="Filed under"><option value="">Not filed</option>${eng.requests.filter(q => q.status !== 'na').map(q => `<option value="${q.id}" ${doc.requestId === q.id ? 'selected' : ''}>${q.sub ? esc(subName(q.sub)) + ' › ' : ''}${esc(q.item)}</option>`).join('')}</select>`, doc.alloc === 'auto' ? `linked automatically, ${Math.round(doc.tieConf * 100)}% match — approve it in the allocation queue` : doc.alloc === 'reference' ? 'reference only' : doc.alloc === 'pending' ? 'pending allocation' : 'approved')}
    ${f.q && (f.q.issue || f.q.missing.length) ? banner('crit', `<b>Does not meet the request.</b> ${esc(f.q.issue || 'Missing: ' + f.q.missing.join(', '))}`) : ''}
    <div><div class="row" style="margin-bottom:5px"><b class="small">Main points</b><span class="xs faint">${p.points.length ? (p.by === 'assistant' ? 'drafted by the assistant — check against the document' : 'computed from the contents') : ''}</span><span class="sp"></span>${doc.summary ? btn('Use computed points', 'doc-sum-clear', { cls: 'sm ghost', data: { id: doc.id } }) : ''}${canAI ? btn(k === 'image' ? 'Read with assistant' : 'Summarise with assistant', 'doc-sum', { cls: 'sm', icon: IC.bolt, data: { id: doc.id } }) : ''}</div>
      ${p.points.length ? `<ul class="pts">${p.points.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p class="small muted">${esc(doc.note || 'No contents read.')}</p>`}</div>
    ${doc.rows ? `<div class="tbl-wrap" style="box-shadow:none;max-height:220px"><table><thead><tr>${doc.headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${doc.rows.slice(0, 8).map(r => `<tr>${doc.headers.map(h => `<td class="mono xs">${esc(r[h])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : doc.text ? `<pre class="excerpt">${esc(doc.text.slice(0, 1500))}${doc.text.length > 1500 ? '…' : ''}</pre>` : ''}
    <div class="row"><span class="sp"></span>${btn('Remove document', 'doc-del-open', { cls: 'sm danger', data: { id: doc.id } })}</div>`; } });
Act['doc-del-open'] = d => { Ops.removeDoc(E(), d.id); closeModal(); commit(); };
Act['doc-sum-clear'] = d => { const doc = E().docs.find(x => x.id === d.id); delete doc.summary; commit(); };
async function summarise(eng, doc) {
  const k = Lib.kind(doc), types = KB.docTypes.map(x => x.t).join(' | ');
  const head = `You are filing internal audit evidence. Reply with only JSON {"type": one of [${types}] or "", "period": "YYYY-MM" or "YYYY" or "", "points": [3 to 5 short factual main points]}. The points say what the document is, who prepared or approved it and when, the key amounts, and anything visibly missing such as a signature or a date. Use only what the document shows; never guess.\n\nFILE NAME: ${doc.name}`;
  let out;
  if (k === 'image') out = await askAI(head + '\n\nThe document is the attached image.', 'Reading image…', { images: [Blobs.get(doc.id)] });
  else if (doc.rows) out = await askAI(`${head}\n\nCOMPUTED FACTS:\n${Lib.profile(doc).join('\n')}\n\nFIRST ROWS:\n${toCSV([doc.headers, ...doc.rows.slice(0, 12).map(r => doc.headers.map(h => r[h]))])}`, 'Summarising…');
  else out = await askAI(`${head}\n\nDOCUMENT TEXT:\n${doc.text.slice(0, 9000)}`, 'Summarising…');
  if (!out || !Array.isArray(out.points) || !out.points.length) return false;
  doc.summary = { points: out.points.slice(0, 6).map(String), at: new Date().toISOString() };
  if (KB.docTypes.some(x => x.t === out.type) && doc.conf < 0.5) { doc.docType = out.type; doc.conf = 0.5; }
  if (out.period && !doc.period) doc.period = String(out.period);
  Ops.log(eng, 'Main points drafted by the assistant', `${doc.name} — to be checked against the document`);
  return true;
}
Act['doc-sum'] = async d => { const eng = E(); if (await summarise(eng, eng.docs.find(x => x.id === d.id))) { if (eng.requests.length) Lib.refile(eng); commit(); } };
Act['doc-sum-all'] = async () => { const eng = E(), list = eng.docs.filter(d => !d.summary && (d.text || (Lib.kind(d) === 'image' && Cap.sampleImages && Blobs.has(d.id)))).slice(0, 8); let n = 0;
  for (const d of list) { if (await summarise(eng, d)) n++; else break; }
  if (eng.requests.length) Lib.refile(eng); commit(); toast(`${n} document${n === 1 ? '' : 's'} summarised`); };

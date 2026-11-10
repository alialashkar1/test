/* Engine: every number, ordering decision and conclusion is computed here in plain code — never typed in, never generated. */
const DEFAULT_METH = {
  basis: 'typical',
  sample: [
    { freq: 'annual', label: 'Annual', min: 1, typical: 1, extend: 0 },
    { freq: 'halfyearly', label: 'Half-yearly', min: 1, typical: 2, extend: 0 },
    { freq: 'quarterly', label: 'Quarterly', min: 2, typical: 4, extend: 0 },
    { freq: 'monthly', label: 'Monthly', min: 3, typical: 8, extend: 1 },
    { freq: 'weekly', label: 'Weekly', min: 8, typical: 8, extend: 4 },
    { freq: 'daily', label: 'Daily', min: 25, typical: 30, extend: 25 },
    { freq: 'recurring', label: 'Recurring (many times a day)', min: 25, typical: 30, extend: 25 },
    { freq: 'automated', label: 'Automated', min: 1, typical: 1, extend: 0 },
  ],
  bands: [
    { max: 3, label: 'Insignificant', tone: 1 }, { max: 7, label: 'Low', tone: 2 }, { max: 11, label: 'Medium', tone: 3 },
    { max: 16, label: 'High', tone: 4 }, { max: 25, label: 'Catastrophic', tone: 5 },
  ],
  likelihood: ['Rarely occurs', 'Unlikely to occur', 'Possible to occur', 'Likely to occur frequently', 'Highly likely'],
  impact: ['Insignificant', 'Low', 'Medium', 'High', 'Catastrophic'],
  gapRatings: ['High', 'Moderate', 'Low'],
  overall: ['Effective', 'Needs improvement', 'Unsatisfactory'],
};
const FREQS = [['annual', 'Annual'], ['halfyearly', 'Half-yearly'], ['quarterly', 'Quarterly'], ['monthly', 'Monthly'], ['weekly', 'Weekly'],
  ['daily', 'Daily'], ['recurring', 'Recurring (many times a day)'], ['adhoc', 'As and when'], ['automated', 'Automated (system)']];
const freqLabel = f => (FREQS.find(x => x[0] === f) || [, '—'])[1];

const Engine = {
  today: () => new Date().toISOString().slice(0, 10),
  typeCfg: t => ({ risk: { controls: false, testing: false }, rcm: { controls: true, testing: false } }[t] || { controls: true, testing: true }),

  riskScore(L, I, meth) {
    if (!L || !I) return null;
    const score = L * I, b = meth.bands.find(x => score <= x.max) || meth.bands[meth.bands.length - 1];
    return { score, band: b.label, tone: b.tone };
  },

  /* Sample size follows the control's frequency; ad hoc controls are sized from the population. */
  sampleSize(ctl, pop, meth) {
    const freq = ctl.type === 'Automated' ? 'automated' : ctl.freq;
    if (!freq) return { size: null, basis: 'Set the control frequency first' };
    const n = Number(pop) || 0;
    if (freq === 'adhoc') {
      if (!n) return { size: null, basis: 'As-and-when control — enter the population to size the sample' };
      const eq = n <= 1 ? 'annual' : n <= 2 ? 'halfyearly' : n <= 4 ? 'quarterly' : n <= 12 ? 'monthly' : n <= 52 ? 'weekly' : 'daily';
      const r = meth.sample.find(x => x.freq === eq);
      return { size: Math.min(n, r[meth.basis]), extend: r.extend, basis: `As and when · population ${n} sized as ${r.label.toLowerCase()} → ${meth.basis} ${r[meth.basis]}` };
    }
    const row = meth.sample.find(x => x.freq === freq);
    if (!row) return { size: null, basis: 'No methodology row for this frequency' };
    const size = n ? Math.min(row[meth.basis], n) : row[meth.basis];
    return { size, extend: row.extend, basis: `${row.label} → ${meth.basis} sample ${row[meth.basis]}${n && n < row[meth.basis] ? ` (capped at population ${n})` : ''}` };
  },
  plannedSize(eng, ctl, meth) {
    const t = eng.etests[ctl.id] || {};
    const calc = Engine.sampleSize(ctl, t.popCount, meth);
    if (ctl.planSize && ctl.planSize !== calc.size) return { size: ctl.planSize, extend: calc.extend || 0, basis: `Auditor override: ${ctl.planSize} (computed ${calc.size ?? '—'}) — ${ctl.planReason || 'no reason recorded'}`, override: true, computed: calc.size };
    return calc;
  },

  /* One attribute failure on one item makes the control ineffective. There is no other route. */
  toe(t, nAttrs) {
    if (!t || !t.items || !t.items.length) return { status: 'not_started', fails: 0, done: 0, n: 0 };
    let fails = 0, done = 0;
    t.items.forEach(it => {
      const r = (it.res || []).slice(0, nAttrs);
      if (r.includes('f')) fails++;
      if (r.length === nAttrs && r.every(Boolean)) done++;
    });
    const n = t.items.length;
    if (fails) return { status: 'ineffective', fails, done, n };
    if (done < n) return { status: 'in_progress', fails, done, n };
    return { status: t.completeness === 'reconciled' ? 'effective' : 'effective_limited', fails, done, n };
  },

  itgc(eng) {
    const itCtls = eng.controls.filter(c => { const r = eng.risks.find(x => x.id === c.riskId); return r && (KB.sub(r.sub) || {}).process === 'itgc'; });
    if (!itCtls.length) return { status: eng.itgc.status, auto: false };
    let failed = false, all = true;
    itCtls.forEach(c => { const s = Engine.controlStatus(eng, c); if (s.design === 'fail' || s.design === 'absent' || s.eff === 'ineffective') failed = true; if (!(s.eff === 'effective' || s.eff === 'effective_limited')) all = false; });
    return { status: failed ? 'failed' : all ? 'effective' : 'pending', auto: true };
  },

  controlStatus(eng, c) {
    if (c.absent) return { design: 'absent', eff: 'na' };
    const d = eng.dtests[c.id], design = (d && d.conclusion) || '';
    if (design === 'fail') return { design, eff: 'terminated' };
    if (!c.key) return { design, eff: 'not_key' };
    if (design !== 'pass') return { design, eff: 'blocked' };
    return { design, eff: Engine.toe(eng.etests[c.id], c.attrs.length).status };
  },

  gapMissing(g) {
    const m = [];
    if (!(g.desc || '').trim()) m.push('description');
    if (!g.cause) m.push('root cause');
    if (!g.rating) m.push('rating');
    if (!(g.response || '').trim()) m.push('management response');
    if (!(g.owner || '').trim()) m.push('owner');
    else if (/^(management|the management|mgmt|tbc|tbd)$/i.test(g.owner.trim())) m.push('owner must be a named role');
    if (!g.due) m.push('target date');
    return m;
  },

  guards: {
    cp1(eng) {
      const s = eng.scope, r = [];
      if (!s.client.trim()) r.push('Client is required');
      if (!s.name.trim()) r.push('Engagement name is required');
      if (!s.type) r.push('Choose the engagement type');
      if (!s.objective.trim()) r.push('State the objective');
      if (!s.periodFrom || !s.periodTo) r.push('Set the period under review');
      else if (s.periodFrom > s.periodTo) r.push('Period start is after period end');
      if (!s.processes.length) r.push('Select at least one sub-process — a department name is not a scope');
      if (!s.exclusions.length && !s.noExclusions) r.push('Record what is out of scope, or state that nothing is excluded');
      if (s.exclusions.some(x => !x.what.trim() || !x.reason.trim())) r.push('Every exclusion needs a reason');
      return r;
    },
    understanding(eng) {
      const r = [];
      eng.scope.processes.forEach(id => {
        const n = KB.sub(id).name, st = eng.steps.filter(x => x.sub === id), m = eng.subs[id] || {};
        if (!st.length) r.push(`${n}: no process steps recorded`);
        else if (!m.confirmedBy) r.push(`${n}: not yet confirmed by the process owner`);
      });
      return r;
    },
    cp2(eng) {
      const cfg = Engine.typeCfg(eng.scope.type), r = [];
      if (!eng.risks.length) r.push('No risks identified yet');
      eng.risks.forEach(x => {
        if (!x.L || !x.I) r.push(`${x.id}: likelihood and impact not rated`);
        if (cfg.controls && !eng.controls.some(c => c.riskId === x.id)) r.push(`${x.id}: no control documented and no absence recorded`);
      });
      eng.controls.filter(c => !c.absent).forEach(c => {
        if (!c.desc.trim()) r.push(`${c.id}: control description is empty`);
        if (!c.owner.trim()) r.push(`${c.id}: no control owner`);
        if (!c.freq) r.push(`${c.id}: frequency not set — the sample size depends on it`);
        if (c.key && !c.attrs.filter(a => a.trim()).length) r.push(`${c.id}: no test attributes`);
        if (c.planSize && !String(c.planReason || '').trim()) r.push(`${c.id}: sample size override has no reason`);
      });
      return r;
    },
    issue(eng) {
      const cfg = Engine.typeCfg(eng.scope.type), r = [];
      eng.scope.processes.forEach(id => {
        if (!eng.steps.some(s => s.sub === id)) r.push(`${KB.sub(id).name}: in scope but no process recorded — cover it, or reopen the scope and exclude it`);
        else if (!eng.risks.some(x => x.sub === id)) r.push(`${KB.sub(id).name}: in scope but no risks identified`);
      });
      if (cfg.controls && !eng.cp2) r.push('The procedure plan has not been approved');
      if (cfg.testing) eng.controls.filter(c => !c.absent).forEach(c => {
        const s = Engine.controlStatus(eng, c);
        if (!s.design) r.push(`${c.id}: test of design not concluded`);
        else if (s.eff === 'in_progress' || s.eff === 'not_started') r.push(`${c.id}: test of effectiveness not concluded`);
        const t = eng.etests[c.id];
        if (t) (t.items || []).forEach(it => { if (it.explanation && !it.corroborated && (it.res || []).includes('f') && !it.accepted) r.push(`${c.id} ${it.ref || 'item'}: explanation recorded but not corroborated or accepted as an exception`); });
      });
      eng.gaps.forEach(g => {
        const m = Engine.gapMissing(g);
        if (m.length) r.push(`${g.id}: missing ${m.join(', ')}`);
        else if (!g.cleared) r.push(`${g.id}: not yet cleared with the process owner`);
      });
      eng.topical.forEach(t => { if (!t.status) r.push(`${t.id}: topical requirement item neither assessed nor excluded`); else if (!String(t.note || '').trim()) r.push(`${t.id}: ${t.status === 'assessed' ? 'evidence reference' : 'exclusion rationale'} missing`); });
      if (!eng.report.overall) r.push('Overall rating not decided');
      if (!String(eng.report.summary || '').trim()) r.push('Executive summary is empty');
      return r;
    },
  },

  stages(eng) {
    const cfg = Engine.typeCfg(eng.scope.type), G = Engine.guards, cp1 = !!eng.cp1, out = [];
    const add = (id, label, state, reasons, info) => out.push({ id, label, state, reasons: reasons || [], info: info || '' });
    const needCp1 = ['Confirm the scope first (Checkpoint 1)'];
    const g1 = G.cp1(eng);
    add('scope', 'Scope', cp1 ? 'done' : 'active', cp1 ? [] : g1, cp1 ? `Confirmed ${eng.cp1.at.slice(0, 10)}` : 'Checkpoint 1');
    const pend = eng.requests.filter(q => q.status === 'pending' || q.status === 'incomplete').length;
    add('requests', 'Requests & documents', !cp1 ? 'locked' : pend ? 'active' : eng.requests.length ? 'done' : 'active', !cp1 ? needCp1 : [], cp1 ? `${eng.requests.length - pend}/${eng.requests.length} received · ${eng.docs.length} documents` : '');
    const gu = G.understanding(eng);
    add('understanding', 'Process understanding', !cp1 ? 'locked' : gu.length ? 'active' : 'done', !cp1 ? needCp1 : gu, cp1 ? `${eng.steps.length} steps` : '');
    const anySteps = eng.steps.length > 0, g2 = G.cp2(eng);
    add('risks', cfg.controls ? 'Risks & controls' : 'Risks', !cp1 ? 'locked' : !anySteps ? 'locked' : g2.length ? 'active' : 'done',
      !cp1 ? needCp1 : !anySteps ? ['Record the process steps first — risks are derived from the process'] : g2, `${eng.risks.length} risks${cfg.controls ? ` · ${eng.controls.length} controls` : ''}`);
    if (cfg.controls) add('plan', 'Procedure plan', eng.cp2 ? 'done' : (!cp1 || !eng.risks.length) ? 'locked' : 'active', eng.cp2 ? [] : !eng.risks.length ? ['Identify risks and controls first'] : g2, eng.cp2 ? `Approved ${eng.cp2.at.slice(0, 10)}` : 'Checkpoint 2');
    if (cfg.testing) {
      const ctl = eng.controls.filter(c => !c.absent), open = ctl.filter(c => { const s = Engine.controlStatus(eng, c); return !s.design || ['in_progress', 'not_started', 'blocked'].includes(s.eff); }).length;
      add('testing', 'Testing', !eng.cp2 ? 'locked' : open ? 'active' : 'done', !eng.cp2 ? ['Approve the procedure plan first (Checkpoint 2)'] : open ? [`${open} control(s) not yet concluded`] : [], eng.cp2 ? `${ctl.length - open}/${ctl.length} concluded` : '');
    }
    add('analysis', 'Data analysis', !cp1 ? 'locked' : 'open', !cp1 ? needCp1 : [], `${eng.analyses.length} saved`);
    if (cfg.controls) {
      const inc = eng.gaps.filter(g => Engine.gapMissing(g).length || !g.cleared).length;
      add('gaps', 'Gaps', !cp1 ? 'locked' : !eng.gaps.length ? 'open' : inc ? 'active' : 'done', !cp1 ? needCp1 : inc ? [`${inc} gap(s) incomplete or not cleared`] : [], `${eng.gaps.length} gaps`);
    }
    const gi = G.issue(eng), issued = !!eng.report.issuedAt;
    add('outputs', 'Report & outputs', !cp1 ? 'locked' : issued ? 'done' : 'open', !cp1 ? needCp1 : issued ? [] : gi, issued ? `Issued ${eng.report.issuedAt.slice(0, 10)}` : '');
    if (cfg.controls) {
      const openF = eng.gaps.filter(g => !['implemented', 'superseded'].includes((eng.followup[g.id] || {}).status)).length;
      add('followup', 'Follow-up', !issued ? 'locked' : openF ? 'active' : 'done', !issued ? ['Opens when the report is issued'] : [], issued ? `${openF} open` : '');
    }
    return out;
  },
  progress(eng) { const s = Engine.stages(eng); return Math.round(100 * s.filter(x => x.state === 'done').length / s.length); },

  /* ---------- intake ---------- */
  norm: h => String(h || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
  parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const delim = [',', ';', '\t', '|'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let cur = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { cur.push(cell); cell = ''; }
      else if (ch === '\n') { cur.push(cell); rows.push(cur); cur = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    if (cell !== '' || cur.length) { cur.push(cell); rows.push(cur); }
    const data = rows.filter(r => r.some(c => String(c).trim() !== ''));
    if (data.length < 1) return { headers: [], rows: [] };
    const headers = data[0].map((h, i) => Engine.norm(h) || 'col_' + (i + 1));
    return { headers, rows: data.slice(1).map(r => { const o = {}; headers.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); }); return o; }) };
  },
  classify(name, headers) {
    const n = name.toLowerCase(), hs = headers || [];
    let best = { t: 'Unclassified', score: 0 };
    KB.docTypes.forEach(d => {
      let s = 0;
      d.kw.forEach(k => { if (n.includes(k)) s += 0.35; });
      if (d.hd.length && hs.length) s += 0.6 * d.hd.filter(h => hs.some(x => x === h || x.includes(h))).length / d.hd.length;
      if (d.hd.length && !hs.length) s *= 0.4;   // a tabular type is unlikely for a file with no columns
      if (s > best.score) best = { t: d.t, score: s };
    });
    if (best.score === 0 && /\.(png|jpe?g|gif|webp|heic)$/i.test(name)) best = { t: 'Screenshot', score: 0.3 };
    const m = n.match(/(20\d\d)[-_ .]?(0[1-9]|1[0-2])(?!\d)/) || n.match(/(0[1-9]|1[0-2])[-_ .](20\d\d)/);
    const period = m ? (m[1].length === 4 ? `${m[1]}-${m[2]}` : `${m[2]}-${m[1]}`) : (n.match(/20\d\d/) || [''])[0];
    return { docType: best.t, conf: Math.min(0.99, Math.round(best.score * 100) / 100), period };
  },
  fieldMatch(field, headers) { const f = Engine.norm(field); return headers.some(h => h === f || (f.length > 3 && (h.includes(f) || f.includes(h)) && h.length > 3)); },
  missingFields: (fields, headers) => (fields || []).filter(f => !Engine.fieldMatch(f, headers || [])),
  suggestRequest(doc, requests) {
    let best = { id: '', score: 0 };
    const words = s => String(s).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3);
    const dw = new Set(words(doc.name + ' ' + doc.docType));
    requests.forEach(q => {
      let s = 0;
      if (q.fields.length && doc.headers && doc.headers.length) s += 0.75 * (q.fields.length - Engine.missingFields(q.fields, doc.headers).length) / q.fields.length;
      const qw = words(q.item); const hit = qw.filter(w => dw.has(w) || [...dw].some(d => d.startsWith(w.slice(0, 5)))).length;
      if (qw.length) s += 0.45 * hit / qw.length;
      if (q.fields.length && !(doc.headers && doc.headers.length)) s *= 0.6;
      if (s > best.score) best = { id: q.id, score: s };
    });
    return { id: best.id, conf: Math.min(0.99, Math.round(best.score * 100) / 100) };
  },
  async hash(buf) {
    try { const d = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }
    catch (e) { let h = 2166136261; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 16777619); } return 'fnv-' + (h >>> 0).toString(16); }
  },

  /* ---------- analysis ---------- */
  num: v => { const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; },
  key: (row, keys) => keys.map(k => String(row[k] ?? '').trim().toUpperCase()).join(' | '),
  reconcile(sources, tol) {
    const maps = sources.map(s => { const m = new Map(); s.rows.forEach(r => { const k = Engine.key(r, s.keys); const e = m.get(k) || { sum: 0, n: 0 }; e.sum += Engine.num(r[s.amount]); e.n++; m.set(k, e); }); return m; });
    const all = new Set(); maps.forEach(m => m.forEach((v, k) => all.add(k)));
    const res = { matched: 0, exceptions: [], missing: [], total: all.size, diffTotal: 0 };
    all.forEach(k => {
      const vals = maps.map(m => m.get(k));
      if (vals.some(v => !v)) { res.missing.push({ key: k, vals: vals.map(v => v ? v.sum : null) }); return; }
      const nums = vals.map(v => Math.round(v.sum * 100) / 100), d = Math.round((Math.max(...nums) - Math.min(...nums)) * 100) / 100;
      if (d > tol) { res.exceptions.push({ key: k, vals: nums, diff: Math.round((nums[nums.length - 1] - nums[0]) * 100) / 100 }); res.diffTotal += Math.abs(nums[nums.length - 1] - nums[0]); }
      else res.matched++;
    });
    res.diffTotal = Math.round(res.diffTotal * 100) / 100;
    res.exceptions.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    return res;
  },
  duplicates(rows, cols) {
    const m = new Map();
    rows.forEach((r, i) => { const k = Engine.key(r, cols); if (!k.replace(/[ |]/g, '')) return; (m.get(k) || m.set(k, []).get(k)).push(i + 2); });
    return [...m.entries()].filter(e => e[1].length > 1).map(e => ({ key: e[0], count: e[1].length, lines: e[1] })).sort((a, b) => b.count - a.count);
  },
  nearThreshold(rows, col, thr, pct) {
    const lo = thr * (1 - pct / 100);
    return rows.map((r, i) => ({ line: i + 2, v: Engine.num(r[col]), row: r })).filter(x => x.v >= lo && x.v < thr);
  },
  rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; },
  pick(n, k, seed) { const r = Engine.rng(seed), idx = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } return idx.slice(0, Math.min(k, n)).sort((a, b) => a - b); },

  /* ---------- quality: the file scored against explicit rules ---------- */
  quality(eng) {
    const cfg = Engine.typeCfg(eng.scope.type), out = [];
    const rule = (name, stage, applicable, bad) => { if (applicable) out.push({ name, stage, ok: !bad.length, items: bad }); };
    rule('Scope names its exclusions', 'scope', true, (eng.scope.exclusions.length || eng.scope.noExclusions) ? [] : ['No exclusions recorded']);
    rule('Received requests have a document tied to them', 'requests', eng.requests.length > 0, eng.requests.filter(q => q.status === 'received' && !eng.docs.some(d => d.requestId === q.id)).map(q => q.item));
    rule('Every document records its source strength', 'requests', eng.docs.length > 0, eng.docs.filter(d => !d.strength).map(d => d.name));
    rule('Every in-scope sub-process is understood and confirmed', 'understanding', !!eng.cp1, Engine.guards.understanding(eng));
    rule('Process steps name a role and an evidence trail', 'understanding', eng.steps.length > 0, eng.steps.filter(s => !s.actor.trim() || !s.evidence.trim()).map(s => `${KB.sub(s.sub).name} step ${s.n}`));
    rule('Every risk has a distinct root cause, an impact and an owner', 'risks', eng.risks.length > 0, eng.risks.filter(r => !r.cause || !String(r.impact).trim() || !String(r.owner).trim() || Engine.norm(r.cause) === Engine.norm(r.desc)).map(r => r.id));
    rule('Every risk is rated', 'risks', eng.risks.length > 0, eng.risks.filter(r => !r.L || !r.I).map(r => r.id));
    const live = eng.controls.filter(c => !c.absent);
    rule('Every control has an owner, a frequency and test attributes', 'risks', cfg.controls && live.length > 0, live.filter(c => !c.owner.trim() || !c.freq || !c.attrs.filter(a => a.trim()).length).map(c => c.id));
    const concluded = live.filter(c => (eng.dtests[c.id] || {}).conclusion);
    rule('Design conclusions rest on a dated walkthrough', 'testing', concluded.length > 0, concluded.filter(c => { const d = eng.dtests[c.id]; return !String(d.walkthrough || '').trim() || !d.date; }).map(c => c.id));
    const seen = {}; concluded.forEach(c => (eng.dtests[c.id].factors || []).forEach(f => { const k = Engine.norm(f); if (k.length > 12) (seen[k] = seen[k] || new Set()).add(c.id); }));
    const boiler = new Set(); Object.values(seen).forEach(s => { if (s.size >= 3) s.forEach(id => boiler.add(id)); });
    rule('Design factors are specific, not the same sentences on every control', 'testing', concluded.length >= 3, [...boiler]);
    const tested = live.filter(c => ((eng.etests[c.id] || {}).items || []).length);
    rule('Every effectiveness test states its population and completeness basis', 'testing', tested.length > 0, tested.filter(c => { const t = eng.etests[c.id]; return !t.popCount || !t.completeness || (t.completeness === 'reconciled' && !String(t.completenessBasis || '').trim()); }).map(c => c.id));
    const wps = []; concluded.forEach(c => wps.push([c.id + ' design', eng.dtests[c.id]])); tested.forEach(c => wps.push([c.id + ' effectiveness', eng.etests[c.id]]));
    rule('Working papers are reviewed by someone other than the preparer', 'testing', wps.length > 0, wps.filter(w => !w[1].reviewer || w[1].reviewer === w[1].preparer).map(w => w[0]));
    rule('Gaps carry root cause, rating, owner and date', 'gaps', eng.gaps.length > 0, eng.gaps.filter(g => Engine.gapMissing(g).length).map(g => g.id));
    const today = Engine.today(), badDates = [];
    concluded.forEach(c => { const d = eng.dtests[c.id]; if (d.date && (d.date > today || (eng.cp1 && d.date < eng.cp1.at.slice(0, 10)))) badDates.push(`${c.id}: walkthrough dated ${d.date}`); });
    eng.gaps.forEach(g => { if (g.due && g.createdAt && g.due < g.createdAt.slice(0, 10)) badDates.push(`${g.id}: target date precedes the finding`); });
    rule('Dates are possible', 'overview', concluded.length + eng.gaps.length > 0, badDates);
    const pass = out.filter(x => x.ok).length;
    return { score: out.length ? Math.round(100 * pass / out.length) : null, rules: out };
  },

  proposeOverall(eng, meth) {
    const high = eng.gaps.filter(g => g.rating === 'High').length, mod = eng.gaps.filter(g => g.rating === 'Moderate').length;
    const o = meth.overall;
    if (high >= 2) return { v: o[2], why: `${high} high-rated gaps` };
    if (high === 1 || mod >= 2) return { v: o[1], why: high ? '1 high-rated gap' : `${mod} moderate gaps` };
    return { v: o[0], why: eng.gaps.length ? 'no high-rated gaps' : 'no gaps raised' };
  },
};

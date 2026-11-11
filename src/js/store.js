/* State, persistence and the operations that change an engagement. Every operation writes the audit trail. */
const STORE_KEY = 'throughline.v1';
let S = null;

const Store = {
  fresh() {
    return { v: 1, users: [{ id: 'u1', name: 'A. Rahman', role: 'Engagement lead' }, { id: 'u2', name: 'S. Haddad', role: 'Senior auditor' }], userId: 'u1',
      meth: JSON.parse(JSON.stringify(DEFAULT_METH)), engs: [], ui: { view: 'home', engId: '', stage: 'overview' } };
  },
  load() {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) { const s = JSON.parse(raw); if (s && s.v === 1) { S = s; S.ui = Object.assign({ view: 'home', engId: '', stage: 'overview' }, S.ui || {}); S.ui.modal = null; return false; } } } catch (e) {}
    S = Store.fresh(); return true;
  },
  save() {
    const ui = { view: S.ui.view, engId: S.ui.engId, stage: S.ui.stage, sub: S.ui.sub, ctl: S.ui.ctl };
    const snap = Object.assign({}, S, { ui });
    try { localStorage.setItem(STORE_KEY, JSON.stringify(snap)); Store.memOnly = false; }
    catch (e) {
      try { const slim = JSON.parse(JSON.stringify(snap)); slim.engs.forEach(en => en.docs.forEach(d => { if (d.rows && d.rows.length > 400) { d.rowsDropped = d.rows.length; d.rows = d.rows.slice(0, 400); } if (d.text && d.text.length > 3000) d.text = d.text.slice(0, 3000); })); localStorage.setItem(STORE_KEY, JSON.stringify(slim)); } catch (e2) {}
      Store.memOnly = true;
    }
  },
  reset() { try { localStorage.removeItem(STORE_KEY); } catch (e) {} S = Store.fresh(); },
};
const me = () => S.users.find(u => u.id === S.userId) || S.users[0];
const E = () => S.engs.find(e => e.id === S.ui.engId);
const subName = id => (KB.sub(id) || { name: id }).name;

const Ops = {
  id(eng, p) { eng.seq[p] = (eng.seq[p] || 0) + 1; return p + '-' + String(eng.seq[p]).padStart(2, '0'); },
  log(eng, a, d) { eng.trail.push({ t: new Date().toISOString(), u: me().name, a, d: d || '' }); },

  newEngagement() {
    const eng = { id: 'E-' + Date.now().toString(36).toUpperCase().slice(-5), sample: false, createdAt: new Date().toISOString(), seq: {},
      scope: { client: '', name: '', type: 'full', objective: '', periodFrom: '', periodTo: '', entities: '', framework: 'coso2013', standard: 'gias2024', reader: '', processes: [], exclusions: [], noExclusions: false },
      cp1: null, cp2: null, itgc: { status: 'pending', note: '' }, requests: [], docs: [], subs: {}, steps: [], risks: [], dismissed: [], controls: [],
      dtests: {}, etests: {}, analyses: [], gaps: [], topical: [], report: { overall: '', summary: '', limitations: '', issuedAt: '', issuedBy: '' }, followup: {}, trail: [] };
    S.engs.unshift(eng); Ops.log(eng, 'Engagement created');
    return eng;
  },

  /* ----- scope (Checkpoint 1) ----- */
  confirmScope(eng) {
    if (Engine.guards.cp1(eng).length) return false;
    eng.cp1 = { by: me().name, at: new Date().toISOString() };
    Ops.deriveRequests(eng);
    eng.scope.processes.forEach(id => { eng.subs[id] = eng.subs[id] || { noProcedure: false, confirmedBy: '', confirmedAt: '', walkthrough: '' }; });
    const itIn = eng.scope.processes.some(id => KB.sub(id).process === 'itgc');
    if (itIn && !eng.topical.length) eng.topical = KB.topical.cyber.items.map(i => ({ id: i.id, status: '', note: '' }));
    if (!itIn) eng.topical = [];
    Lib.refile(eng);
    Ops.log(eng, 'Checkpoint 1 — scope confirmed', `${eng.scope.processes.length} sub-processes in scope · ${eng.requests.length} requests derived`);
    return true;
  },
  reopenScope(eng, reason) { eng.cp1 = null; Ops.log(eng, 'Scope reopened', reason); },
  deriveRequests(eng) {
    const due = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    eng.scope.processes.forEach(sid => KB.sub(sid).requests.forEach(q => {
      if (eng.requests.some(x => x.item === q.item)) return;
      eng.requests.push({ id: Ops.id(eng, 'Q'), item: q.item, form: q.form, fields: q.fields.slice(), feeds: q.feeds, sub: sid, owner: '', due, status: 'pending', naReason: '', missing: [], derived: true });
    }));
  },

  /* ----- documents ----- */
  async ingest(eng, name, size, mime, text, buf, extra) {
    const doc = { id: Ops.id(eng, 'D'), name, size, mime: mime || '', uploadedAt: new Date().toISOString(), by: me().name, headers: [], rows: null, strength: '', requestId: '', tieConf: 0 };
    if (text != null) { const p = Engine.parseCSV(text); if (p.headers.length > 1 && p.rows.length) { doc.headers = p.headers; doc.rows = p.rows; } }
    if (extra) { if (extra.text && !doc.rows) doc.text = extra.text.slice(0, 15000); ['pages', 'sheets', 'sheet', 'note'].forEach(k => { if (extra[k]) doc[k] = extra[k]; }); }
    Object.assign(doc, Engine.classify(name, doc.headers, doc.text));
    doc.hash = buf ? await Engine.hash(buf) : '';
    const sug = Engine.suggestRequest(doc, eng.requests.filter(q => q.status !== 'na'));
    doc.tieConf = sug.conf;
    eng.docs.push(doc);
    Ops.log(eng, 'Document received', `${name} · classified as ${doc.docType} (${Math.round(doc.conf * 100)}%)`);
    if (sug.id && sug.conf >= 0.5) Ops.tie(eng, doc, sug.id, true);
    return doc;
  },
  tie(eng, doc, requestId, auto) {
    const prev = doc.requestId; doc.requestId = requestId || '';
    if (!auto) doc.tieConf = 1;
    [prev, requestId].filter(Boolean).forEach(id => Ops.refreshRequest(eng, eng.requests.find(q => q.id === id)));
    if (requestId) Ops.log(eng, auto ? 'Document tied automatically' : 'Document tied', `${doc.name} → ${(eng.requests.find(q => q.id === requestId) || {}).item}`);
  },
  refreshRequest(eng, q) {
    if (!q || q.status === 'na') return;
    const docs = eng.docs.filter(d => d.requestId === q.id);
    if (!docs.length) { q.status = 'pending'; q.missing = []; return; }
    const tabular = docs.filter(d => d.rows);
    if (q.fields.length && tabular.length) { q.missing = tabular.map(d => Engine.missingFields(q.fields, d.headers)).sort((a, b) => a.length - b.length)[0]; q.status = q.missing.length ? 'incomplete' : 'received'; }
    else if (q.fields.length) { q.missing = ['not in the required tabular form']; q.status = 'incomplete'; }
    else { q.missing = []; q.status = 'received'; }
  },
  removeDoc(eng, id) { const d = eng.docs.find(x => x.id === id); if (!d) return; eng.docs = eng.docs.filter(x => x.id !== id); Ops.refreshRequest(eng, eng.requests.find(q => q.id === d.requestId)); Ops.log(eng, 'Document removed', d.name); },

  /* ----- understanding ----- */
  addStep(eng, sub, init) {
    const n = eng.steps.filter(s => s.sub === sub).length + 1;
    const st = Object.assign({ id: Ops.id(eng, 'S'), sub, n, actor: '', action: '', system: '', review: '', approval: '', evidence: '', walked: false, docId: '' }, init || {});
    eng.steps.push(st); return st;
  },
  renumber(eng, sub) { eng.steps.filter(s => s.sub === sub).sort((a, b) => a.n - b.n).forEach((s, i) => { s.n = i + 1; }); },
  stepFlags(s) {
    const f = [], a = Engine.norm(s.actor);
    if (!s.review.trim() && !s.approval.trim()) f.push('No reviewer or approver');
    if (a && (a === Engine.norm(s.approval) || a === Engine.norm(s.review))) f.push('Same role performs and checks');
    if (!s.evidence.trim()) f.push('No evidence retained');
    return f;
  },

  /* ----- risks & controls ----- */
  acceptLib(eng, sub, libId) {
    const L = KB.libRisk(libId); if (!L) return null;
    const r = { id: Ops.id(eng, 'R'), sub, stepId: '', title: L.title, desc: L.desc, cause: L.cause, impact: L.impact || '', cat: L.cat, fraud: !!L.fraud, owner: '', L: 0, I: 0, source: 'library', libId, principle: L.principle, assertion: L.assertion };
    eng.risks.push(r); Ops.log(eng, 'Risk accepted from library', `${r.id} ${r.title} (${libId})`); return r;
  },
  addRisk(eng, sub, init) {
    const r = Object.assign({ id: Ops.id(eng, 'R'), sub, stepId: '', title: '', desc: '', cause: '', impact: '', cat: 'Operational', fraud: false, owner: '', L: 0, I: 0, source: 'manual', libId: '', principle: 10, assertion: '' }, init || {});
    eng.risks.push(r); Ops.log(eng, 'Risk added', r.id); return r;
  },
  removeRisk(eng, id) {
    eng.controls.filter(c => c.riskId === id).forEach(c => Ops.removeControl(eng, c.id, true));
    eng.risks = eng.risks.filter(r => r.id !== id); Ops.log(eng, 'Risk removed', id);
  },
  addControl(eng, riskId, fromLib) {
    const r = eng.risks.find(x => x.id === riskId), L = fromLib && r.libId ? (KB.libRisk(r.libId) || {}).ctl : null;
    const c = { id: Ops.id(eng, 'C'), riskId, absent: false, desc: L ? L.desc : '', owner: L ? L.owner : '', nature: L ? L.nature : 'Preventive', type: L ? L.type : 'Manual',
      freq: L ? L.freq : '', key: true, itDep: L ? !!L.itDep : false, principle: r.principle, assertion: r.assertion, attrs: L ? L.attrs.slice() : [''], planSize: 0, planReason: '', fromLib: !!L };
    eng.controls.push(c);
    if (L && L.plan) eng.dtests[c.id] = Ops.blankD({ plan: L.plan });
    Ops.log(eng, 'Control documented', `${c.id} for ${riskId}${L ? ' (started from the expected control)' : ''}`); return c;
  },
  recordAbsence(eng, riskId) {
    const r = eng.risks.find(x => x.id === riskId);
    const c = { id: Ops.id(eng, 'C'), riskId, absent: true, desc: 'None — no control exists for this risk.', owner: '', nature: '', type: '', freq: '', key: false, itDep: false, principle: r.principle, assertion: r.assertion, attrs: [], planSize: 0, planReason: '' };
    eng.controls.push(c);
    Ops.ensureGap(eng, 'absence:' + c.id, { controlId: c.id, title: `No control over: ${r.title}`, desc: `No control exists to address the risk that ${lower1(r.desc)} The inherent rating stands as the residual rating.`, cause: r.cause, criterion: criterionFor(r) });
    Ops.log(eng, 'Absence recorded', `${c.id}: no control exists for ${riskId}`); return c;
  },
  removeControl(eng, id, quiet) {
    eng.controls = eng.controls.filter(c => c.id !== id); delete eng.dtests[id]; delete eng.etests[id];
    ['absence:', 'design:', 'toe:'].forEach(p => Ops.dropGap(eng, p + id));
    if (!quiet) Ops.log(eng, 'Control removed', id);
  },
  blankD: o => Object.assign({ plan: '', walkthrough: '', date: '', docIds: [], factors: ['', '', '', '', ''], conclusion: '', failReason: '', preparer: '', reviewer: '', reviewedAt: '' }, o || {}),
  blankE: o => Object.assign({ popCount: 0, popSource: '', datasetId: '', completeness: '', completenessBasis: '', seed: 0, items: [], preparer: '', reviewer: '', reviewedAt: '' }, o || {}),
  dt(eng, cid) { return eng.dtests[cid] || (eng.dtests[cid] = Ops.blankD()); },
  et(eng, cid) { return eng.etests[cid] || (eng.etests[cid] = Ops.blankE()); },

  /* ----- plan (Checkpoint 2) ----- */
  approvePlan(eng) { if (Engine.guards.cp2(eng).length) return false; eng.cp2 = { by: me().name, at: new Date().toISOString() }; Ops.log(eng, 'Checkpoint 2 — procedure plan approved', `${eng.controls.filter(c => !c.absent).length} controls to test`); return true; },
  reopenPlan(eng, reason) { eng.cp2 = null; Ops.log(eng, 'Procedure plan reopened', reason); },

  /* ----- testing ----- */
  designBlockers(eng, c) {
    const d = Ops.dt(eng, c.id), r = [];
    if (!String(d.walkthrough).trim()) r.push('Walkthrough narrative is empty');
    if (!d.date) r.push('Walkthrough date is missing');
    if (d.factors.some(f => !String(f).trim())) r.push('All five design factors need an answer (state "not applicable" with the reason where it is)');
    if (c.itDep && Engine.itgc(eng).status === 'failed') r.push('IT general controls have failed — this control depends on them and fails by design');
    return r;
  },
  concludeDesign(eng, c, result, reason) {
    const d = Ops.dt(eng, c.id); d.conclusion = result; d.failReason = result === 'fail' ? reason : ''; d.preparer = me().name; d.reviewer = ''; d.reviewedAt = '';
    const r = eng.risks.find(x => x.id === c.riskId);
    if (result === 'fail') Ops.ensureGap(eng, 'design:' + c.id, { controlId: c.id, title: `Design of ${c.id} does not address the risk`, desc: `The control as described would not prevent or detect the risk. ${reason}`, cause: r.cause, criterion: criterionFor(r) });
    else Ops.dropGap(eng, 'design:' + c.id);
    Ops.log(eng, `Test of design concluded — ${result.toUpperCase()}`, `${c.id}${reason ? ': ' + reason : ''}`);
  },
  resetDesign(eng, c, reason) { const d = Ops.dt(eng, c.id); d.conclusion = ''; d.reviewer = ''; Ops.dropGap(eng, 'design:' + c.id); Ops.log(eng, 'Design conclusion withdrawn', `${c.id}: ${reason}`); },
  selectSample(eng, c) {
    const t = Ops.et(eng, c.id), plan = Engine.plannedSize(eng, c, S.meth);
    if (!t.popCount || !plan.size) return false;
    t.seed = Math.floor(Math.random() * 1e9); t.preparer = me().name;
    const ds = eng.docs.find(d => d.id === t.datasetId && d.rows);
    const idx = Engine.pick(ds ? ds.rows.length : t.popCount, plan.size, t.seed);
    t.items = idx.map(i => ({ ref: ds ? Ops.rowRef(ds, i) : `Item ${i + 1} of ${t.popCount}`, line: i + 1, res: [], note: '', evidence: '', explanation: '', corroborated: false, accepted: false, ext: false }));
    Ops.log(eng, 'Sample selected', `${c.id}: ${t.items.length} of ${t.popCount} · ${plan.basis} · seed ${t.seed}`); return true;
  },
  rowRef(ds, i) { const r = ds.rows[i]; return ds.headers.slice(0, 3).map(h => r[h]).filter(Boolean).join(' · ') || `Row ${i + 2}`; },
  extendSample(eng, c) {
    const t = Ops.et(eng, c.id), plan = Engine.plannedSize(eng, c, S.meth), add = plan.extend || 1;
    const ds = eng.docs.find(d => d.id === t.datasetId && d.rows), total = ds ? ds.rows.length : t.popCount;
    const used = new Set(t.items.map(i => i.line)), pool = Engine.pick(total, total, t.seed + 7).filter(i => !used.has(i + 1)).slice(0, add);
    if (!pool.length) return 0;
    pool.forEach(i => t.items.push({ ref: ds ? Ops.rowRef(ds, i) : `Item ${i + 1} of ${t.popCount}`, line: i + 1, res: [], note: '', evidence: '', explanation: '', corroborated: false, accepted: false, ext: true }));
    Ops.log(eng, 'Sample extended', `${c.id}: +${pool.length} items to size the issue — conclusion unaffected`); return pool.length;
  },
  setResult(eng, c, i, a, v) {
    const t = Ops.et(eng, c.id), it = t.items[i]; while (it.res.length < c.attrs.length) it.res.push('');
    it.res[a] = v; t.preparer = t.preparer || me().name; t.reviewer = ''; Ops.syncToeGap(eng, c);
  },
  syncToeGap(eng, c) {
    const t = Ops.et(eng, c.id), st = Engine.toe(t, c.attrs.length), r = eng.risks.find(x => x.id === c.riskId);
    if (st.status !== 'ineffective') { Ops.dropGap(eng, 'toe:' + c.id); return; }
    const failed = new Set(); t.items.forEach(it => (it.res || []).forEach((v, a) => { if (v === 'f') failed.add(a); }));
    const facts = `In ${st.fails} of ${st.n} items tested, the control did not operate as described. Attribute(s) not met: ${[...failed].map(a => `"${c.attrs[a]}"`).join('; ')}.`;
    const g = Ops.ensureGap(eng, 'toe:' + c.id, { controlId: c.id, title: `${c.id} did not operate consistently`, desc: facts, cause: r.cause, criterion: criterionFor(r) });
    g.facts = facts;
  },
  review(eng, kind, cid) {
    const w = kind === 'd' ? Ops.dt(eng, cid) : Ops.et(eng, cid);
    if (!w.preparer || w.preparer === me().name) return false;
    w.reviewer = me().name; w.reviewedAt = new Date().toISOString(); Ops.log(eng, 'Working paper reviewed', `${cid} ${kind === 'd' ? 'design' : 'effectiveness'}`); return true;
  },

  /* ----- gaps ----- */
  ensureGap(eng, key, init) {
    let g = eng.gaps.find(x => x.key === key);
    if (g) return g;
    g = Object.assign({ id: Ops.id(eng, 'G'), key, controlId: '', title: '', desc: '', cause: '', rating: '', criterion: '', recommendation: '', response: '', owner: '', due: '', cleared: false, clearedWith: '', clearedAt: '', createdAt: new Date().toISOString() }, init);
    eng.gaps.push(g); Ops.log(eng, 'Gap raised', `${g.id}: ${g.title}`); return g;
  },
  dropGap(eng, key) {
    const g = eng.gaps.find(x => x.key === key); if (!g) return;
    if (g.cleared || String(g.response).trim()) { g.stale = true; return; }
    eng.gaps = eng.gaps.filter(x => x !== g); delete eng.followup[g.id]; Ops.log(eng, 'Gap withdrawn', `${g.id}: its cause no longer stands`);
  },

  /* ----- report ----- */
  issue(eng) { if (Engine.guards.issue(eng).length) return false; eng.report.issuedAt = new Date().toISOString(); eng.report.issuedBy = me().name; eng.gaps.forEach(g => { eng.followup[g.id] = eng.followup[g.id] || { status: 'open', evidence: '', note: '', revisedDue: '' }; }); Ops.log(eng, 'Report issued', `Overall rating: ${eng.report.overall} · ${eng.gaps.length} findings`); return true; },
};
const lower1 = s => { s = String(s || '').trim(); return s ? s[0].toLowerCase() + s.slice(1) : ''; };
const criterionFor = r => `COSO Principle ${r.principle} — ${KB.coso.principles[r.principle] || ''}`;

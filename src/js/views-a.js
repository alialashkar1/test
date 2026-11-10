/* Screens: engagements, overview, scope, requests & documents, process understanding, knowledge base, methodology. */
const typeName = id => (KB.types.find(t => t.id === id) || { name: id }).name;
const stageNode = s => `<div class="node sdot sd-${s.state}" style="width:30px;height:30px;border-radius:8px">${s.state === 'done' ? IC.check : s.state === 'locked' ? IC.lock : s.state === 'active' ? IC.clock : ''}</div>`;

/* ---------- engagements ---------- */
Views.home = () => {
  const head = `<div class="page-head"><div><h1>Engagements</h1></div><div class="acts">${btn('Load sample engagement', 'load-sample', { cls: 'ghost' })}${btn('New engagement', 'new-eng', { cls: 'primary', icon: IC.plus })}</div></div>`;
  if (!S.engs.length) return head + empty('No engagements yet', 'Create an engagement to confirm its scope, or load the sample to see a file in mid-fieldwork.', btn('New engagement', 'new-eng', { cls: 'primary', icon: IC.plus }));
  const open = S.engs.filter(e => !e.report.issuedAt), gaps = S.engs.flatMap(e => e.gaps), pend = S.engs.flatMap(e => e.requests).filter(q => q.status === 'pending' || q.status === 'incomplete');
  const qs = S.engs.map(e => Engine.quality(e).score).filter(x => x != null);
  return head + `<div class="stats">
      <div class="stat"><div class="lbl">In progress</div><div class="val">${open.length}<small> / ${S.engs.length}</small></div><div class="sub">engagements</div></div>
      <div class="stat"><div class="lbl">Gaps raised</div><div class="val">${gaps.length}<small> · ${gaps.filter(g => g.rating === 'High').length} high</small></div><div class="sub">${gaps.filter(g => !g.rating).length} not yet rated</div></div>
      <div class="stat"><div class="lbl">Requests outstanding</div><div class="val">${pend.length}</div><div class="sub">pending or incomplete</div></div>
      <div class="stat"><div class="lbl">File quality</div><div class="val">${qs.length ? Math.round(qs.reduce((a, b) => a + b, 0) / qs.length) + '<small>%</small>' : '—'}</div><div class="sub">average across files</div></div>
    </div><div class="h-sec"><h2>All engagements</h2><span class="line"></span></div><div class="stack">${S.engs.map(e => {
    const st = Engine.stages(e), cur = st.find(s => s.state === 'active') || st.find(s => s.state === 'open');
    return `<article class="card eng"><div><div class="row"><h3>${esc(e.scope.name || 'Untitled engagement')}</h3>${chip('prim', typeName(e.scope.type))}${e.report.issuedAt ? chip('good', 'Issued') : cur ? chip('warn', cur.label) : ''}${e.sample ? chip('mut', 'Sample data', false) : ''}</div>
      <div class="meta"><span>Client <b>${esc(e.scope.client || '—')}</b></span><span>Period <b>${e.scope.periodFrom ? esc(e.scope.periodFrom + ' → ' + e.scope.periodTo) : '—'}</b></span><span>${e.risks.length} risks · ${e.controls.length} controls · ${e.gaps.length} gaps</span></div>
      <div class="pipe">${st.map(s => `<i class="${s.state === 'done' ? 'done' : s.state === 'active' ? 'active' : ''}" title="${esc(s.label)}"></i>`).join('')}</div></div>
      <div class="row"><span class="tag">${esc(e.id)}</span>${btn('Open', 'open', { cls: 'primary sm', data: { id: e.id } })}<button class="icon-btn" data-act="del-eng" data-id="${e.id}" title="Delete engagement" aria-label="Delete">${IC.trash}</button></div></article>`;
  }).join('')}</div>`;
};
Act['new-eng'] = () => { const e = Ops.newEngagement(); S.ui.engId = e.id; resetView(); go('eng', 'scope'); };
Act['load-sample'] = async () => { UI.busy = 'Building the sample engagement…'; render(); const e = await Seed.engagement(); UI.busy = ''; S.ui.engId = e.id; resetView(); go('eng', 'overview'); };
Act['del-eng'] = d => ask({ title: 'Delete this engagement?', text: 'The engagement and its working papers are removed from this browser. This cannot be undone.', ok: 'Delete', danger: true }, () => { S.engs = S.engs.filter(e => e.id !== d.id); });

/* ---------- overview ---------- */
Views.overview = eng => {
  const st = Engine.stages(eng), q = Engine.quality(eng), pend = eng.requests.filter(r => r.status === 'pending' || r.status === 'incomplete').length;
  const fail = q.rules.filter(r => !r.ok);
  return `<div class="page-head"><div><h1>${esc(eng.scope.name || 'Untitled engagement')}</h1><div class="sub">${esc(eng.scope.client || 'No client yet')} · ${esc(typeName(eng.scope.type))}${eng.scope.periodFrom ? ` · ${esc(eng.scope.periodFrom)} → ${esc(eng.scope.periodTo)}` : ''}</div></div></div>
    <div class="stats"><div class="stat"><div class="lbl">Progress</div><div class="val">${Engine.progress(eng)}<small>%</small></div><div class="sub">${st.filter(s => s.state === 'done').length} of ${st.length} stages complete</div></div>
      <div class="stat"><div class="lbl">File quality</div><div class="val">${q.score == null ? '—' : q.score + '<small>%</small>'}</div><div class="sub">${fail.length ? fail.length + ' rule(s) failing' : 'all rules pass'}</div></div>
      <div class="stat"><div class="lbl">Requests</div><div class="val">${eng.requests.length - pend}<small> / ${eng.requests.length}</small></div><div class="sub">${pend} outstanding</div></div>
      <div class="stat"><div class="lbl">Gaps</div><div class="val">${eng.gaps.length}<small> · ${eng.gaps.filter(g => g.rating === 'High').length} high</small></div><div class="sub">${eng.gaps.filter(g => !g.cleared).length} not cleared</div></div></div>
    <div class="split" style="grid-template-columns:1fr 380px;margin-top:16px"><div class="stack">
      <div class="card" style="padding:8px">${st.map(s => `<button class="stage" data-act="stage" data-stage="${s.id}">${stageNode(s)}<div><div class="sn">${esc(s.label)}</div>${s.reasons.length ? `<div class="sr">${esc(s.reasons[0])}${s.reasons.length > 1 ? ` <span class="faint">+${s.reasons.length - 1} more</span>` : ''}</div>` : ''}</div><div class="xs faint" style="white-space:nowrap">${esc(s.info)}</div></button>`).join('')}</div>
    </div><div class="stack">
      <div class="card pad"><div class="row" style="margin-bottom:8px"><h3 style="font-size:14px">File quality</h3><span class="sp"></span>${q.score != null ? chip(q.score >= 85 ? 'good' : q.score >= 60 ? 'warn' : 'crit', q.score + '%') : ''}</div>
        ${q.rules.map(r => `<div class="row small" style="align-items:flex-start;padding:5px 0;border-top:1px solid var(--border);flex-wrap:nowrap"><span class="sdot sd-${r.ok ? 'done' : 'active'}" style="margin-top:2px">${r.ok ? IC.check : '!'}</span><div style="min-width:0"><button class="btn ghost sm" style="padding:0;white-space:normal;text-align:left;font-weight:${r.ok ? 400 : 600}" data-act="stage" data-stage="${r.stage}">${esc(r.name)}</button>${r.ok ? '' : `<div class="xs muted">${esc(r.items.slice(0, 3).join(' · '))}${r.items.length > 3 ? ` +${r.items.length - 3}` : ''}</div>`}</div></div>`).join('') || '<p class="small muted">Rules are scored as the file fills in.</p>'}</div>
      <div class="card pad"><h3 style="font-size:14px;margin-bottom:8px">Recent activity</h3>${eng.trail.slice(-7).reverse().map(t => `<div class="small" style="padding:4px 0;border-top:1px solid var(--border)"><b style="font-weight:600">${esc(t.a)}</b> <span class="muted">${esc(t.d)}</span><div class="xs faint">${esc(t.u)} · ${fmtDT(t.t)}</div></div>`).join('')}</div>
    </div></div>`;
};

/* ---------- scope (Checkpoint 1) ---------- */
Views.scope = eng => {
  const s = eng.scope, lock = !!eng.cp1, g = Engine.guards.cp1(eng), o = { dis: lock };
  return `<div class="page-head"><div><h1>Scope</h1><div class="sub">Checkpoint 1 — nothing is derived until the scope is confirmed.</div></div><div class="acts">${lock ? btn('Reopen scope', 'reopen-scope') : ''}</div></div>
    ${lock ? banner('good', `<b>Confirmed</b> by ${esc(eng.cp1.by)} on ${fmtDate(eng.cp1.at)}. The request list was derived from these sub-processes.`) : ''}
    <div class="stack" style="margin-top:14px"><div class="card pad"><div class="form-grid">
      ${fld('Client', inp('', '', 'scope.client', s.client, o))}${fld('Engagement name', inp('', '', 'scope.name', s.name, o))}
      ${fld('Engagement type', sel('', '', 'scope.type', s.type, KB.types.map(t => [t.id, t.name + (t.on ? '' : ' — engine not in this build'), !t.on]), o))}
      ${fld('Period from', inp('', '', 'scope.periodFrom', s.periodFrom, { type: 'date', dis: lock }))}${fld('Period to', inp('', '', 'scope.periodTo', s.periodTo, { type: 'date', dis: lock }))}
      ${fld('Entities & locations', inp('', '', 'scope.entities', s.entities, { dis: lock, ph: 'e.g. Head office; Plant 2' }))}
      ${fld('Control framework', sel('', '', 'scope.framework', s.framework, KB.frameworks.map(f => [f.id, f.name]), o))}
      ${fld('Professional standard', sel('', '', 'scope.standard', s.standard, KB.standards.map(f => [f.id, f.name]), o))}
      ${fld('Report addressee', inp('', '', 'scope.reader', s.reader, { dis: lock, ph: 'e.g. Audit committee' }))}</div>
      <div style="margin-top:12px">${fld('Objective', ta('', '', 'scope.objective', s.objective, { dis: lock, rows: 2, ph: 'What this engagement is for, in one or two sentences' }))}</div></div>
    <div><div class="h-sec" style="margin-top:4px"><h2>Processes in scope</h2><span class="hint">${s.processes.length} sub-processes selected</span><span class="line"></span></div>
      <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(290px,1fr))">${KB.processes.map(p => { const n = p.subs.filter(x => s.processes.includes(x.id)).length; return `<div class="card pad"><div class="row" style="margin-bottom:8px"><h3 style="font-size:13.5px">${esc(p.name)}</h3><span class="sp"></span><span class="xs faint">${n}/${p.subs.length}</span>${lock ? '' : `<button class="btn ghost sm" data-act="all-subs" data-p="${p.id}">${n === p.subs.length ? 'Clear' : 'All'}</button>`}</div>
        <div class="stack" style="gap:6px">${p.subs.map(x => `<label class="chk"><input type="checkbox" data-change="toggle-sub" data-sub="${x.id}" ${s.processes.includes(x.id) ? 'checked' : ''} ${lock ? 'disabled' : ''}>${esc(x.name)}</label>`).join('')}</div></div>`; }).join('')}</div></div>
    <div class="card pad"><div class="row" style="margin-bottom:10px"><h3 style="font-size:14px">Out of scope</h3><span class="sp"></span>${lock ? '' : btn('Add exclusion', 'add-excl', { cls: 'sm', icon: IC.plus })}</div>
      ${s.exclusions.map((x, i) => `<div class="row" style="margin-bottom:7px;flex-wrap:nowrap">${inp('', '', `scope.exclusions.${i}.what`, x.what, { dis: lock, ph: 'What is excluded' })}${inp('', '', `scope.exclusions.${i}.reason`, x.reason, { dis: lock, ph: 'Why' })}${lock ? '' : `<button class="icon-btn" data-act="del-excl" data-i="${i}" aria-label="Remove">${IC.x}</button>`}</div>`).join('')}
      ${!s.exclusions.length ? chk('', '', 'scope.noExclusions', s.noExclusions, 'Nothing is excluded — recorded as a deliberate statement', o) : ''}</div>
    ${lock ? '' : `${g.length ? banner('warn', `<b>Before the scope can be confirmed</b>${guardList(g)}`) : banner('good', 'The scope is complete and can be confirmed.')}
      <div class="row">${btn('Confirm scope — Checkpoint 1', 'confirm-scope', { cls: 'primary', icon: IC.check, dis: g.length > 0 })}</div>`}</div>`;
};
Act['toggle-sub'] = (d, el) => { const p = E().scope.processes, i = p.indexOf(d.sub); if (el.checked && i < 0) p.push(d.sub); if (!el.checked && i >= 0) p.splice(i, 1); };
Act['all-subs'] = d => { const eng = E(), ids = KB.processes.find(p => p.id === d.p).subs.map(s => s.id), all = ids.every(i => eng.scope.processes.includes(i)); eng.scope.processes = eng.scope.processes.filter(i => !ids.includes(i)); if (!all) eng.scope.processes.push(...ids); commit(); };
Act['add-excl'] = () => { E().scope.exclusions.push({ what: '', reason: '' }); E().scope.noExclusions = false; commit(); };
Act['del-excl'] = d => { E().scope.exclusions.splice(+d.i, 1); commit(); };
Act['confirm-scope'] = () => { const eng = E(); if (Ops.confirmScope(eng)) { toast(`Scope confirmed — ${eng.requests.length} requests derived`); go('eng', 'requests'); } };
Act['reopen-scope'] = () => ask({ title: 'Reopen the scope?', text: 'Work already derived from the scope is kept. The reason is recorded in the audit trail.', fields: [{ id: 'r', label: 'Reason', type: 'textarea' }], ok: 'Reopen' }, v => Ops.reopenScope(E(), v.r));

/* ---------- requests & documents ---------- */
const REQ_ST = { pending: ['warn', 'Pending'], received: ['good', 'Received'], incomplete: ['crit', 'Incomplete'], na: ['mut', 'Not applicable'] };
Views.requests = eng => {
  const today = Engine.today(), cnt = k => eng.requests.filter(q => q.status === k).length;
  const blocked = {}; eng.requests.filter(q => q.status === 'pending' || q.status === 'incomplete').forEach(q => { (blocked[q.feeds] = blocked[q.feeds] || []).push(q.item); });
  const untied = eng.docs.filter(d => !d.requestId);
  return `<div class="page-head"><div><h1>Requests &amp; documents</h1><div class="sub">Derived from the sub-processes in scope. Each item states the form it must arrive in.</div></div><div class="acts">${btn('Add request', 'add-req', { icon: IC.plus })}</div></div>
    <div class="row" style="margin-bottom:12px">${Object.entries(REQ_ST).map(([k, v]) => chip(v[0], `${cnt(k)} ${v[1].toLowerCase()}`)).join('')}</div>
    <div class="tbl-wrap"><table><thead><tr><th>Item and required form</th><th>Client owner</th><th>Due</th><th>Status</th><th>Documents</th><th>Feeds</th><th></th></tr></thead><tbody>
    ${eng.requests.map(q => { const docs = eng.docs.filter(d => d.requestId === q.id), late = q.status === 'pending' && q.due && q.due < today;
    return `<tr><td style="min-width:260px"><b style="font-weight:600">${esc(q.item)}</b><div class="xs muted">${esc(q.form)}</div>${q.fields.length ? `<div class="xs mono faint" style="margin-top:2px">${esc(q.fields.join(' · '))}</div>` : ''}
        ${q.status === 'incomplete' ? `<div class="xs" style="color:var(--crit);margin-top:3px">Missing: ${esc(q.missing.join(', '))}</div>` : ''}${q.status === 'na' ? `<div class="xs muted" style="margin-top:3px">Reason: ${esc(q.naReason)}</div>` : ''}</td>
      <td class="tight" style="min-width:130px">${inp('requests', q.id, 'owner', q.owner, { cls: 'cell', ph: 'Role' })}</td><td class="tight">${inp('requests', q.id, 'due', q.due, { cls: 'cell', type: 'date' })}</td>
      <td>${chip(...REQ_ST[q.status])}${late ? `<div class="xs" style="color:var(--crit);margin-top:3px">Overdue — chase</div>` : ''}</td>
      <td class="small">${docs.map(d => `<div class="mono xs">${esc(d.name)}</div>`).join('') || '<span class="faint">—</span>'}</td><td><span class="xs muted">${esc(q.feeds)}</span></td>
      <td class="tight" style="white-space:nowrap">${q.status === 'na' ? btn('Reinstate', 'req-reinstate', { cls: 'ghost sm', data: { id: q.id } }) : btn('N/A', 'req-na', { cls: 'ghost sm', data: { id: q.id }, title: 'Mark not applicable — requires a reason' })}${q.derived ? '' : `<button class="icon-btn sm" data-act="req-del" data-id="${q.id}" aria-label="Delete">${IC.x}</button>`}</td></tr>`; }).join('')}
    </tbody></table></div>
    ${Object.keys(blocked).length ? `<div style="margin-top:12px">${banner('warn', `<b>Work blocked by outstanding items</b>${guardList(Object.entries(blocked).map(([f, items]) => `${f} — waiting on ${items.length} item(s): ${items.join('; ')}`))}`)}</div>` : ''}
    <div class="h-sec"><h2>Documents</h2><span class="hint">${eng.docs.length} received${untied.length ? ` · ${untied.length} not tied to a request` : ''}</span><span class="line"></span></div>
    <div class="dropzone"><h4>Drop files here</h4><p>Any format. CSV exports are parsed, checked against the required fields and made available for sampling and reconciliation.</p>
      <div class="row" style="justify-content:center"><label class="btn primary" for="file-inp">${IC.up}Choose files</label><input type="file" id="file-inp" multiple hidden>${btn('Load sample files', 'sample-files', { cls: 'ghost' })}</div></div>
    ${eng.docs.length ? `<div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>Document</th><th>Classified as</th><th class="num">Rows</th><th>Satisfies request</th><th>Source strength</th><th>Received</th><th></th></tr></thead><tbody>
    ${eng.docs.map(d => `<tr><td><b class="mono small">${esc(d.name)}</b><div class="xs faint">${fmtSize(d.size)}${d.period ? ' · period ' + esc(d.period) : ''}${d.hash ? ' · sha ' + esc(d.hash.slice(0, 10)) : ''}</div></td>
      <td class="tight" style="min-width:170px">${sel('docs', d.id, 'docType', d.docType, ['Unclassified', ...KB.docTypes.map(x => x.t)], { cls: 'cell' })}${d.conf < 0.5 ? `<div class="xs" style="color:var(--warn);padding-left:6px">Low confidence — confirm</div>` : ''}</td>
      <td class="num">${d.rows ? `<button class="btn ghost sm" data-act="preview" data-id="${d.id}">${fmtNum(d.rowsDropped || d.rows.length)}</button>` : '<span class="faint">—</span>'}</td>
      <td class="tight" style="min-width:200px"><select class="inp cell" data-change="tie-doc" data-id="${d.id}" aria-label="Satisfies request"><option value="">Not tied</option>${eng.requests.filter(q => q.status !== 'na').map(q => `<option value="${q.id}" ${d.requestId === q.id ? 'selected' : ''}>${esc(q.item)}</option>`).join('')}</select>${d.requestId && d.tieConf < 1 ? `<div class="xs faint" style="padding-left:6px">Tied automatically · ${Math.round(d.tieConf * 100)}% match</div>` : ''}</td>
      <td class="tight" style="min-width:190px">${sel('docs', d.id, 'strength', d.strength, KB.strengths, { cls: 'cell', ph: 'Record the source…' })}</td>
      <td class="xs muted" style="white-space:nowrap">${fmtDT(d.uploadedAt)}<br>${esc(d.by)}</td><td class="tight"><button class="icon-btn sm" data-act="doc-del" data-id="${d.id}" aria-label="Remove document">${IC.trash}</button></td></tr>`).join('')}</tbody></table></div>` : ''}`;
};
Act['req-na'] = d => ask({ title: 'Mark as not applicable', text: 'Not applicable means the item does not exist for this entity. An item that was requested and has not arrived stays Pending.', fields: [{ id: 'r', label: 'Why does this item not exist here?', type: 'textarea' }], ok: 'Mark not applicable' },
  v => { const eng = E(), q = eng.requests.find(x => x.id === d.id); q.status = 'na'; q.naReason = v.r; eng.docs.forEach(x => { if (x.requestId === q.id) x.requestId = ''; }); Ops.log(eng, 'Request marked not applicable', `${q.item}: ${v.r}`); });
Act['req-reinstate'] = d => { const eng = E(), q = eng.requests.find(x => x.id === d.id); q.status = 'pending'; q.naReason = ''; Ops.refreshRequest(eng, q); Ops.log(eng, 'Request reinstated', q.item); commit(); };
Act['req-del'] = d => { const eng = E(); eng.docs.forEach(x => { if (x.requestId === d.id) x.requestId = ''; }); eng.requests = eng.requests.filter(q => q.id !== d.id); commit(); };
Act['add-req'] = () => ask({ title: 'Add a request', fields: [{ id: 'item', label: 'Item' }, { id: 'form', label: 'Required form', ph: 'e.g. System export, full period' }, { id: 'fields', label: 'Required fields', required: false, hint: 'comma-separated; checked against CSV headers', ph: 'invoice_no, date, amount' }, { id: 'feeds', label: 'Feeds which work', required: false }], ok: 'Add request' },
  v => { const eng = E(); eng.requests.push({ id: Ops.id(eng, 'Q'), item: v.item, form: v.form, fields: v.fields ? v.fields.split(',').map(x => x.trim()).filter(Boolean) : [], feeds: v.feeds || 'Testing', sub: '', owner: '', due: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), status: 'pending', naReason: '', missing: [], derived: false }); Ops.log(eng, 'Request added', v.item); });
Act['tie-doc'] = (d, el) => { const eng = E(); Ops.tie(eng, eng.docs.find(x => x.id === d.id), el.value); };
Act['doc-del'] = d => { Ops.removeDoc(E(), d.id); commit(); };
Act['sample-files'] = async () => { UI.busy = 'Loading sample files…'; render(); await Seed.loadFiles(E()); UI.busy = ''; commit(); toast('Sample files received and classified'); };
Act.preview = d => { const doc = E().docs.find(x => x.id === d.id); ask({ title: doc.name, ok: false, html: `<div class="tbl-wrap"><table><thead><tr>${doc.headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${doc.rows.slice(0, 12).map(r => `<tr>${doc.headers.map(h => `<td class="mono xs">${esc(r[h])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="xs muted">First ${Math.min(12, doc.rows.length)} of ${fmtNum(doc.rows.length)} rows.</p>` }); };

/* ---------- process understanding ---------- */
const subList = (eng, cur, stage, meta) => `<div class="card sticky"><div class="list">${eng.scope.processes.map(id => { const m = meta(id); return `<button class="list-item ${cur === id ? 'active' : ''}" data-act="stage" data-stage="${stage}" data-sub="${id}"><span class="sdot sd-${m[0]}">${m[0] === 'done' ? IC.check : ''}</span><span class="lt">${esc(subName(id))}<div class="ls">${esc(m[1])}</div></span></button>`; }).join('')}</div></div>`;
const curSub = eng => (eng.scope.processes.includes(S.ui.sub) ? S.ui.sub : (S.ui.sub = eng.scope.processes[0]));
Views.understanding = eng => {
  const sub = curSub(eng), m = eng.subs[sub] || (eng.subs[sub] = { noProcedure: false, confirmedBy: '', confirmedAt: '', walkthrough: '' });
  const steps = eng.steps.filter(s => s.sub === sub).sort((a, b) => a.n - b.n), c = (id, f, v, ph) => inp('steps', id, f, v, { cls: 'cell', ph });
  return `<div class="page-head"><div><h1>Process understanding</h1><div class="sub">Record what each role actually does, who checks it, who approves it and what is kept.</div></div></div>
    <div class="split">${subList(eng, sub, 'understanding', id => { const n = eng.steps.filter(s => s.sub === id).length, ok = n && (eng.subs[id] || {}).confirmedBy; return [ok ? 'done' : n ? 'active' : 'open', n ? `${n} steps${ok ? ' · confirmed' : ' · not confirmed'}` : 'No steps yet']; })}
    <div class="stack"><div class="row"><h2 style="font-size:16px">${esc(subName(sub))}</h2><span class="tag">${esc(KB.sub(sub).processName)}</span><span class="sp"></span>${Cap.sample ? btn('Draft steps from meeting notes', 'ai-steps', { cls: 'sm', icon: IC.bolt }) : ''}${btn('Add step', 'add-step', { cls: 'sm primary', icon: IC.plus })}</div>
      ${steps.length ? `<div class="tbl-wrap"><table><thead><tr><th>#</th><th>Performed by (role)</th><th>Action</th><th>System</th><th>Reviewed by</th><th>Approved by</th><th>Evidence retained</th><th></th></tr></thead><tbody>
      ${steps.map((s, i) => { const fl = Ops.stepFlags(s); return `<tr class="${fl.some(f => f.startsWith('Same') || f.startsWith('No reviewer')) ? 'flag' : ''}"><td class="mono">${s.n}</td><td class="tight" style="min-width:140px">${c(s.id, 'actor', s.actor, 'Role')}</td><td class="tight" style="min-width:240px">${c(s.id, 'action', s.action, 'What they do')}</td><td class="tight" style="min-width:110px">${c(s.id, 'system', s.system, '—')}</td><td class="tight" style="min-width:130px">${c(s.id, 'review', s.review, '—')}</td><td class="tight" style="min-width:130px">${c(s.id, 'approval', s.approval, '—')}</td><td class="tight" style="min-width:150px">${c(s.id, 'evidence', s.evidence, '—')}</td>
        <td class="tight" style="white-space:nowrap"><button class="icon-btn sm" data-act="step-move" data-id="${s.id}" data-dir="-1" ${i ? '' : 'disabled'} aria-label="Move up">${IC.arrowUp}</button> <button class="icon-btn sm" data-act="step-move" data-id="${s.id}" data-dir="1" ${i < steps.length - 1 ? '' : 'disabled'} aria-label="Move down">${IC.arrowDn}</button> <button class="icon-btn sm" data-act="step-del" data-id="${s.id}" aria-label="Delete step">${IC.x}</button></td></tr>
        ${fl.length ? `<tr class="${fl.some(f => f.startsWith('Same') || f.startsWith('No reviewer')) ? 'flag' : ''}"><td></td><td colspan="7" class="xs" style="padding-top:0">${fl.map(f => chip(f.startsWith('No evidence') ? 'warn' : 'crit', f)).join(' ')}</td></tr>` : ''}`; }).join('')}</tbody></table></div>`
      : empty('No steps recorded', 'Add the steps as the process owner describes them. Risks can only be identified once the process is recorded.', btn('Add step', 'add-step', { cls: 'primary', icon: IC.plus }))}
      <div class="card pad stack">${chk('subs', sub, 'noProcedure', m.noProcedure, 'No documented, approved procedure exists for this sub-process', { change: 'noproc' })}
        ${m.noProcedure ? `<div class="xs muted">Recorded as a gap in its own right (${esc((eng.gaps.find(g => g.key === 'noproc:' + sub) || {}).id || '')}).</div>` : ''}
        ${fld('Walkthrough — one real transaction followed end to end', ta('subs', sub, 'walkthrough', m.walkthrough, { rows: 3, ph: 'Which transaction, which documents were seen, who approved, and the dates in order' }))}
        <div class="form-grid">${fld('Description confirmed by (role)', inp('subs', sub, 'confirmedBy', m.confirmedBy, { ph: 'Process owner role' }))}${fld('Confirmed on', inp('subs', sub, 'confirmedAt', m.confirmedAt, { type: 'date' }))}</div></div>
    </div></div>`;
};
Act['add-step'] = () => { const eng = E(); Ops.addStep(eng, curSub(eng)); Ops.log(eng, 'Process step added', subName(curSub(eng))); commit(); };
Act['step-del'] = d => { const eng = E(), s = eng.steps.find(x => x.id === d.id); eng.steps = eng.steps.filter(x => x !== s); eng.risks.forEach(r => { if (r.stepId === s.id) r.stepId = ''; }); Ops.renumber(eng, s.sub); commit(); };
Act['step-move'] = d => { const eng = E(), s = eng.steps.find(x => x.id === d.id), o = eng.steps.find(x => x.sub === s.sub && x.n === s.n + (+d.dir)); if (o) { const t = s.n; s.n = o.n; o.n = t; } commit(); };
Act.noproc = (d, el) => { const eng = E(), sub = d.id;
  if (el.checked) Ops.ensureGap(eng, 'noproc:' + sub, { title: `No documented procedure — ${subName(sub)}`, desc: `There is no documented and approved policy or procedure for ${lower1(subName(sub))}. The process cannot be operated consistently or held to account against an undocumented standard.`, cause: KB.rootCauses[0], criterion: 'COSO Principle 12 — ' + KB.coso.principles[12] });
  else Ops.dropGap(eng, 'noproc:' + sub); };
Act['ai-steps'] = () => ask({ title: 'Draft steps from meeting notes', text: 'Paste the notes from the process-owner meeting. The draft is added for you to check line by line.', fields: [{ id: 'n', label: 'Meeting notes', type: 'textarea' }], ok: 'Draft steps' }, async v => {
  const eng = E(), sub = curSub(eng);
  const out = await askAI(`You are structuring internal audit process notes for the sub-process "${subName(sub)}". From the notes below, reply with only a JSON array of steps in order. Each step is {"actor": role that performs it (a role, never a person's name), "action": what they do, "system": application used or "", "review": role that checks it or "", "approval": role that approves it or "", "evidence": document or record retained or ""}. Use only what the notes state; leave a field "" when the notes do not say.\n\nNOTES:\n${v.n.slice(0, 6000)}`, 'Drafting steps…');
  if (!Array.isArray(out) || !out.length) return;
  out.slice(0, 20).forEach(x => Ops.addStep(eng, sub, { actor: String(x.actor || ''), action: String(x.action || ''), system: String(x.system || ''), review: String(x.review || ''), approval: String(x.approval || ''), evidence: String(x.evidence || '') }));
  Ops.log(eng, 'Steps drafted by the assistant from meeting notes', `${subName(sub)}: ${out.length} steps — to be checked by the auditor`); commit(); toast(`${out.length} steps drafted — check each one`);
});

/* ---------- knowledge base ---------- */
Views.kb = () => {
  const t = curTab('kb', 'lib');
  let body;
  if (t === 'lib') body = KB.processes.map(p => `<div class="h-sec"><h2>${esc(p.name)}</h2><span class="hint">${p.subs.reduce((n, s) => n + s.risks.length, 0)} library risks</span><span class="line"></span></div><div class="tbl-wrap"><table><thead><tr><th>Ref</th><th>Sub-process</th><th>Risk</th><th>Expected control</th><th>Typical frequency</th><th>Principle</th></tr></thead><tbody>
    ${p.subs.flatMap(s => s.risks.map(r => `<tr><td><span class="tag">${r.id}</span></td><td class="small">${esc(s.name)}</td><td style="min-width:220px"><b style="font-weight:600">${esc(r.title)}</b>${r.fraud ? ' ' + chip('crit', 'Fraud', false) : ''}<div class="xs muted">${esc(r.desc)}</div></td><td class="small" style="min-width:260px">${esc(r.ctl.desc)}<div class="xs faint" style="margin-top:3px">${r.ctl.attrs.length} test attributes · ${esc(r.ctl.nature)} · ${esc(r.ctl.type)}</div></td><td class="small">${esc(freqLabel(r.ctl.freq))}</td><td><span class="tag">P${r.principle}</span></td></tr>`)).join('')}</tbody></table></div>`).join('');
  else if (t === 'coso') body = `<div class="stack">${KB.coso.components.map(c => `<div class="card pad"><h3 style="font-size:14px;margin-bottom:8px">${esc(c.name)}</h3>${c.p.map(n => { const used = S.engs.reduce((k, e) => k + e.controls.filter(x => !x.absent && +x.principle === n).length, 0); return `<div class="row small" style="padding:5px 0;border-top:1px solid var(--border)"><span class="tag">P${n}</span><span>${esc(KB.coso.principles[n])}</span><span class="sp"></span><span class="xs ${used ? 'muted' : 'faint'}">${used} control${used === 1 ? '' : 's'} mapped</span></div>`; }).join('')}</div>`).join('')}</div>`;
  else body = `<div class="tbl-wrap"><table><thead><tr><th>Item</th><th>Component</th><th>Requirement</th></tr></thead><tbody>${KB.topical.cyber.items.map(i => `<tr><td><span class="tag">${i.id}</span></td><td class="small">${esc(i.comp)}</td><td>${esc(i.text)}</td></tr>`).join('')}</tbody></table></div><p class="small muted" style="margin-top:10px">Engaged automatically when IT general controls are in scope. Each item must end as assessed with evidence or excluded with a reason before a report can be issued.</p>`;
  return `<div class="page-head"><div><h1>Knowledge base</h1><div class="sub">The library the platform derives requests, risks, expected controls and test attributes from.</div></div></div>${tabs('kb', [['lib', 'Risk & control library'], ['coso', 'COSO principles'], ['topical', 'Cybersecurity requirement']], 'lib')}${body}`;
};

/* ---------- methodology ---------- */
Views.method = () => {
  const m = S.meth, n = (path, v) => `<input class="inp cell" type="number" min="0" style="width:74px" value="${v}" data-c="meth" data-f="${path}" data-num="1" aria-label="${path}">`;
  return `<div class="page-head"><div><h1>Methodology</h1><div class="sub">Firm settings. Sample sizes, risk bands and ratings across every engagement are computed from these.</div></div><div class="acts">${btn('Restore defaults', 'meth-reset', { cls: 'ghost' })}</div></div>
    <div class="split" style="grid-template-columns:1fr 1fr"><div class="stack"><div class="card pad"><div class="row" style="margin-bottom:10px"><h3 style="font-size:14px">Sample size by control frequency</h3><span class="sp"></span>${fld('Size from', sel('meth', '', 'basis', m.basis, [['typical', 'Typical'], ['min', 'Minimum']]))}</div>
      <div class="tbl-wrap" style="box-shadow:none"><table><thead><tr><th>Frequency</th><th>Minimum</th><th>Typical</th><th>Extension on failure</th></tr></thead><tbody>${m.sample.map((r, i) => `<tr><td>${esc(r.label)}</td><td class="tight">${n(`sample.${i}.min`, r.min)}</td><td class="tight">${n(`sample.${i}.typical`, r.typical)}</td><td class="tight">${n(`sample.${i}.extend`, r.extend)}</td></tr>`).join('')}
      <tr><td>As and when</td><td colspan="3" class="small muted">Sized from the population, using the row whose annual count it matches</td></tr></tbody></table></div></div></div>
    <div class="stack"><div class="card pad"><h3 style="font-size:14px;margin-bottom:10px">Inherent risk bands <span class="small muted" style="font-weight:400">· likelihood × impact</span></h3>
      ${m.bands.map((b, i) => `<div class="row small" style="padding:4px 0"><span class="score t-${b.tone}">${i ? m.bands[i - 1].max + 1 : 1}–${b.max}</span><span style="min-width:110px">${esc(b.label)}</span><span class="muted">up to</span>${i < m.bands.length - 1 ? n(`bands.${i}.max`, b.max) : '<span class="mono">25</span>'}</div>`).join('')}</div>
      <div class="card pad"><h3 style="font-size:14px;margin-bottom:8px">Scales</h3><dl class="kv"><dt>Likelihood 1–5</dt><dd>${m.likelihood.map(esc).join(' · ')}</dd><dt>Impact 1–5</dt><dd>${m.impact.map(esc).join(' · ')}</dd><dt>Gap ratings</dt><dd>${m.gapRatings.map(esc).join(' · ')}</dd><dt>Overall ratings</dt><dd>${m.overall.map(esc).join(' · ')}</dd></dl></div></div></div>`;
};
Act['meth-reset'] = () => { S.meth = JSON.parse(JSON.stringify(DEFAULT_METH)); commit(); toast('Methodology restored to defaults'); };

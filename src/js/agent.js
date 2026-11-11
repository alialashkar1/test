/* The agent: builds each part of the file from the document library, a dropped file or what the auditor says.
   With a model attached (Cap.sample) the model reads and drafts; without one, built-in rules do. Either way code applies the
   result through Ops, everything it creates is marked as a draft, and each action can be undone as a whole. */
const SNAP_KEYS = ['scope', 'cp1', 'cp2', 'requests', 'irl', 'subs', 'steps', 'risks', 'dismissed', 'controls', 'dtests', 'etests', 'gaps', 'report', 'seq', 'topical', 'itgc', 'followup'];
const cap1 = s => { s = String(s || '').trim(); return s ? s[0].toUpperCase() + s.slice(1) : ''; };
const ROLE_N = '(?:manager|director|officer|clerk|controller|supervisor|accountant|administrator|head|committee|team|treasurer|cfo|ceo|storekeeper|analyst|executive|partner|lead|department|adviser|advisor|owner)';
const ROLE = '((?:[A-Za-z&-]+ ){0,3}?' + ROLE_N + ')';
const DOC_N = '(?:payroll sheet|transfer request|bank confirmation|access request|personnel action form|purchase order|purchase requisition|goods receipt note|comparison sheet|count sheet|reconciliation|invoice|contract|job offer|request form|report|listing|register|email|form|log|voucher|statement|sheet)';
const CHECK_VERB = /^(reviews?|approves?|checks?|verif\w+|authori[sz]es?|reconciles?|releases?|signs? off|confirms?)\b/i;

/* ---------- built-in rules: used when no model is attached ---------- */
const Rules = {
  iso(str) {
    const M = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], p = n => String(n).padStart(2, '0'); let m;
    if ((m = str.match(/(\d{4})-(\d{2})-(\d{2})/))) return m[0];
    if ((m = str.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/)) && M.includes(m[2].toLowerCase())) return `${m[3]}-${p(M.indexOf(m[2].toLowerCase()) + 1)}-${p(m[1])}`;
    if ((m = str.match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/)) && M.includes(m[1].toLowerCase())) return `${m[3]}-${p(M.indexOf(m[1].toLowerCase()) + 1)}-${p(m[2])}`;
    if ((m = str.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/))) return `${m[3]}-${p(m[2])}-${p(m[1])}`;
    return '';
  },
  sentences: t => String(t).replace(/\r/g, '').split(/(?<=[.!?])\s+|\n+/).map(x => x.trim()).filter(x => x.length > 3),
  scope(text) {
    const out = { client: '', name: '', type: '', objective: '', periodFrom: '', periodTo: '', entities: '', reader: '', processes: [], exclusions: [], open_questions: [] };
    const line = re => { const m = text.match(re); return m ? m[1].trim().replace(/[.;]$/, '') : ''; };
    out.client = line(/^\s*(?:client|company|entity)\s*(?:is|[:\-–])\s*(.+)$/im) || line(/\bclient is ([^,.;\n]+)/i);
    out.name = line(/^\s*(?:subject|re|engagement|title)\s*[:\-–]\s*(.+)$/im);
    out.entities = line(/^\s*(?:locations?|entities|sites?)\s*[:\-–]\s*(.+)$/im);
    out.reader = cap1(line(/addressed to (?:the )?([A-Za-z ]+?)(?:[.,\n]|$)/i)) || (/audit committee/i.test(text) ? 'Audit committee' : '');
    const D = '(\\d{1,2}\\s+[A-Za-z]{3,9}\\.?,?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[\\/.]\\d{1,2}[\\/.]\\d{4}|[A-Za-z]{3,9}\\s+\\d{1,2},?\\s+\\d{4})';
    const pm = text.match(new RegExp(D + '\\s*(?:to|until|through|[-–—])\\s*' + D, 'i'));
    if (pm) { out.periodFrom = Rules.iso(pm[1]); out.periodTo = Rules.iso(pm[2]); }
    else { const y = text.match(/(?:financial|fiscal|calendar)?\s*year(?: ended| ending)?\s*(?:31 December\s*)?(20\d{2})/i); if (y) { out.periodFrom = y[1] + '-01-01'; out.periodTo = y[1] + '-12-31'; } }
    const low = text.toLowerCase();
    out.type = /sarbanes|\bsox\b/.test(low) ? 'sox' : /internal control over financial reporting|\bicfr\b/.test(low) ? 'icfr' : /risk assessment/.test(low) && !/control/.test(low) ? 'risk' : /\bit audit|information technology audit/.test(low) ? 'it' : /matrix build|\brcm\b only/.test(low) ? 'rcm' : /internal audit|audit|review/.test(low) ? 'full' : '';
    const sents = Rules.sentences(text), isEx = s => /\b(exclud\w+|out of scope|not (?:be )?covered|outside the scope)\b/i.test(s);
    sents.filter(isEx).forEach(s => { const m = s.match(/^(?:exclusions?\.?\s*)?(.+?)\s+(?:is|are|will be|were)\s+(?:excluded|out of scope|not (?:be )?covered|outside the scope)(?:\s+(?:because|as|since)\s+(.+))?/i);
      if (m) out.exclusions.push({ what: cap1(m[1].replace(/^the\s+/i, '')), reason: m[2] ? cap1(m[2].replace(/[.;]$/, '')) : 'Stated in the engagement letter' }); });
    const body = sents.filter(s => !isEx(s)).join(' ').toLowerCase().replace(/&/g, 'and');
    const kw = { payroll: /payroll|human resources|\bhr\b/, procurement: /procure|purchas/, inventory: /inventor|warehouse|stock/, o2c: /order to cash|receivable|revenue|collection/, treasury: /treasury|bank|cash management/, fa: /fixed asset/, itgc: /it general|access management|change management|information technology/ };
    KB.processes.forEach(p => { const hit = p.subs.filter(s => body.includes(s.name.toLowerCase().replace(/&/g, 'and'))); if (hit.length) out.processes.push(...hit.map(s => s.id)); else if (kw[p.id] && kw[p.id].test(body) && !sents.some(s => isEx(s) && kw[p.id].test(s.toLowerCase()))) out.processes.push(...p.subs.map(s => s.id)); });
    const ob = sents.find(s => /\b(objective|purpose|aim)\b/i.test(s)) || sents.find(s => /\b(assess|evaluate|review)\b/i.test(s) && s.length > 40);
    if (ob) out.objective = cap1(ob.replace(/^.*?\b(?:objective|purpose|aim)\b[^.]*?\bis to\s+/i, '').replace(/^\s*(?:objective|purpose)\s*[:.\-–]\s*/i, ''));
    if (!out.name && out.processes.length) out.name = [...new Set(out.processes.map(id => KB.sub(id).processName))].join(' and ') + ' review';
    if (!out.client) out.open_questions.push('Who is the client?'); if (!out.periodFrom) out.open_questions.push('What is the period under review?');
    if (!out.processes.length) out.open_questions.push('Which processes are in scope?');
    return out;
  },
  /* Notes may carry "Sub-process: X" headers; text under a header belongs to that sub-process. */
  sections(eng, text, subs) {
    const out = {}, lines = String(text).split(/\n/); let cur = '', any = false;
    const match = h => { const n = Engine.norm(h); return subs.find(id => { const k = Engine.norm(KB.sub(id).name); return n.includes(k) || k.includes(n) || k.split('_').filter(w => w.length > 3).filter(w => n.includes(w)).length >= 2; }) || ''; };
    lines.forEach(l => { const m = l.match(/^\s*(?:sub-?process|process|area|topic)\s*[:\-–]\s*(.+)$/i); if (m) { cur = match(m[1]); any = true; return; } if (cur) out[cur] = (out[cur] || '') + l + '\n'; });
    return any ? out : null;
  },
  walk(text) {
    const steps = [], open = [], role = new RegExp('^(?:the |an? )?' + ROLE + '(?:\\s+and\\s+(?:the )?' + ROLE + ')?\\s+(.+)$', 'i');
    const pick = (s, verbs) => { const m = s.match(new RegExp('(?:' + verbs + ')\\s+by\\s+(?:the\\s+)?' + ROLE, 'i')); return m ? cap1(m[1]) : ''; };
    const sys = s => { const m = s.match(/\b(?:in|into|from|on|using|through|via)\s+the\s+([a-z][a-z ]{2,28}?(?:system|portal|erp|application|platform|module|spreadsheet|workbook))\b/i); return m ? cap1(m[1]) : ''; };
    const evid = s => { const m = s.match(new RegExp('((?:[a-z]+ ){0,2}?' + DOC_N + ')\\b', 'i')); if (!m) return ''; const d = m[1].replace(/^.*?\b(?:the|a|an|its|their)\s+/i, '').replace(/^(?:[a-z]+s)\s+(?=\S+\s)/i, x => /^(?:signed|approved)\b/i.test(x) ? x : /^(?:reviews|approves|prepares|extracts|enters|checks|creates|signs|files|sends|issues|posts|raises|receives|keeps|submits|updates)\b/i.test(x) ? '' : x); return cap1((/\bsign(?:s|ed)?\b/i.test(s) && !/^signed/i.test(d) ? 'signed ' : '') + d); };
    const clean = a => cap1(a.replace(/,?\s*(?:and (?:is )?)?(?:reviewed|checked|verified|approved|authori[sz]ed|signed off)\s+by\s+.+$/i, '').replace(/[.;]\s*$/, ''));
    const sing = a => a.replace(/^([A-Za-z]+)/, w => /s$/i.test(w) ? w : w + 's');
    const make = (s, m) => ({ type: /\b(automatically|the system (?:blocks|calculates|posts|rejects))\b/i.test(s) ? 'system' : 'task', actor: cap1(m[1]), action: m[2] ? sing(clean(m[3])) + ` with the ${m[2].toLowerCase()}` : clean(m[3]), system: sys(s), review: pick(s, 'reviewed|checked|verified'), approval: pick(s, 'approved|authori[sz]ed|signed off') || (m[2] && /\b(release|approve)/i.test(m[3]) ? cap1(m[2]) : ''), evidence: evid(m[3]) });
    Rules.sentences(text).forEach(raw => {
      if (/^(meeting notes|date|attendees|present|sub-?process|process|topic|area)\b/i.test(raw)) return;
      if (/^(open points?|outstanding|to follow up|follow-?ups?|actions?)\s*[:\-–]/i.test(raw)) { open.push(cap1(raw.replace(/^[^:\-–]+[:\-–]\s*/, '').replace(/[.;]$/, ''))); return; }
      const s = raw.replace(/^(?:then|next|after that|afterwards|first|finally|each month|monthly|subsequently),?\s+/i, ''), prev = steps[steps.length - 1];
      const cond = s.match(/^if\s+(.+?),\s*(.+)$/i);
      if (cond) { const d = { type: 'decision', actor: prev ? prev.actor : '', action: cap1(cond[1].replace(/[.;]$/, '').replace(/^the\s+/i, '').replace(/\s+(?:is|are)\s+/i, ' ')) + '?', system: '', review: '', approval: '', evidence: '', yes: '', no: 'NEXT' };
        steps.push(d); const back = cond[2].match(new RegExp('(?:returned|sent back|goes back|referred back|escalated)\\s+to\\s+(?:the\\s+)?' + ROLE, 'i')), m2 = cond[2].replace(/^the\s+/i, 'The ').match(role);
        if (back) { const t = steps.find(x => x !== d && Engine.norm(x.actor) === Engine.norm(back[1])); if (t) d.yes = t; else { const y = { type: 'task', actor: cap1(back[1]), action: cap1(cond[2].replace(/[.;]$/, '')), system: '', review: '', approval: '', evidence: '' }; steps.push(y); d.yes = y; d.no = 'AFTER'; } }
        else if (m2) { const y = make(cond[2], m2); steps.push(y); d.yes = y; d.no = 'AFTER'; }
        return; }
      const au = s.match(/^the\s+([a-z][a-z ]{1,28}?(?:system|portal|erp|application|platform))\s+(?:automatically\s+)?((?:calculates|blocks|posts|rejects|generates|validates|matches|sends|locks)\b.+)$/i);
      if (au) { steps.push({ type: 'system', actor: cap1(au[1]), action: clean(au[2]), system: cap1(au[1]), review: '', approval: '', evidence: evid(au[2]) }); return; }
      const m = s.match(role);
      if (m) { steps.push(make(s, m)); return; }
      if (!prev) return;
      const rv = pick(s, 'reviewed|checked|verified'), ap = pick(s, 'approved|authori[sz]ed|signed off'), kept = s.match(/^(?:the\s+)?(.+?)\s+(?:is|are)\s+(?:kept|retained|filed|stored|archived)\b/i);
      if (rv && !prev.review) prev.review = rv; if (ap && !prev.approval) prev.approval = ap; if (kept && !prev.evidence) prev.evidence = cap1(kept[1]);
    });
    steps.forEach((x, i) => { if (x.type !== 'decision') return; const after = k => steps[k] || 'end';
      x.no = x.no === 'AFTER' ? after(steps.indexOf(x.yes) + 1) : x.no === 'NEXT' ? after(i + 1) : x.no; if (!x.yes) x.yes = after(i + 1); });
    const idx = t => t === 'end' ? 'end' : t ? steps.indexOf(t) + 1 : null;
    return { steps: steps.map(x => Object.assign({}, x, { yes_step: x.type === 'decision' ? idx(x.yes) : null, no_step: x.type === 'decision' ? idx(x.no) : null, yes: undefined, no: undefined })), open_questions: open };
  },
  /* Risks from the recorded steps and the library; the control is described from what the steps show, or recorded as absent. */
  matrix(eng, sub) {
    const steps = eng.steps.filter(s => s.sub === sub).sort((a, b) => a.n - b.n), out = [];
    const checked = steps.filter(s => { const a = Engine.norm(s.actor); return [s.review, s.approval].some(r => r.trim() && Engine.norm(r) !== a); }).concat(steps.filter(s => CHECK_VERB.test(s.action)));
    const words = t => Engine.norm(t).split('_').filter(w => w.length > 4);
    const nearest = t => { const W = words(t); let best = null, sc = 0; steps.forEach(s => { const k = words(s.action + ' ' + s.evidence).filter(w => W.includes(w)).length; if (k > sc) { sc = k; best = s; } }); return best; };
    KB.sub(sub).risks.forEach(L => {
      if (eng.risks.some(r => r.libId === L.id) || eng.dismissed.some(d => d.libId === L.id)) return;
      const st = nearest(L.title + ' ' + L.desc + ' ' + L.ctl.desc), by = [...new Set(checked.flatMap(s => [s.review, s.approval, CHECK_VERB.test(s.action) ? s.actor : '']).filter(x => x.trim()))];
      const control = checked.length ? { exists: true, owner: by[0] || L.ctl.owner, nature: L.ctl.nature, type: L.ctl.type, frequency: L.ctl.freq,
        desc: checked.map(s => CHECK_VERB.test(s.action) ? `The ${s.actor.toLowerCase()} ${lower1(s.action)}` : `${cap1(s.action)} (${s.actor.toLowerCase()}) is ${[s.review && 'reviewed by the ' + s.review.toLowerCase(), s.approval && 'approved by the ' + s.approval.toLowerCase()].filter(Boolean).join(' and ')}`).join('. ') + '.' + ([...new Set(checked.map(s => s.evidence).filter(Boolean))].length ? ` Evidenced by: ${[...new Set(checked.map(s => s.evidence).filter(Boolean))].join(', ').toLowerCase()}.` : ''),
        attributes: [...new Set(checked.flatMap(s => [s.review && `Reviewed by the ${s.review.toLowerCase()}`, s.approval && `Approved by the ${s.approval.toLowerCase()}`, CHECK_VERB.test(s.action) && `${cap1(s.action)} — evidenced by the ${s.actor.toLowerCase()}`]).filter(Boolean))].slice(0, 5) } : { exists: false };
      out.push({ sub_id: sub, lib_id: L.id, title: L.title, desc: L.desc, cause: L.cause, impact: L.impact || '', category: L.cat, fraud: !!L.fraud, owner: '', step: st ? st.n : null, control });
    });
    steps.forEach(s => { const fl = Ops.stepFlags(s);
      if (fl.includes('Same role performs and checks')) out.push({ sub_id: sub, lib_id: '', auto: 'sod:' + s.id, title: `One role performs and approves — step ${s.n}`, desc: `The ${s.actor.toLowerCase()} both performs and approves "${lower1(s.action)}", so an error or irregularity at this step would not be seen by anyone else.`, cause: KB.rootCauses[1], impact: 'Errors or unauthorised transactions pass unchallenged', category: 'Operational', fraud: true, owner: '', step: s.n, control: { exists: false } }); });
    return { risks: out, needs: [] };
  },
};

/* ---------- prompts: one per builder; each opens with its task name ---------- */
const catalogue = ids => KB.processes.flatMap(p => p.subs.filter(s => !ids || ids.includes(s.id)).map(s => `${s.id} — ${p.name} › ${s.name}`)).join('\n');
const docIndex = eng => eng.docs.map(d => `${d.id} — ${d.name} — ${d.docType}${d.period ? ' — ' + d.period : ''}`).join('\n') || '(none)';
const PRE = 'You are the engine of an internal audit platform. Reply with only JSON in the shape given. Use only the material supplied: where it is silent leave the field "" and raise a question instead. Never invent a name, date or amount.';
const STEP_SHAPE = '{"type":"task|decision|system","actor":"the role that performs it, never a person\'s name","action":"what they do; for a decision, the question being decided","system":"application used or \\"\\"","review":"role that checks it, if another role does","approval":"role that approves it","evidence":"document or record kept","doc_id":"id of a library document that is this evidence, or \\"\\"","yes_step":"step number or \\"end\\", decisions only","no_step":"step number or \\"end\\", decisions only"}';
const RISK_SHAPE = '{"sub_id":"","lib_id":"id of the library risk this corresponds to, or \\"\\"","title":"","desc":"the condition in this process, resulting in the consequence","cause":"root cause, distinct from the risk","impact":"in business terms","category":"Strategic|Operational|Reporting|Compliance|Financial","fraud":false,"likelihood":"1-5","impact_rating":"1-5","owner":"role","step":"number of the step where it arises","control":{"exists":true,"desc":"the control as performed today, from the steps: who does what and what evidences it","owner":"role","nature":"Preventive|Detective","type":"Manual|Automated|IT-dependent manual","frequency":"annual|halfyearly|quarterly|monthly|weekly|daily|recurring|adhoc","attributes":["a yes/no check that names who or what"]}}';
const P = {
  scope: text => `TASK scope\n${PRE}\nRead the engagement letter and fill the scope of work.\n{"client":"","name":"engagement title","type":"full|icfr|sox|it|rcm|risk","objective":"one or two sentences","periodFrom":"YYYY-MM-DD","periodTo":"YYYY-MM-DD","entities":"entities and locations","reader":"who the report is addressed to","processes":["catalogue ids the letter puts in scope"],"exclusions":[{"what":"","reason":""}],"open_questions":["what the letter leaves unsettled"]}\nA sub-process the letter excludes goes under exclusions, never under processes.\n\nCATALOGUE (id — process › sub-process)\n${catalogue()}\n\nLETTER\n${text.slice(0, 14000)}`,
  walk: (eng, subs, text) => `TASK walkthrough\n${PRE}\nTurn the meeting notes into the step-by-step process for each sub-process listed.\n{"processes":[{"sub_id":"","narrative":"two or three sentences on the transaction followed, if the notes describe one","steps":[${STEP_SHAPE}]}],"open_questions":["what an auditor needs answered that the notes do not answer"],"requests":[{"item":"a document the notes mention that is not in the library","why":""}]}\nSteps are in order and numbered from 1 within each sub-process. A return for correction is a decision whose branch points back to the earlier step. Only include a sub-process the notes actually describe.\n\nSUB-PROCESSES\n${catalogue(subs)}\n\nLIBRARY DOCUMENTS (id — name — type)\n${docIndex(eng)}\n\nNOTES\n${text.slice(0, 16000)}`,
  matrix: (eng, subs) => `TASK matrix\n${PRE}\nFor each sub-process identify the risks that arise from the recorded steps and document the control as it operates today.\n{"risks":[${RISK_SHAPE}],"needs":[{"item":"evidence or data still needed to test these controls","why":""}]}\nDerive risks from THESE steps. Use a library risk where it applies, rewritten in this organisation's terms. Where the steps show no control for a risk, set control.exists false; never describe a control the steps do not show. Likelihood and impact are proposals the auditor will confirm with the process owner.\n\nSTEPS\n${subs.map(id => `${id} — ${KB.sub(id).name}\n` + eng.steps.filter(s => s.sub === id).sort((a, b) => a.n - b.n).map(s => `  ${s.n}. [${s.type}] ${s.actor}: ${s.action}${s.system ? ' | system: ' + s.system : ''}${s.review ? ' | reviewed by: ' + s.review : ''}${s.approval ? ' | approved by: ' + s.approval : ''}${s.evidence ? ' | evidence: ' + s.evidence : ''}`).join('\n')).join('\n\n')}\n\nLIBRARY RISKS\n${subs.flatMap(id => KB.sub(id).risks.map(r => `${r.id} (${id}) — ${r.title}: ${r.desc} Expected control: ${r.ctl.desc}`)).join('\n')}\n\nALREADY RECORDED — do not repeat\n${eng.risks.filter(r => subs.includes(r.sub)).map(r => `${r.libId || r.id} ${r.title}`).join('\n') || '(none)'}`,
  allocate: (eng, docs) => `TASK allocate\n${PRE}\nFile each document under the request it satisfies.\n{"links":[{"doc_id":"","request_id":"or \\"\\" when none fits","confidence":"0 to 1","reason":"a few words"}]}\n\nREQUESTS (id — item — required form)\n${eng.requests.filter(q => q.status !== 'na').map(q => `${q.id} — ${q.item} — ${q.form}`).join('\n')}\n\nDOCUMENTS (id — name — type — main points)\n${docs.map(d => `${d.id} — ${d.name} — ${d.docType} — ${Lib.points(d).points.slice(0, 3).join('; ')}`).join('\n')}`,
  irl: (eng, notes) => `TASK requests\n${PRE}\nReview the information request list against what the meeting notes and the recorded process say is needed, and add what is missing.\n{"requests":[{"item":"","form":"the form it must arrive in","why":"","sub_id":"catalogue id or \\"\\""}],"comments":["an observation about something received that looks wrong or incomplete"]}\nDo not repeat a request already on the list.\n\nCURRENT LIST\n${eng.requests.map(q => `${q.id} — ${q.item} — ${q.status}${q.issue ? ' — ' + q.issue : ''}`).join('\n')}\n\nEVIDENCE NAMED IN THE PROCESS\n${eng.steps.filter(s => s.evidence).map(s => `${KB.sub(s.sub).name} step ${s.n}: ${s.evidence}`).join('\n') || '(none)'}\n\nSUB-PROCESSES\n${catalogue(eng.scope.processes)}\n\nNOTES\n${notes.slice(0, 9000) || '(none)'}`,
  chat: (eng, text) => { const sub = eng.scope.processes.includes(S.ui.sub) ? S.ui.sub : '';
    const state = { page: S.ui.stage, current_sub_process: sub, scope: Object.assign({}, eng.scope, { confirmed: !!eng.cp1 }), plan_approved: !!eng.cp2,
      requests: eng.requests.map(q => ({ id: q.id, item: q.item, status: q.status, issue: q.issue || undefined })), steps: eng.steps.filter(s => !sub || s.sub === sub).map(s => ({ sub_id: s.sub, n: s.n, type: s.type, actor: s.actor, action: s.action, review: s.review, approval: s.approval, evidence: s.evidence })),
      risks: eng.risks.map(r => ({ id: r.id, sub_id: r.sub, title: r.title, L: r.L, I: r.I, controls: eng.controls.filter(c => c.riskId === r.id).map(c => c.absent ? 'none' : c.id) })), gaps: eng.gaps.map(g => ({ id: g.id, title: g.title, rating: g.rating })) };
    return `TASK chat\n${PRE}\nYou are the agent inside the platform, working on one engagement with the auditor. Reply with only JSON {"reply":"short and plain","actions":[...]}.\nActions, applied in order (return none when the auditor only asks a question):\n{"do":"set_scope", plus any scope fields to change, "processes":[catalogue ids], "exclusions":[{"what":"","reason":""}]}\n{"do":"add_steps","sub_id":"","replace":false,"steps":[${STEP_SHAPE}]}\n{"do":"add_risks","risks":[${RISK_SHAPE}]}\n{"do":"add_requests","requests":[{"item":"","form":"","why":"","sub_id":""}]}\n{"do":"link","doc_id":"","request_id":""}\n{"do":"build","what":"scope|walkthrough|matrix|requests|allocate","sub_ids":[],"doc_ids":[]}\n{"do":"goto","stage":"scope|requests|library|understanding|risks|plan|testing|analysis|gaps|outputs"}\nUse "build" when the answer is in a library document, and the edit actions for what the auditor tells you directly. The scope cannot change once confirmed, and risks and controls cannot change once the plan is approved: say so instead.\n\nSTATE\n${JSON.stringify(state)}\n\nLIBRARY DOCUMENTS (id — name — type)\n${docIndex(eng)}\n\nCATALOGUE\n${catalogue()}\n\nAUDITOR\n${text.slice(0, 6000)}`; },
};

const Agent = {
  busy: '',
  on: () => !!Cap.sample,
  engine: () => Cap.sample ? 'Claude' : 'Built-in rules',
  say(eng, role, text, extra) { eng.chat.push(Object.assign({ id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), role, text, at: new Date().toISOString() }, extra || {})); if (eng.chat.length > 60) eng.chat.shift(); UI.agBottom = true; },
  snap(eng, label) { const id = 'u' + Date.now().toString(36), data = {}; SNAP_KEYS.forEach(k => { data[k] = eng[k]; });
    eng.undo.push({ id, label, at: new Date().toISOString(), data: JSON.stringify(data), docs: eng.docs.map(d => ({ id: d.id, requestId: d.requestId, alloc: d.alloc, tieConf: d.tieConf, docType: d.docType, period: d.period, summary: d.summary || null })) });
    if (eng.undo.length > 4) eng.undo.shift(); return id; },
  undo(eng, id) { const i = eng.undo.findIndex(u => u.id === id); if (i < 0) return false; const u = eng.undo[i];
    Object.assign(eng, JSON.parse(u.data)); u.docs.forEach(m => { const d = eng.docs.find(x => x.id === m.id); if (d) Object.assign(d, m, { summary: m.summary || undefined }); });
    eng.undo.length = i; Ops.log(eng, 'Agent action undone', u.label); Agent.say(eng, 'agent', `Undone — “${u.label}”. The file is as it was before.`, {}); return true; },
  /* Run one builder as a single undoable action and report it in the thread. */
  async act(eng, label, fn) {
    if (Agent.busy) return; Agent.busy = label; UI.agBottom = true; render();
    const undo = Agent.snap(eng, label);
    try { const r = await fn() || { text: 'Nothing to do.' }, changed = (r.did || []).length > 0, irl = Ops.syncIRL(eng);
      if (!changed) eng.undo = eng.undo.filter(u => u.id !== undo);
      Agent.say(eng, 'agent', r.text, { did: r.did || [], ask: r.ask || [], need: r.need || [], irl, undo: changed ? undo : '', engine: r.engine || Agent.engine(), stage: r.stage || '' });
      if (changed) Ops.log(eng, `Agent — ${label}`, `${r.engine || Agent.engine()}: ${(r.did || []).slice(0, 3).join('; ')}`);
      if (r.stage && r.stage !== S.ui.stage && Engine.stages(eng).some(s => s.id === r.stage && s.state !== 'locked')) { S.ui.stage = r.stage; if (r.sub) S.ui.sub = r.sub; } }
    catch (e) { eng.undo = eng.undo.filter(u => u.id !== undo); Agent.say(eng, 'agent', 'That did not work, and nothing was changed.', {}); }
    finally { Agent.busy = ''; commit(); }
  },
  async llm(prompt, label) { return Agent.on() ? askAI(prompt, label) : null; },
  letter: eng => eng.docs.filter(d => d.text && d.docType === 'Engagement letter / scope').pop() || eng.docs.filter(d => d.text && /engagement|proposal|scope of work/i.test(d.name)).pop() || null,
  notes: eng => eng.docs.filter(d => d.text && (d.docType === 'Meeting notes / minutes' || /notes|minutes|walkthrough|interview|transcript/i.test(d.name))),
  matchDoc(eng, evidence) { const W = Engine.norm(evidence).split('_').filter(w => w.length > 3); if (!W.length) return ''; let best = '', sc = 0.59;
    eng.docs.forEach(d => { const n = Engine.norm(d.name + ' ' + d.docType), k = W.filter(w => n.includes(w.slice(0, 6))).length / W.length; if (k > sc) { sc = k; best = d.id; } }); return best; },
  need(eng, subs) { const out = eng.requests.filter(q => (q.status === 'pending' || q.status === 'incomplete') && (!subs || !q.sub || subs.includes(q.sub))).map(q => `${q.item} — ${q.status === 'pending' ? 'not received' : (q.issue || 'missing ' + q.missing.join(', '))}`);
    eng.steps.filter(s => (!subs || subs.includes(s.sub)) && s.evidence && !s.docId).slice(0, 4).forEach(s => out.push(`${s.evidence} for ${KB.sub(s.sub).name} step ${s.n} — not yet linked to a document`)); return out.slice(0, 9); },

  /* ----- appliers: the only way a draft reaches the file ----- */
  applyScope(eng, o) { const s = eng.scope, did = [], set = (k, label, v) => { v = String(v == null ? '' : v).trim(); if (v && s[k] !== v) { s[k] = v; did.push(`${label}: ${v.length > 70 ? v.slice(0, 70) + '…' : v}`); } };
    set('client', 'Client', o.client); set('name', 'Engagement', o.name); set('objective', 'Objective', o.objective); set('entities', 'Entities', o.entities); set('reader', 'Addressee', o.reader);
    if (KB.types.some(t => t.on && t.id === o.type) && s.type !== o.type) { s.type = o.type; did.push(`Type: ${KB.types.find(t => t.id === o.type).name}`); }
    ['periodFrom', 'periodTo'].forEach(k => { if (/^\d{4}-\d{2}-\d{2}$/.test(o[k] || '') && s[k] !== o[k]) { s[k] = o[k]; did.push(`${k === 'periodFrom' ? 'Period from' : 'Period to'}: ${o[k]}`); } });
    const add = (o.processes || []).filter(id => KB.sub(id) && !s.processes.includes(id)); if (add.length) { s.processes.push(...add); did.push(`${add.length} sub-process${add.length === 1 ? '' : 'es'} in scope: ${add.map(id => KB.sub(id).name).join('; ')}`); }
    (o.exclusions || []).forEach(x => { if (x && x.what && !s.exclusions.some(e => Engine.norm(e.what) === Engine.norm(x.what))) { s.exclusions.push({ what: String(x.what), reason: String(x.reason || 'Stated by the client') }); s.noExclusions = false; did.push(`Excluded: ${x.what}`); } });
    return did; },
  applySteps(eng, sub, steps, o) { o = o || {}; const old = eng.steps.filter(s => s.sub === sub), did = [];
    if (old.length && (o.replace || old.every(s => s.draft))) { eng.steps = eng.steps.filter(s => s.sub !== sub); eng.risks.forEach(r => { if (old.some(s => s.id === r.stepId)) r.stepId = ''; }); did.push(`Replaced ${old.length} earlier draft step${old.length === 1 ? '' : 's'}`); }
    const T = v => String(v == null ? '' : v).trim(), made = (steps || []).filter(x => x && T(x.action)).map(x => Ops.addStep(eng, sub, { type: ['task', 'decision', 'system'].includes(x.type) ? x.type : 'task', actor: cap1(T(x.actor)), action: cap1(T(x.action)), system: T(x.system), review: cap1(T(x.review)), approval: cap1(T(x.approval)), evidence: cap1(T(x.evidence)), docId: eng.docs.some(d => d.id === x.doc_id) ? x.doc_id : Agent.matchDoc(eng, T(x.evidence)), draft: true, src: o.src || '' }));
    const ref = v => v === 'end' ? 'end' : (made[Number(v) - 1] || {}).id || '';
    (steps || []).filter(x => x && T(x.action)).forEach((x, i) => { if (made[i].type === 'decision') { made[i].yes = ref(x.yes_step); made[i].no = ref(x.no_step); } });
    Ops.renumber(eng, sub);
    if (made.length) { const dec = made.filter(s => s.type === 'decision').length, weak = made.filter(s => Ops.stepFlags(s).some(f => !f.startsWith('No evidence'))).length;
      did.push(`${KB.sub(sub).name}: ${made.length} steps recorded${dec ? `, ${dec} decision point${dec === 1 ? '' : 's'}` : ''}, flow chart drawn`); if (weak) did.push(`${weak} step${weak === 1 ? ' has' : 's have'} no independent check — flagged on the flow`);
      const linked = made.filter(s => s.docId).length; if (linked) did.push(`${linked} step${linked === 1 ? '' : 's'} linked to documents in the library`); }
    return did; },
  applyRisks(eng, risks) { const did = [], cfg = Engine.typeCfg(eng.scope.type), n15 = v => { v = Math.round(Number(v)); return v >= 1 && v <= 5 ? v : 0; }; let nr = 0, nc = 0, na = 0;
    (risks || []).forEach(x => { if (!x || !x.title || !eng.scope.processes.includes(x.sub_id)) return;
      if ((x.lib_id && eng.risks.some(r => r.libId === x.lib_id)) || (x.auto && eng.risks.some(r => r.autoKey === x.auto)) || eng.risks.some(r => r.sub === x.sub_id && Engine.norm(r.title) === Engine.norm(x.title))) return;
      const L = x.lib_id ? KB.libRisk(x.lib_id) : null, st = eng.steps.find(s => s.sub === x.sub_id && s.n === Number(x.step));
      const r = Ops.addRisk(eng, x.sub_id, { title: String(x.title), desc: String(x.desc || ''), cause: String(x.cause || ''), impact: String(x.impact || ''), cat: KB.categories.includes(x.category) ? x.category : 'Operational', fraud: !!x.fraud, owner: cap1(x.owner || ''), L: n15(x.likelihood), I: n15(x.impact_rating), stepId: st ? st.id : '', source: L ? 'library' : 'agent', libId: L ? L.id : '', principle: L ? L.principle : 10, assertion: L ? L.assertion : '', autoKey: x.auto || '', draft: true });
      nr++; if (!cfg.controls) return; const c = x.control || {};
      if (c.exists && String(c.desc || '').trim()) { const k = Ops.addControl(eng, r.id, false); Object.assign(k, { desc: String(c.desc), owner: cap1(c.owner || ''), nature: KB.natures.includes(c.nature) ? c.nature : 'Preventive', type: KB.ctlTypes.includes(c.type) ? c.type : 'Manual', freq: FREQS.some(f => f[0] === c.frequency) ? c.frequency : '', attrs: (c.attributes || []).map(String).filter(a => a.trim()).slice(0, 6), draft: true }); if (!k.attrs.length) k.attrs = ['']; k.fromLib = !!L; if (k.type === 'Automated') k.itDep = true; nc++; }
      else { Ops.recordAbsence(eng, r.id).draft = true; na++; } });
    if (nr) did.push(`${nr} risk${nr === 1 ? '' : 's'} identified from the recorded steps`); if (nc) did.push(`${nc} control${nc === 1 ? '' : 's'} documented as performed`); if (na) did.push(`${na} risk${na === 1 ? ' has' : 's have'} no control — recorded as absent and raised as gap${na === 1 ? '' : 's'}`);
    return did; },
  applyRequests(eng, reqs) { const did = [], due = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    (reqs || []).forEach(x => { const item = String((x && x.item) || '').trim(); if (!item || eng.requests.some(q => Engine.norm(q.item) === Engine.norm(item))) return;
      eng.requests.push({ id: Ops.id(eng, 'Q'), key: 'ag:' + Engine.norm(item), item, form: String(x.form || 'As described'), fields: [], feeds: 'Raised by the agent', sub: eng.scope.processes.includes(x.sub_id) ? x.sub_id : '', owner: '', due, status: 'pending', naReason: '', missing: [], issue: '', derived: false, origin: 'agent', why: String(x.why || ''), draft: true });
      did.push(`Request added: ${item}`); }); return did; },

  /* ----- builders ----- */
  async scope(eng, src) {
    if (eng.cp1) return { text: 'The scope is confirmed. Reopen it first if it needs to change.' };
    const doc = src.docId ? eng.docs.find(d => d.id === src.docId) : null, text = doc ? doc.text : src.text;
    if (!text) return { text: 'I need the engagement letter. Drop it here, add it to the document library, or tell me the client, the period and what is in scope.', stage: 'scope' };
    let out = await Agent.llm(P.scope(text), 'Reading the engagement letter…'); const engine = out ? 'Claude' : 'Built-in rules'; if (!out) out = Rules.scope(text);
    const did = Agent.applyScope(eng, out); if (did.length) eng.scope.source = { docId: doc ? doc.id : '', name: doc ? doc.name : 'the conversation', engine };
    const left = Engine.guards.cp1(eng);
    return { engine, did, stage: 'scope', ask: (out.open_questions || []).map(String).concat(left).slice(0, 7),
      text: did.length ? `I drafted the scope from ${doc ? doc.name : 'what you told me'}. ${left.length ? 'A few things still need you.' : 'Check each field, then confirm it — nothing is derived until you do.'}` : `I read ${doc ? doc.name : 'that'} and found nothing new for the scope.` };
  },
  async walkthrough(eng, subs, src) {
    if (!eng.cp1) return { text: 'Confirm the scope first — the walkthrough is built for the sub-processes in scope.', stage: 'scope' };
    subs = (subs && subs.length ? subs : eng.scope.processes).filter(id => eng.scope.processes.includes(id));
    const docs = src.docIds ? eng.docs.filter(d => src.docIds.includes(d.id) && d.text) : [], text = src.text || docs.map(d => d.text).join('\n\n');
    if (!text.trim()) return { text: 'I need the meeting notes. Drop them here, add them to the document library, or describe the process to me step by step.', stage: 'understanding' };
    let out = await Agent.llm(P.walk(eng, subs, text), 'Building the walkthrough…'); const engine = out ? 'Claude' : 'Built-in rules', did = [], ask = [];
    if (!out) { const sec = Rules.sections(eng, text, eng.scope.processes), target = eng.scope.processes.includes(S.ui.sub) ? S.ui.sub : subs[0]; out = { processes: [], open_questions: [] };
      (sec ? Object.keys(sec).filter(id => subs.includes(id)) : [target]).forEach(id => { const w = Rules.walk(sec ? sec[id] : text); out.processes.push({ sub_id: id, steps: w.steps, narrative: '' }); out.open_questions.push(...w.open_questions); });
      const tail = text.match(/^\s*(?:open points?|outstanding|to follow up)\s*[:\-–]\s*(.+)$/im); if (tail && !out.open_questions.length) out.open_questions.push(cap1(tail[1])); }
    let first = '';
    (out.processes || []).forEach(p => { if (!eng.scope.processes.includes(p.sub_id) || !(p.steps || []).length) return; first = first || p.sub_id;
      did.push(...Agent.applySteps(eng, p.sub_id, p.steps, { src: docs[0] ? docs[0].id : '' })); const m = eng.subs[p.sub_id] || (eng.subs[p.sub_id] = { noProcedure: false, confirmedBy: '', confirmedAt: '', walkthrough: '' }); if (p.narrative && !m.walkthrough) m.walkthrough = String(p.narrative);
      eng.steps.filter(s => s.sub === p.sub_id).forEach(s => { if (s.type === 'task' && !s.review && !s.approval && !CHECK_VERB.test(s.action)) ask.push(`${KB.sub(p.sub_id).name} step ${s.n}: who reviews or approves “${lower1(s.action).slice(0, 50)}”?`); if (s.type === 'decision' && !s.no) ask.push(`${KB.sub(p.sub_id).name} step ${s.n}: what happens on the other branch?`); }); });
    did.push(...Agent.applyRequests(eng, (out.requests || []).map(r => Object.assign({ form: 'Copy of the document' }, r))));
    ask.unshift(...(out.open_questions || []).map(String));
    return { engine, did, ask: ask.slice(0, 8), need: did.length ? Agent.need(eng, subs) : [], stage: 'understanding', sub: first,
      text: did.length ? `I built the walkthrough from ${docs.length ? docs.map(d => d.name).join(', ') : 'what you told me'}. The steps are drafts: check them against what the process owner said, then accept them and have the owner confirm.` : 'I could not find process steps in that. Notes that say who does what, who reviews it and what is kept work best.' };
  },
  async matrix(eng, subs) {
    if (eng.cp2) return { text: 'The procedure plan is approved, so risks and controls are fixed. Reopen the plan to change them.' };
    subs = (subs && subs.length ? subs : eng.scope.processes).filter(id => eng.scope.processes.includes(id));
    const ready = subs.filter(id => eng.steps.some(s => s.sub === id)), wait = subs.filter(id => !ready.includes(id));
    if (!ready.length) return { text: 'No process has been recorded yet. Risks are derived from the walkthrough, so build or record that first.', stage: 'understanding', ask: wait.map(id => `${KB.sub(id).name}: no steps recorded`) };
    let out = await Agent.llm(P.matrix(eng, ready), 'Identifying risks and controls…'); const engine = out ? 'Claude' : 'Built-in rules';
    if (!out) { out = { risks: [], needs: [] }; ready.forEach(id => out.risks.push(...Rules.matrix(eng, id).risks)); }
    const did = Agent.applyRisks(eng, out.risks), ask = wait.map(id => `${KB.sub(id).name}: no walkthrough yet, so no risks were derived`);
    const unrated = eng.risks.filter(r => ready.includes(r.sub) && (!r.L || !r.I)).length; if (unrated) ask.push(`${unrated} risk${unrated === 1 ? '' : 's'} to rate with the process owner — likelihood and impact are yours to decide`);
    const noOwner = eng.risks.filter(r => ready.includes(r.sub) && !r.owner).length; if (noOwner) ask.push(`${noOwner} risk${noOwner === 1 ? '' : 's'} without an owner`);
    Ops.syncIRL(eng);
    return { engine, did, ask, need: (out.needs || []).map(n => `${n.item}${n.why ? ' — ' + n.why : ''}`).concat(Agent.need(eng, ready)).slice(0, 9), stage: 'risks', sub: ready[0],
      text: did.length ? 'I built the risks and controls from the recorded steps. Each one is a draft: the control is described as the steps show it operating, and where the steps show no control I recorded an absence.' : 'Nothing new to add: the risks that arise from the recorded steps are already on the file.' };
  },
  async allocate(eng) {
    const docs = eng.docs.filter(d => d.alloc === 'pending'); if (!docs.length) return { text: 'Every document is already allocated.' };
    if (!eng.requests.length) return { text: 'There is no request list yet. Confirm the scope and I will file what has arrived.', stage: 'scope' };
    const out = await Agent.llm(P.allocate(eng, docs), 'Allocating documents…'), engine = out ? 'Claude' : 'Built-in rules', did = [];
    docs.forEach(d => { const hit = out ? (out.links || []).find(l => l.doc_id === d.id && eng.requests.some(q => q.id === l.request_id) && Number(l.confidence) >= 0.6) : null, r = hit ? { id: hit.request_id, conf: Math.min(0.99, Number(hit.confidence)) } : (out ? null : Engine.rankRequests(d, eng.requests.filter(q => q.status !== 'na'))[0]);
      if (r && r.conf >= (out ? 0.6 : 0.4)) { d.tieConf = r.conf; Ops.tie(eng, d, r.id, true); did.push(`${d.name} → ${eng.requests.find(q => q.id === r.id).item} (${Math.round(r.conf * 100)}%${hit && hit.reason ? ', ' + hit.reason : ''})`); } });
    const left = eng.docs.filter(d => d.alloc === 'pending').length;
    return { engine, did, stage: 'library', text: did.length ? `I filed ${did.length} document${did.length === 1 ? '' : 's'}. Each is linked automatically and waits for your approval.${left ? ` ${left} had no confident match and stay pending.` : ''}` : `No confident match for the ${left} pending document${left === 1 ? '' : 's'}. Allocate them by hand, or mark them reference only.` };
  },
  async requests(eng) {
    if (!eng.cp1) return { text: 'The request list is built from the confirmed scope. Confirm the scope first.', stage: 'scope' };
    const did = Ops.syncIRL(eng).map(c => c), notes = Agent.notes(eng).map(d => d.text).join('\n\n');
    const out = await Agent.llm(P.irl(eng, notes), 'Reviewing the request list…'), engine = out ? 'Claude' : 'Built-in rules', ask = [];
    if (out) { did.push(...Agent.applyRequests(eng, out.requests)); ask.push(...(out.comments || []).map(String)); }
    else { const open = []; Agent.notes(eng).forEach(d => (d.text.match(/^\s*(?:open points?|outstanding|to follow up)\s*[:\-–]\s*(.+)$/gim) || []).forEach(l => open.push(cap1(l.replace(/^[^:\-–]+[:\-–]\s*/, '').replace(/[.;]$/, '')))));
      did.push(...Agent.applyRequests(eng, open.map(o => ({ full: o, item: o.replace(/\s+(?:were|was|is|are|has|have)\s+(?:not\s+(?:been\s+)?(?:available|provided|received|seen|supplied)|outstanding|missing|to be (?:provided|sent)).*$/i, '') })).filter(o => o.item !== o.full || new RegExp(DOC_N, 'i').test(o.item)).map(o => ({ item: o.item, form: 'To be provided', why: `Open point in the meeting notes: “${o.full}”` })))); }
    const c = k => eng.requests.filter(q => q.status === k).length, bad = eng.requests.filter(q => q.status === 'incomplete').map(q => `${q.item}: ${q.issue || 'missing ' + q.missing.join(', ')}`);
    return { engine, did, ask: ask.concat(bad).slice(0, 8), stage: 'requests', text: `The request list is at version ${eng.irl.v}: ${c('received')} received, ${c('incomplete')} received but not usable, ${c('pending')} not yet received${c('na') ? `, ${c('na')} not applicable` : ''}.` };
  },
  next(eng) { const st = Engine.stages(eng), s = st.find(x => x.state === 'active') || st.find(x => x.state === 'open');
    if (!s) return { text: 'Every stage is complete.' };
    const hint = { scope: 'Give me the engagement letter and I will draft it.', requests: 'Upload what the client has sent; I file it and update the list.', library: 'I can allocate what is pending; you approve.', understanding: 'Give me the meeting notes and I will build the walkthrough and its flow.', risks: 'I can build the risks and controls from the walkthrough.', plan: 'Review the sample sizes and approve the plan.', testing: 'Conclude design, then test the sample.', gaps: 'Complete each gap and clear it with the owner.', outputs: 'Decide the overall rating and issue.' }[s.id] || '';
    return { text: `Next is ${s.label.toLowerCase()}. ${hint}`, ask: s.reasons.slice(0, 6), stage: s.id }; },

  /* ----- conversation ----- */
  async chat(eng, text) {
    Agent.say(eng, 'user', text); const t = text.toLowerCase(), sub = eng.scope.processes.includes(S.ui.sub) ? S.ui.sub : '', long = text.length > 140;
    if (/^\s*undo\b/.test(t)) { const u = eng.undo[eng.undo.length - 1]; if (u) Agent.undo(eng, u.id); else Agent.say(eng, 'agent', 'There is nothing to undo.'); return commit(); }
    if (Agent.on()) return Agent.act(eng, text.length > 48 ? text.slice(0, 48) + '…' : text, async () => {
      const out = await askAI(P.chat(eng, text), 'Thinking…'); if (!out) return { text: 'I could not reach the model just now. Try again, or use the buttons above — they work without it.' };
      const r = { engine: 'Claude', text: String(out.reply || ''), did: [], ask: [], need: [] };
      for (const a of (out.actions || []).slice(0, 8)) { let x = null;
        if (a.do === 'set_scope') { if (eng.cp1) r.ask.push('The scope is confirmed — reopen it to change it.'); else { r.did.push(...Agent.applyScope(eng, a)); r.stage = 'scope'; } }
        else if (a.do === 'add_steps' && eng.scope.processes.includes(a.sub_id)) { r.did.push(...Agent.applySteps(eng, a.sub_id, a.steps, { replace: !!a.replace })); r.stage = 'understanding'; r.sub = a.sub_id; }
        else if (a.do === 'add_risks') { if (eng.cp2) r.ask.push('The plan is approved — reopen it to change risks and controls.'); else { r.did.push(...Agent.applyRisks(eng, a.risks)); r.stage = 'risks'; } }
        else if (a.do === 'add_requests' && eng.cp1) r.did.push(...Agent.applyRequests(eng, a.requests));
        else if (a.do === 'link') { const d = eng.docs.find(k => k.id === a.doc_id), q = eng.requests.find(k => k.id === a.request_id); if (d && q) { Ops.tie(eng, d, q.id, true); r.did.push(`${d.name} → ${q.item}`); } }
        else if (a.do === 'goto') r.stage = a.stage;
        else if (a.do === 'build') { const ids = (a.doc_ids || []).filter(id => eng.docs.some(d => d.id === id));
          x = a.what === 'scope' ? await Agent.scope(eng, { docId: ids[0] || (Agent.letter(eng) || {}).id }) : a.what === 'walkthrough' ? await Agent.walkthrough(eng, a.sub_ids, { docIds: ids.length ? ids : Agent.notes(eng).map(d => d.id) }) : a.what === 'matrix' ? await Agent.matrix(eng, a.sub_ids) : a.what === 'requests' ? await Agent.requests(eng) : a.what === 'allocate' ? await Agent.allocate(eng) : null; }
        if (x) { r.did.push(...(x.did || [])); r.ask.push(...(x.ask || [])); r.need.push(...(x.need || [])); r.stage = x.stage || r.stage; r.sub = x.sub || r.sub; if (!r.text) r.text = x.text; } }
      return r; });
    /* no model attached: route by what was asked and where the auditor is */
    const run = (label, fn) => Agent.act(eng, label, fn);
    if (/\bwhat('?s| is| do i| should i)?\b.*\b(next|do now)\b|\bnext step/.test(t)) { Agent.say(eng, 'agent', '', Object.assign(Agent.next(eng), { engine: 'Built-in rules' })); const m = eng.chat[eng.chat.length - 1]; m.text = m.text || ''; return commit(); }
    if (/\b(need|missing|outstanding|still)\b/.test(t) && !long) { const n = Agent.need(eng, null); Agent.say(eng, 'agent', n.length ? 'This is what is still outstanding.' : 'Nothing is outstanding on the request list.', { need: n, engine: 'Built-in rules' }); return commit(); }
    if (/\b(allocat|file (the|these|them)|link (the|these|them))/.test(t)) return run('Allocate documents', () => Agent.allocate(eng));
    if (/\b(request list|requests?|irl|information request)\b/.test(t) && !long) return run('Update the request list', () => Agent.requests(eng));
    if ((/\b(scope|engagement letter)\b/.test(t) || S.ui.stage === 'scope') && !eng.cp1) return run('Build scope', () => Agent.scope(eng, long || !Agent.letter(eng) || /\b(client|period|in scope)\b/.test(t) ? { text } : { docId: Agent.letter(eng).id }));
    if (/\b(risks?|controls?|matrix|rcm)\b/.test(t) && !long) return run('Build risks and controls', () => Agent.matrix(eng, /\b(all|whole|every\w*|matrix|rcm)\b/.test(t) || !sub ? null : [sub]));
    if (/\b(walk-?through|process|steps?|flow|meeting)\b/.test(t) || (S.ui.stage === 'understanding' && long)) return run('Build walkthrough', () => Agent.walkthrough(eng, long ? (sub ? [sub] : null) : null, long ? { text } : { docIds: Agent.notes(eng).map(d => d.id) }));
    if (/\b(summary|report)\b/.test(t) && Act.compose) { Act.compose(); Agent.say(eng, 'agent', 'I composed the executive summary from the findings on the file. It is on the report page for you to edit.', { stage: 'outputs', engine: 'Built-in rules' }); return commit(); }
    Agent.say(eng, 'agent', 'Without a model attached I work from documents and from the buttons above: build the scope from an engagement letter, build a walkthrough from meeting notes, build risks and controls, allocate documents, update the request list, or tell you what is still needed. Open this in claude.ai and I can also follow free-form instructions.', { engine: 'Built-in rules' }); commit();
  },
  /* Files dropped on a page or on the chat: read and file them, then build from them where the context says so. */
  async files(eng, docs, then) {
    const irl = Ops.syncIRL(eng), line = d => `${d.name} — ${d.docType}${d.requestId ? ', filed under ' + (eng.requests.find(q => q.id === d.requestId) || {}).item : eng.cp1 ? ', pending allocation' : ''}`;
    const letter = docs.find(d => d.text && d.docType === 'Engagement letter / scope'), text = docs.filter(d => d.text), here = then === 'chat' ? S.ui.stage : then;
    Agent.say(eng, 'agent', `${docs.length} document${docs.length === 1 ? '' : 's'} read and filed.`, { did: docs.map(line), irl, engine: 'Built-in rules' });
    if (here === 'scope' && !eng.cp1 && (letter || text[0])) return Agent.act(eng, 'Build scope', () => Agent.scope(eng, { docId: (letter || text[0]).id }));
    if ((here === 'walkthrough' || here === 'understanding') && eng.cp1 && text.length) return Agent.act(eng, 'Build walkthrough', () => Agent.walkthrough(eng, then === 'chat' ? null : null, { docIds: text.map(d => d.id) }));
    commit();
  },
  suggest(eng) { const s = S.ui.stage, out = [], sub = eng.scope.processes.includes(S.ui.sub) ? S.ui.sub : '', pend = eng.docs.filter(d => d.alloc === 'pending').length, L = Agent.letter(eng), N = Agent.notes(eng);
    if (!eng.cp1) { if (L) out.push(['Build the scope from the engagement letter', 'scope']); }
    else { if (pend && eng.requests.length) out.push([`Allocate ${pend} pending document${pend === 1 ? '' : 's'}`, 'allocate']);
      if ((s === 'understanding' || s === 'overview') && N.length) out.push(['Build the walkthrough from the meeting notes', 'walk']);
      if ((s === 'risks' || s === 'understanding' || s === 'plan') && !eng.cp2 && eng.steps.length) out.push([sub && s === 'risks' ? 'Build risks and controls for this sub-process' : 'Build the whole matrix', 'matrix', sub && s === 'risks' ? sub : '']);
      if (s === 'requests' || s === 'library') out.push(['Update the request list', 'requests']);
      if (s === 'outputs' && !eng.report.issuedAt) out.push(['Compose the executive summary', 'summary']); }
    out.push(['What is still needed?', 'need']); out.push(['What should I do next?', 'next']); return out.slice(0, 4); },
};

/* ---------- the panel ---------- */
function agentPanel(eng) {
  const last = eng.undo.length ? eng.undo[eng.undo.length - 1].id : '';
  const list = (title, items, cls) => items && items.length ? `<div class="ag-list ${cls || ''}"><b>${title}</b><ul>${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
  const msg = m => m.role === 'user' ? `<div class="ag-msg me"><div class="ag-bubble">${esc(m.text)}</div></div>`
    : `<div class="ag-msg"><div class="ag-bubble">${m.text ? `<p>${esc(m.text)}</p>` : ''}${list('Done', m.did, 'did')}${list('Request list updated', m.irl, 'irl')}${list('For you to settle', m.ask, 'ask')}${list('Still needed', m.need, 'need')}
        <div class="ag-foot"><span>${esc(m.engine || '')}${m.engine ? ' · ' : ''}${fmtDT(m.at)}</span><span class="sp"></span>${m.stage && m.stage !== S.ui.stage ? `<button class="btn ghost sm" data-act="stage" data-stage="${m.stage}">Open</button>` : ''}${m.undo && m.undo === last ? `<button class="btn sm" data-act="ag-undo" data-id="${m.undo}">Undo</button>` : m.undo ? '<span class="xs faint">kept</span>' : ''}</div></div></div>`;
  return `<aside class="agent" aria-label="Agent"><div class="ag-head"><span class="logo" style="width:24px;height:24px;border-radius:7px">${IC.bolt}</span><b>Agent</b>${chip(Agent.on() ? 'prim' : 'mut', Agent.engine(), false)}<span class="sp"></span><button class="icon-btn sm" data-act="ag-toggle" title="Hide the agent" aria-label="Hide the agent">${IC.x}</button></div>
    <div class="ag-sugg">${Agent.suggest(eng).map(x => `<button class="btn sm" data-act="ag-run" data-what="${x[1]}" ${x[2] ? `data-sub="${x[2]}"` : ''} ${Agent.busy ? 'disabled' : ''}>${esc(x[0])}</button>`).join('')}</div>
    <div class="ag-thread" id="ag-thread">${eng.chat.length ? eng.chat.map(msg).join('') : `<div class="ag-empty"><p><b>Tell me what to build, or drop the documents here.</b></p><p>I read what is in the document library, draft the scope, the walkthrough, the risks and controls and the request list, and tell you what is still missing. Everything I draft is marked, and every action can be undone.</p></div>`}
      ${Agent.busy ? `<div class="ag-msg"><div class="ag-bubble working"><span class="dots"><i></i><i></i><i></i></span>${esc(UI.busy || Agent.busy)}</div></div>` : ''}</div>
    <div class="ag-input dropzone" data-then="chat"><textarea id="ag-text" rows="2" placeholder="Ask, instruct, or drop files here" aria-label="Message the agent">${esc(UI.agDraft || '')}</textarea>
      <div class="row"><label class="btn ghost sm" for="ag-file" title="Attach documents">${IC.up}Attach</label><input type="file" id="ag-file" data-then="chat" multiple hidden><span class="sp"></span><button class="btn primary sm" data-act="ag-send" ${Agent.busy ? 'disabled' : ''}>Send</button></div></div></aside>`;
}
const agentBar = (text, buttons) => `<div class="agentbar"><span class="ab-ic">${IC.bolt}</span><div class="ab-t">${text}</div><div class="row">${buttons || ''}</div></div>`;
const draftChip = x => x && x.draft ? chip('info', 'Agent draft', false) : '';
Act['ag-toggle'] = () => { S.ui.agentHidden = agentShown(); Store.save(); render(); };
Act['ag-send'] = () => { const el = $('#ag-text'), v = (el ? el.value : '').trim(); if (!v || Agent.busy) return; UI.agDraft = ''; Agent.chat(E(), v); };
Act['ag-undo'] = d => ask({ title: 'Undo this agent action?', text: 'The file returns to how it was before the action. Edits you made by hand since then are discarded too.', ok: 'Undo', danger: true }, () => { Agent.undo(E(), d.id); });
Act['ag-run'] = d => { const eng = E(), w = d.what, sub = d.sub || '';
  if (w === 'scope') return Agent.act(eng, 'Build scope', () => Agent.scope(eng, { docId: d.doc || (Agent.letter(eng) || {}).id }));
  if (w === 'walk') return Agent.act(eng, 'Build walkthrough', () => Agent.walkthrough(eng, sub ? [sub] : null, { docIds: Agent.notes(eng).map(x => x.id) }));
  if (w === 'matrix') return Agent.act(eng, sub ? `Build risks and controls — ${KB.sub(sub).name}` : 'Build the matrix', () => Agent.matrix(eng, sub ? [sub] : null));
  if (w === 'allocate') return Agent.act(eng, 'Allocate documents', () => Agent.allocate(eng));
  if (w === 'requests') return Agent.act(eng, 'Update the request list', () => Agent.requests(eng));
  if (w === 'summary') { Act.compose(); Agent.say(eng, 'agent', 'I composed the executive summary from the findings on the file. Edit it on the report page.', { stage: 'outputs', engine: 'Built-in rules' }); return commit(); }
  if (w === 'need') { const n = Agent.need(eng, null); Agent.say(eng, 'agent', n.length ? 'This is what is still outstanding.' : 'Nothing is outstanding on the request list.', { need: n, engine: 'Built-in rules' }); return commit(); }
  if (w === 'next') { const n = Agent.next(eng); Agent.say(eng, 'agent', n.text, { ask: n.ask, stage: n.stage, engine: 'Built-in rules' }); return commit(); } };
Act['ag-paste'] = d => ask({ title: 'Build the walkthrough from notes', text: 'Paste the notes of the process-owner meeting. Notes that say who does what, who reviews it and what is kept work best.', fields: [{ id: 'n', label: 'Meeting notes', type: 'textarea' }], ok: 'Build walkthrough' }, v => { const eng = E(); setTimeout(() => Agent.act(eng, 'Build walkthrough', () => Agent.walkthrough(eng, d.sub ? [d.sub] : null, { text: v.n })), 0); });
Act['accept-drafts'] = d => { const eng = E(), sub = d.sub || '', hit = x => x.draft && (!sub || x.sub === sub || (x.riskId && (eng.risks.find(r => r.id === x.riskId) || {}).sub === sub)); let n = 0;
  [eng.steps, eng.risks, eng.controls].forEach(c => c.forEach(x => { if (hit(x)) { x.draft = false; n++; } })); if (!sub) eng.requests.forEach(q => { if (q.draft) { q.draft = false; n++; } });
  Ops.log(eng, 'Agent drafts accepted', `${n} item${n === 1 ? '' : 's'}${sub ? ' in ' + KB.sub(sub).name : ''}`); commit(); toast(`${n} draft${n === 1 ? '' : 's'} accepted`); };
document.addEventListener('input', ev => { if (ev.target.id === 'ag-text') UI.agDraft = ev.target.value; });
document.addEventListener('keydown', ev => { if (ev.target.id === 'ag-text' && ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); Act['ag-send'](); } });

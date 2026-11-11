/* The model path, with a stand-in for window.claude: checks the prompts carry the right material and that the
   model's JSON is applied through the same appliers, guards and undo as the rules path. */
const { chromium } = require('playwright');
const path = process.argv[2], shots = process.argv[3];
const errors = [], log = [];
const ok = (name, cond, extra) => { log.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`); };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  p.on('pageerror', e => errors.push('pageerror: ' + String(e.stack || e).slice(0, 500)));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  await p.addInitScript(() => {
    window.__prompts = [];
    const reply = prompt => {
      const task = (prompt.match(/^TASK (\w+)/) || [])[1];
      if (task === 'scope') return { client: 'Meridian Industrial Group', name: 'Payroll controls review', type: 'full', objective: 'Assess payroll controls.', periodFrom: '2024-01-01', periodTo: '2024-03-31', entities: 'Head office', reader: 'Audit committee', processes: ['pay-sheet', 'pay-transfer', 'not-a-real-id'], exclusions: [{ what: 'Expatriate tax equalisation', reason: 'Separate mandate' }], open_questions: ['Is Plant 2 in scope?'] };
      if (task === 'walkthrough') return { processes: [{ sub_id: 'pay-sheet', narrative: 'Followed the February sheet.', steps: [
        { type: 'system', actor: 'Payroll system', action: 'Calculates net pay', system: 'Payroll system', review: '', approval: '', evidence: 'Payroll register', doc_id: '' },
        { type: 'task', actor: 'Administration manager', action: 'Extracts and signs the payroll sheet', system: 'Payroll system', review: 'Payroll manager', approval: '', evidence: 'Signed payroll sheet', doc_id: '' },
        { type: 'decision', actor: 'Payroll manager', action: 'Variance above 5%?', yes_step: 2, no_step: 4 },
        { type: 'task', actor: 'Finance director', action: 'Approves the sheet for payment', system: '', review: '', approval: '', evidence: 'Signed payroll sheet', doc_id: '' }] },
        { sub_id: 'tr-recon', steps: [{ actor: 'X', action: 'Out of scope and must be ignored' }] }],
        open_questions: ['Who approves when the finance director is away?'], requests: [{ item: 'Variance review working paper', why: 'Mentioned in the notes' }] };
      if (task === 'matrix') return { risks: [
        { sub_id: 'pay-sheet', lib_id: 'L-PAY-04', title: 'Payroll sheet not calculated or authorised properly', desc: 'Sheet components are wrong, resulting in incorrect payments.', cause: 'No independent recalculation', impact: 'Incorrect salary payments', category: 'Financial', fraud: false, likelihood: 3, impact_rating: 4, owner: 'finance director', step: 4, control: { exists: true, desc: 'The finance director approves the signed payroll sheet each month.', owner: 'Finance director', nature: 'Preventive', type: 'Manual', frequency: 'monthly', attributes: ['The sheet is signed by the finance director before the transfer date'] } },
        { sub_id: 'pay-sheet', lib_id: '', title: 'Variance threshold not evidenced', desc: 'The 5% check leaves no record, resulting in unreviewed movements.', cause: 'No working paper', impact: 'Errors pass', category: 'Operational', fraud: false, likelihood: 9, impact_rating: 3, owner: '', step: 3, control: { exists: false } },
        { sub_id: 'tr-recon', lib_id: '', title: 'Out of scope risk', control: { exists: false } }], needs: [{ item: 'Signed payroll sheets for all three months', why: 'to test the approval' }] };
      if (task === 'allocate') return { links: [] };
      if (task === 'requests') return { requests: [{ item: 'Delegation of authority for payroll approval', form: 'Signed', why: 'Approver cover is unclear', sub_id: 'pay-sheet' }], comments: ['The register covers the full period.'] };
      if (task === 'chat') {
        if (/add a step/i.test(prompt.split('AUDITOR').pop())) return { reply: 'Added the archive step.', actions: [{ do: 'add_steps', sub_id: 'pay-sheet', replace: false, steps: [{ type: 'task', actor: 'Payroll clerk', action: 'Files the approved sheet in the finance archive', system: '', review: 'Payroll manager', approval: '', evidence: 'Archive log' }] }, { do: 'add_risks', risks: [{ sub_id: 'pay-sheet', title: 'Should be refused when the plan is approved', control: { exists: false } }] }] };
        if (/change the client/i.test(prompt.split('AUDITOR').pop())) return { reply: 'Trying.', actions: [{ do: 'set_scope', client: 'Someone Else Ltd' }] };
        return { reply: 'Two requests are still outstanding.', actions: [] };
      }
      return {};
    };
    const sample = { json: async (prompt, opts) => { window.__prompts.push(prompt); await new Promise(r => setTimeout(r, 30)); return reply(prompt); }, limits: async () => ({ images: true }) };
    window.claude = { use: async n => n === 'sample' ? sample : null };
  });
  await p.goto('file://' + path);
  await p.waitForSelector('.eng', { timeout: 8000 });
  const cur = () => p.evaluate(() => { const s = Throughline.S; return JSON.parse(JSON.stringify(s.engs.find(e => e.id === s.ui.engId))); });
  const idle = async () => { await p.waitForFunction(() => !Throughline.Agent.busy, null, { timeout: 8000 }); await p.waitForTimeout(200); };
  const stage = async s => { await p.click(`.nav-item[data-stage="${s}"]`); await p.waitForTimeout(150); };
  const say = async t => { await p.fill('#ag-text', t); await p.click('[data-act="ag-send"]'); await idle(); };
  const prompts = () => p.evaluate(() => window.__prompts);
  const papers = await p.evaluate(() => Throughline.Seed.papers());
  const up = async (sel, list) => { await p.setInputFiles(sel, list.map(f => ({ name: f.name, mimeType: 'text/plain', buffer: Buffer.from(f.text) }))); await p.waitForTimeout(500); await idle(); };

  await p.click('[data-act="new-eng"]'); await p.waitForTimeout(200);
  ok('panel shows the model is attached', /Claude/.test(await p.textContent('.ag-head')));
  await up('#scope-file', [papers[0]]);
  let e = await cur(), P = await prompts();
  ok('scope: prompt carried the letter and the catalogue', /^TASK scope/.test(P[0]) && P[0].includes('Expatriate tax equalisation') && P[0].includes('pay-sheet'));
  ok('scope: model output applied; unknown sub-process id dropped', e.scope.client === 'Meridian Industrial Group' && e.scope.processes.join() === 'pay-sheet,pay-transfer' && e.scope.source.engine === 'Claude', e.scope.processes.join());
  ok('scope: model questions surfaced, scope left unconfirmed', !e.cp1 && e.chat[e.chat.length - 1].ask.includes('Is Plant 2 in scope?'));
  await p.click('[data-act="confirm-scope"]'); await p.waitForTimeout(300);
  await stage('understanding'); await up('#walk-file', [papers[1]]);
  e = await cur(); P = await prompts();
  const sh = e.steps.filter(s => s.sub === 'pay-sheet').sort((a, b) => a.n - b.n);
  ok('walkthrough: prompt carried the notes, the in-scope sub-processes and the library index', P.some(x => /^TASK walkthrough/.test(x) && x.includes('Variance') === false || x.includes('variance against the prior month')) && P.some(x => /^TASK walkthrough/.test(x) && x.includes('engagement_letter_meridian.txt')));
  ok('walkthrough: steps applied as drafts with routing; out-of-scope process ignored', sh.length === 4 && sh[2].type === 'decision' && sh[2].yes === sh[1].id && sh[2].no === sh[3].id && e.steps.every(s => s.sub === 'pay-sheet' && s.draft), sh.map(s => s.type).join());
  ok('walkthrough: narrative and requested document recorded', /February/.test(e.subs['pay-sheet'].walkthrough) && e.requests.some(q => q.item === 'Variance review working paper' && q.origin === 'agent' && q.draft));
  await p.click('[data-act="accept-drafts"]'); await p.waitForTimeout(150);
  await stage('risks'); await p.click('.agentbar [data-act="ag-run"][data-what="matrix"][data-sub]'); await idle();
  e = await cur(); P = await prompts();
  ok('matrix: prompt carried the recorded steps and library risks', P.some(x => /^TASK matrix/.test(x) && x.includes('[decision] Payroll manager: Variance above 5%?') && x.includes('L-PAY-04')));
  ok('matrix: risks applied; out-of-scope dropped; out-of-range rating refused', e.risks.length === 2 && e.risks[0].L === 3 && e.risks[0].I === 4 && e.risks[1].L === 0 && e.risks[1].I === 3, JSON.stringify(e.risks.map(r => [r.title.slice(0, 20), r.L, r.I, r.source])));
  ok('matrix: control documented, absence raised as a gap, risk pinned to its step', e.controls.length === 2 && e.controls[0].freq === 'monthly' && e.controls[1].absent && e.gaps.length === 1 && e.risks[0].stepId === sh[3].id);
  ok('matrix: what the model says is needed is shown', e.chat[e.chat.length - 1].need.some(n => /Signed payroll sheets for all three months/.test(n)));
  await p.screenshot({ path: shots + '/m-matrix.png' });
  // free-form chat with actions; guard on confirmed scope
  await say('please change the client to Someone Else Ltd');
  e = await cur(); ok('chat: confirmed scope cannot be changed by the model', e.scope.client === 'Meridian Industrial Group' && e.chat[e.chat.length - 1].ask.some(a => /reopen/.test(a)));
  await say('add a step: the payroll clerk files the approved sheet');
  e = await cur(); P = await prompts();
  ok('chat: prompt carried the file state', /^TASK chat/.test(P[P.length - 1]) && P[P.length - 1].includes('"plan_approved":false') && P[P.length - 1].includes('add a step'));
  ok('chat: step added through the action', e.steps.filter(s => s.sub === 'pay-sheet').length === 5 && e.steps.some(s => s.actor === 'Payroll clerk' && s.draft));
  const m = e.chat[e.chat.length - 1];
  ok('chat: reply shown with undo', m.text === 'Added the archive step.' && !!m.undo && m.engine === 'Claude');
  await p.click('[data-act="ag-undo"]'); await p.click('.modal .btn.danger'); await p.waitForTimeout(300);
  e = await cur(); ok('chat: undo reverts the model action', e.steps.filter(s => s.sub === 'pay-sheet').length === 4 && e.risks.length === 2);
  await stage('requests'); await p.click('[data-act="ag-run"][data-what="requests"]'); await idle();
  e = await cur(); ok('request list: model-raised request added as a draft with its reason', e.requests.some(q => /Delegation of authority/.test(q.item) && q.origin === 'agent' && q.why));
  await say('what is outstanding?');
  e = await cur(); ok('chat: plain question answered without changing the file', e.chat[e.chat.length - 1].text === 'Two requests are still outstanding.' && !e.chat[e.chat.length - 1].undo);

  console.log(log.join('\n')); console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'no console errors');
  console.log(`${log.filter(l => l.startsWith('PASS')).length} passed, ${log.filter(l => l.startsWith('FAIL')).length} failed`);
  await b.close();
})().catch(e => { console.log(log.join('\n')); console.log(errors.join('\n')); console.error('CRASH', e.message.slice(0, 600)); process.exit(1); });

const { chromium } = require('playwright');
const path = process.argv[2], shots = process.argv[3];
const errors = [], log = [];
const ok = (name, cond, extra) => { log.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`); };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1320, height: 900 } });
  p.on('pageerror', e => errors.push('pageerror: ' + String(e.stack || e).slice(0, 400)));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  await p.goto('file://' + path);
  await p.waitForSelector('.eng', { timeout: 8000 });
  const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('throughline.v1')));
  const stage = async s => { await p.click(`.nav-item[data-stage="${s}"]`); await p.waitForTimeout(120); };
  const set = async (sel, v) => { await p.fill(sel, v); await p.dispatchEvent(sel, 'change'); await p.waitForTimeout(60); };
  const pick = async (sel, v) => { await p.selectOption(sel, v); await p.waitForTimeout(80); };

  // ---- sample engagement: every stage renders
  let s = await st();
  ok('sample engagement seeded', s.engs.length === 1 && s.engs[0].sample, `${s.engs[0].requests.length} requests, ${s.engs[0].docs.length} docs, ${s.engs[0].gaps.length} gaps`);
  ok('sample: files tied to requests automatically', s.engs[0].docs.filter(d => d.requestId).length >= 4, s.engs[0].docs.map(d => d.name.slice(0, 14) + '→' + (d.requestId || 'none')).join(' '));
  ok('sample: design fail + ineffective TOE each raised a gap', s.engs[0].gaps.some(g => g.key.startsWith('design:')) && s.engs[0].gaps.some(g => g.key.startsWith('toe:')));
  ok('sample: reconciliation found planted exceptions', s.engs[0].analyses[0].res.exceptions.length === 4 && s.engs[0].analyses[0].res.missing.length === 2, JSON.stringify({ exc: s.engs[0].analyses[0].res.exceptions.length, miss: s.engs[0].analyses[0].res.missing.length, matched: s.engs[0].analyses[0].res.matched }));
  await p.click('.eng [data-act="open"]'); await p.waitForTimeout(150);
  for (const g of ['overview', 'scope', 'requests', 'understanding', 'risks', 'plan', 'testing', 'analysis', 'gaps', 'outputs', 'trail']) { await stage(g); }
  ok('sample: follow-up is locked until issue', await p.$eval('.nav-item[data-stage="followup"]', e => e.classList.contains('locked')));
  await stage('testing'); await p.screenshot({ path: shots + '/t-testing.png' });
  await stage('outputs'); await p.screenshot({ path: shots + '/t-report.png' });
  for (const t of ['matrix', 'register']) { await p.click(`.tab[data-tab="${t}"]`); await p.waitForTimeout(80); }

  // ---- new engagement from scratch
  await p.click('[data-act="nav"][data-view="home"]'); await p.click('[data-act="new-eng"]'); await p.waitForTimeout(150);
  ok('new: confirm disabled while scope incomplete', await p.$eval('[data-act="confirm-scope"]', e => e.disabled));
  ok('new: later stages locked before Checkpoint 1', await p.$eval('.nav-item[data-stage="requests"]', e => e.classList.contains('locked')));
  await set('[data-f="scope.client"]', 'Acme Trading'); await set('[data-f="scope.name"]', 'Treasury and payroll review');
  await set('[data-f="scope.objective"]', 'Assess payment controls.');
  await set('[data-f="scope.periodFrom"]', '2024-01-01'); await set('[data-f="scope.periodTo"]', '2024-03-31');
  for (const sub of ['pay-sheet', 'pay-transfer', 'tr-recon']) { await p.check(`[data-sub="${sub}"]`); await p.waitForTimeout(60); }
  ok('new: still blocked without exclusions', await p.$eval('[data-act="confirm-scope"]', e => e.disabled));
  await p.check('[data-f="scope.noExclusions"]'); await p.waitForTimeout(80);
  await p.click('[data-act="confirm-scope"]'); await p.waitForTimeout(200);
  s = await st(); let e = s.engs[0];
  ok('CP1: scope confirmed and requests derived', !!e.cp1 && e.requests.length === 7, e.requests.length + ' requests');

  // requests: N/A needs a reason; upload real CSVs through the file input
  await p.click('[data-act="req-na"]'); await p.click('[data-act="modal-ok"]');
  ok('N/A without a reason is refused', await p.$('.modal') !== null);
  await p.click('[data-act="modal-cancel"]');
  const fs = require('fs'), os = require('os'), tmp = fs.mkdtempSync(os.tmpdir() + '/tl-');
  fs.writeFileSync(tmp + '/payroll_register_q1.csv', 'Employee Code,Name,Month,Gross,Deductions,Net,Bank Account\nE1,A,2024-01,1000,100,900,X1\nE2,B,2024-01,2000,200,1800,X2\nE1,A,2024-02,1000,100,900,X1\nE2,B,2024-02,2000,200,1800,X2\n');
  fs.writeFileSync(tmp + '/bank_transfers.csv', 'employee_code;month;amount\nE1;2024-01;900\nE2;2024-01;1800\nE1;2024-02;950\nE3;2024-02;500\n');
  fs.writeFileSync(tmp + '/signed payroll sheet feb.pdf', '%PDF-1.4 fake');
  await p.setInputFiles('#file-inp', [tmp + '/payroll_register_q1.csv', tmp + '/bank_transfers.csv', tmp + '/signed payroll sheet feb.pdf']);
  await p.waitForFunction(() => (Throughline.S.engs.find(e => e.id === Throughline.S.ui.engId) || { docs: [] }).docs.length === 3 && !Throughline.Agent.busy, null, { timeout: 5000 }); await p.waitForTimeout(200);
  s = await st(); e = s.engs[0];
  const reg = e.docs.find(d => /register/.test(d.name)), trf = e.docs.find(d => /transfers/.test(d.name)), pdf = e.docs.find(d => /pdf/.test(d.name));
  ok('upload: CSV parsed with normalised headers', reg.rows.length === 4 && reg.headers.includes('employee_code'), reg.headers.join(','));
  ok('upload: classified', reg.docType === 'Payroll register' && trf.docType === 'Bank transfer file', `${reg.docType} / ${trf.docType} / ${pdf.docType}`);
  const rq = id => e.requests.find(q => q.id === id) || {};
  ok('upload: register tied; Jan-Feb data against a Jan-Mar period is flagged', rq(reg.requestId).status === 'incomplete' && /2024-01 to 2024-02 only/.test(rq(reg.requestId).issue), rq(reg.requestId).item + ' → ' + rq(reg.requestId).status + ' / ' + rq(reg.requestId).issue);
  ok('upload: transfer file missing required fields → incomplete', rq(trf.requestId).status === 'incomplete', (rq(trf.requestId).missing || []).join(','));
  ok('upload: semicolon-delimited file parsed', trf.rows.length === 4 && trf.rows[2].amount === '950');
  ok('upload: sha-256 recorded', /^[0-9a-f]{64}$/.test(reg.hash));
  await p.screenshot({ path: shots + '/t-requests.png' });

  // process before risk
  await stage('understanding');
  ok('risks stage locked before any step is recorded', await p.$eval('.nav-item[data-stage="risks"]', x => x.classList.contains('locked')));
  await p.click('[data-act="add-step"]'); await p.waitForTimeout(100);
  await set('[data-c="steps"][data-f="actor"]', 'Payroll manager'); await set('[data-c="steps"][data-f="action"]', 'Prepares and approves the payroll sheet');
  await set('[data-c="steps"][data-f="approval"]', 'Payroll manager');
  ok('step flagged: same role performs and checks', (await p.textContent('.content')).includes('Same role performs and checks'));
  await stage('risks');
  await p.click('[data-act="lib-accept"]'); await p.waitForTimeout(120);
  await pick('[data-c="risks"][data-f="L"]', '4'); await pick('[data-c="risks"][data-f="I"]', '4');
  ok('risk scored 16 and banded High by the methodology', (await p.textContent('.risk-card')).includes('16') && (await p.textContent('.risk-card')).includes('High'));
  await stage('plan');
  ok('CP2 blocked: risk without control or absence', await p.$eval('[data-act="approve-plan"]', x => x.disabled));
  await stage('risks'); await p.click('[data-act="ctl-add"][data-lib="1"]'); await p.waitForTimeout(120);
  for (const sub of ['pay-transfer', 'tr-recon']) {
    await p.click(`.list-item[data-stage="risks"][data-sub="${sub}"]`); await p.waitForTimeout(100);
    ok(`${sub}: risks blocked until its process is recorded`, (await p.textContent('.content')).includes('Process before risk'));
    await stage('understanding'); await p.click(`.list-item[data-sub="${sub}"]`); await p.waitForTimeout(80);
    await p.click('[data-act="add-step"]'); await p.waitForTimeout(100);
    await set('[data-c="steps"][data-f="actor"]', 'Finance officer'); await set('[data-c="steps"][data-f="action"]', 'Performs the task');
    await stage('risks'); await p.click(`.list-item[data-sub="${sub}"]`); await p.waitForTimeout(80);
    await p.click('[data-act="lib-accept"]'); await p.waitForTimeout(120);
    await pick('[data-c="risks"][data-f="L"]', '3'); await pick('[data-c="risks"][data-f="I"]', '5');
    await p.click('[data-act="ctl-absent"]'); await p.waitForTimeout(120);
  }
  s = await st(); e = s.engs[0];
  ok('recording an absence raises a gap directly', e.gaps.filter(g => g.key.startsWith('absence:')).length === 2 && e.controls.filter(c => c.absent).length === 2);
  await p.screenshot({ path: shots + '/t-risks.png' });
  await stage('plan'); await p.screenshot({ path: shots + '/t-plan.png' });
  ok('plan: monthly control sized at 8 from the table', (await p.textContent('.content')).includes('Sample of 8'));
  await set('[data-c="etests"][data-f="popCount"]', '3');
  ok('plan: sample capped at the population of 3', (await p.textContent('.content')).includes('Sample of 3'));
  await p.click('[data-act="approve-plan"]'); await p.waitForTimeout(200);
  s = await st(); e = s.engs[0]; ok('CP2: plan approved', !!e.cp2);

  // testing: design before effectiveness
  ok('effectiveness blocked until design concludes', (await p.textContent('.content')).includes('Design before effectiveness'));
  ok('design cannot pass with empty factors', await p.$eval('[data-act="d-pass"]', x => x.disabled));
  await set('[data-c="dtests"][data-f="walkthrough"]', 'Followed the February sheet end to end.'); await set('[data-c="dtests"][data-f="date"]', new Date().toISOString().slice(0, 10));
  for (let i = 0; i < 5; i++) await set(`[data-f="factors.${i}"]`, 'Specific answer ' + i + ' for this control.');
  await p.click('[data-act="d-pass"]'); await p.waitForTimeout(150);
  ok('select-sample enabled once population exists', !(await p.$eval('[data-act="select-sample"]', x => x.disabled)));
  await pick('[data-c="etests"][data-f="completeness"]', 'reconciled'); await set('[data-c="etests"][data-f="completenessBasis"]', 'Agreed to the register.');
  await p.click('[data-act="select-sample"]'); await p.waitForTimeout(150);
  s = await st(); e = s.engs[0]; const cid = e.controls.find(c => !c.absent).id;
  ok('sample of 3 selected with a recorded seed', e.etests[cid].items.length === 3 && e.etests[cid].seed > 0);
  const tri = async (i, a, times) => { for (let k = 0; k < times; k++) { await p.click(`.tri[data-i="${i}"][data-a="${a}"]`); await p.waitForTimeout(50); } };
  for (let i = 0; i < 3; i++) for (let a = 0; a < 3; a++) await tri(i, a, 1);
  s = await st(); e = s.engs[0];
  ok('all attributes met → effective, no test gap', !e.gaps.some(g => g.key.startsWith('toe:')) && (await p.$$eval('.concl.eff', x => x.length)) === 2);
  await tri(1, 2, 1);
  s = await st(); e = s.engs[0];
  ok('one failed attribute → ineffective and a gap raised', e.gaps.some(g => g.key === 'toe:' + cid) && (await p.textContent('.content')).includes('Ineffective'), (e.gaps.find(g => g.key.startsWith('toe:')) || {desc:''}).desc.slice(0, 90));
  ok('no control to mark the test effective', (await p.$('[data-act*="override"],[data-act*="mark-eff"]')) === null);
  await p.click('[data-act="extend"]'); await p.waitForTimeout(120);
  s = await st(); e = s.engs[0];
  ok('extending the sample leaves the conclusion ineffective', (await p.textContent('.content')).includes('Ineffective'), e.etests[cid].items.length + ' items');
  ok('preparer cannot review own working paper', await p.$eval('[data-act="review"]', x => x.disabled));
  await p.screenshot({ path: shots + '/t-toe.png', fullPage: false });

  // analysis: run a real reconciliation on the uploaded files
  await stage('analysis');
  await pick('[data-k="src.0"]', reg.id); await pick('[data-k="src.1"]', trf.id);
  await p.click('[data-act="run-recon"]'); await p.waitForTimeout(200);
  s = await st(); e = s.engs[0]; const A = e.analyses[0];
  ok('reconciliation: keys guessed, 2 matched, 1 amount exception (+50), 2 unmatched', A && A.res.matched === 2 && A.res.exceptions.length === 1 && A.res.exceptions[0].diff === 50 && A.res.missing.length === 2, A ? JSON.stringify({ keys: A.cfg.sources.map(x => x.keys.join('+')), amt: A.cfg.sources.map(x => x.amount), m: A.res.matched, x: A.res.exceptions, miss: A.res.missing.length }) : 'none');
  await p.click('[data-act="an-gap"]'); await p.waitForTimeout(120);
  await p.screenshot({ path: shots + '/t-analysis.png' });

  // gaps → report guards → issue
  await stage('outputs');
  ok('issue blocked while gaps are incomplete', await p.$eval('[data-act="issue"]', x => x.disabled));
  await stage('gaps');
  s = await st(); e = s.engs[0];
  for (const g of e.gaps) {
    const q = f => `[data-c="gaps"][data-id="${g.id}"][data-f="${f}"]`;
    await set(q('cause'), 'No periodic or independent review'); await pick(q('rating'), g.key.startsWith('toe') ? 'High' : 'Moderate');
    await set(q('response'), 'We will evidence the review monthly.'); await set(q('owner'), 'Management'); await set(q('due'), '2026-12-31');
  }
  ok('owner "Management" rejected as not a named role', (await p.textContent('.content')).includes('owner must be a named role'));
  for (const g of e.gaps) { const q = f => `[data-c="gaps"][data-id="${g.id}"][data-f="${f}"]`; await set(q('owner'), 'Finance manager'); await set(q('clearedWith'), 'Payroll manager'); await p.check(q('cleared')); await p.waitForTimeout(60); }
  await stage('outputs');
  await pick('[data-f="report.overall"]', 'Needs improvement'); await p.click('[data-act="compose"]'); await p.waitForTimeout(150);
  const blockers = await p.$eval('[data-act="issue"]', x => x.disabled);
  ok('issue enabled once every guard is satisfied', !blockers, blockers ? (await p.textContent('.banner')).slice(0, 300) : '');
  await p.click('[data-act="issue"]'); await p.waitForTimeout(200);
  s = await st(); e = s.engs[0];
  ok('report issued and follow-up opened', !!e.report.issuedAt && Object.keys(e.followup).length === e.gaps.length);
  await p.screenshot({ path: shots + '/t-issued.png' });
  await stage('followup');
  await pick('[data-change="fu-status"]', 'implemented'); await p.waitForTimeout(120);
  s = await st(); e = s.engs[0];
  ok('follow-up cannot close without evidence', Object.values(e.followup)[0].status === 'open');
  await stage('overview'); await p.screenshot({ path: shots + '/t-overview.png' });
  s = await st(); e = s.engs[0];
  ok('audit trail recorded the work', e.trail.length > 25, e.trail.length + ' entries');
  await stage('trail');

  // persistence across reload
  await p.reload(); await p.waitForSelector('.nav-item'); s = await st();
  ok('state survives a reload', s.engs.length === 2 && !!s.engs[0].report.issuedAt);

  // phone width: no horizontal page scroll
  await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(150);
  ok('no horizontal overflow at phone width', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  console.log(log.join('\n')); console.log('\nERRORS: ' + (errors.length ? '\n' + errors.join('\n') : 'none'));
  await b.close();
})().catch(e => { console.log(log.join('\n')); console.log('CRASH: ' + String(e.stack || e).slice(0, 900)); console.log('ERRORS: ' + errors.join('\n')); process.exit(1); });

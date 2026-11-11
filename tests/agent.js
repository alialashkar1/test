const { chromium } = require('playwright');
const path = process.argv[2], shots = process.argv[3], fs = require('fs');
const errors = [], log = [];
const ok = (name, cond, extra) => { log.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`); };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  p.on('pageerror', e => errors.push('pageerror: ' + String(e.stack || e).slice(0, 500)));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  await p.goto('file://' + path);
  await p.waitForSelector('.eng', { timeout: 8000 });
  const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('throughline.v1')));
  const cur = async () => { const s = await st(); return s.engs.find(e => e.id === s.ui.engId); };
  const stage = async s => { await p.click(`.nav-item[data-stage="${s}"]`); await p.waitForTimeout(150); };
  const idle = async () => { await p.waitForFunction(() => !Throughline.Agent.busy, null, { timeout: 8000 }); await p.waitForTimeout(200); };
  const say = async t => { await p.fill('#ag-text', t); await p.click('[data-act="ag-send"]'); await idle(); };
  const lastMsg = async () => { const e = await cur(); return e.chat[e.chat.length - 1]; };
  const papers = await p.evaluate(() => Throughline.Seed.papers());
  const files = await p.evaluate(() => Throughline.Seed.files());
  const up = async (sel, list) => { await p.setInputFiles(sel, list.map(f => ({ name: f.name, mimeType: f.name.endsWith('.csv') ? 'text/csv' : 'text/plain', buffer: Buffer.from(f.text) }))); await p.waitForTimeout(500); await idle(); };

  // ---- sample engagement renders with the agent beside every page
  await p.click('.eng [data-act="open"]'); await p.waitForTimeout(200);
  ok('agent panel is shown beside the page', !!(await p.$('.agent #ag-text')));
  for (const g of ['overview', 'scope', 'requests', 'library', 'understanding', 'risks', 'plan', 'testing', 'analysis', 'gaps', 'outputs', 'trail']) { await stage(g); ok(`sample: ${g} renders with agent`, !!(await p.$('.agent')) && !!(await p.$('.content h1'))); }
  let e = await cur();
  ok('sample: flow has decisions and loops', e.steps.filter(s => s.type === 'decision').length === 2 && e.steps.some(s => s.type === 'system'));
  await stage('understanding'); await p.click('.sub-item[data-sub="pay-sheet"], [data-act="stage"][data-sub="pay-sheet"], [data-sub="pay-sheet"]').catch(() => {});
  await p.waitForTimeout(200);
  await p.screenshot({ path: shots + '/a-sample-flow.png', fullPage: false });
  ok('sample: complex flow drawn', (await p.$$('.flow polygon.dec')).length >= 1 && (await p.$$('.flow .fl-arrow.loop, .flow .fl-arrow.no')).length >= 1 && (await p.$$('.flow .fl-risk')).length >= 1, `dec ${(await p.$$('.flow polygon.dec')).length}`);
  await stage('library'); await p.click('.tab[data-tab="alloc"]'); await p.waitForTimeout(150);
  await p.screenshot({ path: shots + '/a-sample-alloc.png' });
  ok('sample: one automatic allocation awaits approval', e.docs.filter(d => d.alloc === 'auto').length === 1 && !!(await p.$('[data-act="alloc-approve"]')));

  // ---- new engagement: scope from the engagement letter (uploaded on the scope page)
  await p.click('[data-act="nav"][data-view="home"]'); await p.click('[data-act="new-eng"]'); await p.waitForTimeout(200);
  ok('new: scope page offers upload of the letter', !!(await p.$('#scope-file')));
  await up('#scope-file', [papers[0]]);
  e = await cur();
  ok('scope drafted from the uploaded letter', e.scope.client === 'Meridian Industrial Group' && e.scope.periodFrom === '2024-01-01' && e.scope.periodTo === '2024-03-31' && e.scope.processes.length === 5 && e.scope.exclusions.length === 1, JSON.stringify({ c: e.scope.client, f: e.scope.periodFrom, t: e.scope.periodTo, p: e.scope.processes, x: e.scope.exclusions, r: e.scope.reader, o: e.scope.objective.slice(0, 40) }));
  ok('scope: letter classified and kept as reference', e.docs[0].docType === 'Engagement letter / scope' && e.docs[0].alloc === 'reference', e.docs[0].docType + ' ' + e.docs[0].alloc);
  ok('scope: not confirmed by the agent', !e.cp1 && !!e.scope.source);
  let m = await lastMsg();
  ok('scope: agent reported what it did with undo', m.did.length >= 5 && !!m.undo, m.did.join(' | ').slice(0, 200));
  await p.screenshot({ path: shots + '/a-scope.png' });
  // undo then rebuild from the library with one click
  await p.click('[data-act="ag-undo"]'); await p.click('.modal [data-ok], .modal .btn.danger, .modal .btn.primary'); await p.waitForTimeout(300);
  e = await cur();
  ok('undo restores the empty scope', !e.scope.client && e.scope.processes.length === 0, JSON.stringify(e.scope).slice(0, 120));
  ok('scope page finds the letter in the library', !!(await p.$('.agentbar [data-act="ag-run"][data-what="scope"]')));
  await p.click('.agentbar [data-act="ag-run"][data-what="scope"]'); await idle();
  e = await cur(); ok('scope rebuilt from the library with one click', e.scope.client === 'Meridian Industrial Group' && e.scope.processes.length === 5);
  // auditor overrides a field by hand
  await p.fill('[data-f="scope.reader"]', 'Board audit committee'); await p.dispatchEvent('[data-f="scope.reader"]', 'change'); await p.waitForTimeout(100);
  ok('confirm enabled after agent draft', !(await p.$eval('[data-act="confirm-scope"]', el => el.disabled)));
  await p.click('[data-act="confirm-scope"]'); await p.waitForTimeout(300);
  e = await cur();
  ok('request list built at v1 on confirmation', !!e.cp1 && e.requests.length >= 10 && e.irl.v >= 1 && e.scope.reader === 'Board audit committee', `${e.requests.length} requests v${e.irl.v}`);
  const v0 = e.irl.v;

  // ---- living request list: upload client files; wrong period flagged; auto-link vs pending
  const reg = files.find(f => /register/.test(f.name)), short = { name: 'payroll_register_jan_feb.csv', text: reg.text.split('\n').filter((l, i) => i === 0 || !/2024-03/.test(l)).join('\n') };
  const odd = { name: 'misc_export_final_v2.csv', text: 'ref,value,note\n1,200,a\n2,300,b' };
  await up('#file-inp', [short, files.find(f => /transfer/.test(f.name)), files.find(f => /access/.test(f.name)), odd]);
  e = await cur();
  const qReg = e.requests.find(q => /Monthly payroll register/.test(q.item));
  ok('IRL: register covering Jan–Feb only is marked not usable with the reason', qReg.status === 'incomplete' && /2024-01 to 2024-02/.test(qReg.issue || ''), qReg.status + ' / ' + qReg.issue);
  ok('IRL: documents linked themselves on upload', e.docs.filter(d => d.alloc === 'auto').length === 3, e.docs.map(d => d.name.slice(0, 12) + ':' + d.alloc).join(' '));
  ok('IRL: unmatched document left pending allocation', e.docs.find(d => /misc/.test(d.name)).alloc === 'pending');
  ok('IRL: version moved and the change was logged', e.irl.v > v0 && e.irl.log[e.irl.log.length - 1].changes.length > 0, `v${v0}→v${e.irl.v}: ${e.irl.log[e.irl.log.length - 1].changes[0]}`);
  m = await lastMsg(); ok('agent reported the filing and the request-list changes', (m.did || []).length === 4 && (m.irl || []).length > 0, (m.irl || []).join(' | ').slice(0, 160));
  await stage('requests'); await p.screenshot({ path: shots + '/a-requests.png', fullPage: true });
  ok('requests page shows version and allocation queue link', /Version \d+/.test(await p.textContent('.content')) && !!(await p.$('[data-act="goto-alloc"]')));
  // override status
  await p.click(`[data-act="req-override"][data-id="${qReg.id}"]`); await p.selectOption('.modal select', 'received'); await p.fill('.modal textarea', 'March register to follow; Jan-Feb accepted for interim work'); await p.click('.modal .btn.primary'); await p.waitForTimeout(250);
  e = await cur(); let q2 = e.requests.find(q => q.id === qReg.id);
  ok('override: auditor status stands, computed kept', q2.status === 'received' && q2.override && q2.computed === 'incomplete', q2.status + '/' + q2.computed);
  await p.click(`[data-act="req-clear"][data-id="${qReg.id}"]`); await p.waitForTimeout(200);
  e = await cur(); ok('override cleared returns to computed', e.requests.find(q => q.id === qReg.id).status === 'incomplete');
  // corrected file arrives → resolves
  await up('#file-inp', [reg]);
  e = await cur(); q2 = e.requests.find(q => q.id === qReg.id);
  ok('IRL: full-period register arriving resolves the item', q2.status === 'received' && !q2.issue, q2.status + ' / ' + q2.issue);
  // remove a request → suppressed, not re-added; restore from history
  const victim = e.requests.find(q => /Job offers/.test(q.item)), nBefore = e.requests.length;
  await p.click(`[data-act="req-del"][data-id="${victim.id}"]`); await p.fill('.modal textarea', 'Covered by HR file review'); await p.click('.modal .btn.danger'); await p.waitForTimeout(250);
  e = await cur(); ok('removed request stays removed (suppressed)', e.requests.length === nBefore - 1 && e.irl.suppressed.length === 1);
  await p.click('.tab[data-tab="history"]'); await p.waitForTimeout(120);
  ok('history tab lists versions', (await p.$$('.content .card .tag')).length >= 2);
  await p.click('[data-act="req-restore"]'); await p.waitForTimeout(250);
  e = await cur(); ok('restore brings the request back', e.requests.length === nBefore && e.irl.suppressed.length === 0);

  // ---- allocation queue
  await p.click('.tab[data-tab="list"]').catch(() => {}); await p.click('[data-act="goto-alloc"]'); await p.waitForTimeout(200);
  await p.screenshot({ path: shots + '/a-alloc.png', fullPage: true });
  ok('allocation tab lists pending and automatic links', !!(await p.$('[data-act="alloc-ref"]')) && (await p.$$('[data-act="alloc-approve"]')).length >= 3);
  await p.click('[data-act="alloc-approve-all"]'); await p.waitForTimeout(200);
  e = await cur(); ok('approve all approves automatic links', e.docs.filter(d => d.alloc === 'auto').length === 0 && e.docs.filter(d => d.alloc === 'approved').length >= 3);
  const misc = e.docs.find(d => /misc/.test(d.name)), target = e.requests.find(q => /Bank mandate/.test(q.item));
  await p.selectOption(`[data-change="alloc-pick"][data-id="${misc.id}"]`, target.id); await p.waitForTimeout(250);
  e = await cur(); ok('pending document allocated by hand', e.docs.find(d => d.id === misc.id).alloc === 'approved' && e.docs.find(d => d.id === misc.id).requestId === target.id && e.requests.find(q => q.id === target.id).status === 'received');
  await p.click(`[data-act="alloc-reopen"][data-id="${misc.id}"]`); await p.waitForTimeout(200);
  await p.click(`[data-act="alloc-ref"][data-id="${misc.id}"]`); await p.waitForTimeout(200);
  e = await cur(); ok('reopen then mark reference only', e.docs.find(d => d.id === misc.id).alloc === 'reference' && e.requests.find(q => q.id === target.id).status === 'pending');

  // ---- walkthrough from meeting notes (uploaded on the page), complex flow
  await stage('understanding');
  ok('walkthrough page offers upload and paste', !!(await p.$('#walk-file')) && !!(await p.$('[data-act="ag-paste"]')));
  await up('#walk-file', [papers[1]]);
  e = await cur();
  const by = sub => e.steps.filter(s => s.sub === sub).sort((a, b) => a.n - b.n);
  const sh = by('pay-sheet'), tr = by('pay-transfer'), ac = by('pay-access');
  ok('walkthrough: three sub-processes built from the notes', sh.length === 6 && tr.length === 3 && ac.length === 2, `${sh.length}/${tr.length}/${ac.length} :: ` + sh.map(s => `${s.n}[${s.type}] ${s.actor}: ${s.action} |r:${s.review}|a:${s.approval}|e:${s.evidence}`).join(' ;; '));
  const dec = sh.find(s => s.type === 'decision');
  ok('walkthrough: decision loops back to the earlier step', dec && dec.yes === sh[1].id && dec.no === sh[4].id, dec ? `${dec.action} yes→${(sh.find(s => s.id === dec.yes) || {}).n} no→${(sh.find(s => s.id === dec.no) || {}).n}` : 'none');
  ok('walkthrough: automated step recognised', sh[0].type === 'system' && sh[0].system === 'Payroll system', sh[0].type + ' ' + sh[0].system);
  ok('walkthrough: reviewer, approver, system and evidence extracted', tr[0].review === 'Group controller' && tr[0].system === 'Banking portal' && tr[2].approval === 'Finance director' && tr[2].evidence === 'Bank confirmation' && ac[0].approval === 'Payroll director', JSON.stringify(tr.map(s => [s.actor, s.action, s.review, s.approval, s.system, s.evidence])) + JSON.stringify(ac.map(s => [s.actor, s.action, s.review, s.approval, s.system, s.evidence])));
  ok('walkthrough: steps are drafts', e.steps.every(s => s.draft));
  m = await lastMsg();
  ok('walkthrough: agent raised questions and what is still needed', m.ask.length >= 1 && m.need.length >= 1, 'ASK ' + m.ask.join(' | ').slice(0, 220) + ' NEED ' + m.need.join(' | ').slice(0, 200));
  e = await cur();
  ok('IRL grew from the walkthrough evidence', e.requests.some(q => q.origin === 'process') || e.requests.some(q => q.origin === 'agent'), e.requests.filter(q => q.origin !== 'scope').map(q => q.origin + ':' + q.item).join(' | '));
  await p.evaluate(() => { Throughline.S.ui.sub = 'pay-sheet'; Throughline.render(); }); await p.waitForTimeout(200);
  ok('flow: decision, loop, automated step and systems band drawn', (await p.$$('.flow polygon.dec')).length === 1 && (await p.$$('.flow .fl-arrow.loop')).length >= 1 && (await p.$$('.flow .fl-auto')).length === 1 && (await p.$$('.flow .fl-sysc')).length >= 2);
  await p.screenshot({ path: shots + '/a-walk.png', fullPage: true });
  // manual override of a drafted step + accept drafts
  await p.fill(`[data-c="steps"][data-id="${sh[2].id}"][data-f="evidence"]`, 'Variance review working paper'); await p.dispatchEvent(`[data-c="steps"][data-id="${sh[2].id}"][data-f="evidence"]`, 'change'); await p.waitForTimeout(150);
  await p.click('[data-act="accept-drafts"]'); await p.waitForTimeout(200);
  e = await cur(); ok('auditor edit kept and drafts accepted for the sub-process', e.steps.find(s => s.id === sh[2].id).evidence === 'Variance review working paper' && e.steps.filter(s => s.sub === 'pay-sheet').every(s => !s.draft) && e.steps.filter(s => s.sub === 'pay-transfer').every(s => s.draft));
  await p.click('.flow .fl-step'); await p.waitForTimeout(150);
  e = await cur(); ok('flow: clicking a step marks it seen', e.steps.some(s => s.walked));

  // ---- matrix from the walkthrough
  await stage('risks');
  ok('risks page has build buttons', (await p.$$('.agentbar [data-act="ag-run"][data-what="matrix"]')).length === 2);
  await p.click('.agentbar [data-act="ag-run"][data-what="matrix"]:not([data-sub])'); await idle();
  e = await cur();
  ok('matrix: risks and controls drafted from the steps', e.risks.length >= 4 && e.controls.filter(c => !c.absent).length >= 3 && e.risks.every(r => r.draft), `${e.risks.length} risks, ${e.controls.length} controls (${e.controls.filter(c => c.absent).length} absent)`);
  ok('matrix: self-approval detected as a risk with no control', e.risks.some(r => /performs and approves/.test(r.title)) && e.controls.some(c => c.absent), e.risks.map(r => r.title.slice(0, 30)).join(' | '));
  ok('matrix: risks pinned to steps', e.risks.filter(r => r.stepId).length >= 3);
  m = await lastMsg();
  ok('matrix: agent says what extra is needed and what has no walkthrough', m.ask.some(a => /no walkthrough/.test(a)) && m.need.length >= 1, m.ask.join(' | ').slice(0, 260));
  await p.screenshot({ path: shots + '/a-risks.png' });
  await stage('plan');
  ok('plan cannot be approved while drafts are open', await p.$eval('[data-act="approve-plan"]', el => el.disabled).catch(() => 'no button'));
  // undo the matrix from the thread
  const nR = e.risks.length;
  await p.click('[data-act="ag-undo"]'); await p.click('.modal .btn.danger'); await p.waitForTimeout(300);
  e = await cur(); ok('undo removes the drafted matrix', e.risks.length === 0 && nR > 0 && e.gaps.length === 0, `${e.risks.length} risks, ${e.gaps.length} gaps`);

  // ---- chat (rules engine)
  await say('build the risks and controls for everything');
  e = await cur(); ok('chat: "build the risks and controls" rebuilds the matrix', e.risks.length === nR);
  await say('what is still needed?');
  m = await lastMsg(); ok('chat: lists what is outstanding', m.need.length > 0, m.need[0]);
  await say('what should I do next?');
  m = await lastMsg(); ok('chat: says what is next', /Next is/.test(m.text), m.text);
  await say('update the request list');
  m = await lastMsg(); ok('chat: request list review reports the version', /version \d+/.test(m.text), m.text + ' :: ' + (m.did || []).join('|').slice(0, 120));
  await say('undo'); m = await lastMsg(); ok('chat: undo works by typing', /Undone|nothing to undo/i.test(m.text), m.text);
  // describing a process in the chat builds it
  await stage('understanding'); await p.evaluate(() => { Throughline.S.ui.sub = 'pay-joiner'; Throughline.render(); }); await p.waitForTimeout(150);
  await say('The HR officer prepares the job offer and the personnel action form, approved by the HR director. The payroll clerk enters the new employee into the payroll system from the signed contract. It is reviewed by the payroll manager. If the salary differs from the contract, the entry is returned to the payroll clerk.');
  e = await cur(); const jn = e.steps.filter(s => s.sub === 'pay-joiner').sort((a, b) => a.n - b.n);
  ok('chat: a process described in words becomes steps with a decision', jn.length === 3 && jn[2].type === 'decision' && jn[1].review === 'Payroll manager' && jn[0].approval === 'HR director', jn.map(s => `${s.n}[${s.type}] ${s.actor}: ${s.action}|${s.review}|${s.approval}|${s.evidence}`).join(' ;; '));
  await p.screenshot({ path: shots + '/a-chat.png' });
  // hide / show the agent
  await p.click('[data-act="ag-toggle"]'); await p.waitForTimeout(150); ok('agent can be hidden', !(await p.$('.agent')));
  await p.click('.topbar [data-act="ag-toggle"]'); await p.waitForTimeout(150); ok('agent can be reopened from the top bar', !!(await p.$('.agent')));

  // ---- narrow screen
  await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(200);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok('phone: no horizontal page scroll', over <= 0, 'overflow ' + over);
  await p.screenshot({ path: shots + '/a-phone.png' });

  console.log(log.join('\n')); console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'no console errors');
  console.log(`${log.filter(l => l.startsWith('PASS')).length} passed, ${log.filter(l => l.startsWith('FAIL')).length} failed`);
  await b.close();
})().catch(e => { console.log(log.join('\n')); console.log(errors.join('\n')); console.error('CRASH', e.message.slice(0, 600)); process.exit(1); });

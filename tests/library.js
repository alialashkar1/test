const { chromium } = require('playwright');
const path = process.argv[2], shots = process.argv[3], files = process.argv[4];
const errors = [], log = [];
const ok = (name, cond, extra) => log.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, ignoreHTTPSErrors: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('pageerror: ' + String(e.stack || e).slice(0, 400)));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
  await p.goto('file://' + path);
  await p.waitForSelector('.eng', { timeout: 8000 });
  const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('throughline.v1')));
  const stage = async s => { await p.click(`.nav-item[data-stage="${s}"]`); await p.waitForTimeout(150); };
  await p.click('.eng [data-act="open"]'); await p.waitForTimeout(150);

  // ---- library: hierarchy from the sample files
  await stage('library');
  ok('hierarchy: every sample document is a leaf', (await p.$$('.hx-doc')).length === 7, String((await p.$$('.hx-doc')).length));
  ok('hierarchy: process → sub-process → request levels', (await p.$$('.hx-proc')).length >= 1 && (await p.$$('.hx-sub')).length === 5 && (await p.$$('.hx-req')).length >= 11, `${(await p.$$('.hx-proc')).length}/${(await p.$$('.hx-sub')).length}/${(await p.$$('.hx-req')).length}`);
  ok('hierarchy: requests with nothing received are shown empty', (await p.$$('.hx-req.empty')).length >= 6, String((await p.$$('.hx-req.empty')).length));
  await p.screenshot({ path: shots + '/l-tree.png', fullPage: false });

  // ---- dump Excel, PDF, Word, image
  await p.setInputFiles('#file-inp', ['vendor_master_2024.xlsx', 'bank mandate signatories.pdf', 'HR payroll policy v3.docx', 'screenshot payroll approval.png'].map(f => files + '/' + f));
  await p.waitForFunction(() => document.querySelectorAll('.hx-doc').length === 11, null, { timeout: 45000 });
  let s = await st(), e = s.engs[0];
  const d = n => e.docs.find(x => x.name.includes(n));
  const xl = d('vendor'), pdf = d('mandate'), docx = d('policy'), img = d('screenshot');
  ok('Excel: workbook read into rows', !!xl.rows && xl.rows.length === 30 && xl.headers.includes('vendor_id'), xl.rows ? `${xl.rows.length} rows, ${xl.headers.join(',')}; sheets ${xl.sheets}` : xl.note);
  ok('Excel: classified as vendor master', xl.docType === 'Vendor master data', xl.docType);
  ok('PDF: text extracted across pages', !!pdf.text && /Authorised Signatories/.test(pdf.text) && pdf.pages === 2, pdf.text ? pdf.text.slice(0, 60).replace(/\n/g, ' | ') : pdf.note);
  ok('PDF: filed under the bank mandate request automatically', (e.requests.find(q => q.id === pdf.requestId) || {}).item === 'Bank mandate / authorised signatories', (e.requests.find(q => q.id === pdf.requestId) || {}).item + ' @' + pdf.tieConf);
  ok('Word: text extracted', !!docx.text && /Payroll Policy/.test(docx.text), docx.text ? docx.text.slice(0, 50).replace(/\n/g, ' | ') : docx.note);
  ok('Word: classified as policy', docx.docType === 'Policy / procedure', docx.docType);
  ok('Image: kept and marked as not read', !img.text && /not read/.test(img.note || ''), img.docType + ' — ' + img.note);
  ok('hierarchy: documents with no request land under Not filed', (await p.$$('.hx-unfiled')).length === 1);
  await p.screenshot({ path: shots + '/l-tree2.png', fullPage: true });

  // ---- item cards with main points
  await p.click('.tab[data-tab="cards"]'); await p.waitForTimeout(150);
  const cards = await p.$$eval('.dcard', els => els.map(c => ({ name: c.querySelector('.dn').textContent, pts: [...c.querySelectorAll('.pts li')].map(l => l.textContent) })));
  const card = n => cards.find(c => c.name.includes(n)) || { pts: [] };
  ok('cards: one per document', cards.length === 11, String(cards.length));
  ok('card (payroll register): computed rows, period, distinct, totals', card('payroll_register').pts.some(x => /117 rows/.test(x)) && card('payroll_register').pts.some(x => /2024-01 to 2024-03/.test(x)) && card("payroll_register").pts.some(x => /40 distinct employee code/.test(x)) && card('payroll_register').pts.some(x => /^net: total/.test(x)), card('payroll_register').pts.join(' || '));
  ok('card (bank transfers): flags the planted duplicate', card('bank_transfer').pts.some(x => /repeated employee code \+ month/.test(x)), card('bank_transfer').pts.join(' || '));
  ok('card (Excel): blanks and second sheet noted', card('vendor').pts.some(x => /tax id is blank in 4 of 30/.test(x)) && card('vendor').pts.some(x => /2 sheets/.test(x)), card('vendor').pts.join(' || '));
  ok('card (PDF): dates, amounts, approval and rule extracted', card('mandate').pts.some(x => /^Dates:.*12 March 2024/.test(x)) && card('mandate').pts.some(x => /^Amounts:.*50,000/.test(x)) && card('mandate').pts.some(x => /Approved by the Board/.test(x)) && card('mandate').pts.some(x => /^States:.*must be released by two/.test(x)), card('mandate').pts.join(' || '));
  ok('card (Word): opening line, rule and approver', card('policy').pts.some(x => /Human Resources and Payroll Policy/.test(x)) && card('policy').pts.some(x => /shall not exceed 40 hours/.test(x)) && card('policy').pts.some(x => /Approved by: Chief Executive/.test(x)), card('policy').pts.join(' || '));
  await p.screenshot({ path: shots + '/l-cards.png', fullPage: false });
  await p.fill('[data-change="lib-q"]', 'signatories'); await p.dispatchEvent('[data-change="lib-q"]', 'change'); await p.waitForTimeout(150);
  ok('search finds a document by its contents', (await p.$$('.dcard')).length === 1);
  await p.click('.dcard [data-act="doc-open"]'); await p.waitForTimeout(150);
  ok('item card opens with hash, points and text excerpt', (await p.textContent('.modal')).includes('sha-256') && (await p.$$('.modal .pts li')).length >= 4 && (await p.$('.modal .excerpt')) !== null);
  await p.screenshot({ path: shots + '/l-card-open.png' });
  await p.selectOption('.modal [data-change="tie-doc"]', ''); await p.waitForTimeout(200);
  s = await st(); e = s.engs[0];
  ok('re-filing from the card updates the request', !e.docs.find(x => x.name.includes('mandate')).requestId && e.requests.find(q => q.item.startsWith('Bank mandate')).status === 'pending');
  await p.click('[data-act="modal-cancel"]');
  await p.click('.acts [data-act="ag-run"][data-what="allocate"]'); await p.waitForFunction(() => !Throughline.Agent.busy); await p.waitForTimeout(250);
  s = await st(); e = s.engs[0];
  ok('"Allocate pending" puts it back, awaiting approval', e.docs.find(x => x.name.includes('mandate')).alloc === 'auto' && !!e.docs.find(x => x.name.includes('mandate')).requestId);
  await p.click('.tab[data-tab="tree"]'); await p.click('[data-act="lib-mode"][data-mode="type"]'); await p.waitForTimeout(150);
  ok('hierarchy can be re-arranged by document type', (await p.$$('.hx-sub')).length >= 6 && (await p.$$('.hx-doc')).length === 11);
  await p.screenshot({ path: shots + '/l-tree-type.png' });

  // ---- flow diagram in the walkthrough
  await stage('understanding'); await p.click('.list-item[data-sub="pay-sheet"]'); await p.waitForTimeout(150);
  ok('flow: drawn with one box per step', (await p.$$('svg.flow .fl-step')).length === 6);
  ok('flow: one lane per role', (await p.$$('svg.flow .fl-lane')).length === 5, (await p.$$eval('svg.flow .fl-lane-t', x => x.map(t => t.textContent).join(' '))));
  ok('flow: reviews and approvals by other roles are shown', (await p.$$('svg.flow .fl-pill')).length === 1 && (await p.$$('svg.flow polygon.dec')).length === 1 && (await p.$$('svg.flow .fl-arrow.loop')).length === 1);
  ok('flow: steps seen in the walkthrough are marked', (await p.$$('svg.flow .fl-box.seen')).length === 6);
  await p.click('.list-item[data-sub="pay-access"]'); await p.waitForTimeout(150);
  ok('flow: self-approved step is marked weak', (await p.$$('svg.flow .fl-box.weak')).length === 1 && (await p.textContent('svg.flow')).includes('Same role performs and checks'));
  await p.click('.list-item[data-sub="pay-sheet"]'); await p.waitForTimeout(150);
  await p.screenshot({ path: shots + '/f-flow.png', fullPage: true });
  await p.click('.list-item[data-sub="pay-transfer"]'); await p.waitForTimeout(150);
  await p.click('svg.flow .fl-step'); await p.waitForTimeout(200);
  s = await st(); e = s.engs[0];
  ok('clicking a step in the diagram records it as seen', e.steps.filter(x => x.sub === 'pay-transfer' && x.walked).length === 1 && (await p.textContent('.content')).includes('1 of 3 steps seen'));
  await stage('testing'); await p.click('.list-item[data-ctl="C-02"]'); await p.waitForTimeout(150);
  ok('test of design carries the process flow', (await p.$('details.fold svg.flow')) !== null);
  await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(150);
  await p.evaluate(() => document.querySelector('.nav-item[data-stage="library"]').click()); await p.waitForTimeout(200);
  ok('no horizontal page overflow at phone width', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  console.log(log.join('\n')); console.log('\nERRORS: ' + (errors.length ? '\n' + errors.join('\n') : 'none'));
  await b.close();
})().catch(e => { console.log(log.join('\n')); console.log('CRASH: ' + String(e.stack || e).slice(0, 900)); console.log('ERRORS: ' + errors.join('\n')); process.exit(1); });

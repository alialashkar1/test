/* Sample data. Files are generated as CSV text and pass through the same intake as a real upload. */
const Seed = {
  files() {
    const first = ['Omar', 'Layla', 'Yusuf', 'Mariam', 'Karim', 'Nour', 'Hassan', 'Salma', 'Tarek', 'Dina'], last = ['Aziz', 'Farouk', 'Mansour', 'Nasser'];
    const depts = ['Operations', 'Finance', 'Sales', 'Warehouse', 'Administration'], months = ['2024-01', '2024-02', '2024-03'];
    const emp = Array.from({ length: 40 }, (_, i) => {
      const basic = 3000 + (i * 137) % 2400, allow = 400 + (i * 53) % 300;
      return { code: 'EMP-' + (1001 + i), name: `${first[i % 10]} ${last[Math.floor(i / 10)]}`, dept: depts[i % 5], join: `20${18 + i % 5}-${String(1 + i % 12).padStart(2, '0')}-01`,
        leave: i === 11 ? '2024-01-31' : i === 26 ? '2024-02-15' : '', basic, gross: basic + allow, acct: 'EG' + (380000100000 + i * 7919) };
    });
    const csv = (head, rows) => [head.join(','), ...rows.map(r => r.join(','))].join('\n');
    const reg = [], trf = [];
    months.forEach(m => emp.forEach((e, i) => {
      if (e.leave && m > e.leave.slice(0, 7)) return;
      const ded = Math.round(e.gross * 0.11), net = e.gross - ded;
      reg.push([e.code, e.name, m, e.gross, ded, net, e.acct]);
      let amt = net;
      if ((i === 6 && m === '2024-02') || (i === 18 && (m === '2024-01' || m === '2024-03'))) amt += 660;
      if (i === 32 && m === '2024-03') return;
      trf.push([e.code, m, amt, e.acct, m + '-28']);
      if (i === 14 && m === '2024-01') trf.push([e.code, m, amt, e.acct, m + '-29']);
    }));
    trf.push(['EMP-1099', '2024-02', 2400, 'EG380000999001', '2024-02-28']);
    const roles = ['Payroll clerk', 'HR officer', 'Viewer', 'Viewer', 'HR officer'];
    const acc = [['payroll.director', 'Payroll administrator', 'Active', '2021-03-01'], ['admin', 'System administrator', 'Active', '2019-01-01'],
      ...emp.slice(8, 15).map((e, i) => [e.name.toLowerCase().replace(' ', '.'), roles[i % 5], 'Active', `2023-0${1 + i}-15`])];
    return [
      { name: 'payroll_register_2024Q1.csv', text: csv(['employee_code', 'name', 'month', 'gross', 'deductions', 'net', 'bank_account'], reg) },
      { name: 'bank_transfer_file_2024Q1.csv', text: csv(['employee_code', 'month', 'amount', 'account', 'value_date'], trf) },
      { name: 'employee_master_export.csv', text: csv(['employee_code', 'name', 'department', 'join_date', 'leave_date', 'basic_salary', 'bank_account'], emp.map(e => [e.code, e.name, e.dept, e.join, e.leave, e.basic, e.acct])) },
      { name: 'payroll_user_access_listing.csv', text: csv(['user', 'role', 'status', 'grant_date'], acc) },
      { name: 'leavers_listing_2024.csv', text: csv(['employee_code', 'leave_date'], emp.filter(e => e.leave).map(e => [e.code, e.leave])) },
    ];
  },
  /* The engagement's own papers: what the agent builds the scope and the walkthroughs from. */
  papers() { return [
    { name: 'engagement_letter_meridian.txt', text: `Engagement letter
Client: Meridian Industrial Group
Subject: Payroll & HR controls review
Date: 5 April 2024

The objective of the engagement is to assess the design and operating effectiveness of controls over payroll for the first quarter, and identify where payments could leave the organisation without authorisation.

The review covers the period 1 January 2024 to 31 March 2024.
Locations: Head office; Plant 2

The following sub-processes are in scope: system access rights & master data; new joiner processing; payroll sheet preparation & approval; salary transfer & disbursement; resignation, termination & final settlement.

Expatriate tax equalisation is excluded because it is handled by the external tax adviser under a separate mandate.

The report will be addressed to the Audit Committee.
Fieldwork is planned for three weeks from 15 April 2024. Fees are agreed separately.` },
    { name: 'meeting_notes_payroll_walkthrough.txt', text: `Meeting notes - payroll process walkthrough
Date: 14 April 2024
Attendees: Payroll director, Finance manager, HR systems manager, Internal audit

Sub-process: Payroll sheet preparation & approval
The payroll system automatically calculates gross pay, deductions and net pay from the employee master data.
The administration manager extracts the monthly payroll sheet from the payroll system and signs it.
The payroll manager reviews departmental totals, taxes and deductions against the prior month.
If the variance against the prior month is above 5%, the sheet is returned to the administration manager for correction.
The group controller reviews the signed payroll sheet.
The finance director approves the payroll sheet for payment.
The signed payroll sheet is kept in the finance archive.

Sub-process: Salary transfer & disbursement
The payroll director prepares the salary transfer request from the approved payroll sheet in the banking portal. It is reviewed by the group controller.
If the transfer total differs from the approved payroll sheet, the request is sent back to the payroll director.
The group controller and the finance director release the transfer in the banking portal.
The bank confirmation is filed with the transfer request.

Sub-process: System access rights & master data
The HR systems manager creates and amends user access in the payroll system on request, approved by the payroll director.
The access request form is kept by the HR systems manager.
The payroll director maintains employee master data including salary and bank account in the payroll system. Changes are approved by the payroll director.

Open points: Signed access request forms for January were not available at the meeting.` },
  ]; },
  async loadPapers(eng, only) { const out = [];
    for (const f of Seed.papers()) { if ((only && !f.name.includes(only)) || eng.docs.some(d => d.name === f.name)) continue;
      const d = await Ops.ingest(eng, f.name, f.text.length, 'text/plain', null, new TextEncoder().encode(f.text).buffer, { text: f.text }); d.strength = 'Prepared by the audit team'; out.push(d); }
    return out; },
  async loadFiles(eng) {
    for (const f of Seed.files()) {
      if (eng.docs.some(d => d.name === f.name)) continue;
      const buf = new TextEncoder().encode(f.text).buffer;
      const d = await Ops.ingest(eng, f.name, f.text.length, 'text/csv', f.text, buf);
      d.strength = 'System record extracted by client';
    }
  },

  async engagement() {
    const eng = Ops.newEngagement(); eng.sample = true;
    Object.assign(eng.scope, { client: 'Meridian Industrial Group', name: 'Payroll & HR controls review', type: 'full',
      objective: 'Assess the design and operating effectiveness of controls over payroll for the first quarter, and identify where payments could leave the organisation without authorisation.',
      periodFrom: '2024-01-01', periodTo: '2024-03-31', entities: 'Head office; Plant 2', reader: 'Audit committee',
      processes: ['pay-access', 'pay-joiner', 'pay-sheet', 'pay-transfer', 'pay-leaver'],
      exclusions: [{ what: 'Expatriate tax equalisation', reason: 'Handled by the external tax adviser under a separate mandate' }] });
    Ops.confirmScope(eng);
    eng.requests.forEach(q => { q.owner = /access/i.test(q.item) ? 'IT manager' : /bank|transfer/i.test(q.item) ? 'Finance manager' : 'Payroll director'; });
    await Seed.loadPapers(eng); await Seed.loadFiles(eng);
    eng.scope.source = { docId: (eng.docs.find(d => /engagement_letter/.test(d.name)) || {}).id || '', name: 'engagement_letter_meridian.txt', engine: 'Built-in rules' };
    // the auditor approved most automatic allocations; the access listing is left in the queue to show it
    eng.docs.forEach(d => { if (d.alloc === 'auto' && !/access/.test(d.name)) d.alloc = 'approved'; });

    const st = (sub, rows) => { const made = rows.map(r => Ops.addStep(eng, sub, { actor: r[0], action: r[1], system: r[2], review: r[3], approval: r[4], evidence: r[5], type: r[6] || 'task', docId: Agent.matchDoc(eng, r[5]) }));
      rows.forEach((r, i) => { if (r[7]) { made[i].yes = made[r[7][0] - 1].id; made[i].no = made[r[7][1] - 1].id; } }); return made; };
    const sA = st('pay-access', [
      ['HR systems manager', 'Creates and amends user access in the payroll system on request', 'Payroll system', '', 'Payroll director', 'Access request form'],
      ['Payroll director', 'Maintains employee master data including salary and bank account', 'Payroll system', '', 'Payroll director', ''],
    ]);
    const sS = st('pay-sheet', [
      ['Payroll system', 'Calculates gross pay, deductions and net pay from the employee master data', 'Payroll system', '', '', 'Payroll register', 'system'],
      ['Administration manager', 'Extracts the monthly payroll sheet and signs it', 'Payroll system', 'Payroll manager', '', 'Signed payroll sheet'],
      ['Payroll manager', 'Reviews departmental totals, taxes and deductions against the prior month', 'Spreadsheet', '', '', 'Signed payroll sheet'],
      ['Payroll manager', 'Variance against the prior month above 5%?', '', '', '', '', 'decision', [2, 5]],
      ['Group controller', 'Reviews the signed payroll sheet', '', '', '', 'Signed payroll sheet'],
      ['Finance director', 'Approves the payroll sheet for payment', '', '', '', 'Signed payroll sheet'],
    ]);
    const sT = st('pay-transfer', [
      ['Payroll director', 'Prepares the salary transfer request from the approved payroll sheet', 'Banking portal', 'Group controller', '', 'Transfer request'],
      ['Group controller', 'Transfer total differs from the approved payroll sheet?', '', '', '', '', 'decision', [1, 3]],
      ['Group controller', 'Releases the transfer with the finance director', 'Banking portal', '', 'Finance director', 'Bank confirmation'],
    ]);
    ['pay-access', 'pay-sheet', 'pay-transfer'].forEach(s => { eng.subs[s].confirmedBy = 'Payroll director'; eng.subs[s].confirmedAt = Engine.today(); });
    eng.steps.filter(s => s.sub === 'pay-sheet').forEach(s => { s.walked = true; });
    eng.subs['pay-sheet'].walkthrough = 'Followed the February 2024 payroll sheet from extraction to approval: signed by the administration manager, reviewed by the payroll manager and group controller, approved by the finance director.';

    const acc = (sub, lib, L, I, owner) => { const r = Ops.acceptLib(eng, sub, lib); r.L = L; r.I = I; r.owner = owner; return Ops.addControl(eng, r.id, true); };
    const c1 = acc('pay-access', 'L-PAY-01', 3, 5, 'Payroll director');
    const c2 = acc('pay-sheet', 'L-PAY-04', 3, 4, 'Finance director');
    const c3 = acc('pay-transfer', 'L-PAY-08', 3, 5, 'Finance director');
    [[c1, sA[1]], [c2, sS[5]], [c3, sT[2]]].forEach(([c, step]) => { eng.risks.find(r => r.id === c.riskId).stepId = step.id; });
    eng.itgc = { status: 'failed', note: 'IT audit E-198 concluded access management over the payroll system is ineffective.' };
    Ops.approvePlan(eng);

    S.userId = 'u2';
    const d1 = Ops.dt(eng, c1.id);
    d1.walkthrough = 'Obtained the payroll module access listing. The payroll director holds administrator rights and maintains master data, with no independent authorisation of changes.'; d1.date = Engine.today();
    d1.factors = ['Restricting who may amend master data correlates directly to the risk of unauthorised master-file change.', 'The HR systems manager administers access and has authority to grant and remove it.', 'Ad hoc is appropriate: the control triggers on each access change.', 'Not applicable — the control operates at the individual access-request level.', 'Threshold is zero: any access change requires authorisation.'];
    Ops.concludeDesign(eng, c1, 'fail', 'The control depends on system-enforced access restrictions; IT general controls over the payroll system have failed, so the design cannot be relied upon.');
    const d2 = Ops.dt(eng, c2.id);
    d2.walkthrough = 'February 2024 payroll sheet: signed by the administration manager 25 Feb; approved by the payroll manager 26 Feb, group controller 26 Feb and finance director 27 Feb; salary transfer dated 28 Feb.'; d2.date = Engine.today();
    d2.factors = ['The three-level approval of the detailed sheet addresses the risk that components are miscalculated or unauthorised.', 'Approvers are the payroll manager, group controller and finance director — each can reject the sheet.', 'Monthly review of a monthly payroll cycle.', 'Review is at employee-line level within departmental totals, fine enough to catch a single wrong amount.', 'Any unexplained movement against the prior month is queried before approval.'];
    Ops.concludeDesign(eng, c2, 'pass');
    const t2 = Ops.et(eng, c2.id);
    Object.assign(t2, { popCount: 3, popSource: 'Monthly payroll sheets, Jan–Mar 2024', completeness: 'reconciled', completenessBasis: 'Three months in the period; each month\'s sheet total agreed to the payroll register export.' });
    Ops.selectSample(eng, c2);
    ['Payroll sheet — January 2024', 'Payroll sheet — February 2024', 'Payroll sheet — March 2024'].forEach((ref, i) => { if (t2.items[i]) t2.items[i].ref = ref; });
    [['p', 'p', 'p'], ['p', 'p', 'p'], ['p', 'f', 'p']].forEach((row, i) => row.forEach((v, a) => { if (t2.items[i]) Ops.setResult(eng, c2, i, a, v); }));
    if (t2.items[2]) t2.items[2].note = 'March sheet carries no group controller approval.';
    S.userId = 'u1';
    Ops.review(eng, 'd', c2.id);

    const reg = eng.docs.find(d => /register/.test(d.name)), trf = eng.docs.find(d => /transfer/.test(d.name));
    if (reg && trf) {
      const cfg = { type: 'recon', tol: 0, sources: [{ docId: reg.id, keys: ['employee_code', 'month'], amount: 'net' }, { docId: trf.id, keys: ['employee_code', 'month'], amount: 'amount' }] };
      const res = Engine.reconcile(cfg.sources.map(s => ({ rows: eng.docs.find(d => d.id === s.docId).rows, keys: s.keys, amount: s.amount })), 0);
      eng.analyses.push({ id: Ops.id(eng, 'A'), name: 'Payroll register ↔ bank transfer file', cfg, res, count: res.exceptions.length + res.missing.length, runAt: new Date().toISOString(), by: me().name });
      Ops.log(eng, 'Reconciliation run', `${res.matched} matched · ${res.exceptions.length} amount exceptions · ${res.missing.length} unmatched`);
    }
    Ops.syncIRL(eng, true);
    Agent.say(eng, 'agent', 'This sample file was built the way a live one is: the scope from the engagement letter, the request list from the scope, and the walkthroughs from the meeting notes. One automatic allocation is waiting for your approval, and new joiners and leavers have no walkthrough yet.', { engine: 'Built-in rules', need: Agent.need(eng, null).slice(0, 5) });
    return eng;
  },
};

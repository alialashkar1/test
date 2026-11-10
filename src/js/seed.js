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
    await Seed.loadFiles(eng);

    const st = (sub, rows) => rows.forEach(r => Ops.addStep(eng, sub, { actor: r[0], action: r[1], system: r[2], review: r[3], approval: r[4], evidence: r[5] }));
    st('pay-access', [
      ['HR systems manager', 'Creates and amends user access to the payroll module on request', 'Payroll system', '', 'Payroll director', 'Access request email'],
      ['Payroll director', 'Maintains employee master data including salary and bank account', 'Payroll system', '', 'Payroll director', ''],
    ]);
    st('pay-sheet', [
      ['Administration manager', 'Extracts the monthly payroll sheet from the system and signs it', 'Payroll system', 'Payroll manager', '', 'Signed payroll sheet'],
      ['Payroll manager', 'Reviews departmental totals, taxes and deductions against prior month', '', 'Group controller', 'Finance director', 'Signed payroll sheet'],
      ['Finance director', 'Approves the payroll sheet for payment', '', '', 'Finance director', 'Signed payroll sheet'],
    ]);
    st('pay-transfer', [
      ['Payroll director', 'Prepares the salary transfer request from the approved payroll sheet', 'Banking portal', 'Group controller', '', 'Transfer request'],
      ['Group controller', 'Approves the transfer request and releases it with the finance director', 'Banking portal', '', 'Finance director', 'Bank confirmation'],
    ]);
    ['pay-access', 'pay-sheet', 'pay-transfer'].forEach(s => { eng.subs[s].confirmedBy = 'Payroll director'; eng.subs[s].confirmedAt = Engine.today(); });
    eng.subs['pay-sheet'].walkthrough = 'Followed the February 2024 payroll sheet from extraction to approval: signed by the administration manager, reviewed by the payroll manager and group controller, approved by the finance director.';

    const acc = (sub, lib, L, I, owner) => { const r = Ops.acceptLib(eng, sub, lib); r.L = L; r.I = I; r.owner = owner; return Ops.addControl(eng, r.id, true); };
    const c1 = acc('pay-access', 'L-PAY-01', 3, 5, 'Payroll director');
    const c2 = acc('pay-sheet', 'L-PAY-04', 3, 4, 'Finance director');
    const c3 = acc('pay-transfer', 'L-PAY-08', 3, 5, 'Finance director');
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
    return eng;
  },
};

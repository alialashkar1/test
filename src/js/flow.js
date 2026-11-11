/* Process flow: a swimlane drawn from the recorded steps. Lanes are roles; each step sits in the lane of the role that performs it. */
function flowSVG(eng, sub, o) {
  o = o || {};
  const steps = eng.steps.filter(s => s.sub === sub).sort((a, b) => a.n - b.n);
  if (!steps.length) return '';
  const lanes = [], lane = r => { r = String(r || '').trim() || 'Role not recorded'; const k = Engine.norm(r); let i = lanes.findIndex(l => l.k === k); if (i < 0) { lanes.push({ k, name: r }); i = lanes.length - 1; } return i; };
  steps.forEach(s => lane(s.actor)); steps.forEach(s => { if (s.review.trim()) lane(s.review); if (s.approval.trim()) lane(s.approval); });
  const GX = 138, CW = 196, LH = 112, BW = 164, BH = 60, TOP = 6, W = GX + steps.length * CW + 12, H = TOP + lanes.length * LH + 6;
  const wrap = (t, n, max) => { const out = []; let cur = ''; String(t || '').split(/\s+/).filter(Boolean).forEach(w => { if ((cur + ' ' + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }); if (cur) out.push(cur); if (out.length > max) { out.length = max; out[max - 1] = out[max - 1].slice(0, n - 1) + '…'; } return out; };
  const tx = (x, y, lines, cls, lh) => lines.map((l, i) => `<text x="${x}" y="${y + i * (lh || 13)}" class="${cls}">${esc(l)}</text>`).join('');
  const bx = i => GX + i * CW + 14, by = l => TOP + l * LH + 12;
  let bg = '', links = '', boxes = '', pills = '';
  lanes.forEach((l, i) => { bg += `<rect x="0" y="${TOP + i * LH}" width="${W}" height="${LH}" class="fl-lane${i % 2 ? ' alt' : ''}"/><line x1="${GX}" y1="${TOP + i * LH}" x2="${GX}" y2="${TOP + (i + 1) * LH}" class="fl-rule"/>${tx(12, TOP + i * LH + LH / 2 - (wrap(l.name, 17, 3).length - 1) * 6.5 + 4, wrap(l.name, 17, 3), 'fl-lane-t')}`; });
  steps.forEach((s, i) => {
    const li = lane(s.actor), x = bx(i), y = by(li), fl = Ops.stepFlags(s), weak = fl.filter(f => !f.startsWith('No evidence')), hi = o.hi === s.id;
    if (i < steps.length - 1) { const x2 = bx(i + 1), y1 = y + BH / 2, y2 = by(lane(steps[i + 1].actor)) + BH / 2, mx = x + BW + (CW - BW) / 2; links += `<path d="M${x + BW} ${y1} H${mx} V${y2} H${x2 - 3}" class="fl-arrow" marker-end="url(#fl-head)"/>`; }
    const checks = [['review', 'Reviews'], ['approval', 'Approves']].filter(c => s[c[0]].trim() && lane(s[c[0]]) !== li).map(c => ({ l: lane(s[c[0]]), label: c[1] }));
    checks.forEach((c, k) => { const same = checks.filter(z => z.l === c.l).length > 1, py = by(c.l) + BH / 2 - 12 + (same ? (k ? 15 : -15) : 0), px = x + BW - 108, down = c.l > li, cx = x + BW - (k ? 22 : 42);
      links += `<line x1="${cx}" y1="${down ? y + BH : y}" x2="${cx}" y2="${down ? py : py + 24}" class="fl-check"/>`;
      pills += `<rect x="${px}" y="${py}" width="104" height="24" rx="12" class="fl-pill ${c.label === 'Approves' ? 'ap' : ''}"/><text x="${px + 52}" y="${py + 16}" text-anchor="middle" class="fl-pill-t ${c.label === 'Approves' ? 'ap' : ''}">${c.label} step ${s.n}</text>`; });
    boxes += `<g ${o.interactive ? `data-act="step-walk" data-id="${s.id}" class="fl-step" role="button" tabindex="0" aria-label="Step ${s.n}: ${esc(s.action)} — ${s.walked ? 'seen in the walkthrough' : 'not yet seen'}"` : ''}>
      <rect x="${x}" y="${y}" width="${BW}" height="${BH}" rx="9" class="fl-box ${weak.length ? 'weak' : s.walked ? 'seen' : ''} ${hi ? 'hi' : ''}"/>
      ${tx(x + 20, y + 21, wrap(s.action || '(action not recorded)', 25, 2), 'fl-t')}${s.system.trim() ? tx(x + 20, y + BH - 8, [wrap(s.system, 26, 1)[0]], 'fl-sys') : ''}
      <circle cx="${x}" cy="${y}" r="11" class="fl-num ${s.walked ? 'seen' : ''}"/><text x="${x}" y="${y + 4}" text-anchor="middle" class="fl-num-t">${s.walked ? '✓' : s.n}</text></g>
      ${tx(x + 2, y + BH + 14, [s.evidence.trim() ? '▤ ' + wrap(s.evidence, 20, 1)[0] : 'No evidence retained'], s.evidence.trim() ? 'fl-ev' : 'fl-ev warn')}
      ${weak.length ? tx(x + 2, y + BH + 28, [weak[0]], 'fl-flag') : hi ? tx(x + 2, y + BH + 28, ['Risk arises here'], 'fl-hi-t') : ''}`;
  });
  return `<div class="flow-wrap"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="flow" role="img" aria-label="Process flow for ${esc(subName(sub))}"><defs><marker id="fl-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" class="fl-head"/></marker></defs>${bg}${links}${pills}${boxes}</svg></div>`;
}
const flowLegend = `<div class="row xs muted" style="gap:14px"><span><span class="lg lg-step"></span>Step, in the lane of the role that performs it</span><span><span class="lg lg-pill"></span>Reviewed or approved by another role</span><span><span class="lg lg-seen"></span>Seen in the walkthrough</span><span><span class="lg lg-weak"></span>No independent check</span></div>`;
Act['step-walk'] = d => { const eng = E(), s = eng.steps.find(x => x.id === d.id); if (!s) return; s.walked = !s.walked; Ops.log(eng, s.walked ? 'Step traced in walkthrough' : 'Step trace removed', `${subName(s.sub)} step ${s.n}`); commit(); };
document.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('.fl-step')) { ev.preventDefault(); Act['step-walk'](ev.target.dataset); } });

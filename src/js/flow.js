/* Process flow: a swimlane drawn from the recorded steps. One lane per role; tasks, automated steps and decisions with their
   branches and loops; reviews and approvals by other roles; the systems each step touches and the hand-offs between them;
   and the risks and controls pinned to the step where they arise. */
UI.flowZoom = 1;
function flowModel(eng, sub) {
  const steps = eng.steps.filter(s => s.sub === sub).sort((a, b) => a.n - b.n), idx = {}; steps.forEach((s, i) => { idx[s.id] = i; });
  const n = steps.length, edges = [], open = [], res = v => v === 'end' ? 'end' : (v && idx[v] != null ? idx[v] : null);
  steps.forEach((s, i) => { const nxt = i < n - 1 ? i + 1 : 'end';
    if (s.type === 'decision') { const y = res(s.yes), no = res(s.no); edges.push({ i, j: y == null ? nxt : y, kind: 'yes' }); if (no != null) edges.push({ i, j: no, kind: 'no' }); else open.push(i); }
    else { const t = res(s.next); edges.push({ i, j: t == null ? nxt : t, kind: 'seq' }); } });
  const handoffs = steps.filter((s, i) => i < n - 1 && s.system.trim() && steps[i + 1].system.trim() && Engine.norm(s.system) !== Engine.norm(steps[i + 1].system)).length;
  return { steps, idx, edges, open, stats: { steps: n, decisions: steps.filter(s => s.type === 'decision').length, loops: edges.filter(e => e.j !== 'end' && e.j <= e.i).length, handoffs, weak: steps.filter(s => Ops.stepFlags(s).some(f => !f.startsWith('No evidence'))).length, seen: steps.filter(s => s.walked).length } };
}
function flowSVG(eng, sub, o) {
  o = o || {};
  const M = flowModel(eng, sub), steps = M.steps, n = steps.length; if (!n) return '';
  const lanes = [], lane = r => { r = String(r || '').trim() || 'Role not recorded'; const k = Engine.norm(r); let i = lanes.findIndex(l => l.k === k); if (i < 0) { lanes.push({ k, name: r }); i = lanes.length - 1; } return i; };
  steps.forEach(s => lane(s.actor)); steps.forEach(s => { if (s.review.trim()) lane(s.review); if (s.approval.trim()) lane(s.approval); });
  const GX = 138, SX = 58, CW = 204, LH = 140, BW = 166, BH = 62, TOP = 6, SB = 52, W = GX + SX + n * CW + 74, H = TOP + lanes.length * LH + SB + 4;
  const wrap = (t, c, max) => { const out = []; let cur = ''; String(t || '').split(/\s+/).filter(Boolean).forEach(w => { if ((cur + ' ' + w).trim().length > c && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }); if (cur) out.push(cur); if (out.length > max) { out.length = max; out[max - 1] = out[max - 1].slice(0, c - 1) + '…'; } return out; };
  const tx = (x, y, lines, cls, lh, anchor) => lines.map((l, i) => `<text x="${x}" y="${y + i * (lh || 13)}" class="${cls}"${anchor ? ` text-anchor="${anchor}"` : ''}>${esc(l)}</text>`).join('');
  const bx = i => GX + SX + i * CW + 12, laneTop = l => TOP + l * LH, by = l => laneTop(l) + 16, L = i => lane(steps[i].actor), isD = i => steps[i].type === 'decision';
  const cx = i => bx(i) + BW / 2, cy = i => by(L(i)) + BH / 2, endX = GX + SX + n * CW + 34, endY = cy(n - 1), startX = GX + SX / 2 + 6;
  const edgeY = (i, x, bottom) => isD(i) ? cy(i) + (bottom ? 1 : -1) * (BH / 2 + 6) * (1 - Math.min(1, Math.abs(x - cx(i)) / (BW / 2))) : by(L(i)) + (bottom ? BH : 0);
  let bg = '', links = '', boxes = '', pills = '', band = '';
  lanes.forEach((l, i) => { const w = wrap(l.name, 17, 3); bg += `<rect x="0" y="${laneTop(i)}" width="${W}" height="${LH}" class="fl-lane${i % 2 ? ' alt' : ''}"/>${tx(12, laneTop(i) + LH / 2 - (w.length - 1) * 6.5 + 4, w, 'fl-lane-t')}`; });
  bg += `<line x1="${GX}" y1="${TOP}" x2="${GX}" y2="${H - 4}" class="fl-rule"/>`;

  /* edges: adjacent steps join directly; everything else — the other branch of a decision, a jump, a loop back — runs along a track at the foot of the lane */
  const track = {}, inbound = {};
  links += `<circle cx="${startX}" cy="${cy(0)}" r="10" class="fl-start"/><text x="${startX}" y="${cy(0) + 26}" text-anchor="middle" class="fl-term">Start</text><path d="M${startX + 10} ${cy(0)} H${bx(0) - 4}" class="fl-arrow" marker-end="url(#fl-head)"/>`;
  links += `<circle cx="${endX}" cy="${endY}" r="12" class="fl-end"/><circle cx="${endX}" cy="${endY}" r="7" class="fl-start"/><text x="${endX}" y="${endY + 28}" text-anchor="middle" class="fl-term">End</text>`;
  M.edges.forEach(e => { const i = e.i, toEnd = e.j === 'end', back = !toEnd && e.j <= i, x1 = bx(i) + BW, y1 = cy(i);
    const direct = e.kind !== 'no' && (toEnd ? i === n - 1 : e.j === i + 1), cls = `fl-arrow${back ? ' loop' : ''}${e.kind === 'no' ? ' no' : ''}`;
    if (direct) { const x2 = toEnd ? endX - 12 : bx(e.j), y2 = toEnd ? endY : cy(e.j), mx = toEnd ? x1 + 14 : x1 + (CW - BW) / 2; links += `<path d="M${x1} ${y1} H${mx} V${y2} H${x2 - 4}" class="${cls}" marker-end="url(#fl-head)"/>`; }
    else { const slot = (track[L(i)] = (track[L(i)] || 0) + 1), ty = laneTop(L(i)) + LH - 8 - 7 * ((slot - 1) % 3), fromSide = e.kind === 'yes' || (e.kind === 'seq' && isD(i));
      const ex = e.kind === 'no' ? cx(i) : fromSide ? x1 + 12 : x1 - 10, start = e.kind === 'no' ? `M${ex} ${edgeY(i, ex, true)}` : fromSide ? `M${x1} ${y1} H${ex}` : `M${ex} ${by(L(i)) + BH}`;
      let end; if (toEnd) end = `H${endX} V${endY + (ty > endY ? 16 : -16)}`; else { const k = (inbound[e.j] = (inbound[e.j] || 0) + 1), below = ty > by(L(e.j)) + BH, tgx = below ? bx(e.j) + BW - 8 - 9 * ((k - 1) % 3) : bx(e.j) + 18 + 10 * ((k - 1) % 3); end = `H${tgx} V${edgeY(e.j, tgx, below) + (below ? 4 : -4)}`; }
      links += `<path d="${start} V${ty} ${end}" class="${cls}" marker-end="url(#fl-head)"/>`; }
    if (e.kind === 'yes') links += `<text x="${x1 + 5}" y="${y1 - 6}" class="fl-br">Yes</text>`;
    if (e.kind === 'no') links += `<text x="${cx(i) + 6}" y="${cy(i) + BH / 2 + 20}" class="fl-br no">No</text>`; });

  steps.forEach((s, i) => {
    const li = L(i), x = bx(i), y = by(li), fl = Ops.stepFlags(s), weak = fl.filter(f => !f.startsWith('No evidence')), hi = o.hi === s.id, dec = s.type === 'decision';
    const checks = [['review', 'Reviews'], ['approval', 'Approves']].filter(c => s[c[0]].trim() && lane(s[c[0]]) !== li).map(c => ({ l: lane(s[c[0]]), label: c[1] }));
    checks.forEach((c, k) => { const same = checks.filter(z => z.l === c.l).length > 1, py = by(c.l) + BH / 2 - 12 + (same ? (k ? 15 : -15) : 0), px = x + BW - 108, down = c.l > li, lx = x + BW - (k ? 24 : 44);
      links += `<line x1="${lx}" y1="${edgeY(i, lx, down)}" x2="${lx}" y2="${down ? py : py + 24}" class="fl-check"/>`;
      pills += `<rect x="${px}" y="${py}" width="104" height="24" rx="12" class="fl-pill ${c.label === 'Approves' ? 'ap' : ''}"/><text x="${px + 52}" y="${py + 16}" text-anchor="middle" class="fl-pill-t ${c.label === 'Approves' ? 'ap' : ''}">${c.label} step ${s.n}</text>`; });
    const cls = `fl-box ${weak.length ? 'weak' : s.walked ? 'seen' : ''} ${hi ? 'hi' : ''} ${s.draft ? 'draft' : ''}`;
    const shape = dec ? `<polygon points="${x},${y + BH / 2} ${x + BW / 2},${y - 6} ${x + BW},${y + BH / 2} ${x + BW / 2},${y + BH + 6}" class="${cls} dec"/>`
      : `<rect x="${x}" y="${y}" width="${BW}" height="${BH}" rx="${s.type === 'system' ? 3 : 9}" class="${cls}"/>${s.type === 'system' ? `<line x1="${x + 7}" y1="${y + 1}" x2="${x + 7}" y2="${y + BH - 1}" class="fl-sysbar"/><text x="${x + BW - 8}" y="${y + 13}" text-anchor="end" class="fl-auto">AUTOMATED</text>` : ''}`;
    const label = dec ? tx(x + BW / 2, y + BH / 2 - (wrap(s.action, 19, 2).length - 1) * 6.5 + 4, wrap(s.action || '(decision not recorded)', 19, 2), 'fl-t', 13, 'middle') : tx(x + 20, y + (s.type === 'system' ? 27 : 22), wrap(s.action || '(action not recorded)', 25, 2), 'fl-t');
    const risks = eng.risks.filter(r => r.stepId === s.id), ctls = eng.controls.filter(c => risks.some(r => r.id === c.riskId));
    const badges = risks.slice(0, 3).map((r, k) => `<g><title>${esc(r.id + ' — ' + r.title)}</title><rect x="${x + BW - 40 * (k + 1) + 2}" y="${y - 11}" width="37" height="17" rx="5" class="fl-risk"/><text x="${x + BW - 40 * (k + 1) + 20.5}" y="${y + 1.5}" text-anchor="middle" class="fl-badge-t">${r.id}</text></g>`).join('')
      + ctls.slice(0, 3).map((c, k) => `<g><title>${esc(c.absent ? 'No control exists' : c.id + ' — ' + c.desc.slice(0, 120))}</title><rect x="${x + 16 + 40 * k}" y="${y + BH - 7}" width="37" height="17" rx="5" class="fl-ctl ${c.absent ? 'none' : ''}"/><text x="${x + 34.5 + 40 * k}" y="${y + BH + 5.5}" text-anchor="middle" class="fl-badge-t ${c.absent ? 'none' : ''}">${c.absent ? 'none' : c.id}</text></g>`).join('');
    const below = y + BH + (ctls.length ? 24 : 14);
    boxes += `<g ${o.interactive ? `data-act="step-walk" data-id="${s.id}" class="fl-step" role="button" tabindex="0" aria-label="Step ${s.n}: ${esc(s.action)} — ${s.walked ? 'seen in the walkthrough' : 'not yet seen'}"` : ''}><title>${esc(`Step ${s.n} — ${s.actor}: ${s.action}`)}</title>${shape}${label}
      <circle cx="${dec ? x + 26 : x}" cy="${dec ? y + 4 : y}" r="11" class="fl-num ${s.walked ? 'seen' : ''}"/><text x="${dec ? x + 26 : x}" y="${(dec ? y + 4 : y) + 4}" text-anchor="middle" class="fl-num-t">${s.walked ? '✓' : s.n}</text></g>${badges}
      ${dec ? '' : tx(x + 2, below, [s.evidence.trim() ? '▤ ' + wrap(s.evidence, 20, 1)[0] + (s.docId ? ' ✓' : '') : 'No evidence retained'], s.evidence.trim() ? (s.docId ? 'fl-ev linked' : 'fl-ev') : 'fl-ev warn')}
      ${weak.length ? tx(x + 2, below + (dec ? 10 : 14), [weak[0]], 'fl-flag') : hi ? tx(x + 2, below + (dec ? 10 : 14), ['Risk arises here'], 'fl-hi-t') : M.open.includes(i) ? tx(x + 2, below + 10, ['Other branch not recorded'], 'fl-ev warn') : ''}`;
  });
  const y0 = TOP + lanes.length * LH;
  band += `<rect x="0" y="${y0}" width="${W}" height="${SB}" class="fl-band"/><text x="12" y="${y0 + SB / 2 + 4}" class="fl-lane-t">Systems</text>`;
  steps.forEach((s, i) => { const sys = s.system.trim(), x = bx(i) + BW / 2;
    band += sys ? `<rect x="${x - 72}" y="${y0 + 14}" width="144" height="24" rx="6" class="fl-sysc ${/excel|spreadsheet|workbook/i.test(sys) ? 'eu' : ''}"/><text x="${x}" y="${y0 + 30}" text-anchor="middle" class="fl-sysc-t">${esc(wrap(sys, 22, 1)[0])}</text>` : `<text x="${x}" y="${y0 + 30}" text-anchor="middle" class="fl-sys">manual</text>`;
    if (i < n - 1 && sys && steps[i + 1].system.trim() && Engine.norm(sys) !== Engine.norm(steps[i + 1].system)) band += `<text x="${bx(i) + BW + (CW - BW) / 2}" y="${y0 + 30}" text-anchor="middle" class="fl-hand">⇄ hand-off</text>`; });
  const z = o.zoom || 1;
  return `<div class="flow-wrap"><svg viewBox="0 0 ${W} ${H}" width="${Math.round(W * z)}" height="${Math.round(H * z)}" class="flow" role="img" aria-label="Process flow for ${esc(subName(sub))}"><defs><marker id="fl-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" class="fl-head"/></marker></defs>${bg}${band}${links}${pills}${boxes}</svg></div>`;
}
const flowLegend = `<div class="row xs muted" style="gap:6px 14px"><span><span class="lg lg-step"></span>Step</span><span><span class="lg lg-dec"></span>Decision</span><span><span class="lg lg-pill"></span>Check by another role</span><span><span class="lg lg-loop"></span>Other branch or loop back</span><span><span class="lg lg-seen"></span>Seen in the walkthrough</span><span><span class="lg lg-weak"></span>No independent check</span><span><span class="lg lg-risk"></span>Risk</span><span><span class="lg lg-ctl"></span>Control</span></div>`;
const flowStats = (eng, sub) => { const s = flowModel(eng, sub).stats; return [`${s.steps} steps`, s.decisions ? `${s.decisions} decision${s.decisions === 1 ? '' : 's'}` : '', s.loops ? `${s.loops} loop${s.loops === 1 ? '' : 's'} back` : '', s.handoffs ? `${s.handoffs} system hand-off${s.handoffs === 1 ? '' : 's'}` : '', s.weak ? `${s.weak} without an independent check` : ''].filter(Boolean); };
Act['step-walk'] = d => { const eng = E(), s = eng.steps.find(x => x.id === d.id); if (!s) return; s.walked = !s.walked; Ops.log(eng, s.walked ? 'Step traced in walkthrough' : 'Step trace removed', `${subName(s.sub)} step ${s.n}`); commit(); };
Act['flow-zoom'] = d => { UI.flowZoom = d.z === 'fit' ? 1 : Math.max(0.5, Math.min(1.6, Math.round((UI.flowZoom + Number(d.z)) * 10) / 10)); render(); };
Act['flow-export'] = d => { const el = document.querySelector('.flow-wrap svg'); if (!el) return; const css = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch (e) { return []; } }).filter(r => /\.fl-|\.flow\b/.test(r.selectorText || '')).map(r => r.cssText).join('');
  const cs = getComputedStyle(document.documentElement), vars = ['surface', 'surface-2', 'surface-3', 'border', 'border-strong', 'ink', 'ink-2', 'ink-3', 'primary', 'primary-ink', 'primary-bg', 'good', 'good-bg', 'warn', 'warn-bg', 'crit', 'crit-bg', 'info', 'info-bg'].map(v => `--${v}:${cs.getPropertyValue('--' + v).trim()}`).join(';');
  saveFile(`process-flow-${d.sub}.svg`, el.outerHTML.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" style="${vars};--sans:sans-serif;--mono:monospace;font-family:sans-serif" `).replace('<defs>', `<defs><style>${css}</style>`)); };
document.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('.fl-step')) { ev.preventDefault(); Act['step-walk'](ev.target.dataset); } });

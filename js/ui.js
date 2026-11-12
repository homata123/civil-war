'use strict';
// ============ Giao diện: thanh trên, bảng chi tiết, các cửa sổ, màn hình thiết lập ============
(function () {
  const U = CW.U, G = CW.G, R = CW.R, P = CW.Portraits;
  const UI = CW.UI = { modal: null, arg: null, histFilter: 'all', mouseDown: false, lastSide: '', lastModal: '', cands: null, settings: { edge: false } };
  const $ = id => document.getElementById(id);
  const esc = U.esc;
  let g = null;
  const ME = () => CW.me;
  const X = (name, args, cb) => CW.X(name, args, cb);
  const isMine = e => e.n.includes(ME());
  UI.isMine = isMine;
  UI.setGame = gg => { g = gg; UI.lastSide = ''; UI.lastModal = ''; };
  UI.game = () => g;

  // ---------------- Tiện ích HTML ----------------
  const flag = (nid, size) => {
    size = size || 22;
    const n = nid >= 0 && g ? g.nations[nid] : null;
    const col = n ? n.color : CW.NEUTRAL_COLOR, ch = n ? n.char : '土';
    return `<span class="flag" style="background:${col};width:${size}px;height:${Math.round(size * 0.82)}px;font-size:${Math.round(size * 0.6)}px">${esc(ch)}</span>`;
  };
  const flagRaw = (col, ch, size) => `<span class="flag" style="background:${col};width:${size}px;height:${Math.round(size * 0.82)}px;font-size:${Math.round(size * 0.6)}px">${esc(ch)}</span>`;
  const portrait = (gen, cls) => `<img class="portrait ${cls || ''}" src="${P.forGen(g, gen)}" data-act="portrait" data-name="${esc(gen.name)}" title="Bấm để tải chân dung cho ${esc(gen.name)}">`;
  const stLabel = st => st === 'war' ? '<span class="st-war">⚔ Chiến tranh</span>' : st === 'ally' ? '<span class="st-ally">🤝 Đồng minh</span>' : st === 'peace' ? '<span class="st-peace">Hòa hiếu</span>' : '';
  const troopsLine = t => CW.UNIT_KEYS.filter(k => t[k] >= 1).map(k => `${CW.UNITS[k].icon}${U.fmt(t[k])}`).join(' · ') || '—';
  const costHtml = (cost, n) => Object.keys(cost).map(r => `<span class="${n && (n.res[r] || 0) < cost[r] ? 'neg' : ''}">${CW.RES[r].icon}${cost[r]}</span>`).join(' ');
  const relColor = v => v > 40 ? '#2f7a2a' : v > 0 ? '#6a7a2a' : v > -40 ? '#a8692a' : '#b3241b';
  const stateText = a => ({ idle: 'Đóng quân', move: 'Hành quân', battle: '⚔ Giao chiến', siege: '🔥 Vây thành ' + (a.siegeProv >= 0 ? g.provs[a.siegeProv].name : ''), rout: '↩ Tháo chạy' }[a.state] || a.state) + (a.task === 'refit' ? ' (củng cố)' : '');

  // ---------------- Toast / confirm / hint ----------------
  UI.toast = function (text, kind, ms) {
    const el = document.createElement('div'); el.className = 'toast ' + (kind || ''); el.innerHTML = text;
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 5) $('toasts').firstChild.remove();
    setTimeout(() => el.remove(), ms || 5000);
  };
  UI.confirm = function (html, yes, yesLabel) {
    $('ctext').innerHTML = html; $('confirm').classList.remove('hidden');
    $('cyes').textContent = yesLabel || 'Đồng ý';
    $('cyes').onclick = () => { $('confirm').classList.add('hidden'); yes(); UI.refresh(true); };
    $('cno').onclick = () => $('confirm').classList.add('hidden');
  };
  UI.hint = t => { $('hint').textContent = t || ''; };
  UI.jump = (x, y) => { if (x === undefined || x === null) return; R.centerOn(x, y, Math.max(R.cam.z, 9)); };

  // ---------------- Bộ phân phối hành động ----------------
  const ACT = {}, CHG = {};
  document.addEventListener('pointerdown', () => { UI.mouseDown = true; }, true);
  document.addEventListener('pointerup', () => { UI.mouseDown = false; }, true);
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const f = ACT[el.dataset.act]; if (!f) return;
    e.preventDefault(); e.stopPropagation();
    if (el.disabled) return;
    f(el, e);
    if (g) UI.refresh(true);
  });
  document.addEventListener('change', e => {
    const el = e.target.closest('[data-chg]'); if (!el) return;
    const f = CHG[el.dataset.chg]; if (f) { f(el, e); if (g) UI.refresh(true); }
  });
  // ---------------- Sắp xếp bảng (bấm tiêu đề cột: tăng → giảm → mặc định) ----------------
  UI.sorts = {};
  const sortVal = td => {
    const t = (td.textContent || '').trim();
    const m = t.match(/[-+−]?\d[\d.,]*\s*[kM]?/);
    if (!m) return { s: t.toLowerCase() };
    let x = m[0].replace('−', '-').replace(/\s/g, '');
    const suf = /[kM]$/.test(x) ? x.slice(-1) : '';
    if (suf) x = x.slice(0, -1);
    let v = suf ? parseFloat(x.replace(',', '.')) * (suf === 'k' ? 1e3 : 1e6) : parseFloat(x.replace(/\./g, '').replace(',', '.'));
    return isNaN(v) ? { s: t.toLowerCase() } : { n: v };
  };
  UI.applySorts = function (root, scope) {
    root.querySelectorAll('table.tbl').forEach((tb, ti) => {
      const rows = [...tb.rows]; if (rows.length < 3) return;
      const head = rows[0]; if (!head.cells.length || head.cells[0].tagName !== 'TH') return;
      const key = scope + ':' + ti;
      tb.dataset.sk = key;
      const st = UI.sorts[key];
      [...head.cells].forEach((th, ci) => {
        th.classList.add('sortable');
        th.dataset.si = ci;
        th.classList.toggle('asc', !!st && st.col === ci && st.dir === 1);
        th.classList.toggle('desc', !!st && st.col === ci && st.dir === -1);
      });
      if (!st) return;
      const body = rows.slice(1).filter(r => r.cells.length > st.col && r.cells[0].tagName === 'TD');
      body.sort((a, b) => {
        const x = sortVal(a.cells[st.col]), y = sortVal(b.cells[st.col]);
        if (x.n !== undefined && y.n !== undefined) return (x.n - y.n) * st.dir;
        if (x.n !== undefined) return -1; if (y.n !== undefined) return 1;
        return x.s.localeCompare(y.s, 'vi') * st.dir;
      });
      const parent = body.length ? body[0].parentNode : null;
      if (parent) body.forEach(r => parent.appendChild(r));
    });
  };
  document.addEventListener('click', e => {
    const th = e.target.closest('table.tbl th.sortable'); if (!th) return;
    const tb = th.closest('table'); const key = tb.dataset.sk, ci = +th.dataset.si;
    const st = UI.sorts[key];
    UI.sorts[key] = !st || st.col !== ci ? { col: ci, dir: 1 } : st.dir === 1 ? { col: ci, dir: -1 } : undefined;
    if (!UI.sorts[key]) delete UI.sorts[key];
    UI.lastModal = ''; UI.lastSide = '';
    if (g) UI.refresh(true); else UI.applySorts(document, 'x');
  });
  const num = (el, k) => +el.dataset[k];
  const selArmy = () => { const ids = [...R.sel]; return ids.length === 1 ? G.army(g, ids[0]) : null; };
  const selArmies = () => [...R.sel].map(id => G.army(g, id)).filter(a => a && a.nation === ME());
  const selIds = () => selArmies().map(a => a.id);
  const say = (r, okMsg) => { if (typeof r === 'string') UI.toast(r); else if (okMsg) UI.toast(okMsg, 'good', 2500); };

  // ---------------- Thanh trên ----------------
  UI.renderTop = function () {
    const n = g.nations[ME()];
    $('tb-nation').innerHTML = `${flag(ME(), 30)}<div>${esc(n.name)}<div style="font-size:11px;font-weight:400">${esc(n.title)} ${esc(n.monarch)}</div></div>`;
    const net = { food: n.inc.food - n.upkeep.food, gold: n.inc.gold - n.upkeep.gold, wood: n.inc.wood, iron: n.inc.iron, weapons: n.inc.weapons + n.smithy * 45 };
    let pop = 0; G.provsOf(g, ME()).forEach(k => (pop += g.provs[k].pop));
    $('tb-res').innerHTML = CW.RES_KEYS.map(r => {
      const v = net[r]; const cls = v >= 0 ? 'pos' : 'neg';
      return `<div class="res" title="${CW.RES[r].name}: ${Math.floor(n.res[r])} (tháng ${v >= 0 ? '+' : ''}${Math.round(v)})"><b>${CW.RES[r].icon} ${U.fmt(n.res[r])}</b><small class="${cls}">${v >= 0 ? '+' : ''}${U.fmt(v)}/th</small></div>`;
    }).join('') + `<div class="res" title="Tổng dân số"><b>👥 ${U.fmt(pop)}</b><small>dân</small></div><div class="res" title="Tổng binh lực"><b>🛡 ${U.fmt(n.troops)}</b><small>quân</small></div><div class="res" title="Lãnh địa"><b>🏯 ${n.provCount}</b><small>thành</small></div>`;
    $('tb-date').textContent = G.dateStr(g);
    const sp = [[0, '⏸'], [1, '▶'], [2, '▶▶'], [4, '×4'], [8, '×8']];
    $('tb-speed').innerHTML = sp.map(([v, l]) => `<button class="btn sm ${(v === 0 ? g.paused : !g.paused && g.speed === v) ? 'on' : ''}" data-act="speed" data-v="${v}" title="${v === 0 ? 'Tạm dừng (Space)' : 'Tốc độ ' + v + 'x'}">${l}</button>`).join('');
    const props = g.proposals.filter(p => p.to === ME()).length;
    $('tb-menu').innerHTML = [['court', '🏛 Triều chính', 'T'], ['gens', '🎖 Tướng lĩnh', 'G'], ['armies', '⚔ Quân đoàn', 'Q'], ['diplo', '📜 Ngoại giao', 'N'], ['history', '📖 Sử ký', 'H'], ['system', '⚙ Hệ thống', 'Esc']]
      .map(([k, l, key]) => `<button class="btn" data-act="open" data-m="${k}" title="Phím ${key}">${l}${k === 'diplo' && props ? `<span class="badge">${props}</span>` : ''}</button>`).join('');
    $('pausedTag').classList.toggle('hidden', !g.paused);
  };
  ACT.speed = el => { const v = num(el, 'v'); if (v === 0) X('pause', {}); else X('speed', { v }); };
  ACT.open = el => UI.openModal(el.dataset.m);

  // ---------------- Bảng bên ----------------
  UI.renderSide = function (force) {
    const side = $('side');
    if (!force && (UI.mouseDown || side.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName))) return;
    for (const id of [...R.sel]) if (!G.army(g, id)) R.sel.delete(id);
    const arm = [...R.sel].map(id => G.army(g, id)).filter(Boolean);
    let html = '';
    if (arm.length === 1) html = armyPanel(arm[0]);
    else if (arm.length > 1) html = multiPanel(arm);
    else if (R.selProv >= 0) html = provPanel(R.selProv);
    if (!html) { side.classList.add('hidden'); UI.lastSide = ''; return; }
    const min = !!UI.settings.sideMin;
    const ctl = `<div class="pctl"><button class="btn sm" data-act="sideMin" title="${min ? 'Mở rộng bảng (F)' : 'Thu gọn bảng (F)'}">${min ? '▾' : '▴'}</button><button class="btn sm" data-act="sideClose" title="Đóng (Esc)">✕</button></div>`;
    if (min) { const i = html.indexOf('</h3>'); html = (i >= 0 ? html.slice(0, i + 5) : html) + '<div class="muted" style="font-size:11px">Đã thu gọn · phím F để mở lại</div>'; }
    html = ctl + html;
    side.classList.toggle('min', min);
    side.classList.remove('hidden');
    if (html !== UI.lastSide) { side.innerHTML = html; UI.lastSide = html; }
  };

  function armyPanel(a) {
    const own = a.nation === ME(); const gen = a.gen ? G.gen(g, a.gen) : null; const tot = G.troops(a.t);
    let h = `<h3>${flag(a.nation)} ${esc(G.armyName(g, a))} <span class="muted" style="font-size:12px;font-weight:400">· ${esc(G.nationName(g, a.nation))}</span></h3>`;
    if (!own) {
      const est = Math.round(tot / 500) * 500;
      h += `<div class="row">${gen ? portrait(gen) : ''}<div class="kv"><span>Quốc gia</span><span>${esc(G.nationName(g, a.nation))} ${stLabel(G.status(g, ME(), a.nation))}${humanTag(a.nation)}</span>
        <span>Binh lực</span><span>~${U.fmt(Math.max(500, est))}</span><span>Trạng thái</span><span>${stateText(a)}</span>
        ${gen ? `<span>Chủ tướng</span><span>Võ ${gen.war} · Thống ${gen.lead} · Trí ${gen.int}</span>` : ''}<span>Trận hình</span><span>${CW.FORMATIONS[a.formation].name}</span></div></div>
        <p class="muted">Chọn quân ta rồi <b>chuột phải</b> vào đạo quân này để tấn công.</p>`;
      return h;
    }
    h += `<div class="row" style="align-items:flex-start">${gen ? portrait(gen, 'lg') : '<div class="portrait lg"></div>'}<div class="kv" style="flex:1">
      <span>Binh lực</span><span><b>${U.fmt(tot)}</b> / đỉnh ${U.fmt(a.peak)}</span>
      <span>Binh chủng</span><span>${troopsLine(a.t)}</span>
      <span>Uy lực tướng</span><span title="Công: Võ + Thống (danh tướng ≥85 thêm 10%) · Thủ: Thống + Trí, giảm thương vong phải nhận">⚔ Công ×${G.genMult(g, a).toFixed(2)} · 🛡 Thủ ×${G.genDef(g, a).toFixed(2)}</span>
      <span>Sĩ khí</span><span class="row" style="margin:0"><span class="bar"><i style="width:${a.morale}%;background:${a.morale > 60 ? '#5cb85c' : a.morale > 35 ? '#e0a526' : '#d9534f'}"></i></span>${Math.round(a.morale)}</span>
      <span>Trạng thái</span><span>${stateText(a)}</span>
      <span>Chiến công</span><span>${Math.floor(a.merit)} ${a.merit >= 60 ? `<button class="btn sm" data-act="promote" title="Tìm và đề bạt một tướng tài từ hàng ngũ (tốn 60 chiến công)">Đề bạt tướng</button>` : ''}</span>
      <span>Tốc độ</span><span>${G.armySpeed(g, a).toFixed(2)} ô/ngày</span></div></div>`;
    const idle = g.generals.filter(x => x.alive && x.nation === ME() && !x.army);
    h += `<h4>Chủ tướng</h4><div class="row"><select data-chg="armyGen" style="flex:1"><option value="">— Vô tướng —</option>${gen ? `<option value="${gen.id}" selected>${esc(gen.name)} (V${gen.war} T${gen.lead} Tr${gen.int})</option>` : ''}${idle.map(x => `<option value="${x.id}">${esc(x.name)} (V${x.war} T${x.lead} Tr${x.int})</option>`).join('')}</select></div>`;
    h += `<h4>Trận hình</h4><div>${CW.FORMATION_KEYS.map(k => `<span class="chip ${a.formation === k ? 'on' : ''}" data-act="form" data-v="${k}" title="${esc(CW.FORMATIONS[k].desc)}">${CW.FORMATIONS[k].name}</span>`).join('')}</div>`;
    h += `<h4>Tư thế</h4><div>${Object.keys(CW.STANCES).map(k => `<span class="chip ${a.stance === k ? 'on' : ''}" data-act="stance" data-v="${k}" title="${esc(CW.STANCES[k].desc)}">${CW.STANCES[k].name}</span>`).join('')}</div>`;
    h += `<h4>Kế sách</h4><div>${Object.keys(CW.TACTICS).map(k => { const av = G.tacticAvail(g, a, k); return `<span class="chip ${av.ok ? '' : 'dis'}" data-act="${av.ok ? 'tactic' : ''}" data-v="${k}" title="${esc(CW.TACTICS[k].desc + (av.ok ? '' : ' — ' + av.why))}">${CW.TACTICS[k].name}</span>`; }).join('')}</div>`;
    const near = G.cityNear(g, a, ME());
    const mate = g.armies.find(b => b !== a && b.nation === ME() && U.dist(a.x, a.y, b.x, b.y) <= 3);
    h += `<h4>Quân lệnh</h4><div class="row">
      <button class="btn sm" data-act="aStop">✋ Dừng</button>
      <button class="btn sm" data-act="aHome">🏯 Về thành gần nhất</button>
      <button class="btn sm" data-act="aSplit">✂ Tách đôi</button>
      ${mate ? `<button class="btn sm" data-act="aMerge" data-id="${mate.id}">🔗 Hợp với ${esc(G.armyName(g, mate))}</button>` : ''}</div>`;
    if (near >= 0) h += `<div class="row"><span class="muted">Tại ${esc(g.provs[near].name)}:</span>
      <button class="btn sm" data-act="aReinf">➕ Bổ sung quân</button>
      <button class="btn sm" data-act="aDrop">🛡 Để lại 1/3 trấn thủ</button>
      <button class="btn sm" data-act="aDisband">⬇ Nhập thành</button></div>`;
    h += `<h4>Ủy thác tướng quân</h4>`;
    if (a.mode === 'auto') {
      const m = a.mission || { type: 'free' };
      const mt = m.type === 'defend' ? `Trấn giữ ${esc(G.provName(g, m.prov))}` : m.type === 'attack' ? `Chinh phạt ${esc(G.nationName(g, m.nation))}` : 'Tự do tác chiến';
      h += `<div class="row">★ Đang tự chỉ huy: <b>${mt}</b> <button class="btn sm red" data-act="aTakeBack">Thu hồi binh quyền</button></div>`;
    } else {
      const dp = G.nearestOwnCity(g, ME(), a.x, a.y);
      const wars = G.enemies(g, ME());
      h += `<div class="row">${dp >= 0 ? `<button class="btn sm" data-act="aDelegate" data-t="defend" data-p="${dp}">Trấn giữ ${esc(g.provs[dp].name)}</button>` : ''}
        <button class="btn sm" data-act="aDelegate" data-t="free">Tự do tác chiến</button></div>`;
      if (wars.length) h += `<div class="row">Chinh phạt: ${wars.map(w => `<button class="btn sm" data-act="aDelegate" data-t="attack" data-n="${w}">${flag(w, 16)} ${esc(g.nations[w].name)}</button>`).join('')}</div>`;
    }
    h += `<p class="muted" style="margin:8px 0 0">Chuột phải: hành quân · vào thành địch: công thành · vào quân địch: tấn công.</p>`;
    return h;
  }
  function multiPanel(arr) {
    const own = arr.filter(a => a.nation === ME());
    const t = G.emptyT(); own.forEach(a => CW.UNIT_KEYS.forEach(k => (t[k] += a.t[k])));
    let h = `<h3>${flag(ME())} ${own.length} đạo quân</h3><div>Tổng: <b>${U.fmt(G.troops(t))}</b> — ${troopsLine(t)}</div>`;
    h += `<table class="tbl" style="margin-top:6px">${own.map(a => `<tr class="click" data-act="selOne" data-id="${a.id}"><td>${esc(G.armyName(g, a))}</td><td>${U.fmt(G.troops(a.t))}</td><td>${stateText(a)}</td></tr>`).join('')}</table>`;
    h += `<h4>Trận hình (tất cả)</h4><div>${CW.FORMATION_KEYS.map(k => `<span class="chip" data-act="form" data-v="${k}">${CW.FORMATIONS[k].name}</span>`).join('')}</div>`;
    h += `<h4>Tư thế (tất cả)</h4><div>${Object.keys(CW.STANCES).map(k => `<span class="chip" data-act="stance" data-v="${k}">${CW.STANCES[k].name}</span>`).join('')}</div>`;
    h += `<h4>Quân lệnh</h4><div class="row"><button class="btn sm" data-act="aStop">✋ Dừng</button><button class="btn sm" data-act="aHome">🏯 Về thành</button><button class="btn sm" data-act="aDelegate" data-t="free">★ Ủy thác tự do</button><button class="btn sm" data-act="aTakeBack">Thu hồi binh quyền</button></div>`;
    return h;
  }
  function provPanel(k) {
    const p = g.provs[k], mp = g.map.provinces[k], own = p.owner === ME();
    const isCap = p.owner >= 0 && g.nations[p.owner].capital === k;
    let h = `<h3>${flag(p.owner)} ${esc(p.name)} ${isCap ? '<span style="color:#b8860b">👑</span>' : ''}</h3>`;
    h += `<div class="kv"><span>Chủ</span><span>${esc(G.nationName(g, p.owner))} ${p.owner >= 0 && p.owner !== ME() ? stLabel(g.status[ME()][p.owner]) + humanTag(p.owner) : ''}</span>
      <span>Dân số</span><span>${U.fmt(p.pop)}</span>
      <span>Địa thế</span><span>Phì nhiêu ${Math.round(mp.fert * 100)}% · Rừng ${Math.round(mp.forestF * 100)}% · Đồi núi ${Math.round(mp.hillF * 100)}%${mp.coastal ? ' · Ven biển' : ''}</span>
      <span>Tường thành</span><span>${Math.round(p.wallHp)} / ${G.wallMax(p)} ${g.day - p.sieged < 2 ? '<b class="neg">— đang bị vây!</b>' : ''}</span></div>`;
    if (!own) {
      const est = Math.round(G.troops(p.garrison) / 250) * 250;
      h += `<div class="kv" style="margin-top:4px"><span>Trú quân</span><span>~${U.fmt(Math.max(250, est))}</span><span>Công trình</span><span>${CW.BUILD_KEYS.filter(b => p.bld[b]).map(b => CW.BUILDINGS[b].icon + p.bld[b]).join(' ') || '—'}</span></div>`;
      const mine = selArmies();
      if (mine.length) h += `<div class="row" style="margin-top:8px"><button class="btn red" data-act="siegeSel" data-p="${k}">⚔ Xuất quân đánh ${esc(p.name)}</button></div>`;
      else h += `<p class="muted">Chọn quân ta rồi chuột phải vào thành để công thành.</p>`;
      return h;
    }
    const inc = G.provIncome(g, k);
    h += `<h4>Sản lượng / tháng</h4><div>${['food', 'gold', 'wood', 'iron'].map(r => `${CW.RES[r].icon} ${Math.round(inc[r])}`).join(' · ')}${p.bld.smithy ? ` · ⚒ rèn ${p.bld.smithy * 45}` : ''}</div>`;
    h += `<h4>Trú quân</h4><div class="row"><span style="flex:1">${troopsLine(p.garrison)} (= ${U.fmt(G.troops(p.garrison))})</span><button class="btn sm red" data-act="formArmy" data-p="${k}" ${G.troops(p.garrison) < 100 ? 'disabled' : ''}>⚑ Lập đạo quân</button></div>`;
    h += `<h4>Công trình</h4>`;
    const n = g.nations[ME()];
    for (const b of CW.BUILD_KEYS) {
      const B = CW.BUILDINGS[b], lv = p.bld[b]; const cost = G.buildCost(p, b);
      const busy = p.building && p.building.key === b;
      h += `<div class="bld"><span>${B.icon}</span><span title="${esc(B.desc)}">${B.name} <b>${lv}</b>/${CW.MAX_BLD}${busy ? `<div class="prog"><i style="width:${100 - p.building.left / p.building.total * 100}%"></i></div>` : ''}</span>
        <span>${lv >= CW.MAX_BLD ? '<span class="muted">Tối đa</span>' : busy ? `<span class="muted">${p.building.left} ngày</span>` : `<button class="btn sm" data-act="build" data-p="${k}" data-b="${b}" ${p.building || !G.canAfford(n, cost) ? 'disabled' : ''} title="${esc(B.desc)}">${costHtml(cost, n)}</button>`}</span></div>`;
    }
    h += `<h4>Mộ binh</h4>`;
    for (const u of CW.UNIT_KEYS) {
      const c1 = G.recruitCost(g, k, u, 100), c5 = G.recruitCost(g, k, u, 500);
      h += `<div class="row"><span style="width:92px">${CW.UNITS[u].icon} ${CW.UNITS[u].name}</span>
        <button class="btn sm" data-act="recruit" data-p="${k}" data-u="${u}" data-n="100" title="${esc(G.costStr(c1))}" ${G.canAfford(n, c1) ? '' : 'disabled'}>+100</button>
        <button class="btn sm" data-act="recruit" data-p="${k}" data-u="${u}" data-n="500" title="${esc(G.costStr(c5))}" ${G.canAfford(n, c5) ? '' : 'disabled'}>+500</button>
        <span class="muted" style="font-size:11px">${costHtml(c1, n)}</span></div>`;
    }
    if (p.queue.length) h += `<div class="muted">Đang huấn luyện:</div>` + p.queue.map((q, i) => `<div class="row"><span style="flex:1">${CW.UNITS[q.type].icon} ${q.n} ${CW.UNITS[q.type].name}</span><span>${i === 0 ? q.left + ' ngày' : 'chờ'}</span></div>`).join('');
    return h;
  }

  // Hành động bảng quân (đi qua lớp lệnh CW.X — chạy được cả khi là khách trong ván nhiều người)
  CHG.armyGen = el => { const a = selArmy(); if (a) X('setGen', { id: a.id, gen: el.value ? +el.value : null }); };
  ACT.form = el => X('form', { ids: selIds(), v: el.dataset.v });
  ACT.stance = el => X('stance', { ids: selIds(), v: el.dataset.v });
  ACT.tactic = el => { const a = selArmy(); if (a) X('tactic', { id: a.id, v: el.dataset.v }); };
  ACT.aStop = () => X('stop', { ids: selIds() });
  ACT.aHome = () => X('home', { ids: selIds() });
  ACT.aSplit = () => { const a = selArmy(); if (!a) return; X('split', { id: a.id }, r => { CW.Cmd.toast(r); if (r && r.id) R.sel.add(r.id); }); };
  ACT.aMerge = el => { const a = selArmy(); if (a) X('merge', { id: a.id, other: num(el, 'id') }); };
  ACT.aReinf = () => { const a = selArmy(); if (a) X('reinf', { id: a.id }); };
  ACT.aDrop = () => { const a = selArmy(); if (a) X('drop', { id: a.id }); };
  ACT.aDisband = () => { const a = selArmy(); if (a) { X('disband', { id: a.id }); R.sel.delete(a.id); } };
  ACT.aDelegate = el => {
    const t = el.dataset.t; const m = t === 'defend' ? { type: 'defend', prov: num(el, 'p') } : t === 'attack' ? { type: 'attack', nation: num(el, 'n') } : { type: 'free' };
    X('delegate', { ids: selIds(), m });
  };
  ACT.aTakeBack = () => X('undelegate', { ids: selIds() });
  ACT.promote = () => { const a = selArmy(); if (a) X('promote', { id: a.id }); };
  ACT.selOne = el => { R.sel.clear(); R.sel.add(num(el, 'id')); };
  ACT.build = el => X('build', { prov: num(el, 'p'), b: el.dataset.b });
  ACT.recruit = el => X('recruit', { prov: num(el, 'p'), u: el.dataset.u, n: num(el, 'n') });
  ACT.siegeSel = el => CW.Main.orderSiege(selArmies(), num(el, 'p'));
  ACT.formArmy = el => UI.openModal('formArmy', num(el, 'p'));
  // Nhãn "người chơi" cho nước do người thật điều khiển (chế độ nhiều người)
  const humanTag = nid => (nid >= 0 && nid !== ME() && g.nations[nid] && g.nations[nid].isPlayer && G.humans(g).length > 1 ? ` <span class="htag" title="Do người chơi điều khiển">👤 ${esc(g.nations[nid].player || 'Người chơi')}</span>` : '');
  UI.humanTag = humanTag;

  // ---------------- Cửa sổ (modal) ----------------
  const LIVE = { court: 1, gens: 1, armies: 1, diplo: 1, history: 1 };
  const TITLES = { court: '🏛 Triều chính', gens: '🎖 Tướng lĩnh', armies: '⚔ Quân đoàn', diplo: '📜 Ngoại giao', history: '📖 Sử ký thiên hạ', report: '📜 Tổng kết chiến dịch', system: '⚙ Hệ thống', formArmy: '⚑ Lập đạo quân', hire: '🎓 Chiêu hiền nạp sĩ', newGen: '✍ Tự phong tướng', gameover: 'Kết cục', help: 'Hướng dẫn' };
  UI.openModal = function (m, arg) {
    if (UI.modal === m && arg === undefined && LIVE[m]) { UI.closeModal(); return; }
    UI.modal = m; UI.arg = arg; UI.lastModal = '';
    if (m === 'hire') { UI.cands = null; X('hireCands', {}, r => { if (r && r.cands) { UI.cands = r.cands; UI.lastModal = ''; UI.renderModal(true); } }); }
    $('mtitle').textContent = TITLES[m] || ''; $('modal').classList.remove('hidden');
    UI.renderModal(true);
  };
  UI.closeModal = function () { UI.modal = null; $('modal').classList.add('hidden'); $('mbody').innerHTML = ''; };
  ACT.closeModal = () => UI.closeModal();
  $('modal').addEventListener('click', e => { if (e.target.id === 'modal' && UI.modal !== 'gameover') UI.closeModal(); });

  UI.renderModal = function (force) {
    if (!UI.modal || !g) return;
    if (!force && (!LIVE[UI.modal] || UI.mouseDown || ($('mbody').contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName)))) return;
    const f = MOD[UI.modal]; if (!f) return;
    const html = f(UI.arg);
    if (html !== UI.lastModal) {
      const sc = $('mbody').querySelector('.evlist, .scroll'); const st = sc ? sc.scrollTop : 0; const bt = $('mbody').scrollTop;
      $('mbody').innerHTML = html; UI.lastModal = html;
      UI.applySorts($('mbody'), UI.modal);
      const sc2 = $('mbody').querySelector('.evlist, .scroll'); if (sc2) sc2.scrollTop = st; $('mbody').scrollTop = bt;
    }
  };
  const MOD = {};

  // --- Triều chính ---
  MOD.court = function () {
    const n = g.nations[ME()];
    const own = G.provsOf(g, ME());
    let h = `<div class="grid2"><div class="card"><div class="row">${portrait(G.generals0Monarch(), 'lg')}<div><div style="font-size:18px;font-weight:700">${flag(ME(), 26)} ${esc(n.name)}</div>
      <div>${esc(n.title)} <b>${esc(n.monarch)}</b></div><div class="muted">Kinh đô: ${esc(g.provs[n.capital].name)} · ${own.length} lãnh địa · Thế lực ${U.fmt(G.power(g, ME()))}</div></div></div>
      <h4>Thuế khóa</h4><div class="row"><input type="range" min="10" max="60" step="5" value="${Math.round(n.tax * 100)}" data-chg="tax" style="flex:1"><b>${Math.round(n.tax * 100)}%</b></div>
      <div class="muted">Thuế cao: nhiều vàng nhưng dân số tăng chậm.</div>
      <h4>Giao quyền cho bá quan</h4>
      <label class="row"><input type="checkbox" data-chg="autoEcon" ${n.autoEcon ? 'checked' : ''}> Thừa tướng tự lo xây dựng nội chính</label>
      <label class="row"><input type="checkbox" data-chg="autoRecruit" ${n.autoRecruit ? 'checked' : ''}> Binh bộ tự mộ binh bổ sung</label></div>
      <div class="card"><h4 style="margin-top:0">Ngân sách tháng</h4><table class="tbl"><tr><th>Tài nguyên</th><th>Kho</th><th>Thu</th><th>Chi (quân)</th><th>Ròng</th></tr>
      ${CW.RES_KEYS.map(r => { const inc = r === 'weapons' ? n.inc.weapons + n.smithy * 45 : n.inc[r]; const up = (n.upkeep[r] || 0) + (r === 'iron' ? n.smithy * 30 : r === 'wood' ? n.smithy * 15 : 0); const v = inc - up; return `<tr><td>${CW.RES[r].icon} ${CW.RES[r].name}</td><td>${U.fmt(n.res[r])}</td><td>${Math.round(inc)}</td><td>${Math.round(up)}</td><td class="${v >= 0 ? 'pos' : 'neg'}" style="color:${v >= 0 ? '#2f7a2a' : '#b3241b'}">${v >= 0 ? '+' : ''}${Math.round(v)}</td></tr>`; }).join('')}</table>
      ${n.starving ? '<p class="neg" style="color:#b3241b"><b>Thiếu lương! Quân lính hao hụt, sĩ khí giảm.</b></p>' : ''}${n.broke ? '<p style="color:#b3241b"><b>Ngân khố cạn! Sĩ khí và lòng trung thành giảm.</b></p>' : ''}</div></div>`;
    h += `<h4>Các lãnh địa</h4><div class="scroll" style="max-height:40vh;overflow:auto"><table class="tbl"><tr><th>Lãnh địa</th><th>Dân</th><th>Trú quân</th><th>Tường</th><th>Công trình</th><th>Đang làm</th></tr>
      ${own.map(k => { const p = g.provs[k]; return `<tr class="click" data-act="gotoProv" data-p="${k}"><td>${g.nations[ME()].capital === k ? '👑 ' : ''}<b>${esc(p.name)}</b>${g.day - p.sieged < 2 ? ' 🔥' : ''}</td><td>${U.fmt(p.pop)}</td><td>${U.fmt(G.troops(p.garrison))}</td><td>${Math.round(p.wallHp)}/${G.wallMax(p)}</td>
        <td>${CW.BUILD_KEYS.filter(b => p.bld[b]).map(b => CW.BUILDINGS[b].icon + p.bld[b]).join(' ')}</td><td>${p.building ? CW.BUILDINGS[p.building.key].icon + ' ' + p.building.left + 'd' : ''}${p.queue.length ? ' 🛡' + p.queue.length : ''}</td></tr>`; }).join('')}</table></div>`;
    return h;
  };
  G.generals0Monarch = () => g.generals.find(x => x.nation === ME() && x.monarch && x.alive) || { name: g.nations[ME()].monarch, monarch: true, nation: ME() };
  CHG.tax = el => X('tax', { v: +el.value / 100 });
  CHG.autoEcon = el => X('autoEcon', { v: el.checked });
  CHG.autoRecruit = el => X('autoRecruit', { v: el.checked });
  ACT.gotoProv = el => { const k = num(el, 'p'); R.sel.clear(); R.selProv = k; const c = G.city(g, k); UI.jump(c.x, c.y); UI.closeModal(); };

  // --- Tướng lĩnh ---
  MOD.gens = function () {
    const gens = g.generals.filter(x => x.alive && x.nation === ME()).sort((a, b) => (b.monarch - a.monarch) || ((b.war + b.lead + b.int) - (a.war + a.lead + a.int)));
    let h = `<div class="row" style="margin-bottom:8px"><button class="btn green" data-act="open" data-m="hire">🎓 Chiêu hiền nạp sĩ (${G.hireCost(g, ME())} vàng)</button>
      <button class="btn" data-act="open" data-m="newGen">✍ Tự phong tướng</button><span class="muted">Bấm vào chân dung để tải ảnh của riêng bạn. Ảnh được lưu lại theo tên nhân vật.</span></div>`;
    h += `<div class="scroll" style="max-height:62vh;overflow:auto"><table class="tbl"><tr><th></th><th>Tên</th><th>Võ</th><th>Thống</th><th>Trí</th><th>Trung</th><th>Thắng</th><th>Nhiệm vụ</th><th></th></tr>
      ${gens.map(x => { const a = x.army ? G.army(g, x.army) : null; return `<tr><td>${portrait(x, 'sm')}</td><td><b>${esc(x.name)}</b>${x.monarch ? ' 👑' : ''} <span class="chip" data-act="renameGen" data-id="${x.id}" title="Đổi tên">✎</span></td>
        <td>${x.war}</td><td>${x.lead}</td><td>${x.int}</td><td style="color:${x.loyalty < 40 ? '#b3241b' : 'inherit'}">${Math.round(x.loyalty)}</td><td>${x.wins || 0}</td>
        <td>${a ? `<a href="#" data-act="selArmy" data-id="${a.id}">Chỉ huy ${U.fmt(G.troops(a.t))} quân</a>` : '<span class="muted">Nhàn rỗi</span>'}</td>
        <td>${x.monarch ? '' : `<button class="btn sm" data-act="reward" data-id="${x.id}" title="Ban 100 vàng, +12 trung thành">Ban thưởng</button>`}</td></tr>`; }).join('')}</table></div>`;
    return h;
  };
  ACT.reward = el => X('reward', { id: num(el, 'id') });
  ACT.renameGen = el => {
    const gen = G.gen(g, num(el, 'id')); if (!gen) return;
    const name = window.prompt('Tên mới cho ' + gen.name + ':', gen.name);
    if (name && name.trim() && name.trim() !== gen.name) { const old = gen.name; X('rename', { id: gen.id, name }, r => { if (r && r.ok && P.has(old)) P.rename(old, name.trim()); CW.Cmd.toast(r); }); }
  };
  ACT.selArmy = el => { const a = G.army(g, num(el, 'id')); if (!a) return; R.sel.clear(); R.sel.add(a.id); R.selProv = -1; UI.jump(a.x, a.y); UI.closeModal(); };
  MOD.hire = function () {
    const cost = G.hireCost(g, ME());
    if (!UI.cands) return '<p class="muted">Sứ giả đang đi tìm hiền sĩ khắp thiên hạ...</p>';
    return `<p>Mỗi lần chiêu hiền tốn <b>${cost}</b> vàng (ngân khố: ${U.fmt(g.nations[ME()].res.gold)}). Chọn một trong ba hiền sĩ:</p><div class="grid3">${UI.cands.map((c, i) => `<div class="card" style="text-align:center">
      <img class="portrait lg" src="${P.url(c.name, 'general', g.nations[ME()].color)}"><div style="font-weight:700;font-size:15px">${esc(c.name)}</div>
      <div>Võ <b>${c.war}</b> · Thống <b>${c.lead}</b> · Trí <b>${c.int}</b></div><button class="btn green" data-act="doHire" data-i="${i}" style="margin-top:6px">Mời về</button></div>`).join('')}</div>
      <div class="row" style="margin-top:10px"><button class="btn" data-act="rerollHire">🔄 Tìm người khác</button><button class="btn" data-act="open" data-m="gens">← Quay lại</button></div>`;
  };
  ACT.doHire = el => X('hire', { i: num(el, 'i') }, r => { CW.Cmd.toast(r); if (r && r.ok) UI.openModal('gens'); });
  ACT.rerollHire = () => { UI.cands = null; UI.lastModal = ''; UI.renderModal(true); X('hireCands', {}, r => { if (r && r.cands) { UI.cands = r.cands; UI.lastModal = ''; UI.renderModal(true); } }); };
  MOD.newGen = function () {
    return `<p>Tự đặt tên và chỉ số cho tướng của riêng bạn. Chi phí: 100 vàng + 6 vàng cho mỗi điểm tổng chỉ số vượt 150.</p>
      <div class="row"><label>Tên <input id="ngName" maxlength="24" placeholder="VD: Trần Quốc Tuấn"></label>
      <label>Võ <input id="ngWar" type="number" min="1" max="99" value="70" style="width:64px"></label>
      <label>Thống <input id="ngLead" type="number" min="1" max="99" value="70" style="width:64px"></label>
      <label>Trí <input id="ngInt" type="number" min="1" max="99" value="60" style="width:64px"></label></div>
      <div class="row" style="margin-top:10px"><button class="btn green" data-act="doNewGen">Phong tướng</button><button class="btn" data-act="open" data-m="gens">← Quay lại</button></div>`;
  };
  ACT.doNewGen = () => {
    const name = $('ngName').value, w = +$('ngWar').value, l = +$('ngLead').value, i = +$('ngInt').value;
    X('newGen', { name, war: w, lead: l, int: i }, r => { CW.Cmd.toast(r); if (r && r.ok) UI.openModal('gens'); });
  };

  // --- Lập đạo quân ---
  MOD.formArmy = function (k) {
    const p = g.provs[k];
    const idle = g.generals.filter(x => x.alive && x.nation === ME() && !x.army);
    return `<p>Lấy quân từ thành <b>${esc(p.name)}</b> (trú quân ${U.fmt(G.troops(p.garrison))}).</p>
      <div class="grid2"><div>${CW.UNIT_KEYS.map(u => `<div class="row"><span style="width:110px">${CW.UNITS[u].icon} ${CW.UNITS[u].name}</span>
        <input type="number" id="fa_${u}" min="0" max="${Math.floor(p.garrison[u])}" value="${Math.floor(p.garrison[u] * 0.7 / 100) * 100}" style="width:90px"> / ${Math.floor(p.garrison[u])}
        <button class="btn sm" data-act="faAll" data-u="${u}" data-v="${Math.floor(p.garrison[u])}">Tất cả</button></div>`).join('')}</div>
      <div><label>Chủ tướng<br><select id="fa_gen" style="width:100%">${idle.map(x => `<option value="${x.id}">${esc(x.name)}${x.monarch ? ' 👑 (ngự giá thân chinh)' : ''} — V${x.war} T${x.lead} Tr${x.int}</option>`).join('')}<option value="">— Vô tướng —</option></select></label>
      <label style="display:block;margin-top:8px">Trận hình<br><select id="fa_form" style="width:100%">${CW.FORMATION_KEYS.map(f => `<option value="${f}">${CW.FORMATIONS[f].name} — ${esc(CW.FORMATIONS[f].desc)}</option>`).join('')}</select></label>
      <label style="display:block;margin-top:8px">Tư thế<br><select id="fa_stance" style="width:100%">${Object.keys(CW.STANCES).map(s => `<option value="${s}">${CW.STANCES[s].name} — ${esc(CW.STANCES[s].desc)}</option>`).join('')}</select></label></div></div>
      <div class="row" style="margin-top:12px"><button class="btn red" data-act="doFormArmy" data-p="${k}">⚑ Xuất quân</button><button class="btn" data-act="closeModal">Hủy</button></div>`;
  };
  ACT.faAll = el => { $('fa_' + el.dataset.u).value = el.dataset.v; };
  ACT.doFormArmy = el => {
    const k = num(el, 'p'); const t = {};
    for (const u of CW.UNIT_KEYS) t[u] = +$('fa_' + u).value || 0;
    const gid = $('fa_gen').value ? +$('fa_gen').value : null;
    X('formArmy', { prov: k, gen: gid, t, form: $('fa_form').value, stance: $('fa_stance').value }, r => {
      CW.Cmd.toast(r);
      if (r && r.ok) { R.sel.clear(); R.sel.add(r.id); R.selProv = -1; UI.closeModal(); }
    });
  };

  // --- Quân đoàn ---
  MOD.armies = function () {
    const arr = G.armiesOf(g, ME());
    const t = G.emptyT(); arr.forEach(a => CW.UNIT_KEYS.forEach(k => (t[k] += a.t[k])));
    return `<div class="row">Tổng ${arr.length} đạo quân · ${U.fmt(G.troops(t))} binh sĩ (${troopsLine(t)})</div>
      <div class="scroll" style="max-height:66vh;overflow:auto"><table class="tbl"><tr><th>Chủ tướng</th><th>Binh lực</th><th>Binh chủng</th><th>Sĩ khí</th><th>Trận hình</th><th>Vị trí</th><th>Trạng thái</th><th>Chỉ huy</th></tr>
      ${arr.map(a => { const m = a.mission || {}; return `<tr class="click" data-act="selArmy" data-id="${a.id}"><td><b>${esc(G.armyName(g, a))}</b></td><td>${U.fmt(G.troops(a.t))}</td><td>${troopsLine(a.t)}</td><td>${Math.round(a.morale)}</td>
        <td>${CW.FORMATIONS[a.formation].name}</td><td>${esc(G.provName(g, G.provAt(g, a.x, a.y)))}</td><td>${stateText(a)}</td>
        <td>${a.mode === 'auto' ? '★ ' + (m.type === 'defend' ? 'Trấn giữ ' + esc(G.provName(g, m.prov)) : m.type === 'attack' ? 'Chinh phạt ' + esc(G.nationName(g, m.nation)) : 'Tự do') : 'Trực tiếp'}</td></tr>`; }).join('')}</table></div>`;
  };

  // --- Ngoại giao ---
  MOD.diplo = function () {
    let h = '';
    const props = g.proposals.filter(p => p.to === ME());
    if (props.length) {
      h += `<h4 style="margin-top:0">Quốc thư đang chờ</h4>` + props.map(p => {
        const txt = p.type === 'peace' ? `${esc(g.nations[p.from].name)} xin giảng hòa${p.tribute ? ` (dâng ${p.tribute} vàng)` : ''}.` : p.type === 'alliance' ? `${esc(g.nations[p.from].name)} đề nghị kết đồng minh.` : `Đồng minh ${esc(g.nations[p.from].name)} cầu viện: xin tuyên chiến với ${esc(g.nations[p.target].name)}.`;
        return `<div class="card row" style="margin-bottom:4px">${flag(p.from)} <span style="flex:1">${txt} <span class="muted">(hết hạn sau ${Math.ceil(p.expires - g.day)} ngày)</span></span>
          <button class="btn sm green" data-act="propYes" data-id="${p.id}">Chấp thuận</button><button class="btn sm" data-act="propNo" data-id="${p.id}">Khước từ</button></div>`;
      }).join('');
    }
    h += `<table class="tbl"><tr><th>Quốc gia</th><th>Quân chủ</th><th>Thế lực</th><th>Lãnh địa</th><th>Quan hệ</th><th>Hiện trạng</th><th>Hành động</th></tr>`;
    const myPow = G.power(g, ME());
    for (const n of g.nations) {
      if (n.id === ME()) continue;
      const mon = g.generals.find(x => x.nation === n.id && x.monarch) || { name: n.monarch, monarch: true, nation: n.id };
      if (!n.alive) { h += `<tr style="opacity:.5"><td>${flag(n.id)} ${esc(n.name)}</td><td>${esc(n.monarch)}</td><td colspan="5">Đã diệt vong</td></tr>`; continue; }
      const st = g.status[ME()][n.id], rel = Math.round(g.rel[ME()][n.id]);
      const pw = G.power(g, n.id);
      let acts = '';
      if (st === 'war') acts = `<button class="btn sm" data-act="dPeace" data-n="${n.id}" data-t="0">Cầu hòa</button><button class="btn sm" data-act="dPeace" data-n="${n.id}" data-t="400" title="Cống nạp 400 vàng">Cầu hòa + cống 400</button>`;
      else {
        if (st === 'peace') acts += `<button class="btn sm green" data-act="dAlly" data-n="${n.id}">Kết minh</button>`;
        acts += `<button class="btn sm" data-act="dGift" data-n="${n.id}">Tặng lễ 200</button>`;
        if (st === 'ally') acts += `<button class="btn sm" data-act="dBreak" data-n="${n.id}">Hủy minh</button>`;
        acts += `<button class="btn sm red" data-act="dWar" data-n="${n.id}">Tuyên chiến</button>`;
      }
      const truce = g.truce[ME()][n.id] > g.day ? ` <span class="muted" title="Đình chiến">🕊${Math.ceil((g.truce[ME()][n.id] - g.day) / 30)}th</span>` : '';
      h += `<tr><td>${flag(n.id, 24)} <b>${esc(n.name)}</b>${humanTag(n.id)}</td><td><div class="row" style="margin:0">${portrait(mon, 'sm')} ${esc(n.monarch)}</div></td>
        <td title="${U.fmt(pw)}">${U.fmt(pw)} <span class="muted">(${pw > myPow * 1.2 ? 'mạnh hơn' : pw < myPow * 0.8 ? 'yếu hơn' : 'ngang'})</span></td><td>${n.provCount}</td>
        <td><b style="color:${relColor(rel)}">${rel > 0 ? '+' : ''}${rel}</b></td><td>${stLabel(st)}${truce}</td><td>${acts}</td></tr>`;
    }
    h += `</table><h4>Thiên hạ đại thế</h4><div class="row" style="align-items:flex-start;gap:20px"><table class="matrix"><tr><td></td>${g.nations.map(n => `<td>${flag(n.id, 18)}</td>`).join('')}</tr>
      ${g.nations.map(a => `<tr><td>${flag(a.id, 18)}</td>${g.nations.map(b => { if (a.id === b.id) return '<td style="background:#c9b07e"></td>'; if (!a.alive || !b.alive) return '<td style="background:#ccc"></td>'; const s = g.status[a.id][b.id]; return `<td style="background:${s === 'war' ? '#e5856f' : s === 'ally' ? '#93c97e' : '#f3e7c8'}" title="${esc(a.name)} – ${esc(b.name)}: ${s === 'war' ? 'Chiến tranh' : s === 'ally' ? 'Đồng minh' : 'Hòa hiếu'} (${Math.round(g.rel[a.id][b.id])})">${s === 'war' ? '⚔' : s === 'ally' ? '✦' : ''}</td>`; }).join('')}</tr>`).join('')}</table>
      <div class="muted" style="max-width:420px">⚔ chiến tranh · ✦ đồng minh. Khi một nước bị đồng minh tấn công, nước đó sẽ cắt minh ước và phản công; các đồng minh khác của nạn nhân có thể tham chiến chống kẻ phản bội.</div></div>`;
    return h;
  };
  ACT.propYes = el => X('answer', { id: num(el, 'id'), yes: true });
  ACT.propNo = el => X('answer', { id: num(el, 'id'), yes: false });
  ACT.dPeace = el => X('peace', { to: num(el, 'n'), trib: num(el, 't') });
  ACT.dAlly = el => X('ally', { to: num(el, 'n') });
  ACT.dGift = el => X('gift', { to: num(el, 'n') });
  ACT.dBreak = el => { const n = num(el, 'n'); UI.confirm(`Hủy minh ước với <b>${esc(g.nations[n].name)}</b>?`, () => X('breakAlly', { to: n })); };
  ACT.dWar = el => UI.askWar(num(el, 'n'));
  UI.askWar = function (n, then) {
    const st = g.status[ME()][n]; const truce = g.truce[ME()][n] > g.day;
    const warn = st === 'ally' ? '<p style="color:#b3241b"><b>Đây là đồng minh! Phản bội minh ước sẽ khiến thiên hạ khinh bỉ (quan hệ với mọi nước giảm) và đồng minh của họ có thể quay sang đánh ta.</b></p>' : truce ? '<p style="color:#b3241b">Đang trong thời gian đình chiến — bội ước sẽ làm xấu quan hệ.</p>' : '';
    UI.confirm(`Tuyên chiến với <b>${esc(g.nations[n].name)}</b>?${warn}`, () => {
      X('war', { to: n }); if (then) then();
    }, 'Tuyên chiến');
  };

  // --- Sử ký ---
  MOD.history = function () {
    const F = { all: 'Tất cả', mine: 'Của ta', war: 'Chiến sự', diplo: 'Ngoại giao', home: 'Nội chính & nhân sự', major: 'Đại sự', camp: '📜 Chiến dịch' };
    const f = UI.histFilter;
    const tabs = `<div class="tabs">${Object.keys(F).map(k => `<button class="btn sm ${f === k ? 'on' : ''}" data-act="histF" data-f="${k}">${F[k]}</button>`).join('')}
      <span style="flex:1"></span><button class="btn sm" data-act="histCopy" title="Sao chép toàn bộ sử ký (theo bộ lọc) vào clipboard">📋 Sao chép</button><button class="btn sm" data-act="histSave" title="Tải toàn bộ sử ký (theo bộ lọc) về file .txt">💾 Xuất .txt</button></div>`;
    if (f === 'camp') return tabs + campView();
    const test = e => f === 'all' ? true : f === 'mine' ? isMine(e) : f === 'war' ? /war|battle|siege/.test(e.type) : f === 'diplo' ? e.type === 'diplo' : f === 'home' ? /econ|gen|misc/.test(e.type) : e.major;
    const list = g.events.filter(test).slice(-400).reverse();
    return tabs + `<div class="evlist">${list.map(e => `<div class="ev ${isMine(e) ? 'mine' : ''}" data-act="evJump" data-x="${e.x === undefined ? '' : e.x}" data-y="${e.y === undefined ? '' : e.y}"><span class="d">${G.dateStr(g, e.d, true)}</span>${e.n.filter(x => x >= 0).slice(0, 2).map(x => flag(x, 16)).join('')} ${esc(e.text)}${e.rep !== undefined && g.reports && g.reports[e.rep] && g.reports[e.rep].by === ME() ? ` <button class="btn sm" data-act="openRep" data-r="${e.rep}">📜 Xem tổng kết</button>` : ''}</div>`).join('') || '<p class="muted">Chưa có sự kiện.</p>'}</div>`;
  };
  // Danh sách chiến dịch: đã hoàn tất (g.reports) và đang diễn ra (g.camps)
  function campView() {
    const reps = (g.reports || []).map((r, i) => r.by !== ME() ? '' : `<div class="card" style="margin-bottom:6px"><div class="row"><b style="font-size:15px">${esc(r.title)}</b><span class="muted">${G.dateStr(g, r.day, true)}</span><span style="flex:1"></span><button class="btn sm" data-act="openRep" data-r="${i}">📜 Xem chi tiết</button></div>
      <div class="muted">${esc(r.lines[0])} ${esc(r.lines[2])}</div></div>`).reverse().join('');
    const cs = G.camps(g, ME());
    const cur = Object.keys(cs).map(Number).filter(k => g.nations[k] && g.nations[k].alive).map(k => {
      const c = cs[k];
      return `<tr><td>${flag(k, 16)} ${esc(g.nations[k].name)}</td><td>${G.dateStr(g, c.start, true)}</td><td>${c.won} / ${c.lost}</td><td>${U.fmt(c.foeLoss)}</td><td>${U.fmt(c.myLoss)}</td><td>${c.taken.length}${c.lostCities.length ? ' / −' + c.lostCities.length : ''}</td><td>${G.atWar(g, ME(), k) ? '<span style="color:#b3241b">Đang giao tranh</span>' : 'Tạm ngưng'}</td></tr>`;
    }).join('');
    return `<h4 style="margin:4px 0">Chiến dịch đang diễn ra</h4>${cur ? `<table class="tbl"><tr><th>Đối thủ</th><th>Khai chiến</th><th>Thắng / bại</th><th>Địch thương vong</th><th>Ta tổn thất</th><th>Thành chiếm / mất</th><th>Tình hình</th></tr>${cur}</table>` : '<p class="muted">Chưa có.</p>'}
      <h4 style="margin:12px 0 4px">Chiến dịch đã hoàn tất (diệt quốc)</h4>${reps || '<p class="muted">Chưa diệt nước nào. Khi ta tiêu diệt một nước, bản tổng kết chiến dịch sẽ được lưu tại đây.</p>'}`;
  }
  ACT.openRep = el => UI.openModal('report', +el.dataset.r);
  MOD.report = function () {
    const r = (g.reports || [])[UI.arg]; if (!r) return '<p class="muted">Không tìm thấy.</p>';
    const c = r.stats;
    const days = Math.max(1, r.day - c.start);
    const tile = (lb, v, col) => `<div class="card" style="flex:1;min-width:110px;text-align:center"><div class="muted" style="font-size:11px">${lb}</div><div style="font-size:20px;font-weight:700;${col ? 'color:' + col : ''}">${v}</div></div>`;
    const gens = Object.values(c.gens).map(x => Object.assign({}, x, { score: x.kills / 100 + x.wins * 10 + x.cities * 25 })).sort((a, b) => b.score - a.score);
    const gRows = gens.map((x, i) => `<tr><td>${i + 1}</td><td>${portrait({ name: x.name, monarch: x.monarch, nation: x.nation === undefined ? r.by : x.nation }, 'sm')} <b>${esc(x.name)}</b>${x.monarch ? ' <span class="muted">(quân chủ)</span>' : ''}</td><td>${U.fmt(x.kills)}</td><td>${x.wins}</td><td>${x.cities}</td><td>${U.fmt(x.lost)}</td><td>${x.defeats}</td><td><b>${Math.round(x.score)}</b></td></tr>`).join('');
    const extra = r.lines.filter(l => /^Hàng tướng/.test(l)).map(l => `<p>${esc(l)}</p>`).join('');
    return `<div class="row" style="gap:10px">${flagRaw(r.color, r.char, 40)}
        <div><h2 style="margin:0">${esc(r.title)}</h2><div class="muted">${esc(r.lines[0])}</div></div></div>
      <p>${esc(r.lines[1])}</p>
      <div class="row" style="gap:6px;flex-wrap:wrap">${tile('Thời gian', days >= 360 ? (days / 360).toFixed(1) + ' năm' : days >= 30 ? Math.round(days / 30) + ' tháng' : days + ' ngày')}${tile('Trận thắng / bại', c.won + ' / ' + c.lost)}
        ${tile('Địch tử thương', U.fmt(c.foeLoss), '#2f7a2a')}${tile('Ta tổn thất', U.fmt(c.myLoss), '#b3241b')}${tile('Thành chiếm', c.taken.length)}${c.lostCities.length ? tile('Thành mất', c.lostCities.length, '#b3241b') : ''}</div>
      <p><b>Thành chiếm được:</b> ${esc(c.taken.join(', ') || '—')}</p>${c.lostCities.length ? `<p><b>Thành bị mất:</b> ${esc(c.lostCities.join(', '))}</p>` : ''}
      <h4>Danh tướng & công trạng</h4>${gRows ? `<table class="tbl"><tr><th>#</th><th>Tướng</th><th>Hạ địch</th><th>Thắng</th><th>Hạ thành</th><th>Hao quân</th><th>Bại</th><th>Công trạng</th></tr>${gRows}</table>
      <p class="muted" style="font-size:11px">Công trạng = hạ địch/100 + thắng×10 + hạ thành×25.</p>` : '<p class="muted">Không có ghi nhận.</p>'}${extra}
      <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn sm" data-act="repCopy">📋 Sao chép bản tổng kết</button><button class="btn sm" data-act="open" data-m="history">📖 Về Sử ký</button></div>`;
  };
  UI.repText = r => [`=== TỔNG KẾT CHIẾN DỊCH: ${r.title.toUpperCase()} (${G.dateStr(g, r.day, true)}) ===`].concat(r.lines).join('\n');
  ACT.repCopy = () => { const r = (g.reports || [])[UI.arg]; if (!r) return; const t = UI.repText(r); if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => UI.toast('Đã sao chép.', 'good'), () => UI.toast('Không sao chép được.', 'bad')); };
  ACT.histF = el => { UI.histFilter = el.dataset.f; };
  UI.histText = function () {
    const f = UI.histFilter;
    const test = e => f === 'all' ? true : f === 'mine' ? isMine(e) : f === 'war' ? /war|battle|siege/.test(e.type) : f === 'diplo' ? e.type === 'diplo' : f === 'home' ? /econ|gen|misc/.test(e.type) : e.major;
    const TY = { war: 'Chiến tranh', battle: 'Giao chiến', siege: 'Công thành', diplo: 'Ngoại giao', econ: 'Nội chính', gen: 'Nhân sự', misc: 'Sự kiện' };
    const me = g.nations[ME()];
    const head = [`SỬ KÝ — ${me.name} (${me.monarch})`, `Bản đồ: ${(CW.MAP_TEMPLATES.find(t => t.id === g.setup.template) || {}).name || g.setup.template} · hạt giống ${g.setup.seed} · Hiện tại: ${G.dateStr(g)}`,
      'Các nước: ' + g.nations.map(n => `${n.name}${n.alive ? '' : ' (đã diệt)'}`).join(', '), ''];
    if (f === 'camp') return head.concat((g.reports || []).filter(r => r.by === ME()).map(r => UI.repText(r) + '\n')).join('\n');
    const rows = [];
    for (const e of g.events.filter(test)) {
      rows.push(`[${G.dateStr(g, e.d, true)}] [${TY[e.type] || e.type}]${e.major ? ' ★' : ''} ${e.text}`);
      const r = e.rep !== undefined && g.reports && g.reports[e.rep] && g.reports[e.rep].by === ME() ? g.reports[e.rep] : null;
      if (r) rows.push(UI.repText(r).split('\n').map(l => '      ' + l).join('\n'));
    }
    return head.concat(rows).join('\n');
  };
  ACT.histCopy = () => {
    const txt = UI.histText();
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } ta.remove(); UI.toast(ok ? 'Đã sao chép sử ký.' : 'Không sao chép được — hãy dùng Xuất .txt.', ok ? 'good' : 'bad'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => UI.toast('Đã sao chép sử ký.', 'good'), fallback); else fallback();
  };
  ACT.histSave = () => {
    const blob = new Blob(['﻿' + UI.histText()], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `suky_${g.nations[ME()].name}_${G.dateStr(g, undefined, true).replace(/[^\w]+/g, '-')}.txt`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    UI.toast('Đã xuất file sử ký (thư mục Downloads).', 'good');
  };
  ACT.evJump = el => { if (el.dataset.x !== '') { UI.jump(+el.dataset.x, +el.dataset.y); if (UI.modal) UI.closeModal(); } };

  // --- Hệ thống ---
  MOD.system = function () {
    const slots = ['auto', '1', '2', '3'];
    const net = CW.Net && CW.Net.active();
    const netCard = net ? `<div class="card" style="grid-column:1/-1"><h4 style="margin-top:0">🌐 Phòng nhiều người — mã <b>${esc(CW.Net.code())}</b></h4>${CW.Net.playersHtml()}
      <p class="muted">${CW.Net.isHost() ? 'Ngài là chủ phòng: máy của ngài chạy mô phỏng cho cả phòng. Rời phòng sẽ kết thúc ván của mọi người.' : 'Ngài là khách: mọi lệnh được gửi tới chủ phòng. Chỉ chủ phòng lưu được ván.'}</p></div>` : '';
    if (net && CW.Net.isClient()) return `<div class="grid2">${netCard}<div class="card"><h4 style="margin-top:0">Tùy chọn</h4>
      <label class="row"><input type="checkbox" data-chg="edgeScroll" ${UI.settings.edge ? 'checked' : ''}> Cuộn bản đồ khi chuột chạm mép màn hình</label>
      <div class="row" style="margin-top:12px"><button class="btn" data-act="open" data-m="help">📘 Hướng dẫn</button><button class="btn red" data-act="toMenu">⏏ Rời phòng</button></div></div></div>`;
    return `<div class="grid2">${netCard}<div class="card"><h4 style="margin-top:0">Lưu / tải ván</h4>${slots.map(s => {
      const m = CW.Main.saveMeta(s);
      return `<div class="row"><b style="width:90px">${s === 'auto' ? 'Tự động' : 'Ô ' + s}</b><span style="flex:1" class="muted">${m ? esc(m.label) : '(trống)'}</span>
        ${s !== 'auto' ? `<button class="btn sm" data-act="saveSlot" data-s="${s}">Lưu</button>` : ''}<button class="btn sm" data-act="loadSlot" data-s="${s}" ${m && !net ? '' : 'disabled'}>Tải</button></div>`;
    }).join('')}<p class="muted">Tự động lưu mỗi 3 tháng trong game.</p></div>
      <div class="card"><h4 style="margin-top:0">Tùy chọn</h4>
      <label class="row"><input type="checkbox" data-chg="edgeScroll" ${UI.settings.edge ? 'checked' : ''}> Cuộn bản đồ khi chuột chạm mép màn hình</label>
      <div class="row" style="margin-top:12px"><button class="btn" data-act="open" data-m="help">📘 Hướng dẫn</button><button class="btn red" data-act="toMenu">⏏ ${net ? 'Đóng phòng & về màn hình chính' : 'Về màn hình chính'}</button></div></div></div>`;
  };
  ACT.saveSlot = el => { CW.Main.save(el.dataset.s) ? UI.toast('Đã lưu ván chơi.', 'good') : UI.toast('Không thể lưu (bộ nhớ trình duyệt đầy?).', 'bad'); UI.lastModal = ''; };
  ACT.loadSlot = el => { const s = el.dataset.s; UI.confirm('Tải ván đã lưu? Tiến trình hiện tại chưa lưu sẽ mất.', () => CW.Main.load(s)); };
  ACT.toMenu = () => {
    const net = CW.Net && CW.Net.active();
    const q = !net ? 'Về màn hình chính? (Ván hiện tại sẽ được tự động lưu.)' : CW.Net.isHost() ? 'Đóng phòng? Ván của mọi người chơi sẽ kết thúc (ván được tự động lưu trên máy ngài).' : 'Rời phòng? Nước của ngài sẽ được giao cho AI cho tới khi ngài vào lại.';
    UI.confirm(q, () => { if (!net || CW.Net.isHost()) CW.Main.save('auto'); if (net) CW.Net.leave(); CW.Main.toMenu(); });
  };
  CHG.edgeScroll = el => { UI.settings.edge = el.checked; try { localStorage.setItem('cw_settings', JSON.stringify(UI.settings)); } catch (e) { /* bỏ qua */ } };
  try { Object.assign(UI.settings, JSON.parse(localStorage.getItem('cw_settings') || '{}')); } catch (e) { /* bỏ qua */ }

  MOD.help = () => helpHtml() + `<div class="row"><button class="btn" data-act="open" data-m="system">← Quay lại</button></div>`;
  MOD.gameover = function () {
    const o = G.outcome(g, ME()) || { win: false, text: '' };
    if (CW.Audio && !UI._goSnd) { UI._goSnd = 1; CW.Audio.sfx(o.win ? 'victory' : 'defeat', true); }
    return `<div style="text-align:center;padding:20px"><div style="font-size:42px">${o.win ? '🏆' : '🕯'}</div><h2 style="color:${o.win ? '#2f7a2a' : '#b3241b'}">${o.win ? 'NHẤT THỐNG THIÊN HẠ' : 'QUỐC GIA DIỆT VONG'}</h2>
      <p style="font-size:15px">${esc(o.text)}</p><p class="muted">${G.dateStr(g)}</p>
      <div class="row audioInline" style="justify-content:center;margin-top:8px">${CW.Audio ? CW.Audio.html() : ''}</div>
      <div class="row" style="justify-content:center;margin-top:16px"><button class="btn" data-act="goContinue">Tiếp tục quan sát</button><button class="btn red" data-act="toMenuNow">Về màn hình chính</button></div></div>`;
  };
  ACT.goContinue = () => {
    UI.goAck = UI.goKey(); UI._goSnd = 0;
    if (g.gameOver && (!CW.Net || !CW.Net.isClient())) g.gameOver.ack = true;
    UI.closeModal();
  };
  // Khóa nhận diện kết cục hiện tại (để không mở lại cửa sổ sau khi đã bấm "Tiếp tục quan sát")
  UI.goKey = () => (g && g.gameOver ? 'g' : '') + (g && g.nations[ME()] && !g.nations[ME()].alive ? 'd' : '');
  ACT.toMenuNow = () => { if (CW.Net && CW.Net.active()) CW.Net.leave(); CW.Main.toMenu(); };

  // ---------------- Chân dung ----------------
  ACT.portrait = el => {
    const name = el.dataset.name || ($(el.dataset.input) ? $(el.dataset.input).value.trim() : '');
    if (!name) { UI.toast('Hãy đặt tên trước khi tải chân dung.'); return; }
    const fp = $('filePick'); fp.value = '';
    fp.onchange = () => {
      const f = fp.files[0]; if (!f) return;
      P.fromFile(f, url => {
        if (!url) { UI.toast('Không đọc được ảnh.', 'bad'); return; }
        if (!P.set(name, url)) { UI.toast('Bộ nhớ trình duyệt đầy, không lưu được ảnh.', 'bad'); return; }
        UI.toast(`Đã cập nhật chân dung ${esc(name)}.`, 'good');
        UI.lastSide = ''; UI.lastModal = '';
        if (g) UI.refresh(true); else if (UI.onSetupRefresh) UI.onSetupRefresh();
      });
    };
    fp.click();
  };
  ACT.portraitDel = el => { const name = el.dataset.name || ($(el.dataset.input) ? $(el.dataset.input).value.trim() : ''); P.remove(name); if (UI.onSetupRefresh) UI.onSetupRefresh(); UI.lastSide = ''; UI.lastModal = ''; };

  // ---------------- Ticker ----------------
  UI.saveSettings = () => { try { localStorage.setItem('cw_settings', JSON.stringify(UI.settings)); } catch (e) { /* bỏ qua */ } };
  UI.toggleSide = () => { UI.settings.sideMin = !UI.settings.sideMin; UI.saveSettings(); UI.lastSide = ''; UI.renderSide(true); };
  UI.toggleTicker = () => { UI.settings.tickMin = !UI.settings.tickMin; UI.saveSettings(); UI.lastTick = ''; UI.renderTicker(); };
  ACT.sideMin = () => UI.toggleSide();
  ACT.sideClose = () => { R.sel.clear(); R.selProv = -1; UI.lastSide = ''; UI.renderSide(true); };
  ACT.tickMin = () => UI.toggleTicker();
  UI.renderTicker = function () {
    const min = !!UI.settings.tickMin;
    const list = g.events.filter(e => isMine(e) || e.major).slice(min ? -1 : -5);
    const html = `<button class="btn sm tickbtn" data-act="tickMin" title="${min ? 'Hiện thêm tin (L)' : 'Thu gọn tin (L)'}">${min ? '▴ Tin tức' : '▾ Thu gọn'}</button>` + list.map(e => `<div class="tick ${e.type}" data-act="evJump" data-x="${e.x === undefined ? '' : e.x}" data-y="${e.y === undefined ? '' : e.y}"><span class="d">${G.dateStr(g, e.d, true)}</span>${esc(e.text)}</div>`).join('');
    if (html !== UI.lastTick) { $('ticker').innerHTML = html; UI.lastTick = html; }
  };
  UI.consumeEvents = function () {
    if (g._sfxq && g._sfxq.length) {
      const pr = ['gong', 'victory', 'defeat', 'capture', 'siege', 'shout', 'fire', 'drum', 'clash'];
      const q = g._sfxq.map(e => G.sfxFor(e, ME())).filter(x => x && pr.includes(x)); g._sfxq = [];
      const best = q.sort((a, b) => pr.indexOf(a) - pr.indexOf(b))[0];
      if (best && CW.Audio) CW.Audio.sfx(best);
    }
    const fresh = g._fresh; if (!fresh || !fresh.length) return;
    g._fresh = [];
    for (const e of fresh) {
      if (!isMine(e)) continue;
      if (e.rep !== undefined) { if (g.reports && g.reports[e.rep] && g.reports[e.rep].by === ME()) { if (!CW.Net || !CW.Net.active()) g.paused = true; UI.openModal('report', e.rep); } continue; }
      if (e.major || e.type === 'war' || (e.type === 'diplo')) {
        const bad = /tuyên chiến|thất thủ|diệt vong|phản bội|cầu viện/.test(e.text);
        UI.toast(esc(e.text), bad ? 'bad' : '', 6000);
      }
    }
  };

  UI.refresh = function (force) {
    if (!g) return;
    UI.renderTop(); UI.renderSide(force); UI.renderTicker();
    if (UI.modal) UI.renderModal(force);
  };

  // ================= MÀN HÌNH CHÍNH & THIẾT LẬP =================
  const DEFAULT_PROFILE = () => ({
    name: 'Đại Hán', char: '漢', color: '#c0392b', title: 'Hoàng đế', monarch: 'Lưu Triệt', capitalName: 'Trường An', startYear: -221,
    template: 'trungdia', seed: Math.floor(Math.random() * 1e6), nationCount: 7, difficulty: 'normal', monarchStats: { war: 70, lead: 80, int: 75 },
    rivals: CW.NATION_PRESETS.slice(0, 8).map(p => ({ presetId: p.id, rel: 'neutral' })), generals: [],
  });
  UI.loadProfile = function () {
    let p = null; try { p = JSON.parse(localStorage.getItem('cw_profile') || 'null'); } catch (e) { p = null; }
    const d = DEFAULT_PROFILE();
    if (!p) return d;
    p = Object.assign(d, p);
    while (p.rivals.length < 8) { const used = p.rivals.map(r => r.presetId); const pre = CW.NATION_PRESETS.find(x => !used.includes(x.id)); p.rivals.push({ presetId: pre.id, rel: 'neutral' }); }
    return p;
  };
  UI.saveProfile = p => { try { localStorage.setItem('cw_profile', JSON.stringify(p)); } catch (e) { /* bỏ qua */ } };

  UI.showMenu = function () {
    UI.setGame(null); UI.onSetupRefresh = null;
    $('hud').classList.add('hidden'); $('menu').classList.remove('hidden'); UI.closeModal();
    const last = CW.Main.latestSave();
    $('menu').innerHTML = `<div class="title"><div class="cn">帝 國 黃 昏</div><h1>Civil War</h1><h2>The Dusk of Empires</h2></div>
      <div class="mmenu"><button class="btn red" data-act="mNew">⚔ Tân chinh đồ</button>
      <button class="btn" data-act="mMulti">🌐 Chơi nhiều người (tạo / vào phòng)</button>
      ${last ? `<button class="btn" data-act="mContinue">▶ Tiếp tục (${esc(last.meta.label)})</button>` : ''}
      <button class="btn" data-act="mLoad">📂 Tải ván đã lưu</button><button class="btn" data-act="mDemo">🎬 Phim & Demo</button><button class="btn" data-act="mHelp">📘 Hướng dẫn</button></div><div id="menuSub"></div>`;
  };
  ACT.mNew = () => UI.showSetup();
  ACT.mContinue = () => { const l = CW.Main.latestSave(); if (l) CW.Main.load(l.slot); };
  ACT.mLoad = () => {
    $('menuSub').innerHTML = `<div class="help">${['auto', '1', '2', '3'].map(s => { const m = CW.Main.saveMeta(s); return `<div class="row"><b style="width:90px">${s === 'auto' ? 'Tự động' : 'Ô ' + s}</b><span style="flex:1">${m ? esc(m.label) : '<span class="muted">(trống)</span>'}</span>${m ? `<button class="btn sm" data-act="mLoadSlot" data-s="${s}">Tải</button>` : ''}</div>`; }).join('')}</div>`;
  };
  ACT.mLoadSlot = el => CW.Main.load(el.dataset.s);
  ACT.mMulti = () => CW.Net.showLobby();
  ACT.mDemo = () => CW.Cinema.showDemo();
  ACT.mHelp = () => { $('menuSub').innerHTML = `<div class="help">${helpHtml()}</div>`; };

  function readSetup(p) {
    const v = id => $(id) ? $(id).value : undefined;
    if (!$('s_name')) return p;
    p.name = v('s_name').trim() || 'Đại Hán'; p.char = (v('s_char').trim() || '漢').slice(0, 2); p.color = v('s_color');
    p.title = v('s_title'); p.monarch = v('s_monarch').trim() || 'Vô Danh'; p.capitalName = v('s_cap').trim();
    p.startYear = parseInt(v('s_year'), 10) || -221;
    if ($('s_tpl')) { p.template = v('s_tpl'); p.seed = parseInt(v('s_seed'), 10) || 1; p.nationCount = +v('s_count'); p.difficulty = v('s_diff'); }
    p.monarchStats = { war: +v('s_mw') || 50, lead: +v('s_ml') || 50, int: +v('s_mi') || 50 };
    for (let i = 0; i < 8; i++) if ($('r_p' + i)) { p.rivals[i].presetId = v('r_p' + i); p.rivals[i].rel = v('r_r' + i); }
    p.generals = [];
    document.querySelectorAll('.cgen[data-i]').forEach(row => {
      const i = row.dataset.i;
      p.generals.push({ name: v('cg_n' + i).trim(), war: +v('cg_w' + i) || 50, lead: +v('cg_l' + i) || 50, int: +v('cg_i' + i) || 50 });
    });
    return p;
  }
  // mode 'mp': chỉ thiết lập quốc gia của ta (dùng trong phòng nhiều người)
  UI.showSetup = function (mode) {
    UI.setupMode = mode || '';
    const p = UI.prof = UI.loadProfile();
    UI.onSetupRefresh = () => { readSetup(UI.prof); renderSetup(); };
    renderSetup();
  };
  function renderSetup() {
    const p = UI.prof;
    const cnt = p.nationCount;
    const tpl = CW.MAP_TEMPLATES.find(t => t.id === p.template) || CW.MAP_TEMPLATES[0];
    const genRow = (cg, i) => `<div class="cgen" data-i="${i}"><img class="portrait sm" src="${P.url(cg.name, 'general', p.color)}" data-act="portrait" data-input="cg_n${i}" title="Tải chân dung">
      <input id="cg_n${i}" value="${esc(cg.name)}" placeholder="Tên tướng" data-chg="cgName" data-old="${esc(cg.name)}">
      <input id="cg_w${i}" type="number" min="1" max="99" value="${cg.war}" title="Võ lực"><input id="cg_l${i}" type="number" min="1" max="99" value="${cg.lead}" title="Thống soái"><input id="cg_i${i}" type="number" min="1" max="99" value="${cg.int}" title="Trí lực">
      <span class="muted" style="font-size:11px">Σ${cg.war + cg.lead + cg.int}</span><button class="btn sm" data-act="cgDel" data-i="${i}">✕</button></div>`;
    $('menu').innerHTML = `<div class="setup">
      <div class="row" style="justify-content:space-between"><h2 style="margin:0">${UI.setupMode === 'mp' ? 'Quốc gia của ta trong phòng nhiều người' : 'Thiết lập tân chinh đồ'}</h2><button class="btn" data-act="mBack">← Quay lại</button></div>
      <h3>Quốc gia của ta</h3>
      <div class="row" style="align-items:flex-start;gap:16px">
        <div style="text-align:center"><img class="portrait lg" src="${P.url(p.monarch, 'monarch', p.color)}" data-act="portrait" data-input="s_monarch" title="Bấm để tải chân dung quân chủ"><br>
          <span class="muted" style="font-size:11px">Bấm để tải ảnh</span>${P.has(p.monarch) ? `<br><a href="#" data-act="portraitDel" data-input="s_monarch" style="font-size:11px">xóa ảnh</a>` : ''}</div>
        <div class="fields" style="flex:1">
          <label>Quốc hiệu<input id="s_name" value="${esc(p.name)}" maxlength="20"></label>
          <label>Chữ trên cờ (Hán tự)<input id="s_char" value="${esc(p.char)}" maxlength="2" style="font-family:KaiTi,serif;font-size:16px"></label>
          <label>Màu quốc kỳ<div class="row" style="margin:0"><input id="s_color" type="color" value="${esc(p.color)}" data-chg="setupRe">${flagRaw(p.color, p.char, 30)}</div></label>
          <label>Tước hiệu<select id="s_title">${CW.TITLES.map(t => `<option ${t === p.title ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label>Tên quân chủ<input id="s_monarch" value="${esc(p.monarch)}" maxlength="28" data-chg="monName" data-old="${esc(p.monarch)}"></label>
          <label>Tên kinh đô<input id="s_cap" value="${esc(p.capitalName)}" maxlength="20"></label>
          <label>Năm khởi đầu (âm = TCN)<input id="s_year" type="number" value="${p.startYear}"></label>
          <label>Quân chủ: Võ / Thống / Trí<div class="row" style="margin:0"><input id="s_mw" type="number" min="1" max="99" value="${p.monarchStats.war}" style="width:52px"><input id="s_ml" type="number" min="1" max="99" value="${p.monarchStats.lead}" style="width:52px"><input id="s_mi" type="number" min="1" max="99" value="${p.monarchStats.int}" style="width:52px"></div></label>
        </div></div>
      <h3>Tướng lĩnh của ta <span class="muted" style="font-size:12px;font-weight:400">(tự đặt tên & chỉ số; tổng mỗi tướng tối đa 240; bấm ảnh để tải chân dung)</span></h3>
      <div class="cgen muted" style="font-size:11px"><span></span><span>Tên</span><span>Võ</span><span>Thống</span><span>Trí</span><span></span><span></span></div>
      ${p.generals.map(genRow).join('') || '<p class="muted">Chưa có — hệ thống sẽ tạo ngẫu nhiên 4 tướng.</p>'}
      <button class="btn sm" data-act="cgAdd" ${p.generals.length >= 10 ? 'disabled' : ''}>+ Thêm tướng</button>
      ${UI.setupMode === 'mp' ? `<div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn red" style="font-size:17px;padding:9px 26px" data-act="mpProfileDone">✔ Lưu & trở lại phòng</button></div>` : `<h3>Thiên hạ</h3>
      <div class="fields">
        <label>Bản đồ<select id="s_tpl" data-chg="setupRe">${CW.MAP_TEMPLATES.map(t => `<option value="${t.id}" ${t.id === p.template ? 'selected' : ''}>${t.name}</option>`).join('')}</select></label>
        <label>Hạt giống bản đồ<div class="row" style="margin:0"><input id="s_seed" type="number" value="${p.seed}" style="width:100px"><button class="btn sm" data-act="reseed">🎲</button></div></label>
        <label>Số nước (gồm ta): <b>${cnt}</b><input id="s_count" type="range" min="3" max="9" value="${cnt}" data-chg="setupRe"></label>
        <label>Độ khó<select id="s_diff">${Object.keys(CW.DIFFICULTY).map(k => `<option value="${k}" ${k === p.difficulty ? 'selected' : ''}>${CW.DIFFICULTY[k].name}</option>`).join('')}</select></label>
      </div><p class="muted">${esc(tpl.desc)}</p>
      <h3>Chư hầu & quan hệ ban đầu</h3>
      ${p.rivals.slice(0, cnt - 1).map((rv, i) => { const pre = CW.NATION_PRESETS.find(x => x.id === rv.presetId) || CW.NATION_PRESETS[i]; return `<div class="rival">${flagRaw(pre.color, pre.char, 30)}
        <div class="row" style="margin:0"><img class="portrait sm" src="${P.url(pre.monarch, 'monarch', pre.color)}" data-act="portrait" data-name="${esc(pre.monarch)}" title="Tải chân dung ${esc(pre.monarch)}"><select id="r_p${i}" data-chg="setupRe">${CW.NATION_PRESETS.map(x => `<option value="${x.id}" ${x.id === pre.id ? 'selected' : ''}>${x.name} — ${x.monarch}</option>`).join('')}</select></div>
        <select id="r_r${i}">${[['neutral', 'Trung lập'], ['ally', 'Đồng minh'], ['enemy', 'Thù địch']].map(([k, l]) => `<option value="${k}" ${rv.rel === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="muted" style="font-size:11px">Hiếu chiến ${Math.round(pre.aggr * 100)}%</span></div>`; }).join('')}
      <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn red" style="font-size:17px;padding:9px 26px" data-act="startGame">⚔ Khai cuộc</button></div>`}</div>`;
  }
  CHG.setupRe = el => {
    readSetup(UI.prof);
    // tránh trùng nước
    if (el.id && el.id.startsWith('r_p')) {
      const i = +el.id.slice(3); const used = UI.prof.rivals.findIndex((r, j) => j !== i && r.presetId === el.value);
      if (used >= 0) { const free = CW.NATION_PRESETS.find(x => !UI.prof.rivals.some(r => r.presetId === x.id)); UI.prof.rivals[used].presetId = free ? free.id : UI.prof.rivals[used].presetId; }
    }
    renderSetup();
  };
  CHG.monName = el => { const nv = el.value.trim(); if (el.dataset.old && nv && P.has(el.dataset.old) && !P.has(nv)) P.rename(el.dataset.old, nv); el.dataset.old = nv; readSetup(UI.prof); renderSetup(); };
  CHG.cgName = el => { const nv = el.value.trim(); if (el.dataset.old && nv && P.has(el.dataset.old) && !P.has(nv)) P.rename(el.dataset.old, nv); el.dataset.old = nv; readSetup(UI.prof); renderSetup(); };
  ACT.cgAdd = () => { readSetup(UI.prof); UI.prof.generals.push({ name: U.pick(Math.random, CW.SURNAMES) + ' ' + U.pick(Math.random, CW.GIVEN), war: 70, lead: 65, int: 60 }); renderSetup(); };
  ACT.cgDel = el => { readSetup(UI.prof); UI.prof.generals.splice(num(el, 'i'), 1); renderSetup(); };
  ACT.reseed = () => { readSetup(UI.prof); UI.prof.seed = Math.floor(Math.random() * 1e6); renderSetup(); };
  ACT.mBack = () => { readSetup(UI.prof); UI.saveProfile(UI.prof); if (UI.setupMode === 'mp') CW.Net.showLobby(); else UI.showMenu(); };
  ACT.mpProfileDone = () => { const p = readSetup(UI.prof); UI.saveProfile(p); CW.Net.profileChanged(); CW.Net.showLobby(); };
  UI.readSetup = readSetup;
  ACT.startGame = () => {
    const p = readSetup(UI.prof);
    const capStat = o => { let s = o.war + o.lead + o.int; while (s > 240) { const k = ['war', 'lead', 'int'].sort((a, b) => o[b] - o[a])[0]; o[k]--; s--; } };
    p.generals = p.generals.filter(x => x.name); p.generals.forEach(capStat); capStat(p.monarchStats);
    const names = new Set(); p.generals = p.generals.filter(x => !names.has(x.name) && x.name !== p.monarch && names.add(x.name));
    UI.saveProfile(p);
    const setup = {
      profile: { name: p.name, char: p.char, color: p.color, title: p.title, monarch: p.monarch, capitalName: p.capitalName, startYear: p.startYear, monarchStats: p.monarchStats, generals: p.generals },
      template: p.template, seed: p.seed, nationCount: p.nationCount, difficulty: p.difficulty, rivals: p.rivals.slice(0, p.nationCount - 1),
    };
    $('menu').innerHTML = '<div class="title"><h2>Đang khai thiên lập địa...</h2></div>';
    setTimeout(() => CW.Main.startNew(setup), 30);
  };

  function helpHtml() {
    return `<h3>Mục tiêu</h3>Là quân chủ, hãy phát triển quốc gia, ngoại giao khôn khéo và chinh phạt để <b>nắm 75% lãnh địa</b> hoặc tiêu diệt mọi đối thủ.
      <h3>Điều khiển bản đồ</h3><kbd>Kéo chuột trái</kbd> di chuyển · <kbd>Lăn chuột</kbd> phóng to/thu nhỏ (phóng to tối đa để xem trận địa và đội hình) · <kbd>W A S D</kbd>/<kbd>mũi tên</kbd> cuộn · bấm vào bản đồ nhỏ để nhảy tới.
      <h3>Chỉ huy quân</h3><kbd>Bấm trái</kbd> vào cờ súy để chọn đạo quân, <kbd>Shift</kbd>+bấm để chọn thêm, <kbd>Shift</kbd>+kéo để quét chọn nhiều đạo.<br>
      <kbd>Chuột phải</kbd>: lên mặt đất = hành quân · lên quân địch = truy kích · lên thành địch/thổ hào = công thành · lên thành ta = về đóng quân.<br>
      Trong bảng chi tiết: chọn <b>trận hình</b> (khắc chế nhau theo vòng), <b>tư thế</b>, dùng <b>kế sách</b> khi giao chiến, bổ sung/tách/hợp quân, hoặc <b>ủy thác</b> cho tướng tự chỉ huy (trấn giữ / chinh phạt / tự do).
      <h3>Nội chính</h3>Bấm vào thành của ta để xây công trình, mộ binh, lập đạo quân. Lương thực nuôi quân; thiếu lương quân sẽ hao hụt. Xưởng binh khí rèn vũ khí từ sắt và gỗ — cần để mộ binh.
      Có thể giao cho Thừa tướng / Binh bộ tự lo trong <b>Triều chính</b>.
      <h3>Ngoại giao</h3>Kết minh, cầu hòa, tặng lễ, tuyên chiến. Nếu một nước bị đồng minh tấn công, họ sẽ cắt minh ước và phản công; đồng minh của nạn nhân có thể tham chiến.
      <h3>Phím tắt</h3><kbd>Space</kbd> tạm dừng · <kbd>1</kbd>-<kbd>4</kbd> tốc độ · <kbd>T</kbd> Triều chính · <kbd>G</kbd> Tướng lĩnh · <kbd>Q</kbd> Quân đoàn · <kbd>N</kbd> Ngoại giao · <kbd>H</kbd> Sử ký · <kbd>Tab</kbd> chuyển giữa các đạo quân · <kbd>Esc</kbd> đóng/bỏ chọn.`;
  }
})();

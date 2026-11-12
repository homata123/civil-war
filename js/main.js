'use strict';
// ============ Khởi động, vòng lặp, nhập liệu, lưu/tải ============
(function () {
  const U = CW.U, G = CW.G, R = CW.R, UI = CW.UI;
  const M = CW.Main = {};
  let g = null;
  const keys = new Set();
  const cv = document.getElementById('map');
  const mini = document.getElementById('minimap');
  const tip = document.getElementById('tip');
  const marks = [];
  let lastAuto = 0;
  const ME = () => CW.me;
  const X = (n, a, cb) => CW.X(n, a, cb);
  const isClient = () => CW.Net && CW.Net.isClient();

  R.init(cv);
  CW.Portraits.load();
  R.selProv = -1;

  // ---------------- Lưu / tải ----------------
  const SLOTS = ['auto', '1', '2', '3'];
  M.saveMeta = s => { try { return JSON.parse(localStorage.getItem('cw_meta_' + s) || 'null'); } catch (e) { return null; } };
  M.latestSave = () => {
    let best = null;
    for (const s of SLOTS) { const m = M.saveMeta(s); if (m && localStorage.getItem('cw_save_' + s) && (!best || m.t > best.meta.t)) best = { slot: s, meta: m }; }
    return best;
  };
  M.save = function (slot) {
    if (!g || isClient()) return false;
    try {
      g.me = ME();
      localStorage.setItem('cw_save_' + slot, G.serialize(g));
      const n = g.nations[ME()];
      const mp = G.humans(g).length > 1 ? ' · 🌐 nhiều người' : '';
      localStorage.setItem('cw_meta_' + slot, JSON.stringify({ t: Date.now(), label: `${n.name} · ${G.dateStr(g, undefined, true)} · ${n.provCount} thành${mp} · lưu ${new Date().toLocaleString('vi-VN')}` }));
      return true;
    } catch (e) { console.warn(e); return false; }
  };
  M.load = function (slot) {
    const s = localStorage.getItem('cw_save_' + slot);
    if (!s) { UI.toast('Không có dữ liệu.', 'bad'); return; }
    try {
      const gg = G.deserialize(s);
      const me = gg.me >= 0 && gg.nations[gg.me] ? gg.me : 0;
      // Ván nhiều người tải lại để chơi đơn: các nước người chơi khác giao cho AI
      for (const n of gg.nations) if (n.id !== me && (n.isPlayer || n.wasPlayer)) { n.isPlayer = true; G.aiTakeover(gg, n.id, true); }
      G.humanReturn(gg, me);
      CW.me = me;
      begin(gg); UI.toast('Đã tải ván chơi.', 'good');
    } catch (e) { console.error(e); UI.toast('Dữ liệu lưu bị hỏng.', 'bad'); }
  };

  function begin(gg) {
    g = gg; window.__g = g;
    g._onArmyRemoved = a => R.sel.delete(a.id);
    R.sel.clear(); R.selProv = -1;
    R.pad = true;
    if (CW.Cinema) CW.Cinema.stopAmbient();
    R.setGame(g); UI.setGame(g);
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('menu').innerHTML = '';
    document.getElementById('hud').classList.remove('hidden');
    UI.closeModal(); UI.goAck = ''; UI._goSnd = 0;
    lastAuto = g.day;
    UI.refresh(true);
    UI.hint('Bấm vào cờ súy để chọn quân · chuột phải để ra lệnh · lăn chuột để phóng to' + (CW.Net && CW.Net.active() ? ' · Enter để trò chuyện' : ''));
    setTimeout(() => UI.hint(''), 9000);
  }
  M.begin = begin;
  M.game = () => g;
  M.startNew = function (setup) { CW.me = 0; begin(G.newGame(setup)); M.save('auto'); };
  M.toMenu = function () {
    g = null; window.__g = null; R.sel.clear(); R.selProv = -1; marks.length = 0;
    document.getElementById('hud').classList.add('hidden');
    UI.showMenu();
    if (CW.Cinema) CW.Cinema.startAmbient();
  };

  // ---------------- Lệnh ----------------
  M.orderSiege = function (arr, k) {
    const p = g.provs[k]; const ids = arr.map(a => a.id);
    if (!ids.length) return;
    if (p.owner === ME() || p.owner < 0 || G.atWar(g, ME(), p.owner)) X('siege', { ids, prov: k });
    else UI.askWar(p.owner, () => X('siege', { ids, prov: k }));
  };
  function mark(x, y, col) { marks.push({ x, y, t: performance.now(), col }); }
  const mineSel = () => [...R.sel].map(id => G.army(g, id)).filter(a => a && a.nation === ME());

  function leftClick(sx, sy, shift) {
    const a = R.armyAt(g, sx, sy);
    if (a) {
      if (shift && a.nation === ME()) { if (R.sel.has(a.id)) R.sel.delete(a.id); else { for (const id of [...R.sel]) { const b = G.army(g, id); if (!b || b.nation !== ME()) R.sel.delete(id); } R.sel.add(a.id); } }
      else { R.sel.clear(); R.sel.add(a.id); }
      R.selProv = -1; return;
    }
    const k = R.cityAt(sx, sy);
    if (k >= 0) { R.sel.clear(); R.selProv = k; return; }
    if (R.sel.size) { R.sel.clear(); R.selProv = -1; return; }
    const w = R.s2w(sx, sy);
    R.selProv = G.provAt(g, w.x, w.y);
  }
  function rightClick(sx, sy) {
    const mine = mineSel();
    if (!mine.length) return;
    const ids = mine.map(a => a.id);
    const t = R.armyAt(g, sx, sy);
    if (t && t.nation !== ME()) {
      const go = () => X('attack', { ids, target: t.id });
      if (G.atWar(g, ME(), t.nation)) go(); else UI.askWar(t.nation, go);
      mark(t.x, t.y, '#ff5040'); return;
    }
    const k = R.cityAt(sx, sy);
    if (k >= 0) { M.orderSiege(mine, k); const c = G.city(g, k); mark(c.x, c.y, g.provs[k].owner === ME() ? '#ffe08a' : '#ff5040'); return; }
    const w = R.s2w(sx, sy);
    const n = mine.length;
    const moves = mine.map((a, i) => {
      let ox = 0, oy = 0;
      if (i > 0) { const ang = (i - 1) / Math.max(1, n - 1) * Math.PI * 2; const r = 1.6 + Math.floor((i - 1) / 6) * 1.4; ox = Math.cos(ang) * r; oy = Math.sin(ang) * r; }
      return [a.id, w.x + ox, w.y + oy];
    });
    X('move', { moves });
    mark(w.x, w.y, '#ffe08a');
    UI.refresh(true);
  }

  // ---------------- Chuột ----------------
  let drag = null;
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('mousedown', e => {
    if (!g) return;
    if (e.button === 0) drag = { x: e.clientX, y: e.clientY, cx: R.cam.x, cy: R.cam.y, moved: false, box: e.shiftKey };
    else if (e.button === 2) rightClick(e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', e => {
    M.mouse = { x: e.clientX, y: e.clientY };
    if (!g) return;
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
      if (drag.moved) {
        if (drag.box) R.box = { x0: Math.min(drag.x, e.clientX), y0: Math.min(drag.y, e.clientY), x1: Math.max(drag.x, e.clientX), y1: Math.max(drag.y, e.clientY) };
        else { R.cam.x = drag.cx - dx / R.cam.z; R.cam.y = drag.cy - dy / R.cam.z; R.clampCam(); }
      }
      tip.classList.add('hidden');
      return;
    }
    if (e.target !== cv) { tip.classList.add('hidden'); R.hover = null; return; }
    const a = R.armyAt(g, e.clientX, e.clientY);
    R.hover = a ? a.id : null;
    let t = '';
    if (a) t = `<b>${U.esc(G.armyName(g, a))}</b> · ${U.esc(G.nationName(g, a.nation))}${UI.humanTag(a.nation)}<br>${a.nation === ME() ? U.fmt(G.troops(a.t)) : '~' + U.fmt(Math.max(500, Math.round(G.troops(a.t) / 500) * 500))} quân · sĩ khí ${Math.round(a.morale)}`;
    else {
      const k = R.cityAt(e.clientX, e.clientY);
      if (k >= 0) { const p = g.provs[k]; t = `<b>${U.esc(p.name)}</b> · ${U.esc(G.nationName(g, p.owner))}${p.owner >= 0 && p.owner !== ME() ? ' (' + ({ war: 'chiến tranh', ally: 'đồng minh', peace: 'hòa hiếu' }[g.status[ME()][p.owner]]) + ')' : ''}<br>Dân ${U.fmt(p.pop)} · tường ${Math.round(p.wallHp)}/${G.wallMax(p)}`; }
    }
    const mine = [...R.sel].some(id => { const b = G.army(g, id); return b && b.nation === ME(); });
    const ck = R.cityAt(e.clientX, e.clientY);
    cv.style.cursor = mine && ((a && a.nation !== ME()) || (!a && ck >= 0 && g.provs[ck].owner !== ME())) ? 'crosshair' : a ? 'pointer' : 'default';
    if (t) { tip.innerHTML = t; tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px'; tip.classList.remove('hidden'); }
    else tip.classList.add('hidden');
  });
  window.addEventListener('mouseup', e => {
    if (!g || !drag || e.button !== 0) return;
    if (!drag.moved) leftClick(e.clientX, e.clientY, e.shiftKey);
    else if (drag.box && R.box) {
      const b = R.box; if (!e.shiftKey) R.sel.clear();
      for (const a of g.armies) { if (a.nation !== ME()) continue; const s = R.w2s(a.x, a.y); if (s.x >= b.x0 && s.x <= b.x1 && s.y >= b.y0 && s.y <= b.y1) R.sel.add(a.id); }
      R.selProv = -1;
    }
    drag = null; R.box = null;
    UI.refresh(true);
  });
  cv.addEventListener('dblclick', e => {
    if (!g) return;
    const a = R.armyAt(g, e.clientX, e.clientY);
    if (a) R.centerOn(a.x, a.y, Math.max(R.cam.z, 20));
  });
  cv.addEventListener('wheel', e => { e.preventDefault(); if (g) R.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.18 : 1 / 1.18); }, { passive: false });
  let miniDrag = false;
  const miniJump = e => { const r = mini.getBoundingClientRect(); R.centerOn((e.clientX - r.left) / r.width * R.map.W, (e.clientY - r.top) / r.height * R.map.H); };
  mini.addEventListener('mousedown', e => { if (!g) return; miniDrag = true; miniJump(e); });
  window.addEventListener('mousemove', e => { if (miniDrag) miniJump(e); });
  window.addEventListener('mouseup', () => { miniDrag = false; });
  window.addEventListener('resize', () => R.resize());

  // ---------------- Bàn phím ----------------
  window.addEventListener('keydown', e => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (CW.Cinema && CW.Cinema.playing()) return; // phim đang chiếu tự xử lý phím
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) { keys.add(k); e.preventDefault(); return; }
    if (!g) return;
    if (k === 'escape') {
      if (!document.getElementById('confirm').classList.contains('hidden')) document.getElementById('confirm').classList.add('hidden');
      else if (UI.modal && UI.modal !== 'gameover') UI.closeModal();
      else if (R.sel.size || R.selProv >= 0) { R.sel.clear(); R.selProv = -1; }
      else UI.openModal('system');
    } else if (k === 'enter' && CW.Net && CW.Net.active()) { e.preventDefault(); CW.Net.focusChat(); }
    else if (k === ' ') { X('pause', {}); e.preventDefault(); }
    else if (k === '1' || k === '2' || k === '3' || k === '4') X('speed', { v: [1, 2, 4, 8][+k - 1] });
    else if (k === 't') UI.openModal('court');
    else if (k === 'g') UI.openModal('gens');
    else if (k === 'q') UI.openModal('armies');
    else if (k === 'n') UI.openModal('diplo');
    else if (k === 'h') UI.openModal('history');
    else if (k === 'f') UI.toggleSide();
    else if (k === 'l') UI.toggleTicker();
    else if (k === 'tab') {
      e.preventDefault();
      const own = G.armiesOf(g, ME()); if (!own.length) return;
      const cur = [...R.sel][0]; const i = own.findIndex(a => a.id === cur);
      const a = own[(i + 1) % own.length]; R.sel.clear(); R.sel.add(a.id); R.selProv = -1; R.centerOn(a.x, a.y, Math.max(R.cam.z, 9));
    } else return;
    UI.refresh(true);
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  // ---------------- Vòng lặp ----------------
  let last = performance.now(), lastUI = 0, lastMini = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    try {
      if (g) {
        let px = 0, py = 0;
        if (keys.has('arrowleft') || keys.has('a')) px--; if (keys.has('arrowright') || keys.has('d')) px++;
        if (keys.has('arrowup') || keys.has('w')) py--; if (keys.has('arrowdown') || keys.has('s')) py++;
        if (UI.settings.edge && M.mouse && !drag) {
          if (M.mouse.x < 6) px--; if (M.mouse.x > R.vw - 6) px++; if (M.mouse.y < 6) py--; if (M.mouse.y > R.vh - 6) py++;
        }
        if (px || py) { R.cam.x += px * 650 * dt / R.cam.z; R.cam.y += py * 650 * dt / R.cam.z; R.clampCam(); }
        if (isClient()) CW.Net.clientFrame(g, dt);           // khách: nhận trạng thái từ chủ phòng, nội suy vị trí
        else {
          G.step(g, dt);
          if (CW.Net && CW.Net.isHost()) CW.Net.hostFrame(g, now); // chủ phòng: phát trạng thái cho khách
          if (g.day - lastAuto >= 90) { M.save('auto'); lastAuto = g.day; }
        }
        const o = G.outcome(g, ME());
        if (o && UI.goAck !== UI.goKey() && UI.modal !== 'gameover') UI.openModal('gameover');
        R.draw(g, now);
        drawMarks(now);
        if (now - lastMini > 150) { R.drawMinimap(mini, g); lastMini = now; }
        if (now - lastUI > 250) { UI.consumeEvents(); UI.refresh(false); lastUI = now; }
      }
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  function drawMarks(now) {
    const ctx = R.ctx;
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i]; const t = (now - m.t) / 600;
      if (t >= 1) { marks.splice(i, 1); continue; }
      const s = R.w2s(m.x, m.y);
      ctx.strokeStyle = m.col; ctx.globalAlpha = 1 - t; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, 6 + t * 18, (6 + t * 18) * 0.5, 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // Khởi động: màn chờ → phim mở đầu → màn hình chính (nền là sa bàn động). Link mời ?room=MÃ đi thẳng vào phòng.
  UI.showMenu();
  const room = (location.search.match(/[?&]room=([A-Za-z0-9]+)/) || [])[1];
  if (CW.Cinema) CW.Cinema.boot({ room });
  requestAnimationFrame(frame);
})();

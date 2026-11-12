'use strict';
// ============ Lớp lệnh: mọi thao tác của người chơi đi qua đây ============
// Chơi đơn / chủ phòng: thực thi ngay trên trạng thái game. Khách (nhiều người): gửi lên chủ phòng, kết quả trả về qua callback.
// Mỗi lệnh kiểm tra quyền sở hữu theo `nid` (nước của người ra lệnh), nên khách không thể điều quân / tiêu tiền của nước khác.
(function () {
  const U = CW.U, G = CW.G;
  CW.me = 0; // nước của người chơi trên máy này
  const Cmd = CW.Cmd = {};
  const H = Cmd.handlers = {};

  const own = (g, nid, id) => { const a = G.army(g, id); return a && a.nation === nid ? a : null; };
  const owns = (g, nid, ids) => (Array.isArray(ids) ? ids : [ids]).map(id => own(g, nid, +id)).filter(Boolean);
  const ownProv = (g, nid, k) => (g.provs[k] && g.provs[k].owner === nid ? g.provs[k] : null);
  const free = (g, a) => { if (a.mode === 'auto') G.undelegate(g, a); };
  const validNation = (g, nid, to) => to !== nid && g.nations[to] && g.nations[to].alive;
  const ok = (msg, extra) => Object.assign({ ok: true, msg }, extra || {});
  const err = msg => ({ ok: false, msg });
  const wrap = r => (typeof r === 'string' ? err(r) : r);

  Cmd.exec = function (g, nid, name, args) {
    const f = H[name];
    if (!f || !g) return err('Lệnh không hợp lệ.');
    if (!g.nations[nid] || (!g.nations[nid].alive && !/^(pause|speed)$/.test(name))) return err('Quốc gia của ngài đã diệt vong.');
    try { return f(g, nid, args || {}) || null; } catch (e) { console.error(e); return err('Lệnh lỗi: ' + e.message); }
  };

  // ---------- Thời gian ----------
  H.pause = (g, nid, a) => { g.paused = a.v === undefined ? !g.paused : !!a.v; return ok(null, { paused: g.paused }); };
  H.speed = (g, nid, a) => {
    if (CW.Net && CW.Net.active() && nid !== CW.Net.hostNation()) return err('Chỉ chủ phòng được đổi tốc độ.');
    const v = +a.v; if (![1, 2, 4, 8].includes(v)) return null;
    g.speed = v; g.paused = false; return null;
  };

  // ---------- Quân lệnh ----------
  H.move = (g, nid, a) => {
    let fail = 0;
    for (const m of a.moves || []) { const ar = own(g, nid, +m[0]); if (!ar) continue; free(g, ar); if (!G.orderMove(g, ar, +m[1], +m[2])) fail++; }
    return fail ? err('Không có đường đi tới đó.') : null;
  };
  H.attack = (g, nid, a) => {
    const t = G.army(g, +a.target); if (!t) return err('Mục tiêu đã biến mất.');
    if (!G.atWar(g, nid, t.nation)) return err('Chưa tuyên chiến với ' + G.nationName(g, t.nation) + '.');
    for (const ar of owns(g, nid, a.ids)) { free(g, ar); G.orderAttack(g, ar, t); }
    return null;
  };
  H.siege = (g, nid, a) => {
    const k = +a.prov, p = g.provs[k]; if (!p) return null;
    if (p.owner === nid) { for (const ar of owns(g, nid, a.ids)) { free(g, ar); G.orderStation(g, ar, k); } return null; }
    if (!(p.owner < 0 || G.atWar(g, nid, p.owner))) return err('Chưa tuyên chiến với ' + G.nationName(g, p.owner) + '.');
    for (const ar of owns(g, nid, a.ids)) { free(g, ar); G.orderSiege(g, ar, k); }
    return null;
  };
  H.stop = (g, nid, a) => { for (const ar of owns(g, nid, a.ids)) G.orderStop(g, ar); };
  H.home = (g, nid, a) => { for (const ar of owns(g, nid, a.ids)) { const k = G.nearestOwnCity(g, nid, ar.x, ar.y); if (k >= 0) G.orderStation(g, ar, k); } };
  H.form = (g, nid, a) => { if (!CW.FORMATIONS[a.v]) return null; for (const ar of owns(g, nid, a.ids)) ar.formation = a.v; };
  H.stance = (g, nid, a) => { if (!CW.STANCES[a.v]) return null; for (const ar of owns(g, nid, a.ids)) ar.stance = a.v; };
  H.tactic = (g, nid, a) => { const ar = own(g, nid, +a.id); if (!ar || !CW.TACTICS[a.v]) return null; return ok(G.useTactic(g, ar, a.v)); };
  H.setGen = (g, nid, a) => { const ar = own(g, nid, +a.id); if (!ar) return null; const r = G.setGeneral(g, ar, a.gen ? +a.gen : null); return r === 'Đã đổi chủ tướng.' ? null : err(r); };
  H.split = (g, nid, a) => { const ar = own(g, nid, +a.id); if (!ar) return null; const r = G.split(g, ar, null); return typeof r === 'string' ? err(r) : ok('Đã tách quân. Hãy chỉ định tướng cho đạo mới.', { id: r.id }); };
  H.merge = (g, nid, a) => { const x = own(g, nid, +a.id), y = own(g, nid, +a.other); if (!x || !y) return null; const r = G.merge(g, x, y); return r === 'Hợp quân thành công.' ? ok(r) : err(r); };
  H.reinf = (g, nid, a) => { const ar = own(g, nid, +a.id); if (!ar) return null; const r = G.reinforce(g, ar); return /^Bổ sung/.test(r) ? ok(r) : err(r); };
  H.drop = (g, nid, a) => { const ar = own(g, nid, +a.id); if (!ar) return null; const r = G.garrisonDrop(g, ar, 1 / 3); return /^Để lại/.test(r) ? ok(r) : err(r); };
  H.disband = (g, nid, a) => { const ar = own(g, nid, +a.id); if (!ar) return null; const r = G.disband(g, ar); return /^Đạo quân nhập/.test(r) ? ok(r) : err(r); };
  H.delegate = (g, nid, a) => {
    const arr = owns(g, nid, a.ids); const m = a.m || {};
    let mis;
    if (m.type === 'defend') { if (!ownProv(g, nid, +m.prov)) return err('Lãnh địa không thuộc về ta.'); mis = { type: 'defend', prov: +m.prov }; }
    else if (m.type === 'attack') { if (!validNation(g, nid, +m.nation)) return null; mis = { type: 'attack', nation: +m.nation }; }
    else mis = { type: 'free' };
    for (const ar of arr) G.delegate(g, ar, mis.type === 'defend' && arr.length > 1 ? { type: 'defend', prov: Math.max(0, G.nearestOwnCity(g, nid, ar.x, ar.y)) } : mis);
    return null;
  };
  H.undelegate = (g, nid, a) => { for (const ar of owns(g, nid, a.ids)) G.undelegate(g, ar); };
  H.promote = (g, nid, a) => { const ar = own(g, nid, +a.id); if (!ar) return null; const r = G.promote(g, ar); return typeof r === 'string' ? err(r) : ok(`Đề bạt ${r.name} thành tướng!`); };

  // ---------- Nội chính ----------
  H.build = (g, nid, a) => { if (!ownProv(g, nid, +a.prov) || !CW.BUILDINGS[a.b]) return null; const r = G.build(g, +a.prov, a.b); return r ? err(r) : null; };
  H.recruit = (g, nid, a) => {
    if (!ownProv(g, nid, +a.prov) || !CW.UNITS[a.u] || ![100, 500].includes(+a.n)) return null;
    const r = G.recruit(g, +a.prov, a.u, +a.n); return r ? err(r) : null;
  };
  H.formArmy = (g, nid, a) => {
    if (!ownProv(g, nid, +a.prov)) return err('Lãnh địa không thuộc về ta.');
    const t = {}; for (const u of CW.UNIT_KEYS) t[u] = Math.max(0, +((a.t || {})[u]) || 0);
    const r = G.formArmy(g, +a.prov, a.gen ? +a.gen : null, t, CW.FORMATIONS[a.form] ? a.form : 'phuong');
    if (typeof r === 'string') return err(r);
    if (CW.STANCES[a.stance]) r.stance = a.stance;
    return ok('Đạo quân đã sẵn sàng. Chuột phải lên bản đồ để hành quân.', { id: r.id });
  };
  H.tax = (g, nid, a) => { g.nations[nid].tax = U.clamp(+a.v || 0.3, 0.1, 0.6); G.recalcIncome(g); };
  H.autoEcon = (g, nid, a) => { g.nations[nid].autoEcon = !!a.v; };
  H.autoRecruit = (g, nid, a) => { g.nations[nid].autoRecruit = !!a.v; };

  // ---------- Nhân sự ----------
  // Ứng viên chiêu hiền do máy chủ sinh và giữ, khách chỉ chọn theo chỉ số (không tự khai chỉ số được)
  H.hireCands = (g, nid) => {
    const c = (g._cands || (g._cands = {}));
    c[nid] = G.hireCandidates(g, nid);
    return ok(null, { cands: c[nid].map(x => ({ name: x.name, war: x.war, lead: x.lead, int: x.int })), cost: G.hireCost(g, nid) });
  };
  H.hire = (g, nid, a) => {
    const list = (g._cands || {})[nid]; const cand = list && list[+a.i];
    if (!cand) return err('Hiền sĩ đã rời đi, hãy tìm người khác.');
    const r = G.hire(g, nid, cand); if (typeof r === 'string') return err(r);
    delete g._cands[nid];
    return ok(`${r.name} đã nhận lời phò tá!`, { name: r.name });
  };
  H.newGen = (g, nid, a) => { const r = G.createCustomGeneral(g, nid, a.name, a.war, a.lead, a.int); return typeof r === 'string' ? err(r) : ok(`Đã phong ${r.name} làm tướng. Bấm vào chân dung để tải ảnh.`, { name: r.name }); };
  H.rename = (g, nid, a) => { const gen = G.gen(g, +a.id); if (!gen || gen.nation !== nid) return null; const r = G.renameGeneral(g, gen.id, a.name); return r ? err(r) : ok('Đã đổi tên.'); };
  H.reward = (g, nid, a) => { const gen = G.gen(g, +a.id); if (!gen || gen.nation !== nid || !gen.alive) return null; const r = G.reward(g, gen.id); return /^Ban thưởng/.test(r) ? ok('Đã ban thưởng.') : err(r); };

  // ---------- Ngoại giao ----------
  H.peace = (g, nid, a) => { if (!validNation(g, nid, +a.to)) return null; return G.proposePeace(g, nid, +a.to, Math.max(0, +a.trib || 0)); };
  H.ally = (g, nid, a) => { if (!validNation(g, nid, +a.to)) return null; return G.proposeAlliance(g, nid, +a.to); };
  H.gift = (g, nid, a) => { if (!validNation(g, nid, +a.to)) return null; const r = G.gift(g, nid, +a.to, 200); return r ? err(r) : ok('Sứ giả đã dâng lễ vật.'); };
  H.breakAlly = (g, nid, a) => { if (!validNation(g, nid, +a.to)) return null; G.breakAlliance(g, nid, +a.to); };
  H.war = (g, nid, a) => {
    const n = +a.to; if (!validNation(g, nid, n) || g.status[nid][n] === 'war') return null;
    if (g.truce[nid][n] > g.day) for (const x of g.nations) if (x.alive && x.id !== nid && x.id !== n) G.addRel(g, nid, x.id, -8);
    G.declareWar(g, nid, n); return null;
  };
  H.answer = (g, nid, a) => { G.answerProposal(g, +a.id, !!a.yes, nid); };

  // ---------- Điểm vào cho UI ----------
  // CW.X(tên, tham số, callback(kết quả)). Kết quả: null | { ok, msg, ...dữ liệu }
  CW.X = function (name, args, cb) {
    const Net = CW.Net;
    if (Net && Net.isClient()) { Net.command(name, args || {}, cb); return; }
    const g = CW.UI && CW.UI.game(); if (!g) return;
    const r = Cmd.exec(g, CW.me, name, args);
    if (Net && Net.isHost()) Net.dirty();
    if (cb) cb(r); else Cmd.toast(r);
  };
  // Hiển thị kết quả mặc định
  Cmd.toast = function (r, goodKind) {
    if (!r || !r.msg || !CW.UI) return;
    CW.UI.toast(U.esc(r.msg), r.ok ? (goodKind === undefined ? 'good' : goodKind) : 'bad', r.ok ? 2600 : 4000);
  };
})();

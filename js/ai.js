'use strict';
// ============ AI: nội chính, mộ binh, điều quân, ngoại giao; cũng dùng cho tướng được ủy thác ============
(function () {
  const U = CW.U, G = CW.G;
  const AI = CW.AI = {};

  AI.daily = function (g) {
    if (Math.floor(g.day) % 30 === 1) computeBorders(g);
    if (!g._borders) computeBorders(g);
    for (const n of g.nations) {
      if (!n.alive) continue;
      if (g.day >= n.thinkAt) { n.thinkAt = g.day + 5; nationThink(g, n); }
    }
    for (const a of g.armies.slice()) {
      if (a.mode !== 'auto') continue;
      if (g.day >= a.thinkAt) { a.thinkAt = g.day + 2.5 + Math.random() * 1.5; armyThink(g, a); }
    }
  };
  AI.monthly = function (g) { computeBorders(g); diplomacy(g); };

  // Ma trận giáp ranh giữa các nước
  function computeBorders(g) {
    const N = g.nations.length;
    const b = []; for (let i = 0; i < N; i++) b.push(new Array(N).fill(false));
    const mp = g.map.provinces;
    g.provs.forEach((p, k) => {
      if (p.owner < 0) return;
      for (const j of mp[k].adj) { const o = g.provs[j].owner; if (o >= 0 && o !== p.owner) b[p.owner][o] = true; }
    });
    g._borders = b;
  }
  AI.borders = (g, a, b) => g._borders && g._borders[a] && g._borders[a][b];

  function provFlags(g, nid, k) {
    const mp = g.map.provinces[k];
    let border = false, enemy = false, neutral = false;
    for (const j of mp.adj) {
      const o = g.provs[j].owner;
      if (o === nid) continue;
      border = true;
      if (o < 0) neutral = true; else if (G.atWar(g, nid, o)) enemy = true;
    }
    return { border, enemy, neutral, cap: g.nations[nid].capital === k };
  }
  AI.provFlags = provFlags;

  // ---------------- Nội chính ----------------
  function nationThink(g, n) {
    if (!n.inc) return;
    if (!n.isPlayer || n.autoEcon) build(g, n);
    if (!n.isPlayer || n.autoRecruit) recruit(g, n);
    if (!n.isPlayer) {
      formArmies(g, n); hireGenerals(g, n);
      n.tax = n.res.gold < 250 ? 0.4 : n.starving ? 0.25 : 0.32;
    }
  }

  function build(g, n) {
    const own = G.provsOf(g, n.id);
    const reserve = n.isPlayer ? 100 : 150;
    const foodNet = n.inc.food - n.upkeep.food, goldNet = n.inc.gold - n.upkeep.gold;
    let started = 0;
    for (const k of U.shuffle(Math.random, own.slice())) {
      if (started >= 2) break;
      const p = g.provs[k]; if (p.building) continue;
      const mp = g.map.provinces[k]; const f = provFlags(g, n.id, k);
      const s = {
        farm: mp.fert * 8 + (foodNet < 120 ? 12 : 0),
        market: p.pop / 6000 + (goldNet < 100 ? 10 : 2),
        lumber: mp.forestF * 25 + (n.res.wood < 300 ? 8 : 0),
        mine: mp.hillF * 30 + (n.res.iron < 200 ? 6 : 0),
        smithy: (n.smithy < Math.ceil(own.length / 3) ? 12 : 0) + (n.res.weapons < 300 ? 8 : 0),
        barracks: (f.cap || f.enemy ? 6 : 1),
        wall: (f.enemy ? 14 : f.border ? 4 : 0) + (f.cap ? 8 : 0),
      };
      const dec = { farm: 3, market: 3, lumber: 4, mine: 4, smithy: 5, barracks: 5, wall: 4 };
      let best = null, bs = 2;
      for (const key of CW.BUILD_KEYS) {
        if (p.bld[key] >= CW.MAX_BLD) continue;
        const v = s[key] - p.bld[key] * dec[key] + Math.random() * 2;
        if (v > bs) { bs = v; best = key; }
      }
      if (!best) continue;
      const cost = G.buildCost(p, best);
      if (n.res.gold - (cost.gold || 0) < reserve) continue;
      if (G.build(g, k, best) === null) started++;
    }
  }

  function recruit(g, n) {
    const own = G.provsOf(g, n.id);
    const wars = G.enemies(g, n.id).length;
    const tm = n.isPlayer ? 1 : CW.diff(g).troops;
    const target = (3000 + own.length * 1500 * (0.5 + n.aggr)) * tm * (wars ? 1.25 : 1);
    if (n.troops >= target) return;
    const foodNet = n.inc.food - n.upkeep.food, goldNet = n.inc.gold - n.upkeep.gold;
    if (foodNet < 20 && n.res.food < 1500) return;
    // Quân số bị giới hạn bởi kinh tế: không mộ thêm khi ngân khố hằng tháng đã thâm hụt
    if (goldNet < 10 && n.res.gold < 2500) return;
    // Thành phần hiện tại
    const cur = G.emptyT();
    for (const a of g.armies) if (a.nation === n.id) for (const k of CW.UNIT_KEYS) cur[k] += a.t[k];
    for (const k of own) for (const u of CW.UNIT_KEYS) cur[u] += g.provs[k].garrison[u];
    const tot = Math.max(1, G.troops(cur));
    const cands = own.map(k => ({ k, f: provFlags(g, n.id, k), p: g.provs[k] }))
      .filter(c => c.p.queue.length < 3 && g.day - c.p.sieged > 2 && c.p.pop > 3000)
      .sort((x, y) => (y.f.enemy * 3 + y.f.border + y.p.bld.barracks + y.p.pop / 30000) - (x.f.enemy * 3 + x.f.border + x.p.bld.barracks + x.p.pop / 30000));
    let made = 0;
    for (const c of cands) {
      if (made >= 2) break;
      let type = 'inf', gap = -1;
      CW.UNIT_KEYS.forEach((u, i) => { const d = n.comp[i] - cur[u] / tot; if (d > gap) { gap = d; type = u; } });
      const amt = n.res.gold > 800 ? 500 : 300;
      const cost = G.recruitCost(g, c.k, type, amt);
      if (n.res.gold - (cost.gold || 0) < 120) { if (type !== 'inf') { type = 'inf'; } else break; }
      if (G.recruit(g, c.k, type, amt) === null) { made++; cur[type] += amt; }
      else if (type !== 'inf' && G.recruit(g, c.k, 'inf', amt) === null) { made++; cur.inf += amt; }
    }
  }

  function idleGenerals(g, nid) {
    return g.generals.filter(x => x.alive && x.nation === nid && !x.army).sort((a, b) => (a.monarch - b.monarch) || (b.lead + b.war - a.lead - a.war));
  }

  function formArmies(g, n) {
    const own = G.provsOf(g, n.id);
    let count = G.armiesOf(g, n.id).length;
    const maxArmies = Math.max(2, Math.ceil(own.length / 2) + 1);
    for (const k of own) {
      if (count >= maxArmies) break;
      const p = g.provs[k]; const f = provFlags(g, n.id, k);
      const desired = 500 + (f.enemy ? 1200 : f.border ? 400 : 0) + (f.cap ? 1500 : 0) + p.bld.wall * 100;
      const total = G.troops(p.garrison);
      const excess = total - desired;
      if (excess < 1500) continue;
      const gens = idleGenerals(g, n.id).filter(x => !x.monarch || own.length < 3);
      if (!gens.length) break;
      const t = {}; for (const u of CW.UNIT_KEYS) t[u] = Math.floor(p.garrison[u] * excess / total);
      const form = t.cav > G.troops(t) * 0.3 ? 'phongthi' : t.arc > G.troops(t) * 0.35 ? 'nhanhanh' : U.pick(Math.random, ['phuong', 'hacdy', 'phuong']);
      const a = G.formArmy(g, k, gens[0].id, t, form);
      if (typeof a === 'object') count++;
    }
  }

  function hireGenerals(g, n) {
    const idle = idleGenerals(g, n.id).filter(x => !x.monarch);
    const cost = G.hireCost(g, n.id);
    if (idle.length === 0 && n.res.gold > cost + 400) {
      const c = G.hireCandidates(g, n.id).sort((a, b) => (b.war + b.lead + b.int) - (a.war + a.lead + a.int))[0];
      G.hire(g, n.id, c);
    }
  }

  // ---------------- Điều quân ----------------
  function frontierCity(g, nid) {
    const own = G.provsOf(g, nid); let best = -1, bs = -1e9;
    for (const k of own) {
      const f = provFlags(g, nid, k);
      let s = (f.enemy ? 50 : 0) + (f.border ? 10 : 0) + (f.cap ? 5 : 0);
      if (!f.enemy && !f.border) s -= 20;
      s += Math.random() * 3;
      if (s > bs) { bs = s; best = k; }
    }
    return best;
  }

  function chooseTarget(g, a, m) {
    const nid = a.nation; const n = g.nations[nid];
    const wars = G.enemies(g, nid);
    const allowNeutral = m.type !== 'attack' && (!wars.length || n.aggr > 0.6 || G.isPlayer(g, nid));
    const myStr = G.armyStr(g, a);
    let best = -1, bs = -1e9;
    g.provs.forEach((p, k) => {
      const o = p.owner;
      if (o === nid) return;
      if (m.type === 'attack') { if (o !== m.nation || !G.atWar(g, nid, o)) return; }
      else if (!(o < 0 ? allowNeutral : wars.includes(o))) return;
      const c = G.city(g, k);
      const d = U.dist(a.x, a.y, c.x, c.y);
      const adjOwn = g.map.provinces[k].adj.some(j => g.provs[j].owner === nid);
      if (!adjOwn && d > 35) return;
      let friendly = 0, fStr = 0;
      for (const b of g.armies) if (b !== a && b.nation === nid && ((b.order && b.order.type === 'siege' && b.order.prov === k) || b.siegeProv === k)) { friendly++; fStr += G.armyStr(g, b); }
      const need = G.garStr(p) * 1.1;
      if (myStr + fStr < need) return;
      const isCap = o >= 0 && g.nations[o].capital === k;
      const s = 60 - d * 0.9 + (adjOwn ? 20 : 0) - G.garStr(p) / 800 - p.bld.wall * 5 + (isCap ? 12 : 0) + (o < 0 ? -6 : 0) + friendly * 15 + Math.random() * 4;
      if (s > bs) { bs = s; best = k; }
    });
    return best;
  }

  function armyThink(g, a) {
    if (a.state === 'battle' || a.state === 'rout') return;
    if (a.routDays > 0 && a.state === 'idle') return;
    const n = g.nations[a.nation]; const m = a.mission || { type: 'free' };
    const tot = G.troops(a.t);
    const myStr = G.armyStr(g, a);

    if (a.state === 'siege') {
      const p = g.provs[a.siegeProv];
      if (p && G.garStr(p) > myStr * 2.5) { a.task = 'refit'; const h = G.nearestOwnCity(g, a.nation, a.x, a.y); if (h >= 0) G.orderStation(g, a, h); }
      return;
    }
    // Củng cố lực lượng
    if (a.task === 'refit') {
      const pid = G.cityNear(g, a, a.nation);
      if (pid >= 0) {
        const f = provFlags(g, a.nation, pid);
        G.reinforce(g, a, 500 + (f.enemy ? 800 : 0) + (f.cap ? 1000 : 0));
        if (a.morale > 65 && (G.troops(a.t) > 0.7 * a.peak || G.troops(a.t) > 3000)) a.task = null; else return;
      } else {
        if (!a.path) { const h = G.nearestOwnCity(g, a.nation, a.x, a.y); if (h >= 0) G.orderStation(g, a, h); else return; }
        return;
      }
    }
    if ((tot < a.peak * 0.45 && tot < 2500) || a.morale < 35) {
      a.task = 'refit';
      const h = G.nearestOwnCity(g, a.nation, a.x, a.y);
      if (h >= 0) G.orderStation(g, a, h);
      return;
    }
    // Bổ sung khi rảnh ở thành nhà
    if (a.state === 'idle' && !a.path) {
      const pid = G.cityNear(g, a, a.nation);
      if (pid >= 0 && !G.isPlayer(g, a.nation)) { const f = provFlags(g, a.nation, pid); const keep = 500 + (f.enemy ? 1000 : 300) + (f.cap ? 1500 : 0); if (G.troops(g.provs[pid].garrison) > keep + 400) G.reinforce(g, a, keep); }
    }
    // Mối đe dọa
    const center = m.type === 'defend' ? G.city(g, m.prov) : { x: a.x, y: a.y };
    const radius = m.type === 'defend' ? 14 : 9;
    let threat = null, td = 1e9;
    for (const b of g.armies) {
      if (b.routDays > 0 || !G.atWar(g, a.nation, b.nation)) continue;
      const dc = U.dist(center.x, center.y, b.x, b.y), da = U.dist(a.x, a.y, b.x, b.y);
      const pid = G.provAt(g, b.x, b.y);
      const inOwn = pid >= 0 && g.provs[pid].owner === a.nation;
      if (dc < radius || (inOwn && da < 30 && m.type !== 'attack')) { if (da < td) { td = da; threat = b; } }
    }
    if (threat) {
      if (myStr >= G.armyStr(g, threat) * 0.75) {
        if (!(a.order && a.order.type === 'army' && a.order.id === threat.id)) G.orderAttack(g, a, threat);
        return;
      }
      if (m.type === 'defend' || td < 6) {
        const h = m.type === 'defend' && g.provs[m.prov].owner === a.nation ? m.prov : G.nearestOwnCity(g, a.nation, a.x, a.y);
        if (h >= 0 && !(a.order && a.order.type === 'station' && a.order.prov === h)) G.orderStation(g, a, h);
        return;
      }
    }
    // Tiếp tục vây thành đang nhắm
    if (a.order && a.order.type === 'siege') {
      const p = g.provs[a.order.prov];
      if (p && G.hostileProv(g, a.nation, p.owner) && (m.type !== 'attack' || p.owner === m.nation)) return;
    }
    if (m.type === 'defend') {
      const p = g.provs[m.prov];
      if (G.hostileProv(g, a.nation, p.owner) && p.owner >= 0) { G.orderSiege(g, a, m.prov); return; }
      const c = G.city(g, m.prov);
      if (U.dist(a.x, a.y, c.x, c.y) > 3 && !(a.order && a.order.type === 'station')) G.orderStation(g, a, m.prov);
      return;
    }
    const target = chooseTarget(g, a, m);
    if (target >= 0) { G.orderSiege(g, a, target); return; }
    if (!a.path && a.state === 'idle' && !G.isPlayer(g, a.nation)) {
      const f = frontierCity(g, a.nation);
      if (f >= 0) { const c = G.city(g, f); if (U.dist(a.x, a.y, c.x, c.y) > 3.5) G.orderStation(g, a, f); }
    }
  }
  AI.armyThink = armyThink;

  // ---------------- Ngoại giao ----------------
  function diplomacy(g) {
    const N = g.nations.length;
    const pw = g.nations.map(n => G.power(g, n.id));
    // Trôi quan hệ
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      if (!g.nations[i].alive || !g.nations[j].alive) continue;
      let r = g.rel[i][j]; r -= r * 0.02;
      const st = g.status[i][j];
      if (st === 'war') r -= 1; else if (st === 'ally') r += 1;
      const ei = G.enemies(g, i), ej = G.enemies(g, j);
      if (ei.some(e => ej.includes(e))) r += 1.5;
      if (st === 'peace' && AI.borders(g, i, j)) r -= 0.5;
      g.rel[i][j] = g.rel[j][i] = U.clamp(r, -100, 100);
    }
    const D = CW.diff(g), diffAggr = D.aggr;
    // Liên minh chống bá chủ: nước quá mạnh bị các nước khác e ngại
    const alive = g.nations.filter(n => n.alive), avg = alive.reduce((s, n) => s + pw[n.id], 0) / Math.max(1, alive.length);
    const hegemon = alive.filter(n => pw[n.id] > avg * 1.7 && (n.provCount || 0) >= 9).map(n => n.id);
    for (const h of hegemon) for (const n of alive) if (n.id !== h && !n.isPlayer && g.status[n.id][h] !== 'ally') { g.rel[n.id][h] = g.rel[h][n.id] = Math.max(-100, g.rel[n.id][h] - 2); }
    for (const n of g.nations) {
      if (!n.alive || n.isPlayer) continue;
      const i = n.id;
      const wars = G.enemies(g, i);
      let acted = false;
      // Cầu hòa
      for (const e of wars) {
        const age = G.warAge(g, i, e);
        if (age > 150 && (pw[i] < pw[e] * 0.75 || (wars.length > 1 && Math.random() < 0.3) || Math.random() < 0.06)) {
          if (G.isPlayer(g, e)) {
            if (!g.proposals.some(p => p.from === i && p.to === e && p.type === 'peace')) {
              g.proposals.push({ id: g.nextId++, from: i, to: e, type: 'peace', day: g.day, expires: g.day + 45 });
              G.log(g, 'diplo', `Sứ giả ${n.name} đến cầu hòa với ${g.nations[e].name}.`, { nations: [i, e], major: true });
            }
          } else if (G.peaceScore(g, i, e) + Math.random() * 0.2 > 0.45) G.makePeace(g, i, e);
          acted = true; break;
        }
      }
      if (acted) continue;
      // Hủy minh
      for (const j of G.allies(g, i)) {
        if (g.rel[i][j] < -5 && Math.random() < 0.5) { G.breakAlliance(g, i, j); acted = true; break; }
      }
      if (acted) continue;
      // Kết minh
      if (Math.random() < 0.3) {
        const cands = g.nations.filter(m => m.alive && m.id !== i && g.status[i][m.id] === 'peace' && g.rel[i][m.id] > 40);
        const ei = wars;
        for (const m of U.shuffle(Math.random, cands)) {
          const em = G.enemies(g, m.id);
          const common = ei.some(e => em.includes(e)) || g.nations.some(x => x.alive && x.id !== i && x.id !== m.id && pw[x.id] > pw[i] * 1.5 && AI.borders(g, i, x.id) && AI.borders(g, m.id, x.id));
          if (!common && g.rel[i][m.id] < 65) continue;
          if (m.isPlayer) {
            if (!g.proposals.some(p => p.from === i && p.to === m.id && p.type === 'alliance')) {
              g.proposals.push({ id: g.nextId++, from: i, to: m.id, type: 'alliance', day: g.day, expires: g.day + 45 });
              G.log(g, 'diplo', `${n.name} gửi quốc thư đề nghị kết minh với ${m.name}.`, { nations: [i, m.id], major: true });
            }
          } else if (G.allianceScore(g, i, m.id) > 0.45) G.makeAlliance(g, i, m.id);
          acted = true; break;
        }
      }
      if (acted) continue;
      // Tuyên chiến
      if (wars.length === 0 || (wars.length === 1 && n.aggr > 0.75 && pw[i] > pw[wars[0]] * 1.3)) {
        const cands = g.nations.filter(m => m.alive && m.id !== i && g.status[i][m.id] === 'peace' && g.truce[i][m.id] <= g.day && AI.borders(g, i, m.id)
          && !(m.isPlayer && (g.day < D.grace || g.rel[i][m.id] >= D.relP || Math.random() > D.vsPlayer)) // ân hạn & mức độ nhắm vào người chơi theo độ khó
          && g.rel[i][m.id] < 15 && pw[i] * (0.7 + n.aggr) > pw[m.id] * (hegemon.includes(m.id) ? 0.55 : 1));
        if (cands.length && Math.random() < 0.22 * n.aggr * diffAggr) {
          const sc = x => g.rel[i][x.id] + pw[x.id] / 500 - (hegemon.includes(x.id) ? 40 : 0);
          cands.sort((x, y) => sc(x) - sc(y));
          G.declareWar(g, i, cands[0].id);
        }
      }
      // Phản bội đồng minh (hiếm): đồng minh yếu, quan hệ xấu
      else if (Math.random() < 0.02 * n.aggr) {
        const al = G.allies(g, i).filter(j => g.rel[i][j] < 20 && pw[i] > pw[j] * 2 && AI.borders(g, i, j));
        if (al.length) G.declareWar(g, i, al[0]);
      }
    }
  }
})();

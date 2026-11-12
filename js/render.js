'use strict';
// ============ Render: bản đồ nướng sẵn (raster) + đường vector (sông, bờ biển, biên giới) + sprite + quân đội ============
(function () {
  const U = CW.U, T = CW.T;
  const R = CW.R = { cam: { x: 110, y: 75, z: 6 }, S: 8, S2: 4, dpr: 1, vw: 800, vh: 600, sel: new Set(), hover: null, box: null };
  const SEA = '#6c97a2';
  let G;

  R.init = function (canvas) {
    G = CW.G;
    R.cv = canvas; R.ctx = canvas.getContext('2d');
    R.resize();
    makeSprites();
  };
  R.resize = function () {
    R.dpr = Math.min(window.devicePixelRatio || 1, 2);
    R.vw = window.innerWidth; R.vh = window.innerHeight;
    R.cv.width = Math.round(R.vw * R.dpr); R.cv.height = Math.round(R.vh * R.dpr);
    R.cv.style.width = R.vw + 'px'; R.cv.style.height = R.vh + 'px';
    R.clampCam();
  };
  // Vùng đệm (px màn hình) quanh bản đồ để mép bản đồ không bị bảng/nút che: trái, phải, trên, dưới
  R.pad = false; // bật khi đang chơi (tắt ở bản đồ nền màn hình chính)
  R.minZoom = () => (R.map ? Math.max(R.vw / R.map.W, R.vh / R.map.H) * (R.pad ? 0.8 : 1) : 2);
  R.clampCam = function () {
    if (!R.map) return;
    const c = R.cam; c.z = U.clamp(c.z, R.minZoom(), 48);
    const P = R.pad ? { l: Math.min(380, R.vw * 0.3), r: Math.min(360, R.vw * 0.28), t: 80, b: Math.min(260, R.vh * 0.3) } : { l: 0, r: 0, t: 0, b: 0 };
    const hw = R.vw / 2 / c.z, hh = R.vh / 2 / c.z;
    const ax = hw - P.l / c.z, bx = R.map.W - hw + P.r / c.z;
    const ay = hh - P.t / c.z - (R.pad ? 0 : 2), by = R.map.H - hh + P.b / c.z;
    c.x = ax > bx ? (ax + bx) / 2 : U.clamp(c.x, ax, bx);
    c.y = ay > by ? (ay + by) / 2 : U.clamp(c.y, ay, by);
  };
  R.s2w = (sx, sy) => ({ x: (sx - R.vw / 2) / R.cam.z + R.cam.x, y: (sy - R.vh / 2) / R.cam.z + R.cam.y });
  R.w2s = (wx, wy) => ({ x: (wx - R.cam.x) * R.cam.z + R.vw / 2, y: (wy - R.cam.y) * R.cam.z + R.vh / 2 });
  R.centerOn = function (x, y, z) { R.cam.x = x; R.cam.y = y; if (z) R.cam.z = z; R.clampCam(); };
  R.zoomAt = function (sx, sy, f) {
    const before = R.s2w(sx, sy);
    R.cam.z = U.clamp(R.cam.z * f, R.minZoom(), 48);
    const after = R.s2w(sx, sy);
    R.cam.x += before.x - after.x; R.cam.y += before.y - after.y; R.clampCam();
  };

  // ---------------- Sprites ----------------
  const SP = {};
  function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function makeSprites() {
    // Núi
    SP.mount = [0, 1, 2].map(v => {
      const c = cnv(80, 60), x = c.getContext('2d');
      const peaks = v === 0 ? [[40, 6, 34]] : v === 1 ? [[30, 12, 26], [52, 6, 28]] : [[26, 18, 22], [46, 4, 30], [64, 20, 16]];
      peaks.sort((a, b) => a[1] - b[1]).reverse();
      for (const [px, py, hw] of peaks) {
        const by = 56;
        x.fillStyle = '#d6c294'; x.beginPath(); x.moveTo(px - hw, by); x.lineTo(px, py); x.lineTo(px + hw, by); x.closePath(); x.fill();
        x.fillStyle = '#a78d61'; x.beginPath(); x.moveTo(px, py); x.lineTo(px + hw, by); x.lineTo(px + 4, by); x.lineTo(px - 2, py + (by - py) * 0.45); x.closePath(); x.fill();
        x.strokeStyle = '#7c6643'; x.lineWidth = 1.2;
        for (let k = 1; k < 4; k++) { x.beginPath(); x.moveTo(px - hw * k / 5, py + (by - py) * k / 4.2); x.lineTo(px - hw * k / 5 + 5, py + (by - py) * k / 4.2 + 6); x.stroke(); }
        if (py < 10) { x.fillStyle = '#f4efe2'; x.beginPath(); x.moveTo(px, py); x.lineTo(px - hw * 0.22, py + 10); x.lineTo(px - 2, py + 7); x.lineTo(px + 3, py + 11); x.lineTo(px + hw * 0.2, py + 9); x.closePath(); x.fill(); }
        x.strokeStyle = '#5e4a2e'; x.lineWidth = 2; x.beginPath(); x.moveTo(px - hw, by); x.lineTo(px, py); x.lineTo(px + hw, by); x.stroke();
      }
      return c;
    });
    // Đồi
    SP.hill = (() => {
      const c = cnv(60, 30), x = c.getContext('2d');
      x.fillStyle = '#ccb383'; x.beginPath(); x.moveTo(2, 28); x.quadraticCurveTo(30, -6, 58, 28); x.fill();
      x.fillStyle = '#ad935f'; x.beginPath(); x.moveTo(30, 6); x.quadraticCurveTo(50, 12, 58, 28); x.lineTo(34, 28); x.fill();
      x.strokeStyle = '#6e5a3a'; x.lineWidth = 2; x.beginPath(); x.moveTo(2, 28); x.quadraticCurveTo(30, -6, 58, 28); x.stroke();
      return c;
    })();
    // Cây
    SP.tree = [0, 1].map(v => {
      const c = cnv(36, 44), x = c.getContext('2d');
      x.fillStyle = '#5a3e24'; x.fillRect(16, 26, 4, 16);
      if (v === 0) {
        x.fillStyle = '#56702e'; x.beginPath(); x.arc(18, 18, 13, 0, 7); x.fill();
        x.fillStyle = '#7e9a45'; x.beginPath(); x.arc(14, 14, 7, 0, 7); x.fill();
        x.strokeStyle = '#33441a'; x.lineWidth = 2; x.beginPath(); x.arc(18, 18, 13, 0, 7); x.stroke();
      } else {
        x.fillStyle = '#4e6a31'; x.beginPath(); x.moveTo(18, 2); x.lineTo(31, 32); x.lineTo(5, 32); x.closePath(); x.fill();
        x.fillStyle = '#6f8b45'; x.beginPath(); x.moveTo(18, 2); x.lineTo(11, 18); x.lineTo(19, 16); x.closePath(); x.fill();
        x.strokeStyle = '#2f4219'; x.lineWidth = 2; x.beginPath(); x.moveTo(18, 2); x.lineTo(31, 32); x.lineTo(5, 32); x.closePath(); x.stroke();
      }
      return c;
    });
    SP.dune = (() => {
      const c = cnv(50, 20), x = c.getContext('2d');
      x.strokeStyle = '#b8955a'; x.lineWidth = 2.5;
      x.beginPath(); x.moveTo(2, 16); x.quadraticCurveTo(18, 2, 30, 14); x.moveTo(22, 18); x.quadraticCurveTo(36, 6, 48, 16); x.stroke();
      return c;
    })();
    // Thành trì
    SP.city = drawCity(false); SP.capital = drawCity(true);
  }
  function drawCity(cap) {
    const W = 120, H = 100, c = cnv(W, H), x = c.getContext('2d');
    const wallY = cap ? 62 : 66, wallH = cap ? 30 : 26;
    // bóng
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.beginPath(); x.ellipse(60, 94, 54, 6, 0, 0, 7); x.fill();
    // tường thành
    x.fillStyle = '#9c968a'; x.fillRect(10, wallY, 100, wallH);
    x.fillStyle = '#7d776c'; x.fillRect(10, wallY + wallH - 6, 100, 6);
    x.fillStyle = '#9c968a';
    for (let i = 0; i < 10; i++) x.fillRect(10 + i * 10.4, wallY - 6, 6, 6);
    x.strokeStyle = '#4d4840'; x.lineWidth = 2; x.strokeRect(10, wallY, 100, wallH);
    x.strokeStyle = 'rgba(70,64,56,0.4)'; x.lineWidth = 1;
    for (let r = 1; r < 4; r++) { x.beginPath(); x.moveTo(10, wallY + r * wallH / 4); x.lineTo(110, wallY + r * wallH / 4); x.stroke(); }
    // cổng
    x.fillStyle = '#2b2622'; x.beginPath(); x.moveTo(50, wallY + wallH); x.lineTo(50, wallY + 12); x.quadraticCurveTo(60, wallY + 2, 70, wallY + 12); x.lineTo(70, wallY + wallH); x.fill();
    // lầu
    const roof = (cx, y, w, h) => {
      x.fillStyle = '#2f2d2c'; x.beginPath();
      x.moveTo(cx - w / 2 - 8, y + h); x.quadraticCurveTo(cx - w / 2, y + h - 2, cx - w / 2 + 6, y + 2); x.lineTo(cx + w / 2 - 6, y + 2);
      x.quadraticCurveTo(cx + w / 2, y + h - 2, cx + w / 2 + 8, y + h); x.quadraticCurveTo(cx, y + h - 5, cx - w / 2 - 8, y + h); x.fill();
      x.fillStyle = '#4a4744'; x.fillRect(cx - w / 2 + 6, y, w - 12, 3);
    };
    const hall = (cx, y, w, h) => {
      x.fillStyle = '#a8402f'; x.fillRect(cx - w / 2, y, w, h);
      x.fillStyle = '#e8d8b0'; for (let i = 0; i < 4; i++) x.fillRect(cx - w / 2 + 4 + i * (w - 8) / 3 - 1.5, y + 2, 3, h - 2);
      x.strokeStyle = '#3a1810'; x.lineWidth = 1.5; x.strokeRect(cx - w / 2, y, w, h);
    };
    if (cap) {
      hall(60, 44, 60, 18); roof(60, 30, 66, 16);
      hall(60, 20, 36, 12); roof(60, 6, 42, 15);
      x.fillStyle = '#e0b440'; x.beginPath(); x.arc(60, 6, 3, 0, 7); x.fill();
      hall(20, 50, 16, 12); roof(20, 40, 20, 11); hall(100, 50, 16, 12); roof(100, 40, 20, 11);
    } else {
      hall(60, 46, 46, 16); roof(60, 30, 54, 17);
      hall(60, 26, 22, 8); roof(60, 14, 28, 13);
    }
    return c;
  }

  // ---------------- Nướng bản đồ ----------------
  R.setGame = function (g) {
    R.g = g; R.map = g.map;
    bakeStatic(g.map);
    R.bakePolitical(g);
    const me = g.nations[CW.me] || g.nations[0]; const cap = me.alive ? me.capital : g.nations.find(n => n.alive).capital; const c = G.city(g, cap);
    R.cam.z = Math.max(R.minZoom() * 1.6, 7);
    R.centerOn(c.x, c.y);
  };

  function pathFromLines(lines, iter) {
    const p = new Path2D();
    for (const l of lines) {
      const pts = iter === 'river' ? U.chaikin(l.pts, false, 2) : U.smoothLine(l.pts, l.closed);
      if (pts.length < 2) continue;
      p.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
      if (l.closed) p.closePath();
    }
    return p;
  }

  function bakeStatic(m) {
    const W = m.W, H = m.H, S = R.S;
    const isLand = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m.land[y * W + x] === 1;
    const coastLines = U.extractEdges(W, H, (x1, y1, x2, y2) => isLand(x1, y1) !== isLand(x2, y2));
    R.coastPath = pathFromLines(coastLines, 2);
    const base = cnv(W * S, H * S), x = base.getContext('2d');
    // biển với vân màu
    x.fillStyle = SEA; x.fillRect(0, 0, base.width, base.height);
    const nz = new U.Noise(m.seed + 99);
    const sv = cnv(W, H), sx = sv.getContext('2d'); const sd = sx.createImageData(W, H);
    const tv = cnv(W, H), tx = tv.getContext('2d'); const td = tx.createImageData(W, H);
    const TC = { 2: [216, 195, 154], 3: [178, 176, 118], 4: [205, 182, 138], 5: [196, 170, 126], 6: [232, 208, 150], 7: [208, 200, 142] };
    for (let y = 0; y < H; y++) for (let x2 = 0; x2 < W; x2++) {
      const i = y * W + x2, o = i * 4; const n = nz.fbm(x2 / 9, y / 9, 3);
      if (!m.land[i]) { const v = (n - 0.5) * 40; sd.data[o] = 108 + v; sd.data[o + 1] = 151 + v; sd.data[o + 2] = 162 + v * 0.6; sd.data[o + 3] = 255; }
      else {
        const c = TC[m.ter[i]] || TC[2]; const v = (n - 0.5) * 26;
        td.data[o] = c[0] + v; td.data[o + 1] = c[1] + v; td.data[o + 2] = c[2] + v * 0.8; td.data[o + 3] = 255;
      }
    }
    sx.putImageData(sd, 0, 0); tx.putImageData(td, 0, 0);
    x.imageSmoothingEnabled = true;
    x.drawImage(sv, 0, 0, W * S, H * S);
    x.save(); x.scale(S, S); x.lineJoin = 'round'; x.lineCap = 'round';
    // gợn sóng ven bờ
    for (const w of [3.4, 2.4, 1.4]) {
      x.strokeStyle = 'rgba(226,238,236,0.55)'; x.lineWidth = w; x.stroke(R.coastPath);
      x.strokeStyle = 'rgba(108,151,162,0.92)'; x.lineWidth = w - 0.28; x.stroke(R.coastPath);
    }
    // đất liền
    x.save(); x.clip(R.coastPath, 'evenodd');
    x.drawImage(tv, 0, 0, W, H);
    x.restore();
    x.restore();
    // giấy dó lấm tấm
    const r = U.rng(m.seed + 5);
    x.fillStyle = 'rgba(90,60,30,0.05)';
    for (let i = 0; i < 9000; i++) x.fillRect(r() * base.width, r() * base.height, 1 + r() * 2, 1 + r() * 2);
    R.base = base;
    // sông theo nhóm độ rộng
    const buckets = [[], [], []];
    for (const rv of m.rivers) {
      let cur = null, cb = -1;
      rv.pts.forEach((p, k) => {
        const f = rv.flows[k]; const b = f < 18 ? 0 : f < 55 ? 1 : 2;
        if (b !== cb) { if (cur) { cur.push(p); } cur = [p]; buckets[b].push(cur); cb = b; if (k > 0) cur.unshift(rv.pts[k - 1]); }
        else cur.push(p);
      });
    }
    R.riverPaths = buckets.map((ls, i) => ({ path: pathFromLines(ls.filter(l => l.length > 1).map(l => ({ pts: l, closed: false })), 'river'), w: [0.2, 0.3, 0.42][i] }));
  }

  R.bakePolitical = function (g) {
    const m = g.map, W = m.W, H = m.H, S2 = R.S2;
    const sm = cnv(W, H), sx = sm.getContext('2d'), d = sx.createImageData(W, H);
    const cols = g.nations.map(n => U.hexToRgb(n.color)); const neu = U.hexToRgb(CW.NEUTRAL_COLOR);
    const ownerAt = i => { const k = m.prov[i]; return k < 0 ? -2 : g.provs[k].owner; };
    for (let i = 0; i < W * H; i++) {
      const o = ownerAt(i); if (o === -2) continue;
      const c = o < 0 ? neu : cols[o];
      d.data[i * 4] = c[0]; d.data[i * 4 + 1] = c[1]; d.data[i * 4 + 2] = c[2]; d.data[i * 4 + 3] = o < 0 ? 120 : 255;
    }
    sx.putImageData(d, 0, 0);
    const pc = R.pol || cnv(W * S2, H * S2); const px = pc.getContext('2d');
    px.clearRect(0, 0, pc.width, pc.height);
    px.save(); px.scale(S2, S2); px.clip(R.coastPath, 'evenodd'); px.imageSmoothingEnabled = true;
    px.filter = 'blur(2.5px)'; px.drawImage(sm, 0, 0, W, H); px.filter = 'none'; px.globalAlpha = 0.6; px.drawImage(sm, 0, 0, W, H); px.globalAlpha = 1; px.restore();
    R.pol = pc;
    // biên giới
    const own = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -2 : ownerAt(y * W + x);
    const prv = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : m.prov[y * W + x];
    R.nationBorder = pathFromLines(U.extractEdges(W, H, (x1, y1, x2, y2) => { const a = own(x1, y1), b = own(x2, y2); return a !== -2 && b !== -2 && a !== b; }), 2);
    R.provBorder = pathFromLines(U.extractEdges(W, H, (x1, y1, x2, y2) => { const a = prv(x1, y1), b = prv(x2, y2); return a >= 0 && b >= 0 && a !== b && own(x1, y1) === own(x2, y2); }), 2);
    // nhãn quốc gia
    R.labels = [];
    for (const n of g.nations) {
      if (!n.alive) continue;
      let ax = 0, ay = 0, area = 0;
      const ps = [];
      g.provs.forEach((p, k) => { if (p.owner === n.id) { const mp = m.provinces[k]; ax += mp.mx * mp.area; ay += mp.my * mp.area; area += mp.area; ps.push(mp); } });
      if (!area) continue;
      ax /= area; ay /= area;
      let best = ps[0], bd = 1e9; for (const mp of ps) { const dd = U.dist(mp.mx, mp.my, ax, ay); if (dd < bd) { bd = dd; best = mp; } }
      const lx = bd < 6 ? ax : best.mx, ly = bd < 6 ? ay : best.my;
      R.labels.push({ n: n.id, x: lx, y: ly - 1.5, area });
    }
    // minimap
    const mm = R.mini || cnv(W * 2, H * 2); const mx = mm.getContext('2d');
    mx.drawImage(R.base, 0, 0, mm.width, mm.height); mx.globalAlpha = 0.65; mx.drawImage(R.pol, 0, 0, mm.width, mm.height); mx.globalAlpha = 1;
    R.mini = mm;
    g.dirtyPolitical = false;
  };

  // ---------------- Đội hình ----------------
  const layoutCache = new Map();
  function layout(form, n) {
    const key = form + n; if (layoutCache.has(key)) return layoutCache.get(key);
    const pts = [];
    if (form === 'phongthi') {
      for (let r = 0; pts.length < n; r++) for (let j = -r; j <= r && pts.length < n; j++) pts.push([-r * 0.9, j]);
    } else if (form === 'hacdy') {
      const core = Math.ceil(n * 0.3); const side = Math.ceil(Math.sqrt(core));
      for (let i = 0; i < core; i++) pts.push([-(i % side), Math.floor(i / side) - side / 2]);
      const wing = n - core; const L = Math.ceil(wing / 4);
      for (let i = 0; pts.length < n; i++) { const k = Math.floor(i / 4), lane = i % 4; const sgn = lane < 2 ? 1 : -1; const th = lane % 2; pts.push([k * 0.55 + th * 0.5 - side * 0.3, sgn * (side / 2 + 1 + k * 0.8 + th * 0.6)]); }
    } else if (form === 'nhanhanh') {
      const cols = Math.ceil(n / 3);
      for (let i = 0; i < n; i++) { const c = i % cols, r = Math.floor(i / cols); const yy = c - cols / 2; pts.push([-r - Math.abs(yy) * 0.25, yy]); }
    } else if (form === 'truongxa') {
      for (let i = 0; i < n; i++) pts.push([-Math.floor(i / 3), (i % 3) - 1]);
    } else {
      const side = Math.ceil(Math.sqrt(n));
      for (let i = 0; i < n; i++) pts.push([-(i % side), Math.floor(i / side) - side / 2]);
    }
    let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= n; cy /= n;
    const res = pts.map(p => [p[0] - cx, p[1] - cy]);
    const order = res.map((p, i) => i).sort((a, b) => res[b][0] - res[a][0]);
    const out = { pts: res, order };
    layoutCache.set(key, out);
    return out;
  }

  function drawFormation(ctx, g, a, sp, col, now) {
    const tot = G.troops(a.t); if (tot <= 0) return;
    const n = U.clamp(Math.round(tot / 40), 4, 260);
    const L = layout(a.formation, n);
    let face = a.facing, shift = 0;
    const z = R.cam.z, sp2 = 0.26 * z;
    if (a.state === 'battle' && a.foes.length) {
      const f = G.army(g, a.foes[0]);
      if (f) {
        face = Math.atan2(f.y - a.y, f.x - a.x);
        // đặt tiền tuyến ở điểm giữa hai quân
        let fx = -1e9; for (const p of L.pts) if (p[0] > fx) fx = p[0];
        shift = U.dist(a.x, a.y, f.x, f.y) * z / 2 - fx * sp2 - 0.12 * z;
      }
    }
    const cos = Math.cos(face), sin = Math.sin(face);
    sp = { x: sp.x + cos * shift, y: sp.y + sin * shift };
    // phân loại theo thứ tự hàng trước -> sau
    const front = a.formation === 'phongthi' ? ['cav', 'inf', 'arc', 'sie'] : ['inf', 'cav', 'arc', 'sie'];
    const counts = front.map(k => Math.round(a.t[k] / tot * n));
    const r = Math.max(1.4, 0.1 * z);
    const base = U.hexToRgb(col);
    const colors = { inf: U.rgbStr(base), arc: U.rgbStr(U.mix(base, [255, 255, 255], 0.35)), cav: U.rgbStr(U.mix(base, [0, 0, 0], 0.3)), sie: '#6b4a2b' };
    const battle = a.state === 'battle';
    let idx = 0, ti = 0, left = counts[0];
    ctx.lineWidth = Math.max(0.6, r * 0.35); ctx.strokeStyle = 'rgba(20,15,10,0.7)';
    for (const oi of L.order) {
      while (left <= 0 && ti < 3) { ti++; left = counts[ti]; }
      const type = front[ti]; left--;
      const p = L.pts[oi];
      let lx = p[0] * sp2, ly = p[1] * sp2;
      if (battle) { lx += Math.sin(now / 90 + oi * 1.7) * r * 0.9; ly += Math.cos(now / 110 + oi) * r * 0.6; }
      const x = sp.x + lx * cos - ly * sin, y = sp.y + lx * sin + ly * cos;
      ctx.fillStyle = colors[type];
      if (type === 'sie') { ctx.fillRect(x - r, y - r, r * 2, r * 2); }
      else {
        ctx.beginPath(); ctx.arc(x, y, type === 'cav' ? r * 1.25 : type === 'arc' ? r * 0.85 : r, 0, 6.283); ctx.fill();
        if (z > 20) ctx.stroke();
      }
      idx++;
    }
  }

  // ---------------- Vẽ khung hình ----------------
  R.draw = function (g, now) {
    const ctx = R.ctx, dpr = R.dpr, z = R.cam.z, S = R.S;
    if (g.dirtyPolitical) R.bakePolitical(g);
    const ox = R.vw / 2 - R.cam.x * z, oy = R.vh / 2 - R.cam.y * z;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = R.pad ? '#2a1d12' : SEA; ctx.fillRect(0, 0, R.vw, R.vh);
    if (R.pad) { // khung bản đồ (vùng đệm bên ngoài tối màu như mặt bàn)
      ctx.fillStyle = '#3b2a18'; ctx.fillRect(ox - 10, oy - 10, R.map.W * z + 20, R.map.H * z + 20);
      ctx.strokeStyle = '#c9a54a'; ctx.lineWidth = 2; ctx.strokeRect(ox - 6, oy - 6, R.map.W * z + 12, R.map.H * z + 12);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(dpr * z / S, 0, 0, dpr * z / S, dpr * ox, dpr * oy);
    ctx.drawImage(R.base, 0, 0);
    ctx.globalAlpha = 0.6;
    ctx.setTransform(dpr * z / R.S2, 0, 0, dpr * z / R.S2, dpr * ox, dpr * oy);
    ctx.drawImage(R.pol, 0, 0);
    ctx.globalAlpha = 1;
    // vector
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * ox, dpr * oy);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = '#4c6266'; ctx.lineWidth = 1.4 / z; ctx.stroke(R.coastPath);
    for (const rp of R.riverPaths) {
      ctx.strokeStyle = '#557c88'; ctx.lineWidth = rp.w + 1.6 / z; ctx.stroke(rp.path);
      ctx.strokeStyle = '#8fb4c0'; ctx.lineWidth = rp.w; ctx.stroke(rp.path);
    }
    if (z > 3) { ctx.setLineDash([4 / z, 3 / z]); ctx.strokeStyle = 'rgba(70,50,30,0.4)'; ctx.lineWidth = 1 / z; ctx.stroke(R.provBorder); ctx.setLineDash([]); }
    ctx.strokeStyle = 'rgba(58,36,26,0.62)'; ctx.lineWidth = Math.max(2.4 / z, 0.22); ctx.stroke(R.nationBorder);
    ctx.strokeStyle = 'rgba(255,244,214,0.45)'; ctx.lineWidth = 0.9 / z; ctx.stroke(R.nationBorder);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const x0 = -ox / z - 2, y0 = -oy / z - 3, x1 = (R.vw - ox) / z + 2, y1 = (R.vh - oy) / z + 2;
    // biểu tượng địa hình
    const icons = R.map.icons;
    for (let i = 0; i < icons.length; i++) {
      const ic = icons[i];
      if (ic.x < x0 || ic.x > x1 || ic.y < y0 || ic.y > y1) continue;
      const sx = ic.x * z + ox, sy = ic.y * z + oy;
      if (ic.t === 0) { const w = Math.max(9, z * 2.3 * ic.s), h = w * 0.75; ctx.drawImage(SP.mount[ic.v], sx - w / 2, sy - h, w, h); }
      else if (ic.t === 1) { if (z < 3) continue; const w = Math.max(7, z * 1.6 * ic.s); ctx.drawImage(SP.hill, sx - w / 2, sy - w / 2, w, w / 2); }
      else if (ic.t === 2) { if (z < 4.5) continue; const w = z * 0.95 * ic.s; ctx.drawImage(SP.tree[ic.v], sx - w / 2, sy - w * 1.2, w, w * 1.22); }
      else if (ic.t === 3) { if (z < 4) continue; const w = z * 1.3 * ic.s; ctx.drawImage(SP.dune, sx - w / 2, sy - w * 0.4, w, w * 0.4); }
    }
    // thành trì
    const mp = R.map.provinces;
    R.cityRects = [];
    for (let k = 0; k < g.provs.length; k++) {
      const p = g.provs[k], c = mp[k]; const cx = c.cx + 0.5, cy = c.cy + 0.5;
      if (cx < x0 || cx > x1 || cy < y0 || cy > y1 + 2) continue;
      const isCap = p.owner >= 0 && g.nations[p.owner].capital === k;
      const sz = U.clamp(z * 2.3, 14, 66) * (isCap ? 1.35 : 1);
      const sx = cx * z + ox, sy = cy * z + oy;
      const w = sz, h = sz * 0.83;
      ctx.drawImage(isCap ? SP.capital : SP.city, sx - w / 2, sy - h * 0.8, w, h);
      R.cityRects.push({ k, x: sx - w / 2, y: sy - h * 0.8, w, h });
      // cờ chủ thành
      const col = G.nationColor(g, p.owner);
      if (z >= 3.5) {
        const fx = sx + w * 0.38, fy = sy - h * 0.8 - sz * 0.05, fh = Math.max(10, sz * 0.32);
        ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(fx, fy + fh * 0.9); ctx.lineTo(fx, fy - fh * 0.5); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(fx, fy - fh * 0.5); ctx.lineTo(fx + fh * 0.95, fy - fh * 0.35); ctx.lineTo(fx + fh * 0.8, fy); ctx.lineTo(fx, fy + fh * 0.1); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
        if (p.owner >= 0 && fh > 14) { ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(fh * 0.42)}px KaiTi, STKaiti, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(g.nations[p.owner].char, fx + fh * 0.42, fy - fh * 0.2); }
      }
      // bị vây
      if (g.day - p.sieged < 1.5) drawFire(ctx, sx, sy - h * 0.35, sz * 0.5, now);
      // thanh tường thành
      const wm = G.wallMax(p);
      if (p.wallHp < wm - 1 && z >= 4) {
        const bw = w * 0.7; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx - bw / 2, sy + h * 0.25, bw, 4);
        ctx.fillStyle = '#d9a520'; ctx.fillRect(sx - bw / 2, sy + h * 0.25, bw * p.wallHp / wm, 4);
      }
      // tên
      if (z >= 4.2 || (isCap && z >= 2.4)) {
        const fs = Math.round(U.clamp(z * 0.9, 10, 15) * (isCap ? 1.1 : 1));
        ctx.font = `bold ${fs}px "Segoe UI", Tahoma, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(245,235,210,0.9)'; ctx.strokeText(p.name, sx, sy + h * 0.3 + 4);
        ctx.fillStyle = '#2b1d12'; ctx.fillText(p.name, sx, sy + h * 0.3 + 4);
      }
    }
    // tên quốc gia
    if (z < 16) {
      const alpha = z < 9 ? 1 : (16 - z) / 7;
      ctx.globalAlpha = alpha; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const L of R.labels) {
        const n = g.nations[L.n]; if (!n.alive) continue;
        const sx = L.x * z + ox, sy = L.y * z + oy;
        const fs = U.clamp(Math.sqrt(L.area) * z * 0.075, 14, 46);
        ctx.font = `900 ${Math.round(fs)}px "Segoe UI Black", "Arial Black", sans-serif`;
        ctx.lineWidth = Math.max(3, fs / 6); ctx.strokeStyle = 'rgba(30,20,12,0.85)';
        const txt = n.name.toUpperCase();
        ctx.strokeText(txt, sx, sy); ctx.fillStyle = '#fbf3df'; ctx.fillText(txt, sx, sy);
      }
      ctx.globalAlpha = 1;
    }
    // quân đội
    const detailed = z >= 14;
    const arr = g.armies.slice().sort((a, b) => a.y - b.y);
    for (const a of arr) {
      if (a.x < x0 - 2 || a.x > x1 + 2 || a.y < y0 - 2 || a.y > y1 + 6) { a._sb = null; continue; }
      const sp = { x: a.x * z + ox, y: a.y * z + oy };
      const col = G.nationColor(g, a.nation);
      if (detailed) drawFormation(ctx, g, a, sp, col, now);
      drawBanner(ctx, g, a, sp, col, detailed ? 0.6 : (z < 3.2 ? 0.55 : z < 6 ? 0.8 : 1));
    }
    // đường hành quân của đạo được chọn
    for (const id of R.sel) {
      const a = G.army(g, id); if (!a) continue;
      const sp = R.w2s(a.x, a.y);
      ctx.strokeStyle = a.state === 'rout' ? 'rgba(200,60,40,0.9)' : 'rgba(255,230,140,0.95)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
      if (a.path && a.pi < a.path.length) {
        ctx.beginPath(); ctx.moveTo(sp.x, sp.y);
        for (let i = a.pi; i < a.path.length; i++) { const q = R.w2s(a.path[i][0], a.path[i][1]); ctx.lineTo(q.x, q.y); }
        ctx.stroke(); ctx.setLineDash([]);
        const e = a.path[a.path.length - 1]; const q = R.w2s(e[0], e[1]);
        ctx.beginPath(); ctx.arc(q.x, q.y, 6, 0, 7); ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,215,90,0.95)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(sp.x, sp.y, Math.max(12, z * 1.2), Math.max(6, z * 0.6), 0, 0, 7); ctx.stroke();
    }
    // trận đánh
    for (const b of g.battles) {
      const sp = R.w2s(b.x, b.y);
      if (sp.x < -50 || sp.y < -50 || sp.x > R.vw + 50 || sp.y > R.vh + 50) continue;
      const s = detailed ? 30 : 24;
      drawFire(ctx, sp.x, sp.y + s * 0.3, s * 0.9, now);
      drawSwords(ctx, sp.x, sp.y - s * 0.1, s);
    }
    // khung chọn
    if (R.box) {
      ctx.strokeStyle = 'rgba(255,220,120,0.95)'; ctx.fillStyle = 'rgba(255,220,120,0.12)'; ctx.lineWidth = 1.5;
      const b = R.box; ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    }
    if (R.selProv >= 0 && R.selProv !== undefined) {
      const c = G.city(g, R.selProv); const sp = R.w2s(c.x, c.y); const s = U.clamp(z * 2.3, 14, 66);
      ctx.strokeStyle = 'rgba(255,215,90,0.95)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(sp.x, sp.y, s * 0.7, s * 0.32, 0, 0, 7); ctx.stroke();
    }
  };

  function drawFire(ctx, x, y, s, now) {
    const t = now / 120;
    for (let i = 0; i < 5; i++) {
      const ph = t + i * 1.3; const fx = x + Math.sin(i * 2.1) * s * 0.35; const fh = s * (0.45 + 0.2 * Math.sin(ph));
      const gr = ctx.createRadialGradient(fx, y - fh * 0.3, 1, fx, y - fh * 0.3, fh * 0.7);
      gr.addColorStop(0, 'rgba(255,240,150,0.95)'); gr.addColorStop(0.5, 'rgba(255,140,30,0.75)'); gr.addColorStop(1, 'rgba(200,40,10,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(fx, y - fh * 0.3, fh * 0.42, fh * 0.75, 0, 0, 7); ctx.fill();
    }
  }
  function drawSwords(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round';
    for (const sg of [1, -1]) {
      ctx.save(); ctx.rotate(sg * Math.PI / 4);
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(0, -s * 0.6); ctx.lineTo(0, s * 0.45); ctx.stroke();
      ctx.strokeStyle = '#eef2f5'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(0, -s * 0.6); ctx.lineTo(0, s * 0.3); ctx.stroke();
      ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(-s * 0.15, s * 0.3); ctx.lineTo(s * 0.15, s * 0.3); ctx.moveTo(0, s * 0.3); ctx.lineTo(0, s * 0.5); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawBanner(ctx, g, a, sp, col, s) {
    const gen = a.gen ? G.gen(g, a.gen) : null;
    const W = 50 * s, ph = 44 * s, nameH = 12 * s;
    const top = sp.y - 84 * s;
    const sel = R.sel.has(a.id), hov = R.hover === a.id;
    // bóng + cán cờ
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(sp.x + 6 * s, sp.y, 12 * s, 4 * s, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#3a2614'; ctx.lineWidth = Math.max(1.5, 3 * s); ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(sp.x, top - 6 * s); ctx.stroke();
    ctx.fillStyle = '#c8ccd2'; ctx.beginPath(); ctx.moveTo(sp.x, top - 13 * s); ctx.lineTo(sp.x - 3 * s, top - 5 * s); ctx.lineTo(sp.x + 3 * s, top - 5 * s); ctx.fill();
    const bx = sp.x - W / 2;
    if (sel || hov) { ctx.fillStyle = sel ? 'rgba(255,215,80,0.9)' : 'rgba(255,255,255,0.6)'; ctx.fillRect(bx - 3, top - 3, W + 6, nameH + ph + 6 + 10 * s); }
    // dải tên
    ctx.fillStyle = '#efe2bf'; ctx.fillRect(bx, top, W, nameH);
    ctx.strokeStyle = '#3a2614'; ctx.lineWidth = 1; ctx.strokeRect(bx, top, W, nameH);
    if (s >= 0.6) {
      ctx.fillStyle = '#2a1a0e'; ctx.font = `bold ${Math.round(8.5 * s)}px "Segoe UI", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let name = gen ? gen.name : 'Vô tướng';
      ctx.fillText(name.length > 12 ? name.slice(0, 11) + '…' : name, sp.x, top + nameH / 2 + 0.5);
    }
    // khung chân dung
    const py = top + nameH;
    ctx.fillStyle = col; ctx.fillRect(bx, py, W, ph + 4 * s);
    const img = CW.Portraits.source(gen ? gen.name : '', gen && gen.monarch ? 'monarch' : 'general', col);
    ctx.drawImage(img, bx + 3 * s, py + 2 * s, W - 6 * s, ph);
    ctx.strokeStyle = '#2a1a0e'; ctx.lineWidth = 1.2; ctx.strokeRect(bx, py, W, ph + 4 * s);
    // quân số
    const tot = G.troops(a.t);
    const by = py + ph + 4 * s;
    ctx.fillStyle = 'rgba(25,15,8,0.85)'; ctx.fillRect(bx, by, W, 11 * s);
    ctx.fillStyle = '#ffe9b0'; ctx.font = `bold ${Math.round(9 * s)}px "Segoe UI", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let tag = U.fmt(tot);
    if (a.state === 'rout') tag = '↩ ' + tag; else if (a.state === 'siege') tag = '⚑ ' + tag; else if (a.mode === 'auto' && a.nation === CW.me) tag = '★ ' + tag;
    ctx.fillText(tag, sp.x, by + 5.5 * s + 0.5);
    // thanh sĩ khí
    ctx.fillStyle = '#300'; ctx.fillRect(bx, by + 11 * s, W, 3 * s);
    ctx.fillStyle = a.morale > 60 ? '#5cb85c' : a.morale > 35 ? '#e0a526' : '#d9534f'; ctx.fillRect(bx, by + 11 * s, W * a.morale / 100, 3 * s);
    a._sb = { x: bx - 2, y: top - 14 * s, w: W + 4, h: sp.y - top + 14 * s };
  }

  // ---------------- Hit test ----------------
  R.armyAt = function (g, sx, sy) {
    const arr = g.armies.slice().sort((a, b) => b.y - a.y);
    for (const a of arr) { const b = a._sb; if (b && sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) return a; }
    // gần chấm đội hình
    const w = R.s2w(sx, sy); let best = null, bd = Math.max(0.9, 10 / R.cam.z);
    for (const a of g.armies) { const d = U.dist(a.x, a.y, w.x, w.y); if (d < bd) { bd = d; best = a; } }
    return best;
  };
  R.cityAt = function (sx, sy) {
    if (!R.cityRects) return -1;
    for (const r of R.cityRects) if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return r.k;
    return -1;
  };

  R.drawMinimap = function (mcv, g) {
    const x = mcv.getContext('2d'); const W = mcv.width, H = mcv.height;
    if (!R.mini) return;
    x.drawImage(R.mini, 0, 0, W, H);
    const sx = W / R.map.W, sy = H / R.map.H;
    for (const a of g.armies) {
      x.fillStyle = G.nationColor(g, a.nation); x.strokeStyle = '#000'; x.lineWidth = 1;
      x.fillRect(a.x * sx - 2, a.y * sy - 2, 4, 4); x.strokeRect(a.x * sx - 2, a.y * sy - 2, 4, 4);
    }
    for (const b of g.battles) { x.fillStyle = '#ff5a1a'; x.beginPath(); x.arc(b.x * sx, b.y * sy, 3, 0, 7); x.fill(); }
    const a = R.s2w(0, 0), b = R.s2w(R.vw, R.vh);
    x.strokeStyle = '#ffe08a'; x.lineWidth = 1.5; x.strokeRect(a.x * sx, a.y * sy, (b.x - a.x) * sx, (b.y - a.y) * sy);
  };
})();

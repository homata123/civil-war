'use strict';
// ============ Phim mở đầu "Đại bản doanh & Sa bàn quân sự" — dựng hình thời gian thực bằng Canvas 2D ============
// Không dùng file video: mọi khung hình được vẽ bằng code (giống cách repo tham khảo dựng intro bằng camera chạy theo đường quay).
// - Sa bàn isometric 2.5D dựng từ chính bản đồ sinh của game (địa hình, sông, lãnh thổ, kinh đô), khung gỗ viền đồng,
//   cờ chư hầu bay, hai đỉnh đồng tỏa khói hương, nến lung linh, bản đồ lụa trải bàn.
// - Camera sa bàn zoom vào từng địa danh → chuyển cảnh sang "thực cảnh" chiến quốc (góc xa rồi cận cảnh).
// - Ba chế độ: 'intro' (khi vào game), 'demo' (màn Phim & Demo, có điều khiển), 'ambient' (nền động của màn hình chính / thiết lập).
// - Quay thành video .webm bằng MediaRecorder (kèm nhạc nền + hiệu ứng nếu trình duyệt cho phép).
(function () {
  const U = CW.U;
  const C = CW.Cinema = {};
  const VW = 1920, VH = 1080;
  const TAU = Math.PI * 2;
  const CN = '"Ma Shan Zheng", KaiTi, STKaiti, "Noto Serif SC", "SimSun", serif';
  const VNF = '"Noto Serif", "Palatino Linotype", "Book Antiqua", Georgia, serif';
  const KEY = 'cw_cinema';
  C.cfg = { autoIntro: true, seen: false };
  try { Object.assign(C.cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* bỏ qua */ }
  const saveCfg = () => { try { localStorage.setItem(KEY, JSON.stringify(C.cfg)); } catch (e) { /* bỏ qua */ } };

  let cv = null, ctx = null, W = 0, H = 0, dpr = 1, S = 1, OX = 0, OY = 0;
  let world = null;          // sa bàn + tài nguyên đã nướng
  let mode = null;           // 'intro' | 'demo' | 'ambient' | null
  let film = null;           // { segs, total, chapters }
  let t = 0, paused = false, endAt = Infinity, onEnd = null, lastNow = 0, raf = 0;
  let recorder = null;
  const ease = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const ease2 = x => x * x * (3 - 2 * x);
  const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
  const lerp = U.lerp;

  // ================= Canvas =================
  function ensureCanvas() {
    if (cv) return;
    cv = document.createElement('canvas'); cv.id = 'cine';
    document.body.insertBefore(cv, document.getElementById('menu'));
    ctx = cv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, mode === 'ambient' ? 1 : 1.5);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    S = Math.max(W / VW, H / VH); OX = (W - VW * S) / 2; OY = (H - VH * S) / 2;
  }
  const vt = () => ctx.setTransform(dpr * S, 0, 0, dpr * S, dpr * OX, dpr * OY); // hệ tọa độ ảo 1920×1080 (cover)
  const st = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);                    // hệ tọa độ màn hình
  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // ================= Tài nguyên dùng chung =================
  function sprite(r, stops) {
    const c = mk(r * 2, r * 2), x = c.getContext('2d');
    const g = x.createRadialGradient(r, r, 0, r, r, r);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    x.fillStyle = g; x.fillRect(0, 0, r * 2, r * 2); return c;
  }
  function buildCommon() {
    const sp = {};
    sp.flame = sprite(64, [[0, 'rgba(255,250,220,1)'], [0.25, 'rgba(255,200,90,0.95)'], [0.55, 'rgba(240,100,30,0.55)'], [1, 'rgba(160,30,10,0)']]);
    sp.glow = sprite(64, [[0, 'rgba(255,190,110,0.55)'], [0.4, 'rgba(255,140,60,0.18)'], [1, 'rgba(255,120,40,0)']]);
    sp.smoke = sprite(64, [[0, 'rgba(200,190,180,0.55)'], [0.5, 'rgba(150,140,135,0.22)'], [1, 'rgba(120,110,105,0)']]);
    sp.dsmoke = sprite(64, [[0, 'rgba(40,30,30,0.6)'], [0.5, 'rgba(30,22,22,0.28)'], [1, 'rgba(20,15,15,0)']]);
    sp.dust = sprite(64, [[0, 'rgba(170,130,90,0.5)'], [0.6, 'rgba(140,105,70,0.18)'], [1, 'rgba(120,90,60,0)']]);
    sp.mist = sprite(64, [[0, 'rgba(255,240,230,0.5)'], [1, 'rgba(255,240,230,0)']]);
    // hạt phim
    const gn = mk(256, 256), gx = gn.getContext('2d'), id = gx.createImageData(256, 256), r = U.rng(77);
    for (let i = 0; i < id.data.length; i += 4) { const v = r() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 22; }
    gx.putImageData(id, 0, 0); sp.grain = gn;
    return sp;
  }

  // ================= Sa bàn isometric =================
  const STEP = 1, HX = 8, HY = 4, HU = 3.3, PAD = 60, TOPM = 80, RIM = 50;
  const NATIONS = ['tan', 'so', 'trieu', 'te', 'yen', 'han', 'nguy'];
  function buildWorld() {
    const map = CW.generateMap('trungdia', 20101, 7);
    const T = CW.T, N = new U.Noise(11);
    const GW = Math.floor(map.W / STEP), GH = Math.floor(map.H / STEP);
    const pres = NATIONS.map(id => CW.NATION_PRESETS.find(p => p.id === id));
    const cellT = (gx, gy) => map.ter[Math.min(map.H - 1, gy * STEP) * map.W + Math.min(map.W - 1, gx * STEP)];
    const cellH = new Float32Array(GW * GH);
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const tt = cellT(gx, gy), n = N.fbm(gx * 0.18, gy * 0.18, 3);
      const base = tt === T.SEA ? 0 : tt === T.LAKE ? 0.6 : tt === T.MOUNT ? 7 + n * 6 : tt === T.HILL ? 3.6 + n * 1.8 : tt === T.FOREST ? 2.3 + n * 0.6 : 1.8 + n * 0.5;
      cellH[gy * GW + gx] = base;
    }
    const V = (i, j) => { // độ cao đỉnh lưới = trung bình 4 ô quanh
      let s = 0, c = 0;
      for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) { const x = i + dx, y = j + dy; if (x >= 0 && y >= 0 && x < GW && y < GH) { s += cellH[y * GW + x]; c++; } }
      return c ? s / c : 0;
    };
    const VH_ = new Float32Array((GW + 1) * (GH + 1));
    for (let j = 0; j <= GH; j++) for (let i = 0; i <= GW; i++) VH_[j * (GW + 1) + i] = V(i, j);
    { const tmp = Float32Array.from(VH_); for (let j = 1; j < GH; j++) for (let i = 1; i < GW; i++) { let s2 = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s2 += tmp[(j + dy) * (GW + 1) + i + dx]; VH_[j * (GW + 1) + i] = s2 / 9; } }
    const vh = (i, j) => VH_[U.clamp(j, 0, GH) * (GW + 1) + U.clamp(i, 0, GW)];
    const hAt = (gx, gy) => { const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j; return lerp(lerp(vh(i, j), vh(i + 1, j), fx), lerp(vh(i, j + 1), vh(i + 1, j + 1), fx), fy); };
    const imgW = Math.ceil((GW + GH) * HX + PAD * 2), imgH = Math.ceil((GW + GH) * HY + PAD * 2 + TOPM + RIM);
    const ox = GH * HX + PAD, oy = PAD + TOPM;
    const iso = (gx, gy, h) => [(gx - gy) * HX + ox, (gx + gy) * HY - h * HU + oy];
    const img = mk(imgW, imgH), x = img.getContext('2d');
    // --- khung gỗ & cạnh bàn ---
    const m = 2.2;
    const A = iso(-m, -m, 0), B = iso(GW + m, -m, 0), Cc = iso(GW + m, GH + m, 0), D = iso(-m, GH + m, 0);
    const wood = x.createLinearGradient(0, D[1], 0, D[1] + RIM);
    wood.addColorStop(0, '#5a3418'); wood.addColorStop(1, '#2a160a');
    x.fillStyle = wood;
    x.beginPath(); x.moveTo(D[0], D[1]); x.lineTo(Cc[0], Cc[1]); x.lineTo(Cc[0], Cc[1] + RIM); x.lineTo(D[0], D[1] + RIM); x.closePath(); x.fill();
    const wood2 = x.createLinearGradient(0, B[1], 0, B[1] + RIM); wood2.addColorStop(0, '#47280f'); wood2.addColorStop(1, '#1e1006');
    x.fillStyle = wood2;
    x.beginPath(); x.moveTo(Cc[0], Cc[1]); x.lineTo(B[0], B[1]); x.lineTo(B[0], B[1] + RIM); x.lineTo(Cc[0], Cc[1] + RIM); x.closePath(); x.fill();
    // vân gỗ
    x.strokeStyle = 'rgba(20,8,2,0.35)'; x.lineWidth = 1;
    for (let k = 1; k < 9; k++) {
      const f = k / 9;
      x.beginPath(); x.moveTo(D[0], D[1] + RIM * f); x.lineTo(Cc[0], Cc[1] + RIM * f + Math.sin(k) * 2); x.lineTo(B[0], B[1] + RIM * f); x.stroke();
    }
    // nẹp đồng
    x.strokeStyle = '#c9963c'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(D[0], D[1] + 6); x.lineTo(Cc[0], Cc[1] + 6); x.lineTo(B[0], B[1] + 6); x.stroke();
    x.beginPath(); x.moveTo(D[0], D[1] + RIM - 6); x.lineTo(Cc[0], Cc[1] + RIM - 6); x.lineTo(B[0], B[1] + RIM - 6); x.stroke();
    // mặt viền
    const top = x.createLinearGradient(A[0], A[1], Cc[0], Cc[1]); top.addColorStop(0, '#6d4220'); top.addColorStop(1, '#4a2a12');
    x.fillStyle = top;
    x.beginPath(); x.moveTo(A[0], A[1]); x.lineTo(B[0], B[1]); x.lineTo(Cc[0], Cc[1]); x.lineTo(D[0], D[1]); x.closePath(); x.fill();
    const a2 = iso(-0.6, -0.6, 0), b2 = iso(GW + 0.6, -0.6, 0), c2 = iso(GW + 0.6, GH + 0.6, 0), d2 = iso(-0.6, GH + 0.6, 0);
    x.strokeStyle = '#d6a648'; x.lineWidth = 2.5;
    x.beginPath(); x.moveTo(a2[0], a2[1]); x.lineTo(b2[0], b2[1]); x.lineTo(c2[0], c2[1]); x.lineTo(d2[0], d2[1]); x.closePath(); x.stroke();
    // các góc đồng
    for (const P of [A, B, Cc, D]) { x.fillStyle = '#b8862f'; x.beginPath(); x.ellipse(P[0], P[1], 16, 8, 0, 0, TAU); x.fill(); x.fillStyle = '#e8c06a'; x.beginPath(); x.ellipse(P[0], P[1] - 2, 9, 4.5, 0, 0, TAU); x.fill(); }
    // --- địa hình ---
    const COL = {}; COL[T.SEA] = [38, 66, 74]; COL[T.LAKE] = [52, 92, 102]; COL[T.PLAIN] = [184, 156, 100]; COL[T.FOREST] = [112, 120, 70];
    COL[T.HILL] = [164, 132, 88]; COL[T.MOUNT] = [140, 116, 86]; COL[T.DESERT] = [206, 178, 120]; COL[T.STEPPE] = [170, 162, 104];
    const nc = pres.map(p => U.hexToRgb(p.color));
    // màu từng ô rồi làm mịn (tránh răng cưa kiểu ô vuông)
    const isW = tt => tt === T.SEA || tt === T.LAKE;
    const raw = new Array(GW * GH);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const tt = cellT(i, j); let c = COL[tt] || COL[T.PLAIN];
      const mi = Math.min(map.H - 1, j * STEP) * map.W + Math.min(map.W - 1, i * STEP);
      const pv = map.prov[mi], ow = pv >= 0 ? map.owners[pv] : -1;
      if (!isW(tt) && ow >= 0 && nc[ow]) c = U.mix(c, nc[ow], 0.24);
      if (tt === T.SEA) c = U.mix(c, [20, 40, 48], N.n2(i * 0.15, j * 0.15) * 0.5);
      raw[j * GW + i] = c;
    }
    const smooth = new Array(GW * GH);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const w0 = isW(cellT(i, j)); let r = 0, g2 = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x2 = i + dx, y2 = j + dy; if (x2 < 0 || y2 < 0 || x2 >= GW || y2 >= GH || isW(cellT(x2, y2)) !== w0) continue; const c = raw[y2 * GW + x2]; r += c[0]; g2 += c[1]; b += c[2]; n++; }
      smooth[j * GW + i] = [r / n, g2 / n, b / n];
    }
    for (let d = 0; d <= GW + GH - 2; d++) {
      for (let i = Math.max(0, d - GH + 1); i <= Math.min(GW - 1, d); i++) {
        const j = d - i;
        const h00 = vh(i, j), h10 = vh(i + 1, j), h11 = vh(i + 1, j + 1), h01 = vh(i, j + 1);
        const tt = cellT(i, j);
        const sx = (h10 + h11 - h00 - h01) / 2, sy = (h01 + h11 - h00 - h10) / 2;
        const shade = U.clamp(1.02 - (sx + sy) * 0.11, 0.55, 1.4);
        let c = smooth[j * GW + i];
        const hm = (h00 + h10 + h11 + h01) / 4;
        if (hm > 8.5) c = U.mix(c, [226, 214, 190], U.clamp((hm - 8.5) / 3, 0, 0.75));
        const col = U.rgbStr([c[0] * shade, c[1] * shade, c[2] * shade]);
        const p0 = iso(i, j, h00), p1 = iso(i + 1, j, h10), p2 = iso(i + 1, j + 1, h11), p3 = iso(i, j + 1, h01);
        x.fillStyle = col; x.strokeStyle = col; x.lineWidth = 0.8;
        x.beginPath(); x.moveTo(p0[0], p0[1]); x.lineTo(p1[0], p1[1]); x.lineTo(p2[0], p2[1]); x.lineTo(p3[0], p3[1]); x.closePath(); x.fill(); x.stroke();
      }
    }
    // ánh sơn mài trên biển
    x.save(); x.globalCompositeOperation = 'lighter'; x.strokeStyle = 'rgba(120,170,170,0.07)'; x.lineWidth = 1;
    for (let k = 0; k < 140; k++) { const gx = (k * 37) % GW, gy = (k * 53) % GH; if (cellT(gx, gy) !== T.SEA) continue; const p = iso(gx, gy, 0); x.beginPath(); x.moveTo(p[0] - 14, p[1]); x.quadraticCurveTo(p[0], p[1] - 3, p[0] + 14, p[1]); x.stroke(); }
    x.restore();
    // sông
    x.lineJoin = 'round'; x.lineCap = 'round';
    for (const r of map.rivers) {
      const pts = U.chaikin(r.pts, false, 2);
      x.strokeStyle = '#4d8796'; x.lineWidth = 2.2;
      x.beginPath();
      pts.forEach((q, k) => { const gx = q[0] / STEP, gy = q[1] / STEP; const p = iso(gx, gy, hAt(gx, gy) + 0.15); if (k) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); });
      x.stroke();
      x.strokeStyle = 'rgba(170,215,225,0.6)'; x.lineWidth = 0.8; x.stroke();
    }
    // các thành trì (mô hình nhỏ) + kinh đô
    const cities = [];
    map.provinces.forEach((p, k) => {
      if (!map.mainland || p.cx === undefined) return;
      const gx = (p.cx + 0.5) / STEP, gy = (p.cy + 0.5) / STEP; const h = hAt(gx, gy);
      const P = iso(gx, gy, h); const cap = map.capitals.indexOf(k);
      cities.push({ x: P[0], y: P[1], cap, owner: map.owners[k], gx, gy, h, name: p.name });
    });
    cities.sort((a, b) => a.y - b.y);
    for (const c of cities) {
      const s = c.cap >= 0 ? 1.6 : 1;
      x.fillStyle = '#d8c7a0'; x.strokeStyle = '#3a2614'; x.lineWidth = 1;
      x.fillRect(c.x - 5 * s, c.y - 6 * s, 10 * s, 6 * s); x.strokeRect(c.x - 5 * s, c.y - 6 * s, 10 * s, 6 * s);
      x.fillStyle = c.cap >= 0 ? '#8b2a1e' : '#5a3a26';
      x.beginPath(); x.moveTo(c.x - 7 * s, c.y - 6 * s); x.quadraticCurveTo(c.x, c.y - 11 * s, c.x + 7 * s, c.y - 6 * s); x.lineTo(c.x + 4 * s, c.y - 8 * s); x.lineTo(c.x - 4 * s, c.y - 8 * s); x.closePath(); x.fill();
    }
    // bản đồ lụa trải ở hai góc trước của bàn (trong hệ tọa độ ảnh)
    const silk = (cx, cy, w, h, rot, seed) => {
      x.save(); x.translate(cx, cy); x.transform(1, 0.5, -1, 0.5, 0, 0); x.rotate(rot);
      const gg = x.createLinearGradient(-w / 2, 0, w / 2, 0); gg.addColorStop(0, '#e9d7aa'); gg.addColorStop(0.5, '#f4e6c2'); gg.addColorStop(1, '#dcc493');
      x.fillStyle = gg; x.fillRect(-w / 2, -h / 2, w, h);
      x.fillStyle = '#7a2a1a'; x.fillRect(-w / 2 - 4, -h / 2 - 3, 4, h + 6); x.fillRect(w / 2, -h / 2 - 3, 4, h + 6);
      const rr = U.rng(seed); x.strokeStyle = 'rgba(70,40,20,0.55)'; x.lineWidth = 1.2;
      for (let k = 0; k < 6; k++) { x.beginPath(); let px = -w / 2 + 8; x.moveTo(px, -h / 2 + 10 + k * (h - 20) / 6); for (let q = 0; q < 8; q++) { px += w / 9; x.lineTo(px, -h / 2 + 10 + k * (h - 20) / 6 + (rr() - 0.5) * 8); } x.stroke(); }
      x.fillStyle = 'rgba(160,30,20,0.8)'; x.fillRect(w / 2 - 18, -h / 2 + 6, 10, 10);
      x.restore();
    };
    const fl = iso(-1.3, GH * 0.62, 0), fr = iso(GW * 0.68, GH + 1.3, 0);
    silk(fl[0] + 4, fl[1] + 4, 70, 38, 0.05, 3);
    silk(fr[0] + 6, fr[1] - 2, 64, 36, -0.08, 9);
    // dữ liệu động
    const caps = map.capitals.map((k, n) => { const p = map.provinces[k]; const gx = (p.cx + 0.5) / STEP, gy = (p.cy + 0.5) / STEP; const P = iso(gx, gy, hAt(gx, gy)); return { x: P[0], y: P[1] - 8, n, pre: pres[n] }; });
    const corners = [A, B, Cc, D].map(P => ({ x: P[0], y: P[1] }));
    // địa danh cho các cảnh
    const pick = (test, score) => {
      let best = null, bs = -1e9;
      for (let i = 0; i < map.W * map.H; i += 1) {
        if (!map.mainland[i] || !test(i)) continue;
        const s = score(i); if (s > bs) { bs = s; best = i; }
      }
      if (best === null) best = map.provinces[map.capitals[0]].cy * map.W + map.provinces[map.capitals[0]].cx;
      const cx = best % map.W, cy = (best / map.W) | 0; const gx = (cx + 0.5) / STEP, gy = (cy + 0.5) / STEP; const P = iso(gx, gy, hAt(gx, gy));
      return { x: P[0], y: P[1] };
    };
    const ctr = [map.W / 2, map.H / 2];
    const dC = i => -Math.hypot(i % map.W - ctr[0], ((i / map.W) | 0) - ctr[1]);
    const near = (i, tt, r) => { const x0 = i % map.W, y0 = (i / map.W) | 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x0 + dx, yy = y0 + dy; if (xx >= 0 && yy >= 0 && xx < map.W && yy < map.H && map.ter[yy * map.W + xx] === tt) return true; } return false; };
    const pois = {
      pass: pick(i => map.ter[i] === T.MOUNT && near(i, T.PLAIN, 2), i => dC(i) * 0.6 - (i % map.W) * 0.2),
      plain: pick(i => (map.ter[i] === T.PLAIN || map.ter[i] === T.STEPPE) && !near(i, T.MOUNT, 4) && !near(i, T.SEA, 6), i => dC(i) + ((i / map.W) | 0) * -0.3),
      siege: (() => { const c = caps[2] || caps[0]; return { x: c.x, y: c.y + 8 }; })(),
      river: pick(i => map.river[i] && map.flow[i] > 8 && !near(i, T.SEA, 3), i => map.flow[i] * 0.05 + dC(i) * 0.3),
    };
    return { map, img, imgW, imgH, caps, corners, pois, pres, fitZ: 0 };
  }

  // ================= Phòng: đại bản doanh =================
  function buildRoom() {
    const c = mk(VW, VH), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, '#120a07'); g.addColorStop(0.55, '#2a170d'); g.addColorStop(1, '#0c0604');
    x.fillStyle = g; x.fillRect(0, 0, VW, VH);
    // khung cửa sổ song gỗ, ánh trăng
    const wx = 760, wy = 60, ww = 400, wh = 230;
    const mg = x.createLinearGradient(0, wy, 0, wy + wh); mg.addColorStop(0, 'rgba(110,130,170,0.28)'); mg.addColorStop(1, 'rgba(60,70,100,0.08)');
    x.fillStyle = mg; x.fillRect(wx, wy, ww, wh);
    x.strokeStyle = '#2a160b'; x.lineWidth = 7;
    for (let k = 0; k <= 8; k++) { x.beginPath(); x.moveTo(wx + k * ww / 8, wy); x.lineTo(wx + k * ww / 8, wy + wh); x.stroke(); }
    for (let k = 0; k <= 5; k++) { x.beginPath(); x.moveTo(wx, wy + k * wh / 5); x.lineTo(wx + ww, wy + k * wh / 5); x.stroke(); }
    x.lineWidth = 14; x.strokeStyle = '#3b1d0e'; x.strokeRect(wx, wy, ww, wh);
    // cột sơn son
    for (const px of [120, VW - 200]) {
      const cg = x.createLinearGradient(px, 0, px + 80, 0); cg.addColorStop(0, '#2c0806'); cg.addColorStop(0.45, '#6e1610'); cg.addColorStop(1, '#250605');
      x.fillStyle = cg; x.fillRect(px, 0, 80, VH);
      x.fillStyle = '#b8862f'; for (const by of [140, 150, 760, 770]) x.fillRect(px - 4, by, 88, 5);
    }
    // xà ngang
    const bg = x.createLinearGradient(0, 0, 0, 50); bg.addColorStop(0, '#1c0c06'); bg.addColorStop(1, '#4a2410');
    x.fillStyle = bg; x.fillRect(0, 0, VW, 46); x.fillStyle = '#b8862f'; x.fillRect(0, 44, VW, 4);
    // sàn
    const fg = x.createLinearGradient(0, 760, 0, VH); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,0.75)');
    x.fillStyle = fg; x.fillRect(0, 760, VW, VH - 760);
    return c;
  }
  function drawBanner(x, cx, top, w, h, col, ch, tt, sway) {
    x.save(); x.translate(cx, top);
    x.fillStyle = '#5a3a14'; x.fillRect(-w / 2 - 10, -6, w + 20, 8);
    const n = 14;
    x.beginPath(); x.moveTo(-w / 2, 0); x.lineTo(w / 2, 0);
    for (let k = 1; k <= n; k++) { const y = h * k / n; const dx = Math.sin(tt * 1.3 + k * 0.5) * sway * (k / n); x.lineTo(w / 2 + dx, y); }
    x.lineTo(dxAt(n) + 0, h + 26); x.lineTo(-w / 2 + dxAt(n), h);
    for (let k = n; k >= 1; k--) { const y = h * k / n; const dx = Math.sin(tt * 1.3 + k * 0.5) * sway * (k / n); x.lineTo(-w / 2 + dx, y); }
    x.closePath();
    function dxAt(k) { return Math.sin(tt * 1.3 + k * 0.5) * sway; }
    const g = x.createLinearGradient(-w / 2, 0, w / 2, 0); g.addColorStop(0, U.shade(col, -0.35)); g.addColorStop(0.5, col); g.addColorStop(1, U.shade(col, -0.45));
    x.fillStyle = g; x.fill();
    x.strokeStyle = '#d6a648'; x.lineWidth = 3; x.stroke();
    x.fillStyle = '#f0d48a'; x.font = `${Math.round(w * 0.72)}px ${CN}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(ch, Math.sin(tt * 1.3 + 4) * sway * 0.4, h * 0.42);
    x.restore();
  }
  function drawDing(x, cx, by, s, tt) {
    x.save(); x.translate(cx, by); x.scale(s, s);
    const br = x.createLinearGradient(-120, 0, 120, 0); br.addColorStop(0, '#2c1d0b'); br.addColorStop(0.35, '#a67a35'); br.addColorStop(0.55, '#d7a95a'); br.addColorStop(1, '#2a1a09');
    // chân
    x.fillStyle = '#3a2810';
    for (const lx of [-80, 0, 80]) { x.beginPath(); x.moveTo(lx - 12, -40); x.lineTo(lx + 12, -40); x.lineTo(lx + 8 + (lx ? Math.sign(lx) * 10 : 0), 60); x.lineTo(lx - 8 + (lx ? Math.sign(lx) * 10 : 0), 60); x.closePath(); x.fill(); }
    // thân
    x.fillStyle = br; x.beginPath(); x.moveTo(-120, -160); x.bezierCurveTo(-125, -40, -80, -20, 0, -20); x.bezierCurveTo(80, -20, 125, -40, 120, -160); x.closePath(); x.fill();
    // hoa văn rồng (thao thiết) đơn giản
    x.strokeStyle = 'rgba(60,90,70,0.6)'; x.lineWidth = 3;
    for (let k = 0; k < 7; k++) { x.beginPath(); x.arc(-90 + k * 30, -110, 9, 0, Math.PI * 1.5); x.stroke(); }
    x.strokeStyle = 'rgba(40,25,10,0.7)'; x.lineWidth = 2; x.beginPath(); x.moveTo(-118, -135); x.lineTo(118, -135); x.stroke(); x.beginPath(); x.moveTo(-112, -85); x.lineTo(112, -85); x.stroke();
    // miệng
    x.fillStyle = '#1a1006'; x.beginPath(); x.ellipse(0, -160, 120, 22, 0, 0, TAU); x.fill();
    x.strokeStyle = '#d7a95a'; x.lineWidth = 5; x.stroke();
    // quai
    x.strokeStyle = br; x.lineWidth = 12;
    for (const sx of [-1, 1]) { x.beginPath(); x.moveTo(sx * 70, -175); x.lineTo(sx * 70, -225); x.lineTo(sx * 105, -225); x.lineTo(sx * 105, -172); x.stroke(); }
    // nhang
    x.lineWidth = 2.5;
    for (let k = -2; k <= 2; k++) { x.strokeStyle = '#7a2a12'; x.beginPath(); x.moveTo(k * 14, -165); x.lineTo(k * 16, -240 - Math.abs(k) * 6); x.stroke(); x.fillStyle = `rgba(255,${120 + 60 * Math.sin(tt * 3 + k)},40,1)`; x.beginPath(); x.arc(k * 16, -241 - Math.abs(k) * 6, 3.2, 0, TAU); x.fill(); }
    x.restore();
  }

  // ================= Hệ hạt =================
  function PS() { this.p = []; }
  PS.prototype.add = function (o) { this.p.push(o); if (this.p.length > 1400) this.p.shift(); };
  PS.prototype.step = function (dt) {
    const p = this.p;
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; q.age += dt; if (q.age >= q.life) { p.splice(i, 1); continue; } q.x += q.vx * dt; q.y += q.vy * dt; q.vx += (q.ax || 0) * dt; q.vy += (q.ay || 0) * dt; }
  };
  PS.prototype.draw = function (x, img, comp) {
    x.save(); if (comp) x.globalCompositeOperation = comp;
    for (const q of this.p) {
      const f = q.age / q.life; const a = (q.a || 1) * (f < 0.15 ? f / 0.15 : 1 - (f - 0.15) / 0.85);
      if (a <= 0.01) continue;
      const r = q.r * (1 + f * (q.grow || 0));
      x.globalAlpha = a;
      x.drawImage(q.img || img, q.x - r, q.y - r, r * 2, r * 2);
    }
    x.restore();
  };

  // ================= Hình dáng nhân vật =================
  function soldier(x, px, py, s, ph, col, spear) {
    const sw = Math.sin(ph) * 3 * s;
    x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 2.2 * s; x.lineCap = 'round';
    x.beginPath(); x.moveTo(px, py - 9 * s); x.lineTo(px + sw, py); x.moveTo(px, py - 9 * s); x.lineTo(px - sw, py); x.stroke();
    x.beginPath(); x.moveTo(px - 3.2 * s, py - 9 * s); x.lineTo(px + 3.2 * s, py - 9 * s); x.lineTo(px + 2.4 * s, py - 19 * s); x.lineTo(px - 2.4 * s, py - 19 * s); x.closePath(); x.fill();
    x.beginPath(); x.arc(px, py - 22 * s, 2.8 * s, 0, TAU); x.fill();
    x.beginPath(); x.moveTo(px - 4 * s, py - 23.5 * s); x.lineTo(px, py - 27 * s); x.lineTo(px + 4 * s, py - 23.5 * s); x.fill();
    if (spear !== false) { x.lineWidth = 1.1 * s; x.beginPath(); x.moveTo(px + 3 * s, py - 6 * s); x.lineTo(px + 6 * s, py - 44 * s); x.stroke(); x.beginPath(); x.moveTo(px + 6 * s, py - 44 * s); x.lineTo(px + 4.6 * s, py - 38 * s); x.lineTo(px + 7.6 * s, py - 38.6 * s); x.closePath(); x.fill(); }
  }
  function horse(x, px, py, s, ph, col, dir, lance) {
    x.save(); x.translate(px, py); x.scale(dir * s, s);
    x.fillStyle = col; x.strokeStyle = col; x.lineCap = 'round';
    // chân (phi nước đại)
    x.lineWidth = 2.6;
    const L = (bx, a) => { x.beginPath(); x.moveTo(bx, -14); x.lineTo(bx + Math.sin(a) * 9, -6); x.lineTo(bx + Math.sin(a) * 9 + Math.cos(a) * 4, 0); x.stroke(); };
    L(-12, ph); L(-8, ph + 0.7); L(12, ph + 3.3); L(16, ph + 4.0);
    x.beginPath(); x.ellipse(0, -18, 19, 7.5, 0, 0, TAU); x.fill();
    x.beginPath(); x.moveTo(13, -21); x.lineTo(24, -34 + Math.sin(ph) * 1.5); x.lineTo(31, -31 + Math.sin(ph) * 1.5); x.lineTo(30, -27); x.lineTo(20, -18); x.closePath(); x.fill();
    x.lineWidth = 3; x.beginPath(); x.moveTo(-18, -20); x.quadraticCurveTo(-28, -18 + Math.sin(ph * 2) * 3, -30, -8); x.stroke();
    // kỵ sĩ
    x.beginPath(); x.moveTo(-4, -24); x.lineTo(4, -24); x.lineTo(3, -38); x.lineTo(-3, -38); x.closePath(); x.fill();
    x.beginPath(); x.arc(0, -41, 3.4, 0, TAU); x.fill();
    if (lance) { x.lineWidth = 1.4; x.beginPath(); x.moveTo(-6, -30); x.lineTo(40, -44); x.stroke(); }
    x.restore();
  }
  // Bóng tướng quân trên ngựa (cận cảnh) — vẽ bằng đường cong
  function generalRider(x, px, py, sc, tt, col) {
    const sw = Math.sin(tt * 2.2), sw2 = Math.sin(tt * 3.1 + 1);
    x.save(); x.translate(px, py); x.scale(sc, sc);
    x.fillStyle = col; x.strokeStyle = col; x.lineCap = 'round'; x.lineJoin = 'round';
    // đuôi ngựa bay
    x.lineWidth = 20; x.beginPath(); x.moveTo(-150, -160); x.bezierCurveTo(-190 - sw * 8, -150, -215 - sw * 14, -90, -205 - sw * 18, -30); x.stroke();
    x.lineWidth = 8; x.beginPath(); x.moveTo(-160, -150); x.bezierCurveTo(-210 - sw * 10, -130, -235 - sw * 16, -70, -232 - sw * 22, -20); x.stroke();
    // chân
    const leg = (x0, y0, x1, y1, x2, w) => { x.lineWidth = w; x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo(x1, y1, x2, -4); x.stroke(); x.lineWidth = w * 1.2; x.beginPath(); x.moveTo(x2 - 4, -8); x.lineTo(x2 + 8, -2); x.stroke(); };
    leg(-118, -120, -146, -62, -126, 18); leg(-86, -112, -70, -60, -84, 16);
    leg(96, -118, 112, -60, 104, 17); leg(66, -112, 82 + sw2 * 6, -70, 58 + sw2 * 10, 15);
    // thân
    x.beginPath(); x.moveTo(-160, -145);
    x.bezierCurveTo(-170, -185, -100, -192, -40, -185); x.bezierCurveTo(10, -182, 40, -196, 62, -196);
    x.bezierCurveTo(100, -238, 130, -280, 150, -302);   // gáy
    x.lineTo(150, -326); x.lineTo(160, -306);           // tai
    x.bezierCurveTo(185, -300, 205, -280, 228, -238);   // trán → mũi
    x.quadraticCurveTo(232, -224, 214, -222);           // mõm
    x.bezierCurveTo(196, -230, 182, -238, 172, -242);   // hàm
    x.bezierCurveTo(158, -210, 140, -160, 120, -128);   // cổ trước → ngực
    x.bezierCurveTo(90, -100, 0, -96, -60, -104); x.bezierCurveTo(-110, -108, -150, -112, -160, -145);
    x.closePath(); x.fill();
    // bờm
    x.lineWidth = 7; for (let k = 0; k < 6; k++) { const f = k / 6; const mx = lerp(66, 146, f), my = lerp(-200, -298, f); x.beginPath(); x.moveTo(mx, my); x.quadraticCurveTo(mx - 24 - sw * 6, my + 6, mx - 34 - sw * 10, my + 22); x.stroke(); }
    // kỵ sĩ: áo choàng bay
    x.beginPath(); x.moveTo(-14, -292); x.bezierCurveTo(-80, -300 - sw * 6, -160 - sw * 20, -268, -190 - sw * 26, -222 + sw2 * 8);
    x.bezierCurveTo(-150, -190, -90, -176, -20, -200); x.closePath(); x.fill();
    // thân người, giáp
    x.beginPath(); x.moveTo(-26, -196); x.lineTo(28, -196); x.lineTo(24, -262); x.quadraticCurveTo(30, -290, 4, -296); x.quadraticCurveTo(-30, -292, -26, -262); x.closePath(); x.fill();
    x.lineWidth = 14; x.beginPath(); x.moveTo(8, -200); x.quadraticCurveTo(30, -170, 22, -128); x.stroke(); // chân
    x.beginPath(); x.arc(2, -314, 19, 0, TAU); x.fill();                                                   // đầu
    x.beginPath(); x.moveTo(-22, -318); x.quadraticCurveTo(2, -350, 26, -318); x.closePath(); x.fill();    // mũ trụ
    x.lineWidth = 5; x.beginPath(); x.moveTo(2, -342); x.bezierCurveTo(-10, -380, -40 - sw * 10, -386, -64 - sw * 16, -372); x.stroke(); // chùm lông
    // tay & trường thương
    x.lineWidth = 11; x.beginPath(); x.moveTo(14, -280); x.quadraticCurveTo(46, -262, 56, -238); x.stroke();
    x.lineWidth = 5; x.beginPath(); x.moveTo(30, -150); x.lineTo(104, -520); x.stroke();
    x.beginPath(); x.moveTo(104, -520); x.lineTo(96, -560); x.lineTo(114, -548); x.closePath(); x.fill();
    x.fillStyle = '#8b1a12'; x.beginPath(); x.moveTo(101, -506); x.quadraticCurveTo(80 - sw * 8, -490, 74 - sw * 12, -470); x.lineTo(98, -494); x.closePath(); x.fill();
    x.restore();
  }
  function flagCloth(x, px, py, w, h, col, ch, tt, dir, font) {
    const n = 10; dir = dir || 1;
    x.beginPath(); x.moveTo(px, py);
    for (let k = 1; k <= n; k++) { const f = k / n; x.lineTo(px + dir * w * f, py + Math.sin(tt * 6 - k * 0.8) * h * 0.12 * f); }
    for (let k = n; k >= 0; k--) { const f = k / n; x.lineTo(px + dir * w * f, py + h + Math.sin(tt * 6 - k * 0.8 + 0.6) * h * 0.12 * f); }
    x.closePath(); x.fillStyle = col; x.fill();
    if (ch) { x.fillStyle = 'rgba(255,240,200,0.92)'; x.font = `${Math.round(h * 0.7)}px ${font || CN}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, px + dir * w * 0.45, py + h * 0.5 + Math.sin(tt * 6 - 4) * h * 0.06); }
  }
  function roof(x, cx, y, w, h, col) {
    x.fillStyle = col; x.beginPath();
    x.moveTo(cx - w / 2 - w * 0.12, y + h * 0.15); x.quadraticCurveTo(cx - w * 0.35, y + h * 0.55, cx - w * 0.3, y);
    x.lineTo(cx + w * 0.3, y); x.quadraticCurveTo(cx + w * 0.35, y + h * 0.55, cx + w / 2 + w * 0.12, y + h * 0.15);
    x.lineTo(cx + w * 0.4, y + h); x.lineTo(cx - w * 0.4, y + h); x.closePath(); x.fill();
    x.fillRect(cx - w * 0.3, y - h * 0.35, w * 0.6, h * 0.4);
  }
  function ridgeLine(seed, base, amp, freq, sharp) {
    const N = new U.Noise(seed), pts = [];
    for (let px = -500; px <= VW + 500; px += 10) { const n = sharp ? N.ridge(px * freq, seed, 4) : N.fbm(px * freq, seed, 5); pts.push([px, base - n * amp]); }
    return pts;
  }
  function fillRidge(x, pts, col, bottom) {
    x.fillStyle = col; x.beginPath(); x.moveTo(pts[0][0], bottom);
    for (const p of pts) x.lineTo(p[0], p[1]);
    x.lineTo(pts[pts.length - 1][0], bottom); x.closePath(); x.fill();
  }
  // Lớp parallax: d = độ sâu (0 xa vô cực … 1 mặt phẳng tiêu cự … >1 tiền cảnh)
  function layer(cam, d, fn) {
    ctx.save();
    const s = 1 + (cam.z - 1) * d;
    ctx.translate(VW / 2, VH / 2); ctx.scale(s, s); ctx.translate(-VW / 2 - cam.x * d, -VH / 2 - cam.y * d);
    fn(); ctx.restore();
  }
  const camAt = (keys, p) => { // keys: [[p, x, y, z], ...]
    let a = keys[0], b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) if (p >= keys[i][0] && p <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; break; }
    const f = ease2(clamp01((p - a[0]) / Math.max(1e-6, b[0] - a[0])));
    return { x: lerp(a[1], b[1], f), y: lerp(a[2], b[2], f), z: Math.exp(lerp(Math.log(a[3]), Math.log(b[3]), f)) };
  };

  // ================= Các cảnh =================
  const SC = {};
  // --- Sa bàn ---
  function tableScene(tt, dt, cam, opt) {
    const w = world, sp = world.sp;
    ctx.fillStyle = '#0b0604'; ctx.fillRect(0, 0, VW, VH);
    // phòng (parallax nhẹ)
    const zr = cam.z / w.fitZ;
    ctx.save(); ctx.globalAlpha = clamp01(1.6 - zr * 0.45);
    ctx.translate(VW / 2, VH / 2); ctx.scale(1 + (zr - 1) * 0.08, 1 + (zr - 1) * 0.08); ctx.translate(-VW / 2 - (cam.x - w.imgW / 2) * 0.04, -VH / 2);
    ctx.drawImage(w.room, 0, 0);
    drawBanner(ctx, 330, 70, 120, 430, '#7d1a12', '戰', tt, 9);
    drawBanner(ctx, VW - 330, 70, 120, 430, '#7d1a12', '國', tt + 1.7, 9);
    ctx.restore();
    // bàn
    ctx.save();
    ctx.translate(VW / 2, VH / 2 + 40); ctx.scale(cam.z, cam.z * cam.tilt); ctx.translate(-cam.x, -cam.y);
    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 40 * cam.z; ctx.shadowOffsetY = 20 * cam.z;
    ctx.drawImage(w.img, 0, 0);
    ctx.shadowColor = 'transparent';
    // cờ chư hầu
    for (const c of w.caps) {
      const pre = c.pre; if (!pre) continue;
      ctx.strokeStyle = '#2a1608'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(c.x, c.y + 6); ctx.lineTo(c.x, c.y - 44); ctx.stroke();
      ctx.fillStyle = '#d6a648'; ctx.beginPath(); ctx.arc(c.x, c.y - 45, 1.8, 0, TAU); ctx.fill();
      flagCloth(ctx, c.x, c.y - 43, 30, 20, pre.color, pre.char, tt + c.n, 1);
      ctx.strokeStyle = 'rgba(30,15,5,0.6)'; ctx.lineWidth = 0.6; ctx.stroke();
    }
    // địa danh được chọn
    if (opt && opt.poi) {
      const P = opt.poi, a = opt.poiA || 0;
      if (a > 0) {
        ctx.save(); ctx.globalAlpha = a;
        const pr = 1 + 0.15 * Math.sin(tt * 4);
        ctx.strokeStyle = '#d23a22'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(P.x, P.y, 14 * pr, 7 * pr, 0, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,220,140,0.8)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(P.x, P.y, 22 * pr, 11 * pr, 0, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }
    // nến bốn góc
    for (const k of w.corners) {
      ctx.fillStyle = '#e9dcc0'; ctx.fillRect(k.x - 5, k.y - 30, 10, 26);
      ctx.fillStyle = '#c9b48a'; ctx.beginPath(); ctx.ellipse(k.x, k.y - 30, 5, 2, 0, 0, TAU); ctx.fill();
      const fl = 1 + 0.18 * Math.sin(tt * 13 + k.x) + 0.1 * Math.sin(tt * 29 + k.y);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(sp.glow, k.x - 90 * fl, k.y - 120 * fl, 180 * fl, 180 * fl);
      ctx.drawImage(sp.flame, k.x - 5 * fl, k.y - 46 * fl, 10 * fl, 18 * fl);
      ctx.restore();
    }
    ctx.restore();
    // đỉnh đồng tiền cảnh + khói hương
    const fa = clamp01(2.1 - zr * 0.7);
    if (fa > 0) {
      const sh = -(cam.x - w.imgW / 2) * 0.12 * cam.z;
      ctx.save(); ctx.globalAlpha = fa;
      const ds = 1.15 + zr * 0.08;
      drawDing(ctx, 170 + sh, VH - 70, ds, tt);
      drawDing(ctx, VW - 170 + sh, VH - 70, ds, tt + 1);
      ctx.restore();
      if (!world.smoke) world.smoke = new PS();
      const smk = world.smoke;
      for (const bx of [170 + sh, VW - 170 + sh]) for (let k = -2; k <= 2; k++) if (Math.random() < dt * 9) smk.add({ x: bx + k * 16 * ds, y: VH - 70 - (241 + Math.abs(k) * 6) * ds, vx: (Math.random() - 0.5) * 8, vy: -40 - Math.random() * 25, ax: Math.sin(tt + k) * 10, ay: -2, r: 6 + Math.random() * 6, grow: 5, life: 5 + Math.random() * 2, a: 0.42 * fa, age: 0 });
      smk.step(dt);
      for (const q of smk.p) q.vx += Math.sin(tt * 1.4 + q.y * 0.012) * 18 * dt;
      smk.draw(ctx, sp.smoke);
    }
    // ánh nến lung linh toàn cảnh
    const flick = 0.1 + 0.05 * Math.sin(tt * 7.3) + 0.04 * Math.sin(tt * 17.1);
    ctx.fillStyle = `rgba(0,0,0,${flick})`; ctx.fillRect(0, 0, VW, VH);
    ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = 'rgba(255,140,50,0.35)'; ctx.fillRect(0, 0, VW, VH); ctx.restore();
  }
  const tcam = (x, y, z, tilt) => ({ x, y, z, tilt: tilt || 1 });
  function tableKeys(keys, p) { // keys: [[p, x, y, zMul, tilt]]
    let a = keys[0], b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) if (p >= keys[i][0] && p <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; break; }
    const f = (a[5] === 'in' ? (q => q * q * q) : ease)(clamp01((p - a[0]) / Math.max(1e-6, b[0] - a[0])));
    const z0 = world.fitZ;
    return tcam(lerp(a[1], b[1], f), lerp(a[2], b[2], f), z0 * Math.exp(lerp(Math.log(a[3]), Math.log(b[3]), f)), lerp(a[4] || 1, b[4] || 1, f));
  }

  // --- Ải Hàm Cốc (bình minh) ---
  function skyGrad(stops, y0, y1) { const g = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }
  function buildPass() {
    const R = [ridgeLine(31, 560, 260, 0.0021, true), ridgeLine(32, 640, 240, 0.0028, true), ridgeLine(33, 720, 230, 0.0035, true)];
    const near = ridgeLine(34, 800, 260, 0.003, true);
    for (const p of near) { const d = (p[0] - 1250) / 140; p[1] += 200 * Math.exp(-d * d); }
    const road = [[260, 1180], [700, 980], [1050, 900], [1250, 800]];
    return { R, near, road };
  }
  const bez = (P, u) => { const v = 1 - u; return [v * v * v * P[0][0] + 3 * v * v * u * P[1][0] + 3 * v * u * u * P[2][0] + u * u * u * P[3][0], v * v * v * P[0][1] + 3 * v * v * u * P[1][1] + 3 * v * u * u * P[2][1] + u * u * u * P[3][1]]; };
  SC.pass = function (tt, dt, p) {
    const A = world.pass, sp = world.sp;
    const cam = camAt([[0, 0, 0, 1], [1, -140, 60, 1.28]], p);
    ctx.fillStyle = skyGrad([[0, '#1d1b33'], [0.45, '#6b3c52'], [0.75, '#d0704a'], [1, '#f6c27a']], 0, 760); ctx.fillRect(0, 0, VW, VH);
    layer(cam, 0.05, () => {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(sp.glow, 1460 - 420, 470 - 420, 840, 840);
      ctx.fillStyle = 'rgba(255,236,190,0.95)'; ctx.beginPath(); ctx.arc(1460, 470, 46, 0, TAU); ctx.fill();
      for (let k = 0; k < 7; k++) { const a = -2.4 + k * 0.32 + Math.sin(tt * 0.3 + k) * 0.03; ctx.fillStyle = 'rgba(255,200,140,0.035)'; ctx.beginPath(); ctx.moveTo(1460, 470); ctx.lineTo(1460 + Math.cos(a) * 2400, 470 + Math.sin(a) * 2400); ctx.lineTo(1460 + Math.cos(a + 0.09) * 2400, 470 + Math.sin(a + 0.09) * 2400); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    });
    const cols = ['#8a6d80', '#5e4a63', '#3c2f45'];
    A.R.forEach((r, k) => layer(cam, 0.15 + k * 0.15, () => {
      fillRidge(ctx, r, cols[k], 1400);
      const mg = ctx.createLinearGradient(0, r[0][1] - 40, 0, r[0][1] + 120); mg.addColorStop(0, 'rgba(255,215,190,0)'); mg.addColorStop(1, 'rgba(255,210,180,0.32)');
      ctx.fillStyle = mg; ctx.fillRect(-600, 420 + k * 70, VW + 1200, 260);
    }));
    // sương trôi
    layer(cam, 0.55, () => { ctx.save(); for (let k = 0; k < 9; k++) { const mx = ((k * 330 + tt * 22) % 2600) - 400; ctx.globalAlpha = 0.25; ctx.drawImage(sp.mist, mx, 640 + (k % 3) * 40, 520, 90); } ctx.restore(); });
    // núi gần + cửa ải
    layer(cam, 0.7, () => {
      fillRidge(ctx, A.near, '#22171f', 1400);
      const gx = 1250, gy = 760;
      ctx.fillStyle = '#1a1117'; ctx.fillRect(gx - 160, gy - 70, 320, 80);
      for (let k = 0; k < 16; k++) ctx.fillRect(gx - 160 + k * 20, gy - 82, 12, 14);
      ctx.fillStyle = '#120c10'; ctx.fillRect(gx - 50, gy - 150, 100, 80); roof(ctx, gx, gy - 190, 170, 44, '#120c10'); roof(ctx, gx, gy - 232, 110, 34, '#120c10');
      ctx.fillStyle = '#0a0608'; ctx.beginPath(); ctx.arc(gx, gy + 10, 30, Math.PI, 0); ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const lx of [-36, 36]) { ctx.drawImage(sp.glow, gx + lx - 24, gy - 140 - 24, 48, 48); ctx.fillStyle = '#ffb35a'; ctx.beginPath(); ctx.arc(gx + lx, gy - 140, 3.5, 0, TAU); ctx.fill(); }
      ctx.restore();
      ctx.strokeStyle = '#120c10'; ctx.lineWidth = 2; for (const fx of [-140, 140]) { ctx.beginPath(); ctx.moveTo(gx + fx, gy - 80); ctx.lineTo(gx + fx, gy - 150); ctx.stroke(); flagCloth(ctx, gx + fx, gy - 150, 34, 22, '#2b2b33', '秦', tt + fx, 1); }
      ctx.fillStyle = '#7b2a1f'; ctx.font = `30px ${CN}`; ctx.textAlign = 'center'; ctx.fillText('函谷關', gx, gy - 105);
    });
    // đường & đoàn quân
    layer(cam, 0.85, () => {
      const gg = ctx.createLinearGradient(0, 760, 0, VH); gg.addColorStop(0, '#2a1c1c'); gg.addColorStop(1, '#100a0a');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.moveTo(-500, 1400); ctx.lineTo(-500, 900); ctx.quadraticCurveTo(600, 820, 1250, 790); ctx.quadraticCurveTo(1900, 820, 2500, 900); ctx.lineTo(2500, 1400); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(200,150,110,0.22)'; ctx.lineWidth = 60; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(A.road[0][0], A.road[0][1]); ctx.bezierCurveTo(A.road[1][0], A.road[1][1], A.road[2][0], A.road[2][1], A.road[3][0], A.road[3][1]); ctx.stroke();
      const n = 150;
      for (let i = n - 1; i >= 0; i--) {
        const u = ((i / n) + tt * 0.012) % 1; const P = bez(A.road, u), s = lerp(1.7, 0.42, u);
        const lane = ((i % 3) - 1) * 16 * s;
        const ph = tt * 7 + i * 1.7;
        if (i % 13 === 0) { ctx.strokeStyle = '#140c0c'; ctx.lineWidth = 1.5 * s; ctx.beginPath(); ctx.moveTo(P[0] + lane, P[1]); ctx.lineTo(P[0] + lane, P[1] - 70 * s); ctx.stroke(); flagCloth(ctx, P[0] + lane, P[1] - 70 * s, 22 * s, 15 * s, i % 26 === 0 ? '#2b2b33' : '#7d1a12', '秦', tt + i, 1); }
        soldier(ctx, P[0] + lane, P[1], s, ph, '#140c0c');
      }
    });
    // chim
    layer(cam, 0.4, () => {
      ctx.strokeStyle = '#1a1018'; ctx.lineWidth = 2;
      for (let k = 0; k < 9; k++) { const bx = 300 + ((tt * 60 + k * 60) % 1800), by = 300 + Math.sin(k * 2) * 40 + (k % 3) * 18; const f = Math.sin(tt * 9 + k) * 6; ctx.beginPath(); ctx.moveTo(bx - 9, by - f); ctx.lineTo(bx, by); ctx.lineTo(bx + 9, by - f); ctx.stroke(); }
    });
    // tiền cảnh: vách đá & cành tùng
    layer(cam, 1.25, () => {
      ctx.fillStyle = '#080506'; ctx.beginPath(); ctx.moveTo(1500, 1400); ctx.lineTo(1580, 1000); ctx.lineTo(1700, 930); ctx.lineTo(1850, 960); ctx.lineTo(2100, 880); ctx.lineTo(2400, 1400); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#080506'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(1780, 960); ctx.quadraticCurveTo(1650, 760, 1480, 700); ctx.stroke();
      for (let k = 0; k < 10; k++) { const bx = 1500 + k * 28, by = 700 + Math.sin(k) * 30 + k * 18; ctx.fillStyle = '#0c0809'; ctx.beginPath(); ctx.ellipse(bx, by, 46, 13, -0.2 + Math.sin(tt + k) * 0.03, 0, TAU); ctx.fill(); }
    });
  };
  SC.passClose = function (tt, dt, p) {
    const sp = world.sp;
    const cam = camAt([[0, 0, 0, 1], [1, 40, -20, 1.14]], p);
    ctx.fillStyle = skyGrad([[0, '#2a2236'], [0.5, '#a3554a'], [1, '#f2b46e']], 0, VH); ctx.fillRect(0, 0, VW, VH);
    layer(cam, 0.05, () => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(sp.glow, 1350 - 600, 650 - 600, 1200, 1200); ctx.restore(); });
    layer(cam, 0.2, () => fillRidge(ctx, world.pass.R[0].map(q => [q[0], q[1] + 300]), '#6e5266', 1400));
    layer(cam, 0.35, () => fillRidge(ctx, world.pass.R[1].map(q => [q[0], q[1] + 330]), '#3e2f42', 1400));
    // đại kỳ chữ Tần
    layer(cam, 0.9, () => {
      ctx.strokeStyle = '#120a0a'; ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(1160, 1200); ctx.lineTo(1160, 120); ctx.stroke();
      ctx.fillStyle = '#c9963c'; ctx.beginPath(); ctx.moveTo(1160, 90); ctx.lineTo(1146, 126); ctx.lineTo(1174, 126); ctx.closePath(); ctx.fill();
      flagCloth(ctx, 1160, 140, 620, 420, '#1d1d24', '秦', tt * 0.55, 1);
      ctx.strokeStyle = '#7d1a12'; ctx.lineWidth = 10; ctx.stroke();
    });
    // tướng quân trên lưng ngựa
    layer(cam, 1.05, () => {
      generalRider(ctx, 470, 1010, 1.55, tt, '#0c0707');
      for (let k = 0; k < 12; k++) soldier(ctx, 900 + k * 70 + Math.sin(k) * 20, 1080 + (k % 2) * 30, 4.2, tt * 5 + k, '#0d0808');
    });
    // bụi gió
    if (!world.dustC) world.dustC = new PS();
    const ds = world.dustC; if (Math.random() < dt * 20) ds.add({ x: -100, y: 600 + Math.random() * 500, vx: 260 + Math.random() * 200, vy: -10, r: 60 + Math.random() * 80, grow: 1, life: 6, a: 0.25, age: 0 });
    ds.step(dt); ds.draw(ctx, sp.dust);
  };

  // --- Trường Bình (thiết kỵ lúc hoàng hôn) ---
  function buildPlain() {
    const r = U.rng(5); const cav = [];
    for (let i = 0; i < 70; i++) { const y = 700 + r() * 320; cav.push({ x0: 1900 + r() * 1100, y, sp: 330 + r() * 120, ph: r() * 6 }); }
    cav.sort((a, b) => a.y - b.y);
    return { cav, hills: ridgeLine(41, 640, 70, 0.002, false), dust: new PS(), arrows: [] };
  }
  SC.plain = function (tt, dt, p) {
    const B = world.plain, sp = world.sp;
    const cam = camAt([[0, 260, 0, 1.06], [1, -200, 20, 1.22]], p);
    ctx.fillStyle = skyGrad([[0, '#2c1f1f'], [0.55, '#8c5a3a'], [1, '#e2a15e']], 0, 650); ctx.fillRect(0, 0, VW, VH);
    layer(cam, 0.05, () => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(sp.glow, 960 - 500, 560 - 500, 1000, 1000); ctx.restore(); ctx.fillStyle = 'rgba(255,220,170,0.75)'; ctx.beginPath(); ctx.arc(960, 560, 70, 0, TAU); ctx.fill(); });
    layer(cam, 0.2, () => fillRidge(ctx, B.hills, '#4a3226', 1400));
    layer(cam, 0.6, () => {
      const g = ctx.createLinearGradient(0, 630, 0, VH); g.addColorStop(0, '#6a4a30'); g.addColorStop(1, '#22160d'); ctx.fillStyle = g; ctx.fillRect(-800, 630, VW + 1600, 800);
      // trận phương bộ binh (Triệu)
      for (let row = 0; row < 7; row++) for (let c = 0; c < 26; c++) {
        const y = 690 + row * 22, s = 0.75 + row * 0.12, x0 = -150 + c * 26 + row * 6;
        soldier(ctx, x0, y, s, Math.sin(tt * 2 + c) * 0.2, '#160d0a');
      }
      for (let c = 0; c < 6; c++) { const fx = -120 + c * 120; ctx.strokeStyle = '#160d0a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx, 700); ctx.lineTo(fx, 600); ctx.stroke(); flagCloth(ctx, fx, 600, 40, 28, '#5b2c6f', '趙', tt + c, 1); }
    });
    // kỵ binh phi (Tần) + bụi
    layer(cam, 0.85, () => {
      for (const h of B.cav) {
        const x = h.x0 - h.sp * tt; if (x < -400 || x > 2600) continue;
        const s = lerp(0.9, 2.2, (h.y - 700) / 320);
        horse(ctx, x, h.y, s, tt * 14 + h.ph, '#120a07', -1, true);
        if (Math.random() < dt * 6) B.dust.add({ x: x + 30 * s, y: h.y - 6 * s, vx: 40 + Math.random() * 40, vy: -20 - Math.random() * 20, r: 20 * s, grow: 3, life: 2.5, a: 0.35, age: 0 });
        if (h.ph < 0.6) { ctx.strokeStyle = '#120a07'; ctx.lineWidth = 1.5 * s; ctx.beginPath(); ctx.moveTo(x, h.y - 40 * s); ctx.lineTo(x, h.y - 80 * s); ctx.stroke(); flagCloth(ctx, x, h.y - 80 * s, 26 * s, 18 * s, '#2b2b33', '秦', tt + h.ph, -1); }
      }
      B.dust.step(dt); B.dust.draw(ctx, sp.dust);
      // mưa tên
      for (const vol of [1.5, 4.2, 6.8]) {
        const k = tt - vol; if (k < 0 || k > 1.6) continue;
        ctx.strokeStyle = 'rgba(20,12,8,0.9)'; ctx.lineWidth = 1.6;
        for (let i = 0; i < 90; i++) {
          const f = k / 1.6, x0 = 100 + (i * 37) % 500, x1 = 1000 + (i * 53) % 900, y0 = 680, y1 = 760 + (i * 29) % 240;
          const x = lerp(x0, x1, f), y = lerp(y0, y1, f) - Math.sin(f * Math.PI) * 360;
          const ang = Math.atan2((y1 - y0) / 1.6 - Math.cos(f * Math.PI) * 360 * Math.PI / 1.6, (x1 - x0) / 1.6);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(ang) * 16, y - Math.sin(ang) * 16); ctx.stroke();
        }
      }
    });
    ctx.fillStyle = 'rgba(160,110,60,0.12)'; ctx.fillRect(0, 0, VW, VH);
  };
  SC.plainClose = function (tt, dt, p) {
    const sp = world.sp;
    const cam = camAt([[0, 0, 0, 1.05], [1, 0, 0, 1.12]], p);
    const shake = Math.sin(tt * 47) * 3 + Math.sin(tt * 31) * 2;
    ctx.fillStyle = skyGrad([[0, '#3a2620'], [0.6, '#b0703c'], [1, '#d99858']], 0, VH); ctx.fillRect(0, 0, VW, VH);
    layer(cam, 0.1, () => fillRidge(ctx, world.plain.hills.map(q => [q[0], q[1] + 120]), '#4f3528', 1400));
    layer({ x: cam.x, y: cam.y + shake, z: cam.z }, 1, () => {
      const g = ctx.createLinearGradient(0, 760, 0, VH); g.addColorStop(0, '#5a3d26'); g.addColorStop(1, '#1d130b'); ctx.fillStyle = g; ctx.fillRect(-400, 760, VW + 800, 600);
      const lanes = [{ y: 820, s: 4, n: 4, sp: 520 }, { y: 930, s: 6.5, n: 3, sp: 760 }, { y: 1100, s: 10, n: 2, sp: 1100 }];
      for (const L of lanes) for (let i = 0; i < L.n; i++) {
        const span = VW + 1200; const x = VW + 600 - ((tt * L.sp + i * span / L.n) % span);
        for (let b = 2; b >= 0; b--) { ctx.globalAlpha = b ? 0.18 : 1; horse(ctx, x + b * 14 * L.s / 4, L.y, L.s, tt * 15 + i, '#0e0805', -1, true); }
        ctx.globalAlpha = 1;
        if (Math.random() < dt * 14) world.plain.dust.add({ x: x + 25 * L.s, y: L.y - 5 * L.s, vx: 60, vy: -30, r: 14 * L.s, grow: 2.5, life: 1.8, a: 0.4, age: 0 });
      }
      world.plain.dust.step(dt); world.plain.dust.draw(ctx, sp.dust);
    });
  };

  // --- Đại Lương (công thành ban đêm) ---
  function buildSiege() {
    const r = U.rng(8); const roofs = [];
    for (let i = 0; i < 26; i++) roofs.push({ x: -300 + i * 100 + r() * 40, y: 520 - r() * 90, w: 90 + r() * 80, h: 30 + r() * 20, lit: r() < 0.5 });
    return { roofs, fire: new PS(), smoke: new PS(), embers: new PS(), wallFires: [180, 520, 1380, 1700, 2050].map(x => ({ x })) };
  }
  function wallFire(ps, x, y, dt, rate, size) {
    if (Math.random() < dt * rate) ps.add({ x: x + (Math.random() - 0.5) * size, y, vx: (Math.random() - 0.5) * 20, vy: -60 - Math.random() * 60, r: size * (0.5 + Math.random() * 0.5), grow: -0.5, life: 0.7 + Math.random() * 0.5, a: 0.9, age: 0 });
  }
  SC.siege = function (tt, dt, p) {
    const Cc = world.siege, sp = world.sp;
    const cam = camAt([[0, 0, 0, 1], [1, 0, -50, 1.24]], p);
    ctx.fillStyle = skyGrad([[0, '#0c0610'], [0.55, '#36121c'], [1, '#8a2e18']], 0, 620); ctx.fillRect(0, 0, VW, VH);
    layer(cam, 0.05, () => {
      ctx.fillStyle = 'rgba(240,226,190,0.85)'; ctx.beginPath(); ctx.arc(1500, 190, 46, 0, TAU); ctx.fill();
      ctx.save(); ctx.globalAlpha = 0.6; for (let k = 0; k < 5; k++) ctx.drawImage(sp.dsmoke, ((k * 400 + tt * 15) % 2400) - 300, 140 + k * 20, 600, 120); ctx.restore();
    });
    // khói cột từ trong thành
    layer(cam, 0.4, () => {
      for (const sx of [300, 820, 1240, 1650]) if (Math.random() < dt * 7) Cc.smoke.add({ x: sx + Math.random() * 60, y: 520, vx: 10 + Math.random() * 10, vy: -55 - Math.random() * 20, r: 50, grow: 4, life: 9, a: 0.55, age: 0 });
      Cc.smoke.step(dt); Cc.smoke.draw(ctx, sp.dsmoke);
      for (const rf of Cc.roofs) { ctx.fillStyle = '#16090c'; ctx.fillRect(rf.x - rf.w * 0.35, rf.y, rf.w * 0.7, 120); roof(ctx, rf.x, rf.y - rf.h, rf.w, rf.h, '#16090c'); if (rf.lit) { ctx.fillStyle = 'rgba(255,150,60,0.8)'; ctx.fillRect(rf.x - 8, rf.y + 20, 16, 12); } }
    });
    layer(cam, 0.7, () => {
      const top = 560, bot = 790;
      const wg = ctx.createLinearGradient(0, top, 0, bot); wg.addColorStop(0, '#3a2320'); wg.addColorStop(1, '#1a0f0e');
      ctx.fillStyle = wg; ctx.fillRect(-500, top, VW + 1000, bot - top);
      ctx.fillStyle = '#2a1816'; for (let k = -25; k < 120; k++) ctx.fillRect(k * 24, top - 18, 15, 18);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; for (let y = top + 20; y < bot; y += 20) { ctx.beginPath(); ctx.moveTo(-500, y); ctx.lineTo(VW + 500, y); ctx.stroke(); }
      // lầu cổng
      ctx.fillStyle = '#1c100e'; ctx.fillRect(820, top - 120, 280, 130); roof(ctx, 960, top - 175, 380, 60, '#120909'); roof(ctx, 960, top - 240, 250, 46, '#120909');
      ctx.fillStyle = '#080404'; ctx.beginPath(); ctx.moveTo(900, bot); ctx.lineTo(900, top + 90); ctx.arc(960, top + 90, 60, Math.PI, 0); ctx.lineTo(1020, bot); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c9963c'; ctx.font = `34px ${CN}`; ctx.textAlign = 'center'; ctx.fillText('大梁', 960, top - 70);
      // thang & lính trèo
      for (const lx of [300, 640, 1280, 1580]) {
        ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(lx - 50, bot + 10); ctx.lineTo(lx, top - 10); ctx.moveTo(lx - 20, bot + 10); ctx.lineTo(lx + 30, top - 10); ctx.stroke();
        for (let k = 0; k < 3; k++) { const f = ((tt * 0.18 + k / 3 + lx) % 1); soldier(ctx, lerp(lx - 35, lx + 12, f), lerp(bot, top + 10, f), 1.1, tt * 6 + k, '#0b0505', false); }
      }
      // tháp công thành
      const tx = 440 + Math.min(p, 1) * 40;
      ctx.fillStyle = '#2b1a0e'; ctx.fillRect(tx - 50, top - 80, 100, bot - top + 90); ctx.strokeStyle = '#140b05'; ctx.lineWidth = 3; for (let y = top - 70; y < bot; y += 26) { ctx.beginPath(); ctx.moveTo(tx - 50, y); ctx.lineTo(tx + 50, y); ctx.stroke(); }
      roof(ctx, tx, top - 110, 130, 30, '#1a0f07');
      // lửa trên tường
      for (const f of Cc.wallFires) wallFire(Cc.fire, f.x, top - 10, dt, 40, 26);
      wallFire(Cc.fire, 960, top - 130, dt, 30, 40);
      Cc.fire.step(dt);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const f of Cc.wallFires) ctx.drawImage(sp.glow, f.x - 160, top - 170, 320, 320);
      Cc.fire.draw(ctx, sp.flame, 'lighter'); ctx.restore();
    });
    // quân công thành tiền cảnh + hỏa tiễn
    layer(cam, 1.05, () => {
      for (let i = 0; i < 70; i++) { const x = -200 + i * 34 + Math.sin(i * 7) * 10, y = 960 + (i % 4) * 34; soldier(ctx, x, y, 2.4 + (i % 4) * 0.35, Math.sin(tt * 3 + i) * 0.3, '#050303'); }
      for (let c = 0; c < 7; c++) { const fx = -100 + c * 330; ctx.strokeStyle = '#050303'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(fx, 1000); ctx.lineTo(fx, 820); ctx.stroke(); flagCloth(ctx, fx, 820, 70, 48, '#6e1610', '魏', tt + c, 1); }
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) {
        const per = 2.2, k = ((tt + i * 0.37) % per) / per; const x0 = 100 + (i * 83) % 1700, x1 = 300 + (i * 131) % 1400;
        const x = lerp(x0, x1, k), y = lerp(950, 560, k) - Math.sin(k * Math.PI) * 260;
        ctx.drawImage(sp.flame, x - 8, y - 8, 16, 16);
        ctx.strokeStyle = 'rgba(255,170,80,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (x1 - x0) * 0.03, y + 20 - Math.cos(k * Math.PI) * 20); ctx.stroke();
      }
      ctx.restore();
    });
    // tàn lửa
    if (Math.random() < dt * 40) Cc.embers.add({ x: Math.random() * VW, y: VH + 10, vx: (Math.random() - 0.3) * 40, vy: -80 - Math.random() * 120, r: 2 + Math.random() * 3, grow: 0, life: 5, a: 1, age: 0 });
    Cc.embers.step(dt); Cc.embers.draw(ctx, sp.flame, 'lighter');
  };
  SC.siegeClose = function (tt, dt, p) {
    const Cc = world.siege, sp = world.sp;
    const per = 1.8, ph = (tt % per) / per;
    // con lắc: lùi xa (ph≈0.25) rồi lao vào cổng (ph≈0.75)
    const swing = Math.sin(ph * TAU);
    const hit = ph > 0.72 && ph < 0.8;
    const sh = hit ? (Math.random() - 0.5) * 22 : 0;
    const cam = camAt([[0, 60, 30, 1.02], [1, 0, -10, 1.14]], p);
    ctx.fillStyle = '#120708'; ctx.fillRect(0, 0, VW, VH);
    layer({ x: cam.x + sh, y: cam.y + sh, z: cam.z }, 1, () => {
      // tường gạch, hắt ánh lửa từ trên xuống
      const wg = ctx.createLinearGradient(0, -200, 0, 950); wg.addColorStop(0, '#6a3420'); wg.addColorStop(0.35, '#3a2019'); wg.addColorStop(1, '#1c100d');
      ctx.fillStyle = wg; ctx.fillRect(-300, -200, VW + 600, 1150);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
      for (let y = -200; y < 900; y += 46) { ctx.beginPath(); ctx.moveTo(-300, y); ctx.lineTo(VW + 300, y); ctx.stroke(); for (let x = -300 + ((y / 46) % 2) * 45; x < VW + 300; x += 90) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 46); ctx.stroke(); } }
      // vòm cổng
      ctx.fillStyle = '#0d0605'; ctx.beginPath(); ctx.moveTo(560, 950); ctx.lineTo(560, 260); ctx.quadraticCurveTo(960, 40, 1360, 260); ctx.lineTo(1360, 950); ctx.closePath(); ctx.fill();
      // cánh cổng gỗ đinh sắt
      const dg = ctx.createLinearGradient(620, 0, 1300, 0); dg.addColorStop(0, '#2c180b'); dg.addColorStop(0.5, '#5a3216'); dg.addColorStop(1, '#2a160a');
      ctx.fillStyle = dg; ctx.beginPath(); ctx.moveTo(610, 950); ctx.lineTo(610, 290); ctx.quadraticCurveTo(960, 110, 1310, 290); ctx.lineTo(1310, 950); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3; for (let x = 650; x < 1300; x += 44) { ctx.beginPath(); ctx.moveTo(x, 250); ctx.lineTo(x, 950); ctx.stroke(); }
      ctx.strokeStyle = '#140904'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(960, 170); ctx.lineTo(960, 950); ctx.stroke();
      ctx.fillStyle = '#1a0f08'; for (const by of [380, 620, 860]) ctx.fillRect(610, by, 700, 26);
      ctx.fillStyle = '#8a7a5a'; for (const by of [393, 633, 873]) for (let x = 640; x < 1300; x += 70) { ctx.beginPath(); ctx.arc(x, by, 8, 0, TAU); ctx.fill(); }
      // vết nứt dần theo thời gian
      ctx.strokeStyle = 'rgba(255,170,80,' + (0.25 + 0.5 * p) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(960, 600); ctx.lineTo(990, 560 - 60 * p); ctx.lineTo(1020, 540 - 90 * p); ctx.moveTo(960, 610); ctx.lineTo(925, 660 + 50 * p); ctx.stroke();
      if (hit) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(sp.glow, 990 - 320, 640 - 320, 640, 640); ctx.restore(); }
      // mặt đất
      const gg = ctx.createLinearGradient(0, 940, 0, 1300); gg.addColorStop(0, '#2a1610'); gg.addColorStop(1, '#070302'); ctx.fillStyle = gg; ctx.fillRect(-300, 940, VW + 600, 400);
      // xe phá thành: mái che + trục gỗ treo
      const rx = 1040 + (swing + 1) * 120;
      ctx.fillStyle = '#140b06'; ctx.beginPath(); ctx.moveTo(1050, 470); ctx.lineTo(1980, 470); ctx.lineTo(2060, 560); ctx.lineTo(1000, 560); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2a1608'; ctx.lineWidth = 3; for (let x = 1060; x < 2000; x += 30) { ctx.beginPath(); ctx.moveTo(x, 474); ctx.lineTo(x - 40, 556); ctx.stroke(); }
      ctx.strokeStyle = '#140b06'; ctx.lineWidth = 16; for (const px of [1100, 1900]) { ctx.beginPath(); ctx.moveTo(px, 540); ctx.lineTo(px, 1010); ctx.stroke(); }
      ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(1350, 556); ctx.lineTo(rx + 160, 700); ctx.moveTo(1650, 556); ctx.lineTo(rx + 460, 700); ctx.stroke();
      const lg = ctx.createLinearGradient(0, 680, 0, 730); lg.addColorStop(0, '#6b4220'); lg.addColorStop(1, '#2c1a0b');
      ctx.fillStyle = lg; ctx.fillRect(rx, 680, 640, 50);
      ctx.fillStyle = '#7d7a70'; ctx.beginPath(); ctx.moveTo(rx + 4, 668); ctx.lineTo(rx - 50, 705); ctx.lineTo(rx + 4, 742); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3a3a36'; for (const bx of [rx + 120, rx + 300, rx + 480]) ctx.fillRect(bx, 676, 14, 58);
      for (let k = 0; k < 7; k++) soldier(ctx, 1150 + k * 100 + swing * 50, 1085, 5.2, swing * 2 + k, '#060202', false);
      if (hit && !Cc._hit) for (let k = 0; k < 26; k++) Cc.embers.add({ x: 1000, y: 700, vx: -Math.random() * 600 + 150, vy: -Math.random() * 500, ay: 900, r: 3 + Math.random() * 6, grow: 0, life: 1.1, a: 1, age: 0 });
    });
    // lửa & khói trên đỉnh tường
    for (let k = 0; k < 9; k++) wallFire(Cc.fire, 60 + k * 230 + Math.sin(k * 3) * 40, 70, dt, 34, 90);
    if (Math.random() < dt * 6) Cc.smoke.add({ x: Math.random() * VW, y: 40, vx: 20, vy: -30, r: 120, grow: 2, life: 4, a: 0.5, age: 0 });
    Cc.smoke.step(dt); Cc.smoke.draw(ctx, sp.dsmoke);
    Cc.fire.step(dt); Cc.fire.draw(ctx, sp.flame, 'lighter');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const tg = ctx.createLinearGradient(0, 0, 0, 500); tg.addColorStop(0, 'rgba(255,120,40,0.35)'); tg.addColorStop(1, 'rgba(255,120,40,0)'); ctx.fillStyle = tg; ctx.fillRect(0, 0, VW, 500); ctx.restore();
    // mưa tên từ trên thành
    ctx.strokeStyle = 'rgba(20,10,6,0.9)'; ctx.lineWidth = 2;
    for (let i = 0; i < 40; i++) { const k = ((tt * 0.9 + i * 0.137) % 1); const x = 200 + (i * 211) % 1600 + k * 120, y = -50 + k * 1200; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 10, y - 40); ctx.stroke(); }
    Cc.embers.step(dt); Cc.embers.draw(ctx, sp.flame, 'lighter');
    if (hit && !Cc._hit) { Cc._hit = true; if (mode !== 'ambient' && CW.Audio) CW.Audio.sfx('siege', true); } else if (!hit) Cc._hit = false;
  };

  // --- Xích Bích (hỏa thiêu chiến thuyền) ---
  function buildRiver() {
    const r = U.rng(12); const stars = []; for (let i = 0; i < 160; i++) stars.push([r() * VW * 1.4 - 200, r() * 520, r() * 1.6 + 0.4, r() * 6]);
    const ships = []; for (let i = 0; i < 8; i++) ships.push({ x: -100 + i * 260 + r() * 40, y: 690 + (i % 3) * 40 + r() * 20, s: 0.9 + r() * 0.35, burn: i % 3 !== 1 });
    ships.sort((a, b) => a.y - b.y);
    return { stars, ships, fire: new PS(), smoke: new PS(), embers: new PS(), cliff: ridgeLine(51, 360, 140, 0.004, true) };
  }
  function ship(x, s, burning, tt, R, sp, dt) {
    ctx.save(); ctx.translate(x.x, x.y); ctx.scale(s, s);
    const bob = Math.sin(tt * 1.3 + x.x) * 3;
    ctx.translate(0, bob);
    ctx.fillStyle = '#0d0a0a'; ctx.beginPath(); ctx.moveTo(-110, -10); ctx.quadraticCurveTo(-130, -40, -140, -46); ctx.lineTo(140, -46); ctx.quadraticCurveTo(130, -30, 110, 0); ctx.closePath(); ctx.fill();
    ctx.fillRect(-70, -86, 120, 40); roof(ctx, -10, -108, 150, 22, '#0d0a0a'); ctx.fillRect(-40, -130, 70, 24); roof(ctx, -5, -146, 100, 18, '#0d0a0a');
    ctx.strokeStyle = '#0d0a0a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(60, -46); ctx.lineTo(60, -250); ctx.stroke();
    ctx.fillStyle = burning ? '#2a140c' : '#3a2a20'; ctx.beginPath(); ctx.moveTo(62, -240); ctx.lineTo(150, -230); ctx.lineTo(140, -70); ctx.lineTo(62, -60); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2; for (let k = 0; k < 6; k++) { const y = -230 + k * 30; ctx.beginPath(); ctx.moveTo(62, y); ctx.lineTo(148 - k * 1.5, y + 2); ctx.stroke(); }
    ctx.restore();
    if (burning) {
      for (let k = 0; k < 3; k++) wallFire(R.fire, x.x + (40 + k * 30) * s, x.y + (-80 - k * 50) * s + bob, dt, 26, 30 * s);
      wallFire(R.fire, x.x - 20 * s, x.y - 60 * s + bob, dt, 18, 34 * s);
      if (Math.random() < dt * 4) R.smoke.add({ x: x.x + 60 * s, y: x.y - 220 * s, vx: 30, vy: -40, r: 40 * s, grow: 4, life: 7, a: 0.5, age: 0 });
      // phản chiếu dưới nước
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const rg = ctx.createLinearGradient(0, x.y, 0, x.y + 260 * s); rg.addColorStop(0, 'rgba(255,130,40,0.35)'); rg.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = rg; for (let k = 0; k < 7; k++) ctx.fillRect(x.x + (-60 + k * 22 + Math.sin(tt * 3 + k) * 6) * s, x.y, 10 * s, 260 * s);
      ctx.drawImage(sp.glow, x.x - 220 * s, x.y - 330 * s, 440 * s, 440 * s);
      ctx.restore();
    }
  }
  SC.river = function (tt, dt, p) {
    const R = world.river, sp = world.sp;
    const cam = camAt([[0, -160, 0, 1.08], [1, 160, -20, 1.16]], p);
    ctx.fillStyle = skyGrad([[0, '#04060f'], [0.7, '#141a35'], [1, '#2c2440']], 0, 650); ctx.fillRect(0, 0, VW, VH);
    layer(cam, 0.02, () => {
      for (const s of R.stars) { ctx.fillStyle = `rgba(230,230,255,${0.4 + 0.4 * Math.sin(tt * 2 + s[3])})`; ctx.fillRect(s[0], s[1], s[2], s[2]); }
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(sp.mist, 400 - 160, 180 - 160, 320, 320); ctx.restore();
      ctx.fillStyle = '#efe6cc'; ctx.beginPath(); ctx.arc(400, 180, 40, 0, TAU); ctx.fill();
    });
    layer(cam, 0.25, () => fillRidge(ctx, ridgeLine(52, 650, 90, 0.003, false), '#0f1022', 1400));
    // vách Xích Bích
    layer(cam, 0.55, () => {
      const pts = R.cliff.map(q => [q[0] + 1300, q[1]]).filter(q => q[0] > 1250);
      ctx.fillStyle = '#3a1612'; ctx.beginPath(); ctx.moveTo(1250, 700); for (const q of pts) ctx.lineTo(q[0], q[1]); ctx.lineTo(2600, 700); ctx.closePath(); ctx.fill();
      const lg = ctx.createLinearGradient(1250, 0, 1900, 0); lg.addColorStop(0, 'rgba(255,110,40,0.28)'); lg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = lg; ctx.fill();
      ctx.fillStyle = '#b8322a'; ctx.font = `92px ${CN}`; ctx.textAlign = 'center'; ctx.fillText('赤', 1560, 470); ctx.fillText('壁', 1560, 580);
    });
    // mặt sông
    layer(cam, 0.75, () => {
      const wg = ctx.createLinearGradient(0, 640, 0, VH); wg.addColorStop(0, '#0e1530'); wg.addColorStop(1, '#03050c'); ctx.fillStyle = wg; ctx.fillRect(-600, 640, VW + 1200, 700);
      ctx.strokeStyle = 'rgba(150,170,220,0.12)'; ctx.lineWidth = 1.5; for (let k = 0; k < 60; k++) { const y = 650 + k * 8, x = ((k * 97 + tt * 30) % 2400) - 300; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 60 + (k % 5) * 20, y); ctx.stroke(); }
      R.smoke.step(dt); R.smoke.draw(ctx, sp.dsmoke);
      for (const s of R.ships) ship(s, s.s, s.burn, tt, R, sp, dt);
      // thuyền lửa
      for (let k = 0; k < 4; k++) { const x = -200 + ((tt * 140 + k * 500) % 2400), y = 900 + k * 30; ctx.fillStyle = '#0a0606'; ctx.beginPath(); ctx.moveTo(x - 50, y - 12); ctx.lineTo(x + 50, y - 12); ctx.lineTo(x + 36, y); ctx.lineTo(x - 36, y); ctx.closePath(); ctx.fill(); wallFire(R.fire, x, y - 14, dt, 30, 30); }
      R.fire.step(dt); R.fire.draw(ctx, sp.flame, 'lighter');
    });
    if (Math.random() < dt * 30) R.embers.add({ x: Math.random() * VW, y: 800 + Math.random() * 200, vx: 60 + Math.random() * 60, vy: -60 - Math.random() * 80, r: 2 + Math.random() * 2.5, life: 5, a: 1, age: 0 });
    R.embers.step(dt); R.embers.draw(ctx, sp.flame, 'lighter');
  };
  SC.riverClose = function (tt, dt, p) {
    const R = world.river, sp = world.sp;
    const cam = camAt([[0, 0, 0, 1], [1, -30, 10, 1.12]], p);
    ctx.fillStyle = skyGrad([[0, '#05060e'], [1, '#3a1a14']], 0, VH); ctx.fillRect(0, 0, VW, VH);
    layer(cam, 0.1, () => { for (const s of R.stars) { ctx.fillStyle = 'rgba(230,230,255,0.5)'; ctx.fillRect(s[0], s[1] * 0.6, s[2], s[2]); } });
    layer(cam, 0.6, () => {
      // cánh buồm cháy lớn
      ctx.fillStyle = '#2a1209'; ctx.beginPath(); ctx.moveTo(900, 40); ctx.lineTo(1700, 90); ctx.lineTo(1650, 760); ctx.lineTo(920, 720); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#0b0503'; ctx.lineWidth = 8; for (let k = 0; k < 8; k++) { ctx.beginPath(); ctx.moveTo(900, 60 + k * 90); ctx.lineTo(1690, 100 + k * 88); ctx.stroke(); }
      ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(880, 0); ctx.lineTo(880, 1100); ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(sp.glow, 1000 - 500, 420 - 500, 1100, 1000); ctx.restore();
      // lửa bén từ mép dưới cánh buồm lan lên, vị trí ngẫu nhiên
      for (let k = 0; k < 4; k++) { const u = Math.random(), v = Math.pow(Math.random(), 0.6); wallFire(R.fire, lerp(930, 1660, u), lerp(720, 120 + 600 * (1 - p) * 0.6, v), dt, 70, 50 + Math.random() * 50); }
    });
    layer(cam, 1, () => {
      const wg = ctx.createLinearGradient(0, 860, 0, VH); wg.addColorStop(0, '#1a0f14'); wg.addColorStop(1, '#030205'); ctx.fillStyle = wg; ctx.fillRect(-300, 860, VW + 600, 400);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,120,40,0.18)'; for (let k = 0; k < 14; k++) ctx.fillRect(950 + k * 50 + Math.sin(tt * 2 + k) * 10, 870, 18, 240); ctx.restore();
      // mũi thuyền + tướng quân
      ctx.fillStyle = '#070404'; ctx.beginPath(); ctx.moveTo(-200, 1100); ctx.lineTo(-200, 820); ctx.lineTo(560, 780); ctx.quadraticCurveTo(700, 770, 760, 700); ctx.lineTo(720, 880); ctx.lineTo(500, 1100); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.translate(420, 790); ctx.scale(8.5, 8.5);
      ctx.fillStyle = '#070404';
      ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-2, -16); ctx.lineTo(2, -16); ctx.lineTo(4, 0); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-5, -16); ctx.lineTo(5, -16); ctx.lineTo(4, -30); ctx.lineTo(-4, -30); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -33, 3.2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-3, -29); ctx.quadraticCurveTo(-18 - Math.sin(tt * 4) * 3, -24, -22 - Math.sin(tt * 3) * 4, -6); ctx.lineTo(-4, -16); ctx.closePath(); ctx.fill();
      ctx.lineWidth = 0.9; ctx.strokeStyle = '#070404'; ctx.beginPath(); ctx.moveTo(4, -26); ctx.lineTo(8, 2); ctx.stroke();
      ctx.restore();
    });
    R.fire.step(dt); R.fire.draw(ctx, sp.flame, 'lighter');
    if (Math.random() < dt * 50) R.embers.add({ x: 900 + Math.random() * 900, y: 600 + Math.random() * 300, vx: -80 + Math.random() * 60, vy: -100 - Math.random() * 100, r: 2 + Math.random() * 3, life: 4, a: 1, age: 0 });
    R.embers.step(dt); R.embers.draw(ctx, sp.flame, 'lighter');
  };

  // ================= Kịch bản phim =================
  function buildFilm() {
    const w = world, P = w.pois, cx = w.imgW / 2, cy = w.imgH / 2;
    const segs = [];
    const add = (o) => { segs.push(o); };
    // 1. Đại bản doanh
    add({ ch: 0, dur: 9, kind: 'table', fin: 2.2, fout: 0, keys: [[0, cx, cy + 40, 0.78, 0.82], [1, cx - 60, cy, 1.08, 1]],
      caps: [[1.2, 3.6, 'Năm 260 trước Công nguyên.'], [4.6, 4.2, 'Thất quốc tranh hùng — thiên hạ chia năm xẻ bảy.']], title: ['大本營', 'Đại bản doanh'] });
    const c0 = w.caps[0], c1 = w.caps[3] || w.caps[1], c2 = w.caps[5] || w.caps[2];
    add({ ch: 0, dur: 7, kind: 'table', keys: [[0, cx - 60, cy, 1.08, 1], [0.35, c0.x, c0.y, 2.6, 0.95], [0.7, c1.x, c1.y, 2.8, 0.95], [1, c2.x, c2.y, 2.6, 0.95]],
      caps: [[0.4, 6, 'Trên sa bàn đồng thau nơi đại bản doanh, vận mệnh chư hầu được định đoạt.']], flagNames: true });
    // 2. Hàm Cốc
    add({ ch: 1, dur: 3.2, kind: 'table', fout: 0.5, flash: true, poi: P.pass, label: '函谷關 · Ải Hàm Cốc', keys: [[0, c2.x, c2.y, 2.6, 0.95], [0.45, P.pass.x, P.pass.y, 4.2, 1], [1, P.pass.x, P.pass.y, 7, 1, 'in']] });
    add({ ch: 1, dur: 7, kind: 'pass', fin: 0.8, flashIn: true, sfx: [[0.2, 'drum']], title: ['函谷關', 'Ải Hàm Cốc — bình minh'], caps: [[1.2, 5.2, 'Mười vạn quân Tần lặng lẽ vượt núi khi trời vừa rạng.']] });
    add({ ch: 1, dur: 4.5, kind: 'passClose', caps: [[0.6, 3.6, 'Đại kỳ chữ Tần tung bay — tướng quân chỉ kiếm về phương Đông.']] });
    // 3. Trường Bình
    add({ ch: 2, dur: 4.4, kind: 'table', fin: 0.8, fout: 0.5, flash: true, poi: P.plain, label: '長平 · Trường Bình', keys: [[0, P.pass.x, P.pass.y, 4.2, 1], [0.45, P.plain.x, P.plain.y, 3.2, 0.97], [1, P.plain.x, P.plain.y, 7, 1, 'in']] });
    add({ ch: 2, dur: 7.5, kind: 'plain', fin: 0.8, flashIn: true, sfx: [[0.3, 'shout'], [1.6, 'clash'], [4.4, 'clash']], title: ['長平', 'Bình nguyên Trường Bình'], caps: [[1, 5.6, 'Thiết kỵ xung trận, mưa tên che lấp mặt trời.']] });
    add({ ch: 2, dur: 4, kind: 'plainClose', sfx: [[0.2, 'drum']], caps: [[0.5, 3.2, 'Vó ngựa rung chuyển đất trời.']] });
    // 4. Đại Lương
    add({ ch: 3, dur: 4.4, kind: 'table', fin: 0.8, fout: 0.5, flash: true, poi: P.siege, label: '大梁 · Đại Lương', keys: [[0, P.plain.x, P.plain.y, 4.2, 1], [0.45, P.siege.x, P.siege.y, 3.2, 0.97], [1, P.siege.x, P.siege.y, 7, 1, 'in']] });
    add({ ch: 3, dur: 7.5, kind: 'siege', fin: 0.8, flashIn: true, sfx: [[0.3, 'fire'], [2.5, 'shout']], title: ['大梁', 'Thành Đại Lương — đêm'], caps: [[1, 5.6, 'Lửa cháy suốt ba ngày đêm, tên lửa rợp trời.']] });
    add({ ch: 3, dur: 5, kind: 'siegeClose', caps: [[0.6, 4, 'Xe phá thành dồn dập nện vào cổng sắt.']] });
    // 5. Xích Bích
    add({ ch: 4, dur: 4.4, kind: 'table', fin: 0.8, fout: 0.5, flash: true, poi: P.river, label: '赤壁 · Xích Bích', keys: [[0, P.siege.x, P.siege.y, 4.2, 1], [0.45, P.river.x, P.river.y, 3.2, 0.97], [1, P.river.x, P.river.y, 7, 1, 'in']] });
    add({ ch: 4, dur: 7.5, kind: 'river', fin: 0.8, flashIn: true, sfx: [[0.3, 'fire'], [3.2, 'fire']], title: ['赤壁', 'Xích Bích — đêm lửa'], caps: [[1, 5.6, 'Một trận gió đông — chiến thuyền nối nhau bốc cháy.']] });
    add({ ch: 4, dur: 4.5, kind: 'riverClose', caps: [[0.5, 3.6, 'Anh hùng thiên hạ, rốt cuộc thuộc về ai?']] });
    // 6. Kết
    add({ ch: 5, dur: 9, kind: 'table', fin: 1, fout: 1.6, keys: [[0, cx, cy - 40, 2.4, 0.95], [1, cx, cy + 40, 0.8, 0.8]], sfx: [[0.6, 'gong']], finale: true,
      caps: [[1, 4, 'Ai sẽ nhất thống thiên hạ?']] });
    let acc = 0; for (const s of segs) { s.t0 = acc; acc += s.dur; }
    const chapters = ['Đại bản doanh & sa bàn', 'Ải Hàm Cốc', 'Trường Bình', 'Đại Lương', 'Xích Bích', 'Thiên hạ quy nhất'].map((name, i) => {
      const ss = segs.filter(s => s.ch === i); return { name, t0: ss[0].t0, t1: ss[ss.length - 1].t0 + ss[ss.length - 1].dur };
    });
    return { segs, total: acc, chapters };
  }
  function buildAmbient() {
    const w = world, P = w.pois, cx = w.imgW / 2, cy = w.imgH / 2;
    const segs = [
      { dur: 16, kind: 'table', fin: 2, fout: 1.2, keys: [[0, cx - 180, cy + 20, 1.0, 0.9], [0.5, cx + 60, cy - 30, 1.35, 0.97], [1, cx + 220, cy + 30, 1.12, 0.92]] },
      { dur: 9, kind: 'pass', fin: 1.2, fout: 1.2 },
      { dur: 12, kind: 'table', fin: 1.2, fout: 1.2, keys: [[0, P.siege.x, P.siege.y, 3.2, 0.95], [1, cx, cy, 1.15, 0.9]] },
      { dur: 9, kind: 'river', fin: 1.2, fout: 1.2 },
      { dur: 12, kind: 'table', fin: 1.2, fout: 1.2, keys: [[0, P.plain.x, P.plain.y, 2.8, 0.95], [1, cx - 120, cy + 20, 1.05, 0.88]] },
      { dur: 9, kind: 'plain', fin: 1.2, fout: 1.2 },
      { dur: 9, kind: 'siege', fin: 1.2, fout: 1.2 },
    ];
    let acc = 0; for (const s of segs) { s.t0 = acc; acc += s.dur; }
    return { segs, total: acc, chapters: [] };
  }

  // ================= Vẽ một khung hình =================
  let lastSeg = null, sfxDone = new Set();
  function render(dt) {
    const f = film; if (!f) return;
    const tm = mode === 'ambient' ? t % f.total : Math.min(t, f.total - 1e-3);
    let seg = f.segs[0]; for (const s of f.segs) if (tm >= s.t0) seg = s;
    const lt = tm - seg.t0, p = lt / seg.dur;
    if (seg !== lastSeg) { lastSeg = seg; if (mode !== 'ambient') sfxDone = new Set(); }
    vt();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (seg.kind === 'table') {
      const cam = tableKeys(seg.keys, p);
      const poiA = seg.poi ? clamp01((p - 0.15) / 0.2) * (1 - clamp01((p - 0.9) / 0.1)) : 0;
      tableScene(t, dt, cam, { poi: seg.poi, poiA });
      if (seg.label && poiA > 0) {
        const P = seg.poi, sx = VW / 2 + (P.x - cam.x) * cam.z, sy = VH / 2 + 40 + (P.y - cam.y) * cam.z * cam.tilt;
        const [lcn, lvn] = seg.label.split(' · ');
        ctx.save(); ctx.globalAlpha = poiA; ctx.font = `36px ${CN}`; const w1 = ctx.measureText(lcn).width; ctx.font = `600 28px ${VNF}`; const tw = w1 + 18 + ctx.measureText(lvn).width;
        const lx = Math.min(sx + 40, VW - tw - 80), ly = Math.max(140, sy - 110);
        ctx.fillStyle = 'rgba(245,232,200,0.95)'; ctx.fillRect(lx, ly, tw + 36, 56); ctx.strokeStyle = '#7a2a1a'; ctx.lineWidth = 3; ctx.strokeRect(lx, ly, tw + 36, 56);
        ctx.strokeStyle = 'rgba(122,42,26,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, ly + 56); ctx.lineTo(sx, sy); ctx.stroke();
        ctx.fillStyle = '#8b1a12'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = `36px ${CN}`; ctx.fillText(lcn, lx + 18, ly + 30);
        ctx.fillStyle = '#4a1a0c'; ctx.font = `600 28px ${VNF}`; ctx.fillText(lvn, lx + 36 + w1, ly + 30); ctx.restore();
      }
      if (seg.flagNames) {
        for (const c of world.caps) {
          const sx = VW / 2 + (c.x - cam.x) * cam.z, sy = VH / 2 + 40 + (c.y - 60 - cam.y) * cam.z * cam.tilt;
          if (sx < 80 || sx > VW - 80 || sy < 80 || sy > VH - 120) continue;
          ctx.font = `600 22px ${VNF}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,236,190,0.92)'; ctx.shadowColor = '#000'; ctx.shadowBlur = 8;
          ctx.fillText(`${c.pre.name} · ${c.pre.monarch}`, sx, sy - 10); ctx.shadowBlur = 0;
        }
      }
      if (seg.finale) drawFinale(lt, seg.dur);
    } else SC[seg.kind](lt + (mode === 'ambient' ? Math.floor(t / f.total) * 0.37 : 0), dt, p);
    // hiệu ứng âm thanh theo kịch bản
    if (mode !== 'ambient' && seg.sfx && CW.Audio) for (const [at, name] of seg.sfx) { const key = seg.t0 + ':' + at; if (lt >= at && !sfxDone.has(key)) { sfxDone.add(key); CW.Audio.sfx(name, true); } }
    // chuyển cảnh
    const fin = seg.fin || 0, fout = seg.fout || 0;
    let fade = 0, flash = 0;
    if (fin && lt < fin) { if (seg.flashIn) flash = Math.max(flash, 1 - lt / fin); else fade = Math.max(fade, 1 - lt / fin); }
    if (fout && lt > seg.dur - fout) { const k = (lt - (seg.dur - fout)) / fout; if (seg.flash) flash = Math.max(flash, k); else fade = Math.max(fade, k); }
    if (mode === 'ambient') { fade = Math.max(fade, flash * 0.6); flash = 0; }
    if (flash > 0) { ctx.fillStyle = `rgba(255,236,196,${flash * 0.95})`; ctx.fillRect(0, 0, VW, VH); }
    if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, VW, VH); }
    // hậu kỳ: tối viền + hạt phim
    const vg = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VH * 1.05);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.65)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
    st();
    ctx.globalAlpha = 1;
    const gx = -Math.random() * 256, gy = -Math.random() * 256;
    ctx.fillStyle = ctx.createPattern(world.sp.grain, 'repeat'); ctx.save(); ctx.translate(gx, gy); ctx.fillRect(-gx, -gy, W, H); ctx.restore();
    if (mode !== 'ambient') overlays(seg, lt);
  }
  function drawFinale(lt, dur) {
    const a = clamp01((lt - 2.2) / 1.6) * (1 - clamp01((lt - (dur - 1.2)) / 1.2));
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const bg = ctx.createRadialGradient(VW / 2, VH / 2 - 20, 40, VW / 2, VH / 2 - 20, 620); bg.addColorStop(0, 'rgba(8,4,2,0.82)'); bg.addColorStop(1, 'rgba(8,4,2,0)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, VW, VH);
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 30;
    ctx.fillStyle = '#c9372c'; ctx.font = `120px ${CN}`; ctx.fillText('帝國黃昏', VW / 2, VH / 2 - 110);
    ctx.fillStyle = '#f0d48a'; ctx.font = `600 96px ${VNF}`; ctx.fillText('Civil War', VW / 2, VH / 2 + 20);
    ctx.font = `italic 42px ${VNF}`; ctx.fillStyle = '#e6c98a'; ctx.fillText('The Dusk of Empires', VW / 2, VH / 2 + 95);
    ctx.restore();
  }
  // Phụ đề, thẻ chương, dải điện ảnh (vẽ trên canvas để khi quay video vẫn có)
  function overlays(seg, lt) {
    const bar = Math.round(H * 0.085);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
    const fs = Math.max(15, Math.min(30, W / 48));
    if ((seg.caps || []).some(([at, d]) => lt >= at - 0.3 && lt <= at + d + 0.3)) {
      const cg = ctx.createLinearGradient(0, H - bar - fs * 3.4, 0, H - bar); cg.addColorStop(0, 'rgba(0,0,0,0)'); cg.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = cg; ctx.fillRect(0, H - bar - fs * 3.4, W, fs * 3.4);
    }
    for (const [at, d, text] of seg.caps || []) {
      if (lt < at || lt > at + d) continue;
      const a = Math.min(1, (lt - at) / 0.5, (at + d - lt) / 0.5);
      ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `italic ${fs}px ${VNF}`; ctx.fillStyle = '#f3e3bd'; ctx.shadowColor = '#000'; ctx.shadowBlur = 10;
      ctx.fillText(text, W / 2, H - bar - fs * 1.4); ctx.restore();
    }
    if (seg.title) {
      const a = Math.min(clamp01((lt - 0.6) / 0.8), clamp01((4.6 - lt) / 0.8));
      if (a > 0) {
        ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.shadowColor = '#000'; ctx.shadowBlur = 14;
        const x0 = Math.max(24, W * 0.05), y0 = bar + fs * 3.2;
        ctx.fillStyle = '#d23a22'; ctx.font = `${fs * 2.6}px ${CN}`; ctx.fillText(seg.title[0], x0, y0);
        ctx.fillStyle = '#f0d48a'; ctx.font = `600 ${fs * 0.95}px ${VNF}`; ctx.fillText(seg.title[1], x0 + 4, y0 + fs * 1.4);
        ctx.fillStyle = '#c9963c'; ctx.fillRect(x0 + 4, y0 + fs * 1.75, fs * 7, 2);
        ctx.restore();
      }
    }
  }

  // ================= Vòng chạy =================
  function loop(now) {
    raf = 0;
    if (!mode) return;
    const dt = Math.min(0.05, (now - lastNow) / 1000 || 0.016); lastNow = now;
    if (!paused) t += dt;
    try { render(paused ? 0 : dt); } catch (e) { console.error(e); }
    if (mode !== 'ambient' && t >= Math.min(endAt, film.total)) { finish(); return; }
    if (mode === 'demo' || mode === 'intro') updateUI();
    raf = requestAnimationFrame(loop);
  }
  function ensureWorld() {
    if (world) return true;
    try {
      world = buildWorld();
      world.sp = buildCommon(); world.room = buildRoom();
      world.pass = buildPass(); world.plain = buildPlain(); world.siege = buildSiege(); world.river = buildRiver();
      world.fitZ = Math.min(VW * 0.86 / world.imgW, VH * 0.86 / world.imgH);
      world.film = buildFilm(); world.ambient = buildAmbient();
      return true;
    } catch (e) { console.error('cinema', e); world = null; return false; }
  }
  function start(m, f, from, to, cb) {
    ensureCanvas();
    if (!ensureWorld()) { if (cb) cb(); return; }
    mode = m; film = f === 'ambient' ? world.ambient : world.film; t = from || 0; endAt = to || Infinity; onEnd = cb || null; paused = false; lastSeg = null; sfxDone = new Set();
    resize();
    cv.classList.remove('hidden'); cv.classList.toggle('dim', m === 'ambient');
    document.body.classList.toggle('cine-play', m !== 'ambient');
    lastNow = performance.now();
    if (!raf) raf = requestAnimationFrame(loop);
    if (m !== 'ambient') showUI(); else hideUI();
  }
  function finish() {
    const cb = onEnd; onEnd = null;
    if (recorder) stopRecord();
    hideUI(); document.body.classList.remove('cine-play');
    mode = null;
    if (cb) cb(); else C.startAmbient();
  }
  C.playing = () => mode === 'intro' || mode === 'demo';
  C.startAmbient = function () {
    if (CW.Main && CW.Main.game && CW.Main.game()) return;
    if (mode === 'ambient') return;
    if (C.playing()) return;
    start('ambient', 'ambient', 0);
  };
  C.stopAmbient = function () { if (mode === 'ambient' || C.playing()) { mode = null; hideUI(); document.body.classList.remove('cine-play'); } if (cv) cv.classList.add('hidden'); };
  C.playIntro = function (cb) { start('intro', 'film', 0, Infinity, () => { C.cfg.seen = true; saveCfg(); if (cb) cb(); else C.startAmbient(); }); };
  C.playChapter = function (i, cb) { const ch = world && world.film.chapters[i]; ensureWorld(); const c = world.film.chapters[i]; start('demo', 'film', c.t0, c.t1, cb || (() => { C.startAmbient(); C.showDemo(); })); };
  C.playAll = function (cb) { start('demo', 'film', 0, Infinity, cb || (() => { C.startAmbient(); C.showDemo(); })); };

  // ================= Điều khiển khi chiếu =================
  let ui = null, idleT = 0;
  function showUI() {
    if (!ui) {
      ui = document.createElement('div'); ui.id = 'cineUI';
      ui.innerHTML = `<div class="cu-top"><button class="btn" data-cine="skip">Bỏ qua ⏭ <small>(Esc)</small></button></div>
        <div class="cu-bot"><button class="btn sm" data-cine="prev" title="Chương trước (←)">⏮</button><button class="btn sm" data-cine="pause" title="Tạm dừng (Space)">⏸</button><button class="btn sm" data-cine="next" title="Chương sau (→)">⏭</button>
        <div class="cu-bar"><div class="cu-fill"></div><div class="cu-ticks"></div></div><span class="cu-ch"></span><span class="cu-rec hidden">⏺ Đang quay</span></div>`;
      document.body.appendChild(ui);
      ui.addEventListener('click', e => {
        const b = e.target.closest('[data-cine]'); if (b) { e.stopPropagation(); act(b.dataset.cine); return; }
        const bar = e.target.closest('.cu-bar'); if (bar && film) { const r = bar.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * film.total); }
      });
      window.addEventListener('mousemove', () => { idleT = performance.now(); if (ui) ui.classList.remove('idle'); });
      window.addEventListener('keydown', e => {
        if (!C.playing()) return;
        const k = e.key;
        if (k === 'Escape') act('skip'); else if (k === ' ') act('pause'); else if (k === 'ArrowRight') act('next'); else if (k === 'ArrowLeft') act('prev'); else return;
        e.preventDefault(); e.stopPropagation();
      }, true);
    }
    ui.classList.remove('hidden'); idleT = performance.now();
    const ticks = ui.querySelector('.cu-ticks');
    ticks.innerHTML = film.chapters.map(c => `<i style="left:${c.t0 / film.total * 100}%" title="${U.esc(c.name)}"></i>`).join('');
    ui.querySelector('[data-cine="skip"]').innerHTML = mode === 'intro' ? 'Bỏ qua ⏭ <small>(Esc)</small>' : 'Đóng ✕ <small>(Esc)</small>';
  }
  function hideUI() { if (ui) ui.classList.add('hidden'); }
  function updateUI() {
    if (!ui) return;
    ui.querySelector('.cu-fill').style.width = (Math.min(1, t / film.total) * 100) + '%';
    const ch = film.chapters.filter(c => t >= c.t0).pop();
    ui.querySelector('.cu-ch').textContent = ch ? ch.name : '';
    ui.querySelector('[data-cine="pause"]').textContent = paused ? '▶' : '⏸';
    ui.querySelector('.cu-rec').classList.toggle('hidden', !recorder);
    ui.classList.toggle('idle', !paused && performance.now() - idleT > 2600);
  }
  function seek(x) { t = U.clamp(x, 0, film.total - 0.01); endAt = Infinity; lastSeg = null; sfxDone = new Set(); }
  function act(a) {
    if (!film) return;
    const chs = film.chapters; const i = Math.max(0, chs.filter(c => t >= c.t0).length - 1);
    if (a === 'skip') { if (recorder) stopRecord(true); finish(); }
    else if (a === 'pause') paused = !paused;
    else if (a === 'next') { if (i + 1 < chs.length) seek(chs[i + 1].t0); else finish(); }
    else if (a === 'prev') seek(t - chs[i].t0 > 2 ? chs[i].t0 : chs[Math.max(0, i - 1)].t0);
  }

  // ================= Quay video =================
  C.record = function () {
    if (!window.MediaRecorder) { CW.UI.toast('Trình duyệt không hỗ trợ quay video.', 'bad'); return; }
    ensureCanvas(); if (!ensureWorld()) return;
    start('demo', 'film', 0, Infinity, () => { C.startAmbient(); C.showDemo(); });
    const stream = cv.captureStream(30);
    const au = CW.Audio && CW.Audio.recordStream ? CW.Audio.recordStream() : null;
    if (au) for (const tr of au.getAudioTracks()) stream.addTrack(tr);
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    const mime = types.find(m => MediaRecorder.isTypeSupported(m)) || '';
    const chunks = [];
    try { recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : {}); } catch (e) { recorder = null; CW.UI.toast('Không quay được: ' + U.esc(e.message), 'bad'); return; }
    recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      if (recorder && recorder._cancel) { recorder = null; return; }
      const blob = new Blob(chunks, { type: 'video/webm' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'civil-war-intro.webm';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      CW.UI.toast(`Đã lưu video (${(blob.size / 1048576).toFixed(1)} MB) vào thư mục Downloads.`, 'good', 6000);
      recorder = null;
    };
    recorder.start(1000);
  };
  function stopRecord(cancel) { if (!recorder) return; recorder._cancel = !!cancel; try { recorder.stop(); } catch (e) { recorder = null; } }

  // ================= Màn hình Phim & Demo =================
  C.showDemo = function () {
    ensureWorld();
    C.startAmbient();
    const menu = document.getElementById('menu'); if (!menu) return;
    const f = world && world.film;
    const fmt = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
    const thumbs = ['🏯', '⛰', '🐎', '🔥', '⛵', '🐉'];
    menu.innerHTML = `<div class="setup demo"><div class="row" style="justify-content:space-between"><h2 style="margin:0">🎬 Phim & Demo</h2><button class="btn" data-act="mBackMenu">← Quay lại</button></div>
      <p class="muted">Phim mở đầu được dựng trực tiếp bằng code trên trình duyệt (không phải file video): sa bàn quân sự đồng thau dựng từ bản đồ thật của game, rồi máy quay lao vào từng địa danh để thấy thực cảnh chiến quốc. Nền màn hình chính cũng là "phim" chạy vòng lặp.</p>
      <div class="demo-hero" data-act="cinePlayAll"><div class="dh-cn">帝國黃昏</div><div><b>Phim mở đầu đầy đủ</b><div class="muted">${f ? fmt(f.total) : ''} · 6 chương · có phụ đề, nhạc nền & hiệu ứng</div></div><span class="dh-play">▶</span></div>
      <div class="demo-grid">${f ? f.chapters.map((c, i) => `<div class="demo-card" data-act="cineChap" data-i="${i}"><div class="dc-ic">${thumbs[i]}</div><div><b>${i + 1}. ${U.esc(c.name)}</b><div class="muted">${fmt(c.t1 - c.t0)}</div></div><span>▶</span></div>`).join('') : ''}</div>
      <div class="row" style="margin-top:14px;gap:10px"><button class="btn red" data-act="cineRec">⏺ Quay phim mở đầu thành video (.webm)</button>
      <label class="row" style="margin:0"><input type="checkbox" data-chg="cineAuto" ${C.cfg.autoIntro ? 'checked' : ''}> Tự chiếu phim mở đầu mỗi khi vào game</label></div>
      <p class="muted" style="font-size:12px">Phím tắt khi xem: <kbd>Space</kbd> tạm dừng · <kbd>←</kbd>/<kbd>→</kbd> chuyển chương · <kbd>Esc</kbd> thoát. Khi quay video, phim chạy từ đầu đến cuối rồi tự tải file về.</p></div>`;
  };
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const a = el.dataset.act;
    const go = { cinePlayAll: () => C.playAll(), cineChap: () => C.playChapter(+el.dataset.i), cineRec: () => C.record(), mBackMenu: () => CW.UI.showMenu() }[a];
    if (!go) return; e.preventDefault(); e.stopPropagation(); go();
  }, true);
  document.addEventListener('change', e => { const el = e.target.closest('[data-chg="cineAuto"]'); if (el) { C.cfg.autoIntro = el.checked; saveCfg(); } }, true);

  // ================= Màn chờ khởi động =================
  C.boot = function (opt) {
    opt = opt || {};
    const b = document.createElement('div'); b.id = 'boot';
    b.innerHTML = `<div class="bt-cn">帝 國 黃 昏</div><div class="bt-en">Civil War</div><div class="bt-sub">The Dusk of Empires</div><div class="bt-flame"></div><div class="bt-hint">Nhấn phím bất kỳ hoặc bấm chuột để bắt đầu</div>`;
    document.body.appendChild(b);
    // dựng sẵn sa bàn trong lúc chờ (tránh khựng khi bấm)
    setTimeout(() => { ensureWorld(); }, 60);
    const go = e => {
      if (e && e.type === 'keydown' && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      window.removeEventListener('keydown', go, true); b.removeEventListener('pointerdown', go);
      b.classList.add('out'); setTimeout(() => b.remove(), 700);
      if (opt.room) { C.startAmbient(); CW.Net.showLobby(opt.room); return; }
      if (C.cfg.autoIntro) C.playIntro(() => { CW.UI.showMenu(); C.startAmbient(); });
      else C.startAmbient();
    };
    b.addEventListener('pointerdown', go); window.addEventListener('keydown', go, true);
  };
  C.world = () => world;
  C.seek = x => { if (film) seek(x); };
  C.pause = v => { paused = v === undefined ? !paused : !!v; };
})();

'use strict';
// ============ Sinh bản đồ theo mẫu + seed (tất định: cùng seed => cùng bản đồ) ============
(function () {
  const U = CW.U, T = CW.T;
  const W = 220, H = 150;
  const sstep = (a, b, x) => { const t = U.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const gauss = (nx, ny, cx, cy, rx, ry) => Math.exp(-(((nx - cx) * (nx - cx)) / (rx * rx) + ((ny - cy) * (ny - cy)) / (ry * ry)));

  // Mặt nạ đất liền theo mẫu: >0 thiên về đất
  const TEMPLATES = {
    trungdia: {
      mask(nx, ny) {
        const coastX = 0.78 + 0.06 * Math.sin(ny * 5.5 + 1) - 0.1 * sstep(0.55, 1, ny);
        let m = Math.min((coastX - nx) * 3.2, (0.9 - ny + 0.04 * Math.sin(nx * 9)) * 3.2 + (nx < 0.35 ? 1 : 0));
        m = Math.max(m, 1.6 * gauss(nx, ny, 0.91, 0.72, 0.035, 0.11) - 0.5);
        return m;
      },
      mtn(nx, ny) { return 0.55 + 0.7 * sstep(0.4, 0.0, nx) + 0.2 * sstep(0.3, 0, ny); },
      mtnFrac: 0.11, rivers: 13, steppe: (nx, ny) => ny < 0.13 && nx < 0.65,
    },
    thatquoc: {
      mask(nx, ny) {
        let m = (0.86 - nx + 0.04 * Math.sin(ny * 8)) * 3.2;
        m = Math.min(m, 0.9) - 2.2 * gauss(nx, ny, 0.47, 0.5, 0.075, 0.09);
        m = Math.min(m, (ny - 0.03) * 8, (0.97 - ny) * 8, (nx - 0.02) * 8);
        return m;
      },
      mtn() { return 0.85; }, mtnFrac: 0.12, rivers: 12,
    },
    giangnam: {
      mask(nx, ny) {
        let m = (1.3 - nx - ny * 0.75) * 2.8;
        return Math.min(m, (ny - 0.02) * 10 + 0.6, (nx - 0.02) * 10 + 0.6);
      },
      mtn(nx) { return 0.4 + 0.7 * sstep(0.35, 0, nx); }, mtnFrac: 0.08, rivers: 19, lakes: 0.66,
    },
    bandao: {
      mask(nx, ny) {
        let m = (0.93 - nx) * 3;
        m -= 2.4 * gauss(nx, ny, 0.8, 0.47, 0.2, 0.09);
        m -= 1.6 * gauss(nx, ny, 0.98, 0.15, 0.1, 0.12);
        m += 1.2 * gauss(nx, ny, 0.85, 0.72, 0.1, 0.07);
        return Math.min(m, (0.95 - ny) * 6, (ny - 0.03) * 8 + 0.4);
      },
      mtn(nx, ny) { return 0.6 + 0.4 * sstep(0.3, 0, nx) + 0.3 * gauss(nx, ny, 0.3, 0.1, 0.2, 0.15); }, mtnFrac: 0.1, rivers: 12,
    },
    taivuc: {
      mask(nx, ny) {
        let m = (0.88 - nx + 0.05 * Math.sin(ny * 7 + 2)) * 3;
        return Math.min(m, (0.95 - ny) * 7 + (nx < 0.5 ? 1.5 : 0));
      },
      mtn(nx, ny) { return 0.5 + 0.5 * gauss(nx, ny, 0.4, 0.45, 0.08, 0.5) + 0.3 * sstep(0.3, 0, ny); }, mtnFrac: 0.1, rivers: 9,
      desert: (nx, ny, n) => nx + n * 0.25 < 0.42, steppe: (nx, ny, n) => ny + n * 0.15 < 0.25,
    },
    cuuchau: {
      mask(nx, ny) {
        const e = Math.min(nx, 1 - nx, ny * 1.3, (1 - ny) * 1.3);
        return (e - 0.08) * 6 - 0.7 * gauss(nx, ny, 0.55, 0.55, 0.06, 0.05);
      },
      mtn() { return 0.75; }, mtnFrac: 0.11, rivers: 12,
    },
  };

  function components(W, H, test) {
    const comp = new Int32Array(W * H).fill(-1); const sizes = []; const stack = [];
    for (let i = 0; i < W * H; i++) {
      if (comp[i] >= 0 || !test(i)) continue;
      const id = sizes.length; let size = 0; comp[i] = id; stack.push(i);
      while (stack.length) {
        const c = stack.pop(); size++;
        const x = c % W, y = (c / W) | 0;
        if (x > 0 && comp[c - 1] < 0 && test(c - 1)) { comp[c - 1] = id; stack.push(c - 1); }
        if (x < W - 1 && comp[c + 1] < 0 && test(c + 1)) { comp[c + 1] = id; stack.push(c + 1); }
        if (y > 0 && comp[c - W] < 0 && test(c - W)) { comp[c - W] = id; stack.push(c - W); }
        if (y < H - 1 && comp[c + W] < 0 && test(c + W)) { comp[c + W] = id; stack.push(c + W); }
      }
      sizes.push(size);
    }
    return { comp, sizes };
  }

  CW.generateMap = function (templateId, seed, nationCount) {
    const tpl = TEMPLATES[templateId] || TEMPLATES.trungdia;
    const rnd = U.rng(seed);
    const N1 = new U.Noise(seed + 11), N2 = new U.Noise(seed + 22), N3 = new U.Noise(seed + 33), N4 = new U.Noise(seed + 44);
    const size = W * H;
    const h = new Float32Array(size);
    const land = new Uint8Array(size);

    // ---- Độ cao & đất/nước ----
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const nx = x / W, ny = y / H; const i = y * W + x;
      const base = N1.fbm(x / 36, y / 36, 5) - 0.5;
      const m = U.clamp(tpl.mask(nx, ny), -1.2, 1.2);
      h[i] = base * 0.85 + m * 0.5;
      land[i] = h[i] > 0 ? 1 : 0;
      if (land[i] && tpl.lakes && N3.fbm(x / 13 + 50, y / 13, 4) > tpl.lakes) land[i] = 0;
      else if (land[i] && !tpl.lakes && N3.fbm(x / 13 + 50, y / 13, 4) > 0.76) land[i] = 0;
    }
    // Xóa đảo/hồ quá nhỏ
    {
      const lc = components(W, H, i => land[i] === 1);
      for (let i = 0; i < size; i++) if (land[i] && lc.sizes[lc.comp[i]] < 14) land[i] = 0;
      const wc = components(W, H, i => land[i] === 0);
      for (let i = 0; i < size; i++) if (!land[i] && wc.sizes[wc.comp[i]] < 8) land[i] = 1;
    }
    // Loại bỏ nối chéo kiểu bàn cờ để đường bờ biển khép kín
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
        const i = y * W + x;
        const a = land[i], b = land[i + 1], c = land[i + W], d = land[i + W + 1];
        if (a === d && b === c && a !== b) { land[i] = land[i + 1] = land[i + W] = land[i + W + 1] = 1; changed = true; }
      }
      if (!changed) break;
    }

    // ---- Phân loại nước: biển / hồ ----
    const ter = new Uint8Array(size);
    {
      const wc = components(W, H, i => land[i] === 0);
      const edgeComp = new Set();
      for (let x = 0; x < W; x++) { if (!land[x]) edgeComp.add(wc.comp[x]); if (!land[(H - 1) * W + x]) edgeComp.add(wc.comp[(H - 1) * W + x]); }
      for (let y = 0; y < H; y++) { if (!land[y * W]) edgeComp.add(wc.comp[y * W]); if (!land[y * W + W - 1]) edgeComp.add(wc.comp[y * W + W - 1]); }
      for (let i = 0; i < size; i++) if (!land[i]) ter[i] = edgeComp.has(wc.comp[i]) ? T.SEA : T.LAKE;
    }

    // ---- Núi / đồi theo phân vị ----
    const landIdx = [];
    for (let i = 0; i < size; i++) if (land[i]) landIdx.push(i);
    const mscore = new Float32Array(size);
    for (const i of landIdx) {
      const x = i % W, y = (i / W) | 0;
      mscore[i] = N2.ridge(x / 32, y / 32, 4) * tpl.mtn(x / W, y / H) + h[i] * 0.35 + N4.n2(x / 6, y / 6) * 0.05;
    }
    const sorted = landIdx.slice().sort((a, b) => mscore[b] - mscore[a]);
    const nM = Math.floor(sorted.length * tpl.mtnFrac), nH = Math.floor(sorted.length * 0.1);
    for (let k = 0; k < sorted.length; k++) ter[sorted[k]] = k < nM ? T.MOUNT : k < nM + nH ? T.HILL : T.PLAIN;
    // Rừng / sa mạc / thảo nguyên
    const moist = new Float32Array(size);
    for (const i of landIdx) { const x = i % W, y = (i / W) | 0; moist[i] = N3.fbm(x / 22, y / 22, 4); }
    const plains = landIdx.filter(i => ter[i] === T.PLAIN).sort((a, b) => moist[b] - moist[a]);
    const nF = Math.floor(plains.length * 0.22);
    for (let k = 0; k < nF; k++) ter[plains[k]] = T.FOREST;
    for (const i of landIdx) {
      if (ter[i] !== T.PLAIN) continue;
      const x = i % W, y = (i / W) | 0, nx = x / W, ny = y / H, n = N4.fbm(x / 15, y / 15, 3) - 0.5;
      if (tpl.desert && tpl.desert(nx, ny, n)) ter[i] = T.DESERT;
      else if (tpl.steppe && tpl.steppe(nx, ny, n)) ter[i] = T.STEPPE;
    }

    // ---- Sông: priority-flood từ mặt nước để có hướng chảy ----
    const parent = new Int32Array(size).fill(-1);
    {
      const E = new Float32Array(size); const seen = new Uint8Array(size); const heap = new U.Heap();
      for (let i = 0; i < size; i++) if (!land[i]) { seen[i] = 1; E[i] = -1; heap.push(i, -1); }
      while (heap.size) {
        const c = heap.pop(); const x = c % W, y = (c / W) | 0;
        const nb = [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, y > 0 ? c - W : -1, y < H - 1 ? c + W : -1];
        for (const n of nb) {
          if (n < 0 || seen[n]) continue; seen[n] = 1;
          const nx2 = n % W, ny2 = (n / W) | 0;
          const elev = h[n] + mscore[n] * 0.4 + N4.n2(nx2 / 4, ny2 / 4) * 0.08;
          E[n] = Math.max(elev, E[c] + 0.0005); parent[n] = c; heap.push(n, E[n]);
        }
      }
    }
    const river = new Uint8Array(size), flow = new Float32Array(size);
    const rivers = [];
    {
      const cands = landIdx.filter(i => ter[i] === T.MOUNT || ter[i] === T.HILL);
      U.shuffle(rnd, cands);
      const srcs = [];
      for (const c of cands) {
        if (srcs.length >= tpl.rivers * 2) break;
        const x = c % W, y = (c / W) | 0;
        if (srcs.every(s => Math.abs(s % W - x) + Math.abs(((s / W) | 0) - y) > 16)) srcs.push(c);
      }
      let made = 0;
      for (const s of srcs) {
        if (made >= tpl.rivers) break;
        const cells = []; let c = s; let joined = -1;
        while (c >= 0 && land[c]) {
          if (river[c]) { joined = c; break; }
          cells.push(c); c = parent[c];
        }
        if (cells.length < 14) continue;
        made++;
        const mouth = joined >= 0 ? joined : c;
        cells.forEach((ci, k) => { river[ci] = 1; flow[ci] += k + 1; });
        if (joined >= 0) { // cộng dòng chảy xuống hạ lưu
          let d = joined; let add = cells.length;
          while (d >= 0 && land[d]) { flow[d] += add; d = parent[d]; }
        }
        const pts = cells.map(ci => [ci % W + 0.5, ((ci / W) | 0) + 0.5]);
        if (mouth >= 0) pts.push([mouth % W + 0.5, ((mouth / W) | 0) + 0.5]);
        rivers.push({ cells: cells.concat(mouth >= 0 ? [mouth] : []), pts });
      }
      for (const r of rivers) r.flows = r.cells.map(ci => (land[ci] ? flow[ci] : 999));
    }

    // ---- Đại lục chính ----
    const lc = components(W, H, i => land[i] === 1);
    let mainComp = 0; lc.sizes.forEach((s, k) => { if (s > lc.sizes[mainComp]) mainComp = k; });
    const mainland = new Uint8Array(size);
    let M = 0;
    for (let i = 0; i < size; i++) if (land[i] && lc.comp[i] === mainComp) { mainland[i] = 1; M++; }

    // ---- Lãnh địa (province) ----
    const P = U.clamp(Math.round(M / 420), nationCount * 3 + 5, 72);
    const seedCands = [];
    for (let i = 0; i < size; i++) if (mainland[i] && ter[i] !== T.MOUNT && !river[i]) {
      const x = i % W, y = (i / W) | 0;
      // tránh sát mép bản đồ
      if (x > 2 && y > 2 && x < W - 3 && y < H - 3) seedCands.push(i);
    }
    U.shuffle(rnd, seedCands);
    const seeds = [];
    let minD = Math.sqrt(M / P) * 0.9;
    for (let tries = 0; tries < 8 && seeds.length < P; tries++) {
      for (const c of seedCands) {
        if (seeds.length >= P) break;
        const x = c % W, y = (c / W) | 0;
        let ok = true;
        for (const s of seeds) { const dx = s % W - x, dy = ((s / W) | 0) - y; if (dx * dx + dy * dy < minD * minD) { ok = false; break; } }
        if (ok) seeds.push(c);
      }
      minD *= 0.88;
    }
    const prov = new Int16Array(size).fill(-1);
    {
      const cost = new Float32Array(size).fill(1e9); const heap = new U.Heap();
      seeds.forEach((s, k) => { cost[s] = 0; prov[s] = k; heap.push(s, 0); });
      const stepCost = n => (CW.TERRAIN[ter[n]].move || 1) + (river[n] ? 2.2 : 0);
      while (heap.size) {
        const c = heap.pop(); const x = c % W, y = (c / W) | 0;
        const nb = [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, y > 0 ? c - W : -1, y < H - 1 ? c + W : -1];
        for (const n of nb) {
          if (n < 0 || !mainland[n]) continue;
          const nc = cost[c] + stepCost(n);
          if (nc < cost[n]) { cost[n] = nc; prov[n] = prov[c]; heap.push(n, nc); }
        }
      }
    }
    const names = U.shuffle(rnd, CW.PROVINCE_NAMES.slice());
    const provinces = seeds.map((s, k) => ({
      id: k, name: names[k % names.length] + (k >= names.length ? ' ' + (1 + Math.floor(k / names.length)) : ''),
      cx: s % W, cy: (s / W) | 0, area: 0, sx: 0, sy: 0, plain: 0, forest: 0, hill: 0, mount: 0, desert: 0, river: 0, coastal: false, adj: new Set(),
    }));
    for (let i = 0; i < size; i++) {
      const k = prov[i]; if (k < 0) continue;
      const p = provinces[k]; const x = i % W, y = (i / W) | 0;
      p.area++; p.sx += x; p.sy += y;
      const t = ter[i];
      if (t === T.PLAIN || t === T.STEPPE) p.plain++; else if (t === T.FOREST) p.forest++;
      else if (t === T.HILL) p.hill++; else if (t === T.MOUNT) p.mount++; else if (t === T.DESERT) p.desert++;
      if (river[i]) p.river++;
      if (x < W - 1) { const k2 = prov[i + 1]; if (k2 >= 0 && k2 !== k) { p.adj.add(k2); provinces[k2].adj.add(k); } if (ter[i + 1] === T.SEA) p.coastal = true; }
      if (y < H - 1) { const k2 = prov[i + W]; if (k2 >= 0 && k2 !== k) { p.adj.add(k2); provinces[k2].adj.add(k); } if (ter[i + W] === T.SEA) p.coastal = true; }
    }
    for (const p of provinces) {
      const a = Math.max(1, p.area);
      p.mx = p.sx / a; p.my = p.sy / a;
      p.fert = U.clamp((p.plain * 1 + p.forest * 0.55 + p.hill * 0.5 + p.mount * 0.1 + p.desert * 0.2 + p.river * 0.6) / a, 0.2, 1.4);
      p.forestF = p.forest / a; p.hillF = (p.hill + p.mount * 1.3) / a;
      p.adj = Array.from(p.adj);
      delete p.sx; delete p.sy;
    }

    // ---- Phân chia lãnh thổ ban đầu cho các nước ----
    const owners = new Array(provinces.length).fill(-1);
    const capitals = [];
    {
      const big = provinces.filter(p => p.area > 150);
      const pool = big.length >= nationCount ? big : provinces;
      capitals.push(U.pick(rnd, pool).id);
      while (capitals.length < nationCount) {
        const scored = pool.filter(p => !capitals.includes(p.id)).map(p => {
          let d = 1e9; for (const c of capitals) d = Math.min(d, U.dist(p.mx, p.my, provinces[c].mx, provinces[c].my));
          return { p, d };
        }).sort((a, b) => b.d - a.d);
        capitals.push(scored[Math.floor(rnd() * Math.min(3, scored.length))].p.id);
      }
      capitals.forEach((c, n) => { owners[c] = n; });
      const quota = Math.max(3, Math.floor(provinces.length * 0.8 / nationCount));
      const counts = new Array(nationCount).fill(1);
      let grew = true;
      while (grew) {
        grew = false;
        for (let n = 0; n < nationCount; n++) {
          if (counts[n] >= quota) continue;
          const cap = provinces[capitals[n]];
          let best = -1, bd = 1e9;
          for (let k = 0; k < provinces.length; k++) {
            if (owners[k] !== n) continue;
            for (const a of provinces[k].adj) {
              if (owners[a] !== -1) continue;
              const d = U.dist(provinces[a].mx, provinces[a].my, cap.mx, cap.my) + rnd() * 6;
              if (d < bd) { bd = d; best = a; }
            }
          }
          if (best >= 0) { owners[best] = n; counts[n]++; grew = true; }
        }
      }
    }

    // ---- Biểu tượng địa hình ----
    const icons = [];
    const cityCells = new Set(provinces.map(p => p.cy * W + p.cx));
    for (let i = 0; i < size; i++) {
      if (!land[i] || river[i]) continue;
      const near = cityCells.has(i) || cityCells.has(i + 1) || cityCells.has(i - 1) || cityCells.has(i + W) || cityCells.has(i - W);
      if (near) continue;
      const x = i % W, y = (i / W) | 0, t = ter[i];
      const jx = x + 0.2 + rnd() * 0.6, jy = y + 0.3 + rnd() * 0.5;
      if (t === T.MOUNT) { if ((x % 3 === 0 && y % 2 === 0) || rnd() < 0.05) icons.push({ x: jx, y: jy, t: 0, v: Math.floor(rnd() * 3), s: 0.85 + rnd() * 0.5 }); }
      else if (t === T.HILL) { if (rnd() < 0.11) icons.push({ x: jx, y: jy, t: 1, v: 0, s: 0.8 + rnd() * 0.4 }); }
      else if (t === T.FOREST) { if (rnd() < 0.22) icons.push({ x: jx, y: jy, t: 2, v: Math.floor(rnd() * 2), s: 0.8 + rnd() * 0.4 }); }
      else if (t === T.PLAIN || t === T.STEPPE) { if (rnd() < 0.012) icons.push({ x: jx, y: jy, t: 2, v: Math.floor(rnd() * 2), s: 0.7 + rnd() * 0.3 }); }
      else if (t === T.DESERT) { if (rnd() < 0.03) icons.push({ x: jx, y: jy, t: 3, v: 0, s: 0.8 + rnd() * 0.4 }); }
    }
    icons.sort((a, b) => a.y - b.y);

    return { W, H, ter, land, river, flow, mainland, prov, provinces, rivers, icons, owners, capitals, seed, templateId };
  };
})();

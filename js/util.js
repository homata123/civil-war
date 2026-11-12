'use strict';
// ============ Tiện ích chung: RNG, noise, heap, định dạng ============
var CW = (typeof window !== 'undefined' ? (window.CW = window.CW || {}) : (globalThis.CW = globalThis.CW || {}));

(function () {
  const U = CW.U = {};

  U.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  U.hashStr = function (s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  U.pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  U.shuffle = (r, arr) => {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  };
  U.fmt = function (n) {
    n = Math.floor(n || 0);
    const s = n < 0 ? '-' : ''; n = Math.abs(n);
    if (n >= 1e6) return s + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e4) return s + (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k';
    return s + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  U.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.hexToRgb = function (h) {
    h = String(h || '#888888').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  U.rgbStr = (c, a) => (a === undefined ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);
  U.mix = (c1, c2, t) => [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
  U.shade = function (hex, f) { // f>0 sáng hơn, f<0 tối hơn
    const c = U.hexToRgb(hex);
    return U.rgbStr(f >= 0 ? U.mix(c, [255, 255, 255], f) : U.mix(c, [0, 0, 0], -f));
  };

  // ---- Value noise ----
  U.Noise = function (seed) {
    const r = U.rng(seed);
    const p = new Uint16Array(512), v = new Float32Array(256);
    for (let i = 0; i < 256; i++) { p[i] = i; v[i] = r(); }
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 256; i++) p[i + 256] = p[i];
    const fade = t => t * t * (3 - 2 * t);
    function n2(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
      const a = v[p[p[X] + Y]], b = v[p[p[X + 1] + Y]], c = v[p[p[X] + Y + 1]], d = v[p[p[X + 1] + Y + 1]];
      const u = fade(xf), w = fade(yf);
      const top = a + (b - a) * u, bot = c + (d - c) * u;
      return top + (bot - top) * w;
    }
    this.n2 = n2;
    this.fbm = function (x, y, oct) {
      oct = oct || 5; let s = 0, amp = 0.5, f = 1, norm = 0;
      for (let i = 0; i < oct; i++) { s += amp * n2(x * f + i * 17.3, y * f - i * 9.1); norm += amp; amp *= 0.5; f *= 2.03; }
      return s / norm;
    };
    this.ridge = function (x, y, oct) {
      oct = oct || 4; let s = 0, amp = 0.5, f = 1, norm = 0;
      for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(n2(x * f + 31.7 * i, y * f + 7.7 * i) * 2 - 1); s += amp * n * n; norm += amp; amp *= 0.5; f *= 2.1; }
      return s / norm;
    };
  };

  // ---- Binary min-heap ----
  U.Heap = class {
    constructor() { this.a = []; this.p = []; }
    get size() { return this.a.length; }
    push(item, pri) {
      const a = this.a, p = this.p; a.push(item); p.push(pri);
      let i = a.length - 1;
      while (i > 0) {
        const par = (i - 1) >> 1; if (p[par] <= p[i]) break;
        [a[par], a[i]] = [a[i], a[par]]; [p[par], p[i]] = [p[i], p[par]]; i = par;
      }
    }
    pop() {
      const a = this.a, p = this.p; const top = a[0];
      const la = a.pop(), lp = p.pop();
      if (a.length) {
        a[0] = la; p[0] = lp; let i = 0; const n = a.length;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < n && p[l] < p[m]) m = l;
          if (r < n && p[r] < p[m]) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]]; [p[m], p[i]] = [p[i], p[m]]; i = m;
        }
      }
      return top;
    }
  };

  // ---- Chaikin smoothing ----
  U.chaikin = function (pts, closed, iter) {
    for (let k = 0; k < iter; k++) {
      const out = []; const n = pts.length;
      if (n < 3) return pts;
      if (closed) {
        for (let i = 0; i < n; i++) {
          const a = pts[i], b = pts[(i + 1) % n];
          out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
        }
      } else {
        out.push(pts[0]);
        for (let i = 0; i < n - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          if (i > 0) out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
          if (i < n - 2) out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
        }
        out.push(pts[n - 1]);
      }
      pts = out;
    }
    return pts;
  };

  // Làm mượt đường lưới ô: trung điểm (khử bậc thang) + Laplace + Chaikin
  U.smoothLine = function (pts, closed) {
    const n = pts.length;
    if (n < 3) return pts;
    let p;
    if (closed) p = pts.map((a, i) => { const b = pts[(i + 1) % n]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; });
    else { p = [pts[0]]; for (let i = 0; i < n - 1; i++) p.push([(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2]); p.push(pts[n - 1]); }
    for (let it = 0; it < 3; it++) {
      const m = p.length, q = new Array(m);
      for (let i = 0; i < m; i++) {
        if (!closed && (i === 0 || i === m - 1)) { q[i] = p[i]; continue; }
        const a = p[(i - 1 + m) % m], b = p[i], c = p[(i + 1) % m];
        q[i] = [(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4];
      }
      p = q;
    }
    return U.chaikin(p, closed, 1);
  };

  // Trích các đường biên giữa các ô (lưới đỉnh), trả về polyline [[x,y],...]
  // diff(x1,y1,x2,y2) => true nếu có biên giữa 2 ô kề nhau
  U.extractEdges = function (W, H, diff) {
    const VW = W + 1;
    const adj = new Map();
    const add = (a, b) => {
      let la = adj.get(a); if (!la) { la = []; adj.set(a, la); } la.push(b);
      let lb = adj.get(b); if (!lb) { lb = []; adj.set(b, lb); } lb.push(a);
    };
    for (let y = 0; y < H; y++) for (let x = 0; x <= W; x++) if (diff(x - 1, y, x, y)) add(y * VW + x, (y + 1) * VW + x);
    for (let y = 0; y <= H; y++) for (let x = 0; x < W; x++) if (diff(x, y - 1, x, y)) add(y * VW + x, y * VW + x + 1);
    const used = new Set();
    const key = (a, b) => (a < b ? a * 100000 + b : b * 100000 + a);
    const lines = [];
    const walk = (start, next) => {
      const pts = [start]; let prev = start, cur = next; used.add(key(start, next));
      for (;;) {
        pts.push(cur);
        const nb = adj.get(cur);
        if (nb.length !== 2) break;
        const nx = nb[0] === prev ? nb[1] : nb[0];
        const k = key(cur, nx); if (used.has(k)) break;
        used.add(k); prev = cur; cur = nx;
      }
      return pts;
    };
    for (const [v, nb] of adj) if (nb.length !== 2) for (const w of nb) if (!used.has(key(v, w))) lines.push(walk(v, w));
    for (const [v, nb] of adj) for (const w of nb) if (!used.has(key(v, w))) lines.push(walk(v, w));
    return lines.map(l => {
      const closed = l.length > 3 && l[0] === l[l.length - 1];
      const pts = l.map(id => [id % VW, Math.floor(id / VW)]);
      if (closed) pts.pop();
      return { pts, closed };
    });
  };
})();

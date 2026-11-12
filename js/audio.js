'use strict';
// ============ Âm thanh: nhạc nền (luân phiên các bản trong sounds/) + hiệu ứng tổng hợp bằng Web Audio ============
(function () {
  const A = CW.Audio = {};
  const TRACKS = [
    { src: 'sounds/Citadel_Of_The_Fallen_King.mp3', name: 'Citadel Of The Fallen King' },
    { src: 'sounds/The_Divided_Realm.mp3', name: 'The Divided Realm' },
  ];
  const KEY = 'cw_audio';
  A.cfg = { music: true, sfx: true, mv: 0.45, sv: 0.7 };
  try { Object.assign(A.cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* bỏ qua */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(A.cfg)); } catch (e) { /* bỏ qua */ } };

  // ---------------- Nhạc nền ----------------
  let el = null, idx = 0, unlocked = false;
  try { idx = (+localStorage.getItem('cw_track') || 0) % TRACKS.length; } catch (e) { idx = 0; }
  function ensureEl() {
    if (el) return el;
    el = new Audio(); el.preload = 'auto';
    el.addEventListener('ended', () => A.next());
    el.addEventListener('error', () => { if (A.cfg.music) setTimeout(() => A.next(), 1500); });
    return el;
  }
  function load(i) {
    idx = (i + TRACKS.length) % TRACKS.length;
    const e = ensureEl(); e.src = TRACKS[idx].src; e.volume = A.cfg.mv;
    try { localStorage.setItem('cw_track', idx); } catch (err) { /* bỏ qua */ }
    A.render();
  }
  A.play = function () {
    if (!A.cfg.music) return;
    const e = ensureEl(); if (!e.src) load(idx);
    e.volume = A.cfg.mv;
    const p = e.play(); if (p && p.catch) p.catch(() => { /* chờ người chơi tương tác */ });
  };
  A.status = () => ({ track: TRACKS[idx].name, playing: !!el && !el.paused, time: el ? Math.round(el.currentTime) : 0, music: A.cfg.music, sfx: A.cfg.sfx });
  A.next = function () { load(idx + 1); if (A.cfg.music && unlocked) A.play(); };
  A.toggleMusic = function () {
    A.cfg.music = !A.cfg.music; save();
    if (A.cfg.music) A.play(); else if (el) el.pause();
    A.render();
  };
  A.toggleSfx = function () { A.cfg.sfx = !A.cfg.sfx; save(); A.render(); if (A.cfg.sfx) A.sfx('clash', true); };
  A.setMv = function (v) { A.cfg.mv = v; save(); if (el) el.volume = v; };

  // Trình duyệt chỉ cho phát âm thanh sau thao tác đầu tiên của người chơi
  function unlock() {
    if (unlocked) return; unlocked = true;
    ctx(); A.play();
    window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true);
  }
  window.addEventListener('pointerdown', unlock, true); window.addEventListener('keydown', unlock, true);

  // ---------------- Bảng điều khiển ----------------
  A.render = function () {
    const html = A.html(); document.querySelectorAll('#audioCtl, .audioInline').forEach(b => { b.innerHTML = html; });
  };
  A.html = function () {
    return `<button class="btn sm ${A.cfg.music ? 'on' : ''}" data-aud="music" title="${A.cfg.music ? 'Tắt' : 'Bật'} nhạc nền${A.cfg.music ? ' — đang phát: ' + TRACKS[idx].name : ''}">${A.cfg.music ? '🎵' : '🔇'}</button>`
      + `<button class="btn sm" data-aud="next" title="Chuyển bài" ${A.cfg.music ? '' : 'disabled'}>⏭</button>`
      + `<input type="range" min="0" max="100" value="${Math.round(A.cfg.mv * 100)}" data-aud="vol" title="Âm lượng nhạc">`
      + `<button class="btn sm ${A.cfg.sfx ? 'on' : ''}" data-aud="sfx" title="${A.cfg.sfx ? 'Tắt' : 'Bật'} hiệu ứng âm thanh">${A.cfg.sfx ? '🔊' : '🔈'}</button>`;
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-aud]'); if (!b || b.tagName === 'INPUT') return;
    e.stopPropagation(); unlock();
    if (b.dataset.aud === 'music') A.toggleMusic(); else if (b.dataset.aud === 'next') A.next(); else if (b.dataset.aud === 'sfx') A.toggleSfx();
  });
  document.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.aud === 'vol') A.setMv(+e.target.value / 100); });
  document.addEventListener('DOMContentLoaded', A.render);
  if (document.readyState !== 'loading') setTimeout(A.render, 0);

  // ---------------- Hiệu ứng tổng hợp ----------------
  let ac = null, master = null, noiseBuf = null;
  function ctx() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      ac = new AC(); master = ac.createGain(); master.connect(ac.destination);
      const n = ac.sampleRate * 2; noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  const env = (gn, t, a, peak, dec, sus) => { // attack → peak → giảm theo hàm mũ
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(peak, t + a);
    gn.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus || 0.0001), t + a + dec);
  };
  function noise(t, dur, type, freq, q, peak, a, out) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
    const gn = ac.createGain(); env(gn, t, a || 0.005, peak, dur);
    s.connect(f); f.connect(gn); gn.connect(out || master); s.start(t, Math.random()); s.stop(t + dur + a + 0.05);
    return f;
  }
  function tone(t, type, f0, f1, dur, peak, a, out) {
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const gn = ac.createGain(); env(gn, t, a || 0.005, peak, dur);
    o.connect(gn); gn.connect(out || master); o.start(t); o.stop(t + dur + (a || 0) + 0.05);
    return o;
  }
  // Trống trận: thân trống trầm + tiếng gõ
  function drum(t, v) {
    tone(t, 'sine', 95, 42, 0.45, 0.9 * v);
    tone(t, 'triangle', 160, 70, 0.12, 0.3 * v);
    noise(t, 0.08, 'lowpass', 900, 0.7, 0.35 * v);
  }
  // Kèn đồng (kèn hiệu): sóng răng cưa qua lọc thông thấp mở dần
  function horn(t, freq, dur, v, out) {
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(2200, t + 0.08); f.frequency.linearRampToValueAtTime(1300, t + dur);
    const gn = ac.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.32 * v, t + 0.05);
    gn.gain.setValueAtTime(0.28 * v, t + dur - 0.06); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    f.connect(gn); gn.connect(out || master);
    for (const d of [-6, 0, 7]) {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = d;
      const vib = ac.createOscillator(), vg = ac.createGain(); vib.frequency.value = 5.5; vg.gain.value = 4; vib.connect(vg); vg.connect(o.detune);
      o.connect(f); o.start(t); o.stop(t + dur + 0.2); vib.start(t); vib.stop(t + dur + 0.2);
    }
  }
  // Chiêng: các họa âm không điều hòa, tắt chậm
  function gong(t, base, v) {
    [[1, 1], [1.48, 0.6], [2.02, 0.45], [2.74, 0.3], [3.9, 0.18], [5.1, 0.1]].forEach(([r, a], i) => {
      const o = tone(t, 'sine', base * r * 1.01, base * r, 3.2 - i * 0.3, 0.28 * a * v, 0.01);
      const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 3 + i; lg.gain.value = 1.5 + i; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + 3.5);
    });
    noise(t, 0.25, 'bandpass', 1800, 1.5, 0.12 * v);
  }
  // Tiếng hô của ba quân: nhiều giọng (răng cưa + lọc formant) trượt cao độ, cộng tiếng ồn đám đông
  function shout(t, v) {
    const out = ac.createGain(); out.gain.value = v; out.connect(master);
    const f1 = ac.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 650; f1.Q.value = 3;
    const f2 = ac.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1100; f2.Q.value = 4;
    const gn = ac.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.6, t + 0.12);
    gn.gain.setValueAtTime(0.5, t + 0.6); gn.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
    f1.connect(gn); f2.connect(gn); gn.connect(out);
    for (let i = 0; i < 9; i++) {
      const o = ac.createOscillator(); o.type = 'sawtooth';
      const b = 120 + Math.random() * 90, st = t + Math.random() * 0.08;
      o.frequency.setValueAtTime(b * 0.85, st); o.frequency.linearRampToValueAtTime(b * 1.18, st + 0.25); o.frequency.linearRampToValueAtTime(b * 1.05, st + 0.95);
      o.connect(f1); o.connect(f2); o.start(st); o.stop(t + 1.1);
    }
    noise(t, 0.9, 'bandpass', 800, 0.8, 0.25, 0.1, out);
    drum(t, 0.7 * v); drum(t + 0.5, 0.5 * v);
  }
  // Gươm giáo chạm nhau
  function clash(t, v) {
    [2400, 3170, 4410, 5900].forEach((f, i) => tone(t + i * 0.004, 'square', f, f * 0.97, 0.18 + i * 0.03, 0.05 * v));
    noise(t, 0.12, 'highpass', 3500, 0.7, 0.25 * v);
  }
  const SFX = {
    // Trống thúc quân khi giáp trận / tuyên chiến
    drum: (t, v) => { drum(t, v); drum(t + 0.32, 0.8 * v); drum(t + 0.64, v); clash(t + 0.7, 0.5 * v); },
    shout: (t, v) => shout(t, v),
    clash: (t, v) => clash(t, v),
    // Công thành: tiếng va đập lớn + gạch đá đổ
    siege: (t, v) => {
      tone(t, 'sine', 70, 30, 0.7, 1.0 * v); noise(t, 0.5, 'lowpass', 500, 0.8, 0.7 * v);
      for (let i = 0; i < 8; i++) noise(t + 0.15 + Math.random() * 0.6, 0.12, 'bandpass', 600 + Math.random() * 1400, 2, 0.18 * v);
    },
    // Hạ thành: va đập + kèn ngắn
    capture: (t, v) => { SFX.siege(t, 0.8 * v); horn(t + 0.5, 293.7, 0.25, v); horn(t + 0.8, 392, 0.55, v); },
    // Chiến thắng: kèn hiệu ngũ cung đi lên + trống
    victory: (t, v) => {
      const N = [[293.7, 0.18], [329.6, 0.18], [392, 0.18], [440, 0.3], [587.3, 0.9]]; let x = t;
      N.forEach(([f, d]) => { horn(x, f, d, v); x += d + 0.03; });
      drum(t, 0.8 * v); drum(t + 0.42, 0.6 * v); drum(x - 0.9, v);
    },
    // Thất bại: kèn trầm đi xuống + chiêng nhỏ
    defeat: (t, v) => {
      horn(t, 220, 0.5, 0.8 * v); horn(t + 0.55, 196, 0.5, 0.8 * v); horn(t + 1.1, 146.8, 1.2, 0.8 * v);
      gong(t + 1.1, 110, 0.5 * v); drum(t + 1.1, 0.6 * v);
    },
    // Diệt quốc: chiêng lớn ngân dài + trống
    gong: (t, v) => { gong(t, 82, v); drum(t, 0.8 * v); gong(t + 1.6, 82, 0.55 * v); drum(t + 1.6, 0.5 * v); },
    // Hỏa công: tiếng lửa bùng
    fire: (t, v) => { const f = noise(t, 1.2, 'lowpass', 400, 0.7, 0.6 * v, 0.15); f.frequency.linearRampToValueAtTime(2600, t + 0.5); for (let i = 0; i < 12; i++) noise(t + Math.random() * 1.1, 0.03, 'highpass', 2500, 1, 0.25 * v); },
  };
  // Luồng âm thanh để quay video (hiệu ứng + nhạc nền). Nhạc chỉ ghép được khi chạy qua http(s) (file:// bị chặn CORS).
  let recDest = null, elSrc = null;
  A.recordStream = function () {
    const c = ctx(); if (!c) return null;
    if (!recDest) { recDest = c.createMediaStreamDestination(); master.connect(recDest); }
    if (el && !elSrc && /^https?:/.test(location.protocol)) {
      try { elSrc = c.createMediaElementSource(el); elSrc.connect(c.destination); elSrc.connect(recDest); } catch (e) { elSrc = null; }
    }
    return recDest.stream;
  };
  const last = {};
  A.sfx = function (name, force) {
    if (!A.cfg.sfx || !SFX[name]) return;
    const now = performance.now();
    if (!force && last[name] && now - last[name] < 1800) return; // chống dồn tiếng
    if (!force && last._any && now - last._any < 350) return;
    last[name] = last._any = now;
    const c = ctx(); if (!c || c.state !== 'running' && !unlocked) return;
    try { SFX[name](c.currentTime + 0.03, A.cfg.sv); } catch (e) { /* bỏ qua */ }
  };
})();

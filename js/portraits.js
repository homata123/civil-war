'use strict';
// ============ Chân dung nhân vật: ảnh tải lên (lưu localStorage theo tên) + avatar mặc định theo vai trò & màu nước ============
(function () {
  const U = CW.U;
  const KEY = 'cw_portraits';
  const P = CW.Portraits = { lib: {}, imgs: {}, defaults: {}, urls: {}, shared: {} };

  P.load = function () {
    try { P.lib = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { P.lib = {}; }
    P.imgs = {};
    for (const name in P.lib) { const im = new Image(); im.src = P.lib[name]; P.imgs[name] = im; }
  };
  P.persist = function () {
    try { localStorage.setItem(KEY, JSON.stringify(P.lib)); return true; } catch (e) { return false; }
  };
  P.has = name => !!P.lib[name];
  // Chân dung của người chơi khác trong phòng nhiều người: chỉ giữ trong bộ nhớ, không ghi vào localStorage
  P.setShared = function (name, dataUrl) {
    if (P.lib[name]) return;
    P.shared[name] = dataUrl; const im = new Image(); im.src = dataUrl; P.imgs[name] = im;
  };
  P.set = function (name, dataUrl) {
    P.lib[name] = dataUrl; const im = new Image(); im.src = dataUrl; P.imgs[name] = im;
    if (!P.persist()) { delete P.lib[name]; delete P.imgs[name]; return false; }
    return true;
  };
  P.remove = function (name) { delete P.lib[name]; delete P.imgs[name]; P.persist(); };
  P.rename = function (oldName, newName) {
    if (!P.lib[oldName] || oldName === newName) return;
    P.lib[newName] = P.lib[oldName]; P.imgs[newName] = P.imgs[oldName];
    delete P.lib[oldName]; delete P.imgs[oldName]; P.persist();
  };

  // Đọc file ảnh, cắt vuông giữa, thu về 128px JPEG
  P.fromFile = function (file, cb) {
    if (!file || !/^image\//.test(file.type)) { cb(null); return; }
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const s = Math.min(im.width, im.height);
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const x = c.getContext('2d');
        x.drawImage(im, (im.width - s) / 2, Math.max(0, (im.height - s) / 2 - s * 0.08), s, s, 0, 0, 128, 128);
        cb(c.toDataURL('image/jpeg', 0.86));
      };
      im.onerror = () => cb(null);
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  };

  // ---- Avatar mặc định ----
  function drawDefault(role, color) {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');
    const base = U.hexToRgb(color);
    const dark = U.rgbStr(U.mix(base, [0, 0, 0], 0.45)), light = U.rgbStr(U.mix(base, [255, 255, 255], 0.35));
    const bg = x.createRadialGradient(64, 50, 10, 64, 64, 90);
    bg.addColorStop(0, light); bg.addColorStop(1, dark);
    x.fillStyle = bg; x.fillRect(0, 0, S, S);
    // hoa văn mây
    x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 2;
    for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(20 + i * 30, 112, 14, Math.PI, 0); x.stroke(); }
    const skin = '#e6c09a', skinD = '#c99a72';
    // Thân / vai
    if (role === 'monarch') {
      x.fillStyle = '#d9a520'; x.beginPath(); x.moveTo(14, 128); x.quadraticCurveTo(20, 88, 64, 84); x.quadraticCurveTo(108, 88, 114, 128); x.fill();
      x.fillStyle = U.rgbStr(U.mix(base, [0, 0, 0], 0.2)); x.beginPath(); x.moveTo(26, 128); x.quadraticCurveTo(30, 96, 64, 92); x.quadraticCurveTo(98, 96, 102, 128); x.fill();
      x.strokeStyle = '#f3d36b'; x.lineWidth = 3; x.beginPath(); x.moveTo(52, 92); x.lineTo(64, 116); x.lineTo(76, 92); x.stroke();
    } else {
      // giáp
      x.fillStyle = '#7d8088'; x.beginPath(); x.moveTo(10, 128); x.quadraticCurveTo(16, 86, 64, 84); x.quadraticCurveTo(112, 86, 118, 128); x.fill();
      x.strokeStyle = '#4b4e55'; x.lineWidth = 2;
      for (let r = 0; r < 4; r++) for (let k = 0; k < 7; k++) { x.beginPath(); x.arc(22 + k * 14 + (r % 2) * 7, 100 + r * 8, 6, 0, Math.PI); x.stroke(); }
      x.fillStyle = U.rgbStr(base); x.fillRect(40, 86, 48, 8); // khăn quàng màu nước
    }
    // Cổ & mặt
    x.fillStyle = skinD; x.fillRect(54, 72, 20, 16);
    x.fillStyle = skin; x.beginPath(); x.ellipse(64, 58, 21, 25, 0, 0, Math.PI * 2); x.fill();
    // tai
    x.beginPath(); x.ellipse(43, 60, 4, 7, 0, 0, Math.PI * 2); x.ellipse(85, 60, 4, 7, 0, 0, Math.PI * 2); x.fill();
    // mắt & mày
    x.strokeStyle = '#2a1d14'; x.lineWidth = 2.5;
    x.beginPath(); x.moveTo(51, 50); x.lineTo(60, 52); x.moveTo(77, 50); x.lineTo(68, 52); x.stroke();
    x.fillStyle = '#2a1d14'; x.fillRect(53, 56, 6, 2.5); x.fillRect(69, 56, 6, 2.5);
    x.strokeStyle = skinD; x.lineWidth = 1.5; x.beginPath(); x.moveTo(64, 58); x.lineTo(62, 67); x.lineTo(66, 67); x.stroke();
    // râu
    x.fillStyle = '#1e1712';
    if (role === 'monarch') {
      x.beginPath(); x.moveTo(52, 72); x.quadraticCurveTo(64, 76, 76, 72); x.quadraticCurveTo(72, 98, 64, 102); x.quadraticCurveTo(56, 98, 52, 72); x.fill();
      x.beginPath(); x.moveTo(54, 71); x.quadraticCurveTo(64, 66, 74, 71); x.quadraticCurveTo(64, 70, 54, 71); x.fill();
    } else {
      x.beginPath(); x.moveTo(52, 72); x.quadraticCurveTo(64, 64, 76, 72); x.quadraticCurveTo(64, 70, 52, 72); x.fill();
      x.beginPath(); x.moveTo(58, 78); x.quadraticCurveTo(64, 84, 70, 78); x.quadraticCurveTo(64, 92, 58, 78); x.fill();
    }
    // Mũ
    if (role === 'monarch') {
      x.fillStyle = '#17120e'; x.beginPath(); x.moveTo(42, 46); x.quadraticCurveTo(44, 26, 64, 24); x.quadraticCurveTo(84, 26, 86, 46); x.fill();
      x.fillStyle = '#211a14'; x.fillRect(30, 18, 68, 8); // bản miện
      x.fillStyle = '#d9a520'; x.fillRect(30, 18, 68, 2.5); x.fillRect(58, 26, 12, 8);
      for (let k = 0; k < 7; k++) { // chuỗi ngọc
        const px = 34 + k * 10; x.strokeStyle = '#d9a520'; x.lineWidth = 1; x.beginPath(); x.moveTo(px, 26); x.lineTo(px, 40); x.stroke();
        x.fillStyle = k % 2 ? '#e94b3c' : '#f5e6a8'; for (let b = 0; b < 3; b++) { x.beginPath(); x.arc(px, 29 + b * 5, 1.8, 0, 7); x.fill(); }
      }
    } else {
      // mũ trụ
      x.fillStyle = '#8f939b'; x.beginPath(); x.moveTo(38, 52); x.quadraticCurveTo(38, 22, 64, 20); x.quadraticCurveTo(90, 22, 90, 52); x.lineTo(84, 46); x.quadraticCurveTo(64, 36, 44, 46); x.closePath(); x.fill();
      x.strokeStyle = '#4b4e55'; x.lineWidth = 2; x.stroke();
      x.fillStyle = '#d9a520'; x.fillRect(60, 22, 8, 22);
      x.fillStyle = '#c0392b'; x.beginPath(); x.moveTo(64, 20); x.quadraticCurveTo(52, 2, 70, 4); x.quadraticCurveTo(66, 10, 64, 20); x.fill(); // chỏm tua đỏ
      x.fillStyle = '#7d8088'; x.fillRect(36, 50, 9, 22); x.fillRect(83, 50, 9, 22); // che má
    }
    // Viền
    x.strokeStyle = dark; x.lineWidth = 6; x.strokeRect(0, 0, S, S);
    x.strokeStyle = '#d9b45a'; x.lineWidth = 2; x.strokeRect(4, 4, S - 8, S - 8);
    return c;
  }
  P.defaultCanvas = function (role, color) {
    const k = role + color;
    if (!P.defaults[k]) P.defaults[k] = drawDefault(role, color);
    return P.defaults[k];
  };
  // Nguồn ảnh để vẽ lên canvas
  P.source = function (name, role, color) {
    const im = P.imgs[name];
    if (im && im.complete && im.naturalWidth) return im;
    return P.defaultCanvas(role, color);
  };
  // URL dùng trong HTML
  P.url = function (name, role, color) {
    if (P.lib[name]) return P.lib[name];
    if (P.shared[name]) return P.shared[name];
    const k = role + color;
    if (!P.urls[k]) P.urls[k] = P.defaultCanvas(role, color).toDataURL('image/png');
    return P.urls[k];
  };
  P.forGen = function (g, gen) {
    return P.url(gen.name, gen.monarch ? 'monarch' : 'general', CW.G.nationColor(g, gen.nation));
  };
})();

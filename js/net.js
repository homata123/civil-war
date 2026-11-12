'use strict';
// ============ Nhiều người chơi: phòng P2P qua WebRTC (PeerJS), chủ phòng giữ trạng thái gốc ============
// - Chủ phòng (host) chạy mô phỏng + AI như chơi đơn; khách chỉ gửi lệnh (CW.X → 'cmd') và nhận trạng thái.
// - Đồng bộ: gói 'tick' 5 lần/giây (ngày, vị trí quân, trận đánh, sự kiện, âm thanh) + gói 'full' ~1 lần/giây
//   (toàn bộ trạng thái trừ sử ký), và ngay sau mỗi lệnh của khách. Khách nội suy vị trí quân giữa các gói nên chuyển động mượt.
// - Không cần máy chủ riêng: PeerJS dùng máy chủ mai mối công cộng (0.peerjs.com) để hai trình duyệt tìm nhau, sau đó dữ liệu đi thẳng P2P.
//   Chạy được trên GitHub Pages (https). Thư viện chỉ được tải khi người chơi mở chế độ nhiều người.
(function () {
  const U = CW.U, G = CW.G;
  const Net = CW.Net = {};
  const PROTO = 1;
  const PREFIX = 'cw2010-dusk-';
  const LIBS = ['https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js', 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js'];
  const TICK_MS = 200, FULL_MS = 1000, CHUNK = 12000, TIMEOUT_MS = 12000;
  const $ = id => document.getElementById(id);
  const esc = U.esc;

  let mode = null;          // 'host' | 'client' | null
  let inGame = false;
  let peer = null, code = '', hostConn = null;
  let players = [];         // chủ phòng: [{ pid, name, prof, portraits, conn, online, nid, ping, seen }]; khách: bản sao hiển thị
  let cfg = { template: 'trungdia', seed: Math.floor(Math.random() * 1e6), nationCount: 6, difficulty: 'normal', mode: 'ffa' };
  let myName = '';
  let chatLog = [];
  let reqId = 0; const pending = new Map();
  let lastTick = 0, lastFull = 0, dirtyFlag = false, lastPing = 0, hostSeen = 0;
  let sharedPortraits = {};
  let status = '';
  let worker = null;

  Net.active = () => !!mode && inGame;
  Net.isHost = () => mode === 'host' && inGame;
  Net.isClient = () => mode === 'client' && inGame;
  Net.hostNation = () => 0;
  Net.code = () => code;

  // ---------------- Thư viện ----------------
  function loadLib(cb, i) {
    i = i || 0;
    if (window.Peer) { cb(true); return; }
    if (i >= LIBS.length) { cb(false); return; }
    const s = document.createElement('script'); s.src = LIBS[i]; s.async = true;
    s.onload = () => cb(!!window.Peer); s.onerror = () => { s.remove(); loadLib(cb, i + 1); };
    document.head.appendChild(s);
  }

  // ---------------- Gửi / nhận (tự chia nhỏ gói lớn) ----------------
  let partSeq = 0; const parts = new Map();
  function sendRaw(conn, str) {
    if (!conn || !conn.open) return;
    try {
      if (str.length <= CHUNK) { conn.send(str); return; }
      const k = ++partSeq, n = Math.ceil(str.length / CHUNK);
      for (let i = 0; i < n; i++) conn.send(JSON.stringify({ t: 'part', k, i, n, d: str.slice(i * CHUNK, (i + 1) * CHUNK) }));
    } catch (e) { console.warn('send', e); }
  }
  const send = (conn, obj) => sendRaw(conn, JSON.stringify(obj));
  const busy = conn => conn && conn.dataChannel && conn.dataChannel.bufferedAmount > 1.5e6;
  function onRaw(conn, data, handler) {
    let m; try { m = typeof data === 'string' ? JSON.parse(data) : data; } catch (e) { return; }
    if (!m || !m.t) return;
    if (m.t === 'part') {
      const key = conn.peer + ':' + m.k; let p = parts.get(key);
      if (!p) { p = { n: m.n, got: 0, arr: new Array(m.n) }; parts.set(key, p); }
      if (p.arr[m.i] === undefined) { p.arr[m.i] = m.d; p.got++; }
      if (p.got === p.n) { parts.delete(key); onRaw(conn, p.arr.join(''), handler); }
      return;
    }
    handler(conn, m);
  }

  // ---------------- Hồ sơ của ta ----------------
  function myProfile() {
    const p = CW.UI.loadProfile();
    return { name: p.name, char: p.char, color: p.color, title: p.title, monarch: p.monarch, capitalName: p.capitalName, startYear: p.startYear, monarchStats: p.monarchStats, generals: p.generals || [] };
  }
  function myPortraits(prof) {
    const out = {}; const P = CW.Portraits; let n = 0;
    for (const nm of [prof.monarch].concat((prof.generals || []).map(x => x.name))) if (nm && P.lib[nm] && n < 12 && P.lib[nm].length < 40000) { out[nm] = P.lib[nm]; n++; }
    return out;
  }
  const capStat = o => { o.war = U.clamp(o.war | 0, 1, 99); o.lead = U.clamp(o.lead | 0, 1, 99); o.int = U.clamp(o.int | 0, 1, 99); let s = o.war + o.lead + o.int; while (s > 240) { const k = ['war', 'lead', 'int'].sort((a, b) => o[b] - o[a])[0]; o[k]--; s--; } return o; };
  function cleanProfile(p) {
    p = p || {};
    const str = (v, n, d) => (String(v === undefined || v === null ? '' : v).trim().slice(0, n) || d);
    const out = {
      name: str(p.name, 20, 'Vô Danh Quốc'), char: str(p.char, 2, '國'), color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#888888',
      title: CW.TITLES.includes(p.title) ? p.title : 'Vương', monarch: str(p.monarch, 28, 'Vô Danh'), capitalName: str(p.capitalName, 20, ''),
      startYear: -221, monarchStats: capStat(Object.assign({ war: 60, lead: 60, int: 60 }, p.monarchStats || {})),
      generals: (Array.isArray(p.generals) ? p.generals : []).slice(0, 10).filter(x => x && x.name).map(x => capStat({ name: str(x.name, 24, 'Tướng'), war: x.war, lead: x.lead, int: x.int })),
    };
    return out;
  }
  const PALETTE = ['#c0392b', '#2e6bb8', '#2f8a3a', '#d9a520', '#8e44ad', '#16a2a2', '#d35400', '#6d4c41', '#e84393', '#34495e'];
  const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const cdist = (a, b) => { const x = hexRgb(a), y = hexRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  // Tránh trùng quốc hiệu / tên quân chủ / màu cờ giữa các người chơi
  function dedupe(profs) {
    const names = new Set(), mons = new Set(), cols = [], caps = new Set();
    for (const p of profs) {
      let n = p.name, k = 2; while (names.has(n)) n = p.name + ' ' + ['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][Math.min(9, k++)]; p.name = n; names.add(n);
      let m = p.monarch, j = 2; while (mons.has(m)) m = p.monarch + ' (' + j++ + ')'; p.monarch = m; mons.add(m);
      if (cols.some(c => cdist(c, p.color) < 70)) p.color = PALETTE.find(c => !cols.some(x => cdist(x, c) < 70)) || p.color;
      cols.push(p.color);
      if (p.capitalName && caps.has(p.capitalName)) p.capitalName = ''; // trùng tên kinh đô: dùng tên lãnh địa gốc
      if (p.capitalName) caps.add(p.capitalName);
    }
    return profs;
  }

  // ---------------- Phòng chờ (giao diện) ----------------
  Net.showLobby = function (joinCode) {
    if (CW.Cinema) CW.Cinema.startAmbient();
    CW.UI.onSetupRefresh = null;
    CW.UI.setupMode = ''; // rời màn sửa quốc gia: cho phép vẽ lại phòng chờ
    if (!myName) { try { myName = localStorage.getItem('cw_mp_name') || ''; } catch (e) { /* bỏ qua */ } }
    renderLobby();
    if (joinCode) {
      $('mp_code').value = joinCode.toUpperCase();
      if (myName) Net.join(joinCode); else { setStatus('Nhập tên người chơi rồi bấm "Vào phòng".'); $('mp_name').focus(); }
    }
  };
  function profCard(p, extra) {
    return `<div class="mpp">${flagRaw(p.color, p.char, 30)}<div style="flex:1"><b>${esc(p.name)}</b> · ${esc(p.title)} ${esc(p.monarch)}<div class="muted" style="font-size:11px">${extra || ''}</div></div></div>`;
  }
  const flagRaw = (col, ch, size) => `<span class="flag" style="background:${col};width:${size}px;height:${Math.round(size * 0.82)}px;font-size:${Math.round(size * 0.6)}px">${esc(ch)}</span>`;
  function renderLobby() {
    const menu = $('menu'); if (!menu || inGame) return;
    if (CW.UI.game && CW.UI.game()) return;
    if (CW.UI.setupMode === 'mp' && $('s_name')) return; // đang sửa quốc gia: không ghi đè màn hình
    const keep = {}; for (const id of ['mp_chat', 'mp_name', 'mp_code']) { const el = $(id); if (el) keep[id] = { v: el.value, f: document.activeElement === el }; }
    const prof = myProfile();
    const connected = mode && (mode === 'host' ? !!peer && !!code : !!hostConn && hostConn.open);
    let body = '';
    if (!connected) {
      body = `<div class="grid2"><div class="card"><h4 style="margin-top:0">Ngài là ai?</h4>
        <label class="row">Tên người chơi <input id="mp_name" maxlength="20" value="${esc(myName)}" placeholder="VD: Thắng" style="flex:1"></label>
        ${profCard(prof, `Quốc gia ngài sẽ dẫn dắt · ${prof.generals.length} tướng tự tạo`)}
        <div class="row"><button class="btn" data-act="mpProfile">✎ Thiết lập quốc gia của ta</button></div></div>
        <div class="card"><h4 style="margin-top:0">Vào trận</h4>
        <button class="btn red" data-act="mpHost" style="width:100%;font-size:16px;padding:9px">🏯 Tạo phòng mới (làm chủ phòng)</button>
        <div class="row" style="margin-top:12px"><input id="mp_code" maxlength="8" placeholder="Mã phòng" style="flex:1;text-transform:uppercase;font-size:16px;letter-spacing:3px"><button class="btn green" data-act="mpJoin">🚪 Vào phòng</button></div>
        <p class="muted" style="font-size:12px">Chủ phòng chạy mô phỏng trên máy của mình; mọi người khác điều khiển nước của họ y như chơi đơn (nội chính, mộ binh, ra trận, ngoại giao, kế sách…). Kết nối trực tiếp giữa các trình duyệt (WebRTC) — cần Internet.</p>
        <div class="muted" id="mp_status">${esc(status)}</div></div></div>`;
    } else {
      const host = mode === 'host';
      const list = players.map((p, i) => profCard(p.prof, `👤 ${esc(p.name)}${i === 0 ? ' · 👑 chủ phòng' : ''}${p.online === false ? ' · <span style="color:#b3241b">mất kết nối</span>' : ''}${p.ping ? ` · ${p.ping} ms` : ''}`)
        + (host && i > 0 ? `<button class="btn sm" data-act="mpKick" data-i="${i}" title="Mời ra khỏi phòng">✕</button>` : '')).map(x => `<div class="row" style="margin:0 0 4px">${x}</div>`).join('');
      const tpl = CW.MAP_TEMPLATES.find(t => t.id === cfg.template) || CW.MAP_TEMPLATES[0];
      const dis = host ? '' : 'disabled';
      const link = location.href.split('?')[0].split('#')[0] + '?room=' + code;
      body = `<div class="grid2"><div class="card"><h4 style="margin-top:0">Phòng <span class="mpcode">${esc(code)}</span></h4>
        <div class="row"><button class="btn sm" data-act="mpCopy" data-v="${esc(code)}">📋 Sao chép mã</button><button class="btn sm" data-act="mpCopy" data-v="${esc(link)}">🔗 Sao chép link mời</button></div>
        <h4>Quân chủ trong phòng (${players.length})</h4>${list}
        <div class="row" style="margin-top:8px"><button class="btn sm" data-act="mpProfile">✎ Sửa quốc gia của ta</button></div></div>
        <div class="card"><h4 style="margin-top:0">Thiên hạ ${host ? '' : '<span class="muted" style="font-size:11px">(chủ phòng thiết lập)</span>'}</h4>
        <div class="fields" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <label>Bản đồ<select id="mp_tpl" data-chg="mpCfg" ${dis}>${CW.MAP_TEMPLATES.map(t => `<option value="${t.id}" ${t.id === cfg.template ? 'selected' : ''}>${t.name}</option>`).join('')}</select></label>
          <label>Hạt giống<input id="mp_seed" type="number" value="${cfg.seed}" data-chg="mpCfg" ${dis}></label>
          <label>Tổng số nước: <b>${cfg.nationCount}</b> (AI: ${Math.max(0, cfg.nationCount - players.length)})<input id="mp_count" type="range" min="${Math.max(3, players.length)}" max="9" value="${cfg.nationCount}" data-chg="mpCfg" ${dis}></label>
          <label>Độ khó AI<select id="mp_diff" data-chg="mpCfg" ${dis}>${Object.keys(CW.DIFFICULTY).map(k => `<option value="${k}" ${k === cfg.difficulty ? 'selected' : ''}>${CW.DIFFICULTY[k].name}</option>`).join('')}</select></label>
          <label style="grid-column:1/-1">Chế độ<select id="mp_mode" data-chg="mpCfg" ${dis}><option value="ffa" ${cfg.mode === 'ffa' ? 'selected' : ''}>⚔ Hỗn chiến — mỗi người một nước, tự kết minh hay đối đầu</option><option value="coop" ${cfg.mode === 'coop' ? 'selected' : ''}>🤝 Hợp tác — mọi người chơi là đồng minh, cùng đánh AI</option></select></label>
        </div><p class="muted" style="font-size:12px">${esc(tpl.desc)}</p>
        <h4>Trò chuyện</h4><div class="mpchat" id="mp_chatlog">${chatLog.slice(-40).map(chatLine).join('')}</div>
        <div class="row"><input id="mp_chat" maxlength="200" placeholder="Nhắn cho cả phòng… (Enter)" style="flex:1"><button class="btn sm" data-act="mpSay">Gửi</button></div>
        <div class="row" style="justify-content:flex-end;margin-top:12px">${host ? `<button class="btn red" style="font-size:17px;padding:9px 26px" data-act="mpStart">⚔ Khai cuộc (${players.length} người chơi)</button>` : '<span class="muted">Chờ chủ phòng khai cuộc…</span>'}</div></div></div>`;
    }
    menu.innerHTML = `<div class="setup"><div class="row" style="justify-content:space-between"><h2 style="margin:0">🌐 Chơi nhiều người</h2><button class="btn" data-act="mpBack">← ${connected ? 'Rời phòng' : 'Quay lại'}</button></div>${body}</div>`;
    for (const id in keep) { const el = $(id); if (el) { el.value = keep[id].v; if (keep[id].f) el.focus(); } }
    const sc = $('mp_chatlog'); if (sc) sc.scrollTop = sc.scrollHeight;
    const ci = $('mp_chat'); if (ci) ci.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sayFrom(ci); } });
  }
  const chatLine = c => `<div class="cl"><b style="color:${c.color || '#7a4a1a'}">${esc(c.from)}</b>: ${esc(c.text)}</div>`;
  function setStatus(t) { status = t; const el = $('mp_status'); if (el) el.textContent = t; }
  function readName() { const el = $('mp_name'); if (el) { myName = el.value.trim().slice(0, 20); try { localStorage.setItem('cw_mp_name', myName); } catch (e) { /* bỏ qua */ } } return myName || 'Quân chủ'; }

  // Gắn hành động vào bộ phân phối của UI (data-act) qua sự kiện click riêng
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const f = ACTS[el.dataset.act]; if (!f) return;
    e.preventDefault(); e.stopPropagation(); f(el);
  }, true);
  document.addEventListener('change', e => { const el = e.target.closest('[data-chg="mpCfg"]'); if (el) readCfg(); }, true);
  const ACTS = {
    mpHost: () => { readName(); Net.host(); },
    mpJoin: () => { readName(); const c = ($('mp_code').value || '').trim().toUpperCase(); if (c.length < 4) { setStatus('Hãy nhập mã phòng.'); return; } Net.join(c); },
    mpProfile: () => { readName(); CW.UI.showSetup('mp'); },
    mpBack: () => { Net.leave(); CW.UI.showMenu(); },
    mpCopy: el => { const v = el.dataset.v; if (navigator.clipboard) navigator.clipboard.writeText(v).then(() => CW.UI.toast('Đã sao chép.', 'good', 1800), () => window.prompt('Sao chép:', v)); else window.prompt('Sao chép:', v); },
    mpSay: () => { const ci = $('mp_chat'); if (ci) sayFrom(ci); },
    mpKick: el => { const p = players[+el.dataset.i]; if (p && p.conn) { send(p.conn, { t: 'deny', why: 'Chủ phòng đã mời ngài ra khỏi phòng.' }); setTimeout(() => p.conn.close(), 300); } },
    mpStart: () => hostStart(),
  };
  function readCfg() {
    if (mode !== 'host') return;
    cfg.template = $('mp_tpl').value; cfg.seed = parseInt($('mp_seed').value, 10) || 1;
    cfg.nationCount = Math.max(players.length, +$('mp_count').value); cfg.difficulty = $('mp_diff').value; cfg.mode = $('mp_mode').value;
    broadcastLobby(); renderLobby();
  }
  function sayFrom(input) { const t = input.value.trim(); if (!t) return; input.value = ''; Net.chat(t); }
  Net.profileChanged = function () {
    const prof = cleanProfile(myProfile());
    if (mode === 'host' && players[0]) { players[0].prof = prof; players[0].portraits = myPortraits(prof); broadcastLobby(); }
    else if (mode === 'client' && hostConn) send(hostConn, { t: 'prof', prof, portraits: myPortraits(prof) });
  };

  // ---------------- Chủ phòng ----------------
  const newCode = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');
  Net.host = function () {
    Net.leave(true);
    setStatus('Đang tải thư viện kết nối…');
    loadLib(okLib => {
      if (!okLib) { setStatus('Không tải được thư viện PeerJS (cần Internet).'); return; }
      mode = 'host'; code = newCode();
      setStatus('Đang mở phòng…');
      const tryOpen = attempt => {
        peer = new window.Peer(PREFIX + code.toLowerCase(), { debug: 1 });
        peer.on('open', () => {
          const prof = cleanProfile(myProfile());
          players = [{ pid: 'host', name: readName(), prof, portraits: myPortraits(prof), conn: null, online: true }];
          chatLog = [{ from: 'Hệ thống', text: `Phòng ${code} đã mở. Gửi mã hoặc link mời cho bằng hữu.`, color: '#2f7a2a' }];
          renderLobby();
        });
        peer.on('connection', conn => hostAccept(conn));
        peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* bỏ qua */ } });
        peer.on('error', err => {
          if (err.type === 'unavailable-id' && attempt < 4) { try { peer.destroy(); } catch (e) { /* bỏ qua */ } code = newCode(); tryOpen(attempt + 1); return; }
          console.warn('peer', err); setStatus('Lỗi kết nối: ' + (err.type || err.message)); if (!inGame) renderLobby();
        });
      };
      tryOpen(0);
    });
  };
  function hostAccept(conn) {
    conn.on('data', d => onRaw(conn, d, hostMsg));
    conn.on('close', () => hostDrop(conn));
    conn.on('error', () => hostDrop(conn));
  }
  function playerOf(conn) { return conn ? players.find(p => p.conn === conn) : null; }
  function hostMsg(conn, m) {
    const pl = playerOf(conn); if (pl) pl.seen = performance.now();
    if (m.t === 'hello') {
      if (m.v !== PROTO) { send(conn, { t: 'deny', why: 'Phiên bản game khác nhau — hãy tải lại trang (Ctrl+F5).' }); return; }
      const name = String(m.name || 'Khách').slice(0, 20);
      const prof = cleanProfile(m.prof);
      if (inGame) {
        // Vào lại ván đang chơi (cùng tên người chơi)
        const old = players.find(p => p.name === name && !p.online && p.nid !== undefined);
        if (!old) { send(conn, { t: 'deny', why: 'Ván đã bắt đầu. Chỉ người chơi bị rớt mạng mới vào lại được (dùng đúng tên cũ).' }); return; }
        old.conn = conn; old.online = true; old.seen = performance.now();
        const g = CW.Main.game(); G.humanReturn(g, old.nid);
        G.log(g, 'diplo', `${old.name} đã trở lại, tiếp tục cai quản ${g.nations[old.nid].name}.`, { nations: [old.nid], major: true });
        sendStart(old); broadcastLobby(); return;
      }
      if (players.length >= 9) { send(conn, { t: 'deny', why: 'Phòng đã đủ người.' }); return; }
      if (players.some(p => p.name === name)) { send(conn, { t: 'deny', why: `Tên "${name}" đã có người dùng trong phòng.` }); return; }
      players.push({ pid: conn.peer, name, prof, portraits: sanitizePortraits(m.portraits), conn, online: true, seen: performance.now() });
      cfg.nationCount = Math.max(cfg.nationCount, players.length);
      sysChat(`${name} đã vào phòng.`);
      broadcastLobby(); renderLobby();
      return;
    }
    if (!pl) return;
    if (m.t === 'prof' && !inGame) { pl.prof = cleanProfile(m.prof); pl.portraits = sanitizePortraits(m.portraits); broadcastLobby(); renderLobby(); return; }
    if (m.t === 'chat') { relayChat(pl, m.text); return; }
    if (m.t === 'pong') { pl.ping = Math.round(performance.now() - m.ts); return; }
    if (m.t === 'cmd' && inGame && pl.nid !== undefined) {
      const g = CW.Main.game(); if (!g) return;
      const r = CW.Cmd.exec(g, pl.nid, String(m.c), m.a || {});
      Net.executed(pl.nid, m.c, r);
      sendFull(g, [pl]);          // khách thấy ngay kết quả (vd. đạo quân mới lập)
      send(conn, { t: 'res', id: m.id, r });
      dirtyFlag = true;
    }
  }
  function sanitizePortraits(o) {
    const out = {}; let n = 0;
    for (const k in (o || {})) if (n < 12 && typeof o[k] === 'string' && /^data:image\/(jpeg|png);base64,/.test(o[k]) && o[k].length < 40000) { out[String(k).slice(0, 28)] = o[k]; n++; }
    return out;
  }
  function hostDrop(conn) {
    const pl = playerOf(conn); if (!pl || !pl.online || pl.pid === 'host') return;
    pl.online = false; pl.conn = null;
    if (inGame && pl.nid !== undefined) {
      const g = CW.Main.game();
      if (g) { G.aiTakeover(g, pl.nid); G.log(g, 'diplo', `${pl.name} mất kết nối — AI tạm cai quản ${g.nations[pl.nid].name}. Có thể vào lại bằng mã phòng ${code} với đúng tên cũ.`, { nations: [pl.nid], major: true }); }
      sysChat(`${pl.name} mất kết nối.`);
    } else { players = players.filter(p => p !== pl); sysChat(`${pl.name} đã rời phòng.`); }
    broadcastLobby(); renderLobby();
  }
  function lobbyState() {
    return { t: 'lobby', code, cfg, players: players.map((p, i) => ({ name: p.name, prof: p.prof, online: p.online !== false, ping: p.ping || 0, host: i === 0, nid: p.nid })) };
  }
  function broadcastLobby() { const m = JSON.stringify(lobbyState()); for (const p of players) if (p.conn && p.online) sendRaw(p.conn, m); if (inGame) renderBar(); }
  function sysChat(text) { const c = { from: 'Hệ thống', text, color: '#2f7a2a' }; pushChat(c); for (const p of players) if (p.conn && p.online) send(p.conn, { t: 'chat', c }); }
  function relayChat(pl, text) {
    text = String(text || '').slice(0, 200).trim(); if (!text) return;
    const c = { from: pl.name, text, color: pl.prof.color, nid: pl.nid };
    pushChat(c); for (const p of players) if (p.conn && p.online) send(p.conn, { t: 'chat', c });
  }
  // Chủ phòng: bình luận một vài lệnh cho cả phòng (tạm dừng / tiếp tục)
  Net.executed = function (nid, name, r) {
    if (mode !== 'host' || !inGame) return;
    if (name === 'pause' && r && r.paused !== undefined) {
      const pl = players.find(p => p.nid === nid); sysChat(`${pl ? pl.name : 'Ai đó'} ${r.paused ? 'đã tạm dừng trận' : 'cho trận tiếp tục'}.`);
    }
    dirtyFlag = true;
  };
  Net.dirty = () => { dirtyFlag = true; };

  function hostStart() {
    if (mode !== 'host' || inGame) return;
    readCfg();
    const profs = dedupe(players.map(p => Object.assign(cleanProfile(p.prof), { player: p.name })));
    const used = new Set(profs.map(p => p.name));
    const rivals = CW.NATION_PRESETS.filter(p => !used.has(p.name)).sort(() => Math.random() - 0.5).slice(0, Math.max(0, cfg.nationCount - profs.length)).map(p => ({ presetId: p.id, rel: 'neutral' }));
    const setup = { profile: profs[0], humans: profs.slice(1).map(p => ({ profile: p })), template: cfg.template, seed: cfg.seed, nationCount: Math.max(cfg.nationCount, profs.length), difficulty: cfg.difficulty, mode: cfg.mode, rivals, multi: true };
    $('menu').innerHTML = '<div class="title"><h2>Đang khai thiên lập địa…</h2></div>';
    setTimeout(() => {
      const g = G.newGame(setup);
      players.forEach((p, i) => { p.nid = i; });
      sharedPortraits = {}; for (const p of players) Object.assign(sharedPortraits, p.portraits || {});
      inGame = true;
      g._evOut = []; g._sfxOut = [];
      CW.me = 0;
      CW.Main.begin(g);
      CW.Main.save('auto');
      for (const p of players.slice(1)) if (p.online) sendStart(p);
      sysChat('Khai cuộc! Chúc chư vị quân chủ vận nước hưng thịnh.');
      startWorker(); renderBar();
      CW.UI.toast('Ngài là chủ phòng: hãy giữ tab này mở để trận đấu chạy mượt cho mọi người.', '', 7000);
    }, 30);
  }
  function sendStart(p) {
    const g = CW.Main.game(); if (!g || !p.conn) return;
    send(p.conn, { t: 'start', you: p.nid, s: G.serialize(g), portraits: sharedPortraits, code, chat: chatLog.slice(-20) });
  }
  function fullStr(g) {
    const o = {}; for (const k of Object.keys(g)) if (k !== 'events' && k[0] !== '_') o[k] = g[k];
    return JSON.stringify({ t: 'full', s: o }, (k, v) => (k[0] === '_' ? undefined : v));
  }
  function sendFull(g, list) { const str = fullStr(g); for (const p of list) if (p.conn && p.online && !busy(p.conn)) sendRaw(p.conn, str); }
  const r3 = v => Math.round(v * 1000) / 1000;
  Net.hostFrame = function (g, now) {
    if (mode !== 'host' || !inGame) return;
    const guests = players.filter(p => p.conn && p.online);
    if (now - lastTick >= TICK_MS) {
      lastTick = now;
      const ev = g._evOut ? g._evOut.splice(0) : [], sx = g._sfxOut ? g._sfxOut.splice(0) : [];
      if (guests.length) {
        const msg = JSON.stringify({ t: 'tick', d: g.day, sp: g.speed, pz: g.paused, a: g.armies.map(a => [a.id, r3(a.x), r3(a.y), a.state, Math.round(a.facing * 100) / 100, a.pi, Math.round(a.morale)]), b: g.battles, ev, sx });
        for (const p of guests) sendRaw(p.conn, msg);
      }
    }
    if (guests.length && (now - lastFull >= FULL_MS || (dirtyFlag && now - lastFull > 150))) { lastFull = now; dirtyFlag = false; sendFull(g, guests); }
    if (now - lastPing > 2000) {
      lastPing = now;
      for (const p of guests) { const c = p.conn; send(c, { t: 'ping', ts: now }); if (p.seen && now - p.seen > TIMEOUT_MS) { hostDrop(c); try { c.close(); } catch (e) { /* bỏ qua */ } } }
      renderBar(); broadcastLobby();
    }
  };
  // Tab chủ phòng bị ẩn thì requestAnimationFrame ngừng chạy: dùng Worker làm nhịp phụ để trận không bị đứng cho khách
  function startWorker() {
    if (worker) return;
    try {
      const src = 'setInterval(function(){postMessage(0)},100)';
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      let last = performance.now();
      worker.onmessage = () => {
        const now = performance.now(); const dt = Math.min(0.25, (now - last) / 1000); last = now;
        if (!document.hidden || !Net.isHost()) return;
        const g = CW.Main.game(); if (!g) return;
        G.step(g, dt); Net.hostFrame(g, now);
      };
    } catch (e) { worker = null; }
  }

  // ---------------- Khách ----------------
  Net.join = function (c) {
    Net.leave(true);
    c = String(c).trim().toUpperCase();
    setStatus('Đang tải thư viện kết nối…');
    loadLib(okLib => {
      if (!okLib) { setStatus('Không tải được thư viện PeerJS (cần Internet).'); return; }
      mode = 'client'; code = c;
      setStatus(`Đang tìm phòng ${c}…`);
      peer = new window.Peer({ debug: 1 });
      peer.on('open', () => {
        hostConn = peer.connect(PREFIX + c.toLowerCase(), { reliable: true, serialization: 'raw' });
        const to = setTimeout(() => { if (hostConn && !hostConn.open) { setStatus(`Không vào được phòng ${c}. Kiểm tra lại mã, hoặc chủ phòng đã đóng phòng.`); Net.leave(true); renderLobby(); } }, 15000);
        hostConn.on('open', () => {
          clearTimeout(to); hostSeen = performance.now();
          const prof = cleanProfile(myProfile());
          send(hostConn, { t: 'hello', v: PROTO, name: myName || 'Khách', prof, portraits: myPortraits(prof) });
          setStatus('Đã vào phòng.');
        });
        hostConn.on('data', d => onRaw(hostConn, d, clientMsg));
        hostConn.on('close', () => clientLost('Chủ phòng đã đóng phòng hoặc mất kết nối.'));
        hostConn.on('error', () => clientLost('Lỗi kết nối với chủ phòng.'));
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* bỏ qua */ } });
      peer.on('error', err => {
        console.warn('peer', err);
        if (err.type === 'peer-unavailable') setStatus(`Không tìm thấy phòng ${c}.`); else setStatus('Lỗi kết nối: ' + (err.type || err.message));
        if (!inGame) { mode = null; renderLobby(); }
      });
    });
  };
  function clientMsg(conn, m) {
    hostSeen = performance.now();
    const g = CW.Main.game();
    switch (m.t) {
      case 'lobby': cfg = m.cfg; players = m.players; code = m.code; if (!inGame) renderLobby(); else renderBar(); break;
      case 'deny': if (inGame) { clientLost(m.why); break; } setStatus(m.why); CW.UI.toast(esc(m.why), 'bad', 7000); Net.leave(true); renderLobby(); break;
      case 'chat': pushChat(m.c); break;
      case 'ping': send(conn, { t: 'pong', ts: m.ts }); break;
      case 'start': {
        const gg = G.deserialize(m.s);
        for (const k in (m.portraits || {})) CW.Portraits.setShared(k, m.portraits[k]);
        if (m.chat) chatLog = m.chat;
        inGame = true; CW.me = m.you;
        CW.Main.begin(gg);
        renderBar();
        CW.UI.toast(`Ngài cai quản nước <b>${esc(gg.nations[m.you].name)}</b>. Enter để trò chuyện.`, 'good', 6000);
        break;
      }
      case 'full': if (g && inGame) applyFull(g, m.s); break;
      case 'tick': if (g && inGame) applyTick(g, m); break;
      case 'res': { const cb = pending.get(m.id); pending.delete(m.id); if (cb) cb(m.r); else CW.Cmd.toast(m.r); break; }
    }
  }
  function applyFull(g, s) {
    const prev = new Map(g.armies.map(a => [a.id, a]));
    const owners = g.provs.map(p => p.owner).join(',');
    for (const k of Object.keys(s)) if (k !== 'events') g[k] = s[k];
    for (const a of g.armies) {
      const o = prev.get(a.id);
      a._tx = a.x; a._ty = a.y;
      if (o) { a.x = o.x; a.y = o.y; }
    }
    if (g.provs.map(p => p.owner).join(',') !== owners) g.dirtyPolitical = true;
  }
  function applyTick(g, m) {
    g.day = m.d; g.speed = m.sp; g.paused = m.pz; g.battles = m.b || [];
    const map = new Map(g.armies.map(a => [a.id, a]));
    for (const r of m.a) { const a = map.get(r[0]); if (!a) continue; a._tx = r[1]; a._ty = r[2]; a.state = r[3]; a.facing = r[4]; a.pi = r[5]; a.morale = r[6]; }
    if (m.ev && m.ev.length) {
      for (const e of m.ev) { g.events.push(e); (g._fresh || (g._fresh = [])).push(e); }
      if (g.events.length > 2500) g.events.splice(0, g.events.length - 2500);
    }
    if (m.sx && m.sx.length) (g._sfxq || (g._sfxq = [])).push(...m.sx);
  }
  Net.clientFrame = function (g, dt) {
    const k = 1 - Math.exp(-dt * 9);
    for (const a of g.armies) {
      if (a._tx === undefined) continue;
      const dx = a._tx - a.x, dy = a._ty - a.y;
      if (dx * dx + dy * dy > 36) { a.x = a._tx; a.y = a._ty; } else { a.x += dx * k; a.y += dy * k; }
    }
    if (performance.now() - hostSeen > TIMEOUT_MS) clientLost('Mất tín hiệu từ chủ phòng.');
  };
  Net.command = function (name, args, cb) {
    if (!hostConn || !hostConn.open) { CW.UI.toast('Chưa kết nối tới chủ phòng.', 'bad'); return; }
    const id = ++reqId; pending.set(id, cb || null);
    send(hostConn, { t: 'cmd', id, c: name, a: args });
  };
  let lostShown = false;
  function clientLost(why) {
    if (mode !== 'client' || lostShown) return;
    lostShown = true;
    const g = CW.Main.game();
    const was = inGame;
    Net.leave(true);
    if (!was || !g) { setStatus(why); CW.UI.toast(esc(why), 'bad', 6000); renderLobby(); lostShown = false; return; }
    CW.UI.confirm(`<b>${esc(why)}</b><p>Ngài có thể tiếp tục ván này một mình: AI sẽ cai quản các nước của người chơi khác.</p>`, () => {
      for (const n of g.nations) if (n.id !== CW.me && n.isPlayer) G.aiTakeover(g, n.id, true);
      for (const a of g.armies) { if (a._tx !== undefined) { a.x = a._tx; a.y = a._ty; } }
      G.recalcIncome(g); g.paused = true;
      CW.UI.toast('Đã chuyển sang chơi đơn. Bấm Space để tiếp tục.', 'good', 6000);
      lostShown = false;
    }, 'Chơi tiếp một mình');
    const no = $('cno'); if (no) no.onclick = () => { $('confirm').classList.add('hidden'); lostShown = false; CW.Main.toMenu(); };
  }

  // ---------------- Chung ----------------
  Net.chat = function (text) {
    text = String(text || '').slice(0, 200).trim(); if (!text) return;
    if (mode === 'host') relayChat(players[0], text);
    else if (mode === 'client' && hostConn) send(hostConn, { t: 'chat', text });
  };
  function pushChat(c) {
    chatLog.push(Object.assign({ at: performance.now() }, c)); if (chatLog.length > 120) chatLog.shift();
    const el = $('mp_chatlog'); if (el && !inGame) { el.innerHTML = chatLog.slice(-40).map(chatLine).join(''); el.scrollTop = el.scrollHeight; }
    if (inGame) renderChat();
  }
  Net.leave = function (silent) {
    stopWorker();
    try { if (mode === 'host') for (const p of players) if (p.conn) { send(p.conn, { t: 'deny', why: 'Chủ phòng đã đóng phòng.' }); } } catch (e) { /* bỏ qua */ }
    const pr = peer; setTimeout(() => { try { if (pr) pr.destroy(); } catch (e) { /* bỏ qua */ } }, 300);
    peer = null; hostConn = null; mode = null; inGame = false; players = []; pending.clear();
    if (!silent) status = '';
    const bar = $('netBar'); if (bar) bar.classList.add('hidden');
    document.body.classList.remove('netgame');
    const ch = $('netChat'); if (ch) ch.classList.add('hidden');
  };
  function stopWorker() { if (worker) { worker.terminate(); worker = null; } }
  Net.playersHtml = function () {
    const g = CW.Main.game();
    return `<table class="tbl"><tr><th>Người chơi</th><th>Quốc gia</th><th>Trạng thái</th></tr>${players.map(p => {
      const n = g && p.nid !== undefined ? g.nations[p.nid] : null;
      return `<tr><td>👤 <b>${esc(p.name)}</b>${p.host || p.pid === 'host' ? ' 👑' : ''}</td><td>${n ? flagRaw(n.color, n.char, 18) + ' ' + esc(n.name) : '—'}</td><td>${p.online === false ? '<span style="color:#b3241b">mất kết nối (AI tạm quản)</span>' : n && !n.alive ? 'Đã mất nước' : 'Đang chơi'}${p.ping ? ' · ' + p.ping + ' ms' : ''}</td></tr>`;
    }).join('')}</table>`;
  };

  // ---------------- Thanh trạng thái & trò chuyện trong trận ----------------
  function renderBar() {
    let bar = $('netBar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'netBar'; document.body.appendChild(bar); bar.addEventListener('click', () => CW.UI.openModal('system')); }
    document.body.classList.toggle('netgame', inGame);
    if (!inGame) { bar.classList.add('hidden'); return; }
    const g = CW.Main.game();
    bar.classList.remove('hidden');
    bar.title = 'Phòng nhiều người — bấm để xem danh sách';
    bar.innerHTML = `🌐 <b>${esc(code)}</b> ${players.map(p => { const n = g && p.nid !== undefined ? g.nations[p.nid] : null; return n ? `<span class="nb ${p.online === false ? 'off' : ''}" title="${esc(p.name)} — ${esc(n.name)}${p.ping ? ' · ' + p.ping + ' ms' : ''}">${flagRaw(n.color, n.char, 16)}</span>` : ''; }).join('')} <span class="muted">${mode === 'host' ? 'chủ phòng' : 'khách'}</span>`;
  }
  function renderChat() {
    let box = $('netChat');
    if (!box) {
      box = document.createElement('div'); box.id = 'netChat';
      box.innerHTML = '<div id="ncLog"></div><input id="ncIn" maxlength="200" placeholder="Nhắn cho cả phòng… (Enter gửi, Esc đóng)" class="hidden">';
      document.body.appendChild(box);
      const inp = $('ncIn');
      inp.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter') { Net.chat(inp.value); inp.value = ''; inp.classList.add('hidden'); inp.blur(); renderChat(); }
        else if (e.key === 'Escape') { inp.value = ''; inp.classList.add('hidden'); inp.blur(); renderChat(); }
      });
    }
    box.classList.toggle('hidden', !inGame);
    const open = !$('ncIn').classList.contains('hidden');
    const now = performance.now();
    const list = chatLog.filter(c => open || now - (c.at || 0) < 14000).slice(open ? -12 : -5);
    $('ncLog').innerHTML = list.map(c => `<div class="cl">${c.nid !== undefined && CW.Main.game() && CW.Main.game().nations[c.nid] ? flagRaw(CW.Main.game().nations[c.nid].color, CW.Main.game().nations[c.nid].char, 14) + ' ' : ''}<b style="color:${c.color && c.from !== 'Hệ thống' ? lighten(c.color) : '#9fe08a'}">${esc(c.from)}</b>: ${esc(c.text)}</div>`).join('');
  }
  const lighten = h => { const [r, g2, b] = hexRgb(h); const f = v => Math.round(v + (255 - v) * 0.45); return `rgb(${f(r)},${f(g2)},${f(b)})`; };
  Net.focusChat = function () { renderChat(); const inp = $('ncIn'); inp.classList.remove('hidden'); renderChat(); inp.focus(); };
  setInterval(() => { if (inGame) renderChat(); }, 1000);
})();

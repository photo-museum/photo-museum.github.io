// 같이 관람: 같은 초대 링크(공유 중인 전시실)에 들어온 사람들이 서로를 보며 걷는다.
//  · Supabase Realtime 한 채널(mm:<공유 id>)에서 Presence 로 누가 있는지, Broadcast 로 위치를 주고받는다. 위치는 어디에도 저장하지 않는다.
//  · 내 위치는 1초에 10번까지만(움직였을 때), 가만히 있으면 1초에 한 번 보낸다. 받는 쪽은 그 사이를 부드럽게 이어서 그린다.
//  · 사람은 얼굴 없는 검은 실루엣 + 머리 위 이름표. 사진을 가려도 그대로 둔다 (진짜 전시처럼). 누르기·부딪힘과는 상관없다.
//  · 대화: 같은 채널에 Broadcast 'chat' 으로 흘려보낸다 (저장하지 않는다: 나중에 들어온 사람은 앞의 대화를 못 본다). 말한 사람 머리 위에 말풍선이 잠깐 뜬다.
//  · 혼자 볼 때·공유하지 않은 전시실·인터넷이 없을 때는 아무 일도 하지 않는다 (기존 동작 그대로).
// a: main.js 가 건네는 것들 { THREE, scene, controls, wake(ms), onCount(n), onChat({ name, owner, text, mine }) }
const URL_ = 'https://nrrhykbbgxvqziatkhsm.supabase.co';
// 공개용 열쇠 (publishable key): 누구에게나 보여도 되는 값이고, 이 열쇠로는 표를 읽거나 쓸 수 없다 (supabase/schema.sql 참고)
const KEY = 'sb_publishable_LVEPVQNdT_O1DY5VgLTlxw_MwIzW7ST';
const LIB = 'vendor/supabase-2.119.0.js';
const SEND_MS = 100, IDLE_MS = 1000, STALE_MS = 8000;
const CHAT_MAX = 80, CHAT_GAP = 700; // 한 번에 80자, 0.7초에 한 번까지

let libLoading = null;
function loadLib() {
  if (globalThis.supabase && globalThis.supabase.createClient) return Promise.resolve();
  if (!libLoading) libLoading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = LIB; s.onload = () => res(); s.onerror = () => { libLoading = null; rej(new Error('lib')); };
    document.head.appendChild(s);
  });
  return libLoading;
}

export function initTogether(a) {
  const { THREE, scene, controls } = a;
  const myId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  let client = null, ch = null, topic = null, me = null, live = false;
  const peers = new Map(); // id → { group, tag, name, owner, cur, tgt, at, shown }
  let names = new Map();   // id → { name, owner } (Presence)
  let lastSent = 0, sent = null, joinSeq = 0;

  // ---------- 실루엣 ----------
  const ink = new THREE.MeshBasicMaterial({ color: 0x1d1d21 }); // 어두운 방 기준 (setLight 가 방 밝기에 맞춘다)
  const G = {
    leg: new THREE.CapsuleGeometry(0.072, 0.7, 4, 10), arm: new THREE.CapsuleGeometry(0.048, 0.5, 4, 8),
    torso: new THREE.CylinderGeometry(0.2, 0.15, 0.64, 18), shoulder: new THREE.SphereGeometry(1, 16, 10),
    neck: new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10), head: new THREE.SphereGeometry(0.105, 18, 14),
    hip: new THREE.CylinderGeometry(0.152, 0.165, 0.24, 18), foot: new THREE.BoxGeometry(0.1, 0.05, 0.25), shadow: new THREE.CircleGeometry(0.42, 28),
  };
  const shadowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    r.addColorStop(0, 'rgba(0,0,0,0.5)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  function makeFigure() {
    const g = new THREE.Group();
    const add = (geo, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, ink); m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m); return m; };
    add(G.leg, -0.09, 0.44, 0); add(G.leg, 0.09, 0.44, 0);
    add(G.foot, -0.09, 0.025, -0.05); add(G.foot, 0.09, 0.025, -0.05); // 발끝이 앞(-z): 어느 쪽을 보는지 읽힌다
    add(G.torso, 0, 1.12, 0, 1, 1, 0.6);
    add(G.hip, 0, 0.84, 0, 1, 1, 0.62);
    add(G.shoulder, 0, 1.42, 0, 0.215, 0.085, 0.13);
    add(G.arm, -0.245, 1.1, 0); add(G.arm, 0.245, 1.1, 0);
    add(G.neck, 0, 1.52, -0.005);
    add(G.head, 0, 1.64, -0.015, 1, 1.14, 1.04);
    const sh = new THREE.Mesh(G.shadow, shadowMat); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.012; sh.renderOrder = 3; g.add(sh);
    return g;
  }
  // 이름표: 작은 알약. 전시 주인은 앞에 빨간 점
  function makeTag(name, owner) {
    const c = document.createElement('canvas'), g = c.getContext('2d');
    const F = '600 34px -apple-system, "Apple SD Gothic Neo", "Pretendard", system-ui, sans-serif';
    g.font = F;
    const text = name || '관람객', dot = owner ? 30 : 0, tw = Math.ceil(g.measureText(text).width);
    c.width = tw + 44 + dot; c.height = 60;
    g.font = F;
    g.fillStyle = owner ? 'rgba(52,20,22,0.82)' : 'rgba(20,20,22,0.72)';
    g.beginPath(); g.roundRect(0, 0, c.width, c.height, 30); g.fill();
    if (owner) { g.fillStyle = '#e5484d'; g.beginPath(); g.arc(30, 30, 8, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = owner ? '#ffe4dc' : '#f2f2f4'; g.textBaseline = 'middle';
    g.fillText(text, 22 + dot, 31);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    sp.scale.set(c.width / 300, c.height / 300, 1);
    sp.position.y = 1.98;
    sp.renderOrder = 4;
    return sp;
  }
  function setTag(p, name, owner) {
    if (p.tag && p.name === name && p.owner === owner) return;
    if (p.tag) { p.group.remove(p.tag); p.tag.material.map.dispose(); p.tag.material.dispose(); }
    p.name = name; p.owner = owner;
    p.tag = makeTag(name, owner);
    p.group.add(p.tag);
    a.wake(300);
  }
  function peer(id) {
    let p = peers.get(id);
    if (!p) {
      p = { group: makeFigure(), tag: null, name: null, owner: null, cur: null, tgt: null, at: 0 };
      p.group.visible = false;
      scene.add(p.group);
      peers.set(id, p);
      const n = names.get(id);
      setTag(p, n ? n.name : '', n ? n.owner : false);
    }
    return p;
  }
  function drop(id) {
    const p = peers.get(id);
    if (!p) return;
    scene.remove(p.group);
    if (p.tag) { p.tag.material.map.dispose(); p.tag.material.dispose(); }
    clearBubble(p);
    peers.delete(id);
    a.wake(300);
  }

  // ---------- 채널 ----------
  function onPresence() {
    if (!ch) return;
    const st = ch.presenceState();
    names = new Map();
    for (const k of Object.keys(st)) { const m = st[k][0] || {}; names.set(k, { name: String(m.name || '').slice(0, 12), owner: !!m.owner }); }
    for (const [id, p] of peers) { if (!names.has(id)) drop(id); else setTag(p, names.get(id).name, names.get(id).owner); }
    a.onCount(Math.max(1, names.size));
  }
  // 말풍선: 흰 둥근 판에 검은 글씨 (세 줄까지), 아래 가운데에 작은 꼬리
  function makeBubble(text) {
    const c = document.createElement('canvas'), g = c.getContext('2d');
    const F = '500 32px -apple-system, "Apple SD Gothic Neo", "Pretendard", system-ui, sans-serif', MAXW = 420;
    g.font = F;
    const lines = [];
    let cur = '';
    for (const chr of [...text]) {
      if (g.measureText(cur + chr).width > MAXW && cur) { lines.push(cur); cur = chr.trim() ? chr : ''; } else cur += chr;
    }
    if (cur) lines.push(cur);
    if (lines.length > 3) { lines.length = 3; lines[2] = lines[2].slice(0, -1) + '…'; }
    const w = Math.ceil(Math.max(...lines.map(l => g.measureText(l).width))) + 48, bh = lines.length * 42 + 28, tail = 16;
    c.width = Math.max(w, 90); c.height = bh + tail;
    g.font = F;
    g.fillStyle = 'rgba(250,250,252,0.96)';
    g.beginPath(); g.roundRect(0, 0, c.width, bh, 26); g.fill();
    g.beginPath(); g.moveTo(c.width / 2 - 14, bh - 1); g.quadraticCurveTo(c.width / 2, bh + tail + 6, c.width / 2 + 14, bh - 1); g.fill();
    g.fillStyle = '#1c1c1e'; g.textBaseline = 'middle'; g.textAlign = 'center';
    lines.forEach((l, k) => g.fillText(l, c.width / 2, 14 + 21 + k * 42));
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    sp.scale.set(c.width / 300, c.height / 300, 1);
    sp.position.y = 2.14 + c.height / 600; // 이름표 바로 위
    sp.renderOrder = 5;
    return sp;
  }
  function clearBubble(p) {
    if (!p.bubble) return;
    p.group.remove(p.bubble); p.bubble.material.map.dispose(); p.bubble.material.dispose();
    p.bubble = null; p.said = null;
    a.wake(300);
  }
  function onChat(m) {
    if (!m || m.i === myId || typeof m.t !== 'string') return;
    const text = m.t.trim().slice(0, CHAT_MAX);
    if (!text) return;
    const n = names.get(m.i) || { name: '', owner: false };
    if (peers.has(m.i)) { // 말한 사람 머리 위에 말풍선 (글이 길수록 조금 더 오래)
      const p = peers.get(m.i);
      clearBubble(p);
      p.bubble = makeBubble(text); p.said = text;
      p.bubbleUntil = performance.now() + 4500 + text.length * 70;
      p.group.add(p.bubble);
      a.wake(400);
    }
    if (a.onChat) a.onChat({ name: n.name || '관람객', owner: n.owner, text, mine: false });
  }
  // 말하기. 보냈으면 true
  let lastSaid = 0;
  function say(text) {
    text = String(text || '').trim().slice(0, CHAT_MAX);
    const now = performance.now();
    if (!text || !ch || !live || now - lastSaid < CHAT_GAP) return false;
    lastSaid = now;
    ch.send({ type: 'broadcast', event: 'chat', payload: { i: myId, t: text } }).catch(() => {});
    if (a.onChat) a.onChat({ name: (me && me.name) || '나', owner: !!(me && me.owner), text, mine: true });
    return true;
  }
  function onPos(m) {
    if (!m || m.i === myId || typeof m.x !== 'number' || typeof m.z !== 'number') return;
    const p = peer(m.i);
    p.tgt = { x: m.x, z: m.z, yaw: +m.y || 0 };
    p.at = performance.now();
    if (!p.cur) p.cur = { ...p.tgt };
  }

  // 들어가기: shareId 전시의 채널에 붙는다. 이미 같은 채널이면 이름만 다시 알린다.
  async function join(shareId, name, owner) {
    const want = 'mm:' + shareId, seq = ++joinSeq;
    me = { name: String(name || '').slice(0, 12), owner: !!owner };
    if (ch && topic === want) { if (live) ch.track(me).catch(() => {}); return; }
    await leave(true);
    try {
      await loadLib();
      if (seq !== joinSeq) return;
      if (!client) client = globalThis.supabase.createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 15 } } });
      topic = want;
      const c = ch = client.channel(want, { config: { broadcast: { self: false }, presence: { key: myId } } });
      c.on('broadcast', { event: 'pos' }, m => onPos(m.payload));
      c.on('broadcast', { event: 'chat' }, m => onChat(m.payload));
      c.on('presence', { event: 'sync' }, onPresence);
      c.subscribe(status => {
        if (ch !== c) return;
        live = status === 'SUBSCRIBED';
        if (live) { sent = null; c.track(me).catch(() => {}); }
      });
      a.onCount(1);
    } catch (e) { console.warn('같이 관람에 연결하지 못함', e); }
  }
  async function leave(keepSeq) {
    if (!keepSeq) joinSeq++;
    const c = ch;
    ch = null; topic = null; live = false; sent = null;
    for (const id of [...peers.keys()]) drop(id);
    names = new Map();
    a.onCount(0);
    if (c) { try { await c.untrack(); } catch (e) {} try { await client.removeChannel(c); } catch (e) {} }
  }
  window.addEventListener('pagehide', () => { if (ch) { try { ch.untrack(); } catch (e) {} } });

  // ---------- 매 프레임 ----------
  function tick(dt, now) {
    if (!ch) return;
    // 내 위치 보내기
    if (live && now - lastSent >= SEND_MS) {
      const x = +controls.pos.x.toFixed(2), z = +controls.pos.z.toFixed(2), y = +controls.yaw.toFixed(2);
      const moved = !sent || Math.abs(x - sent.x) > 0.01 || Math.abs(z - sent.z) > 0.01 || Math.abs(y - sent.y) > 0.01;
      if (moved || now - lastSent >= IDLE_MS) {
        lastSent = now; sent = { x, z, y };
        ch.send({ type: 'broadcast', event: 'pos', payload: { i: myId, x, z, y } }).catch(() => {});
      }
    }
    // 다른 사람들: 받은 자리로 부드럽게 따라간다
    const k = 1 - Math.exp(-Math.min(0.1, dt) * 11);
    for (const p of peers.values()) {
      if (p.bubble && now > p.bubbleUntil) clearBubble(p);
      const fresh = p.tgt && now - p.at < STALE_MS;
      if (p.group.visible !== !!fresh) { p.group.visible = !!fresh; a.wake(300); }
      if (!fresh) continue;
      const c = p.cur, t = p.tgt;
      const dx = t.x - c.x, dz = t.z - c.z;
      let dy = t.yaw - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      if (Math.hypot(dx, dz) > 12) { c.x = t.x; c.z = t.z; c.yaw = t.yaw; } // 멀리 건너뛴 것(지도로 이동 등)은 미끄러지지 않고 바로
      else { c.x += dx * k; c.z += dz * k; c.yaw += dy * k; }
      if (Math.abs(dx) + Math.abs(dz) > 0.002 || Math.abs(dy) > 0.002) a.wake(200);
      p.group.position.set(c.x, 0, c.z);
      p.group.rotation.y = c.yaw;
    }
  }
  // 실루엣 색: 어두운 방에서는 검은 벽에 묻히지 않게 벽보다 한 톤 밝은 먹색, 밝은 방에서는 거의 검정
  function setLight(light) { ink.color.setHex(light ? 0x111113 : 0x1d1d21); a.wake(200); }

  return {
    join, leave, tick, setLight, say, myId,
    get active() { return !!ch; }, get live() { return live; },
    get count() { return ch ? Math.max(1, names.size) : 0; },
    get peers() { return [...peers.entries()].map(([id, p]) => ({ id, name: p.name, owner: p.owner, visible: p.group.visible, said: p.said || null, x: p.cur ? p.cur.x : null, z: p.cur ? p.cur.z : null, yaw: p.cur ? p.cur.yaw : null })); },
  };
}

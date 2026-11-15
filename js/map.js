// 지도: 오른쪽 위 작은 지도 + 누르면 열리는 큰 평면도.
// 평면도 방향: 방이 이어지는 쪽(-Z)이 오른쪽, 왼쪽 벽(x<0)이 위쪽. (앞을 보고 걸으면 오른쪽으로 간다)
// 큰 지도에서 방을 누르면 그 방으로 이동, '편집'을 누르면 방을 끌어서 순서를 바꾼다.
import { ROOM_W, DOOR_W, INTRO_S, INTRO_W } from './layout.js';
import { getImage } from './store.js';
import { themeOf } from './builder.js';

const colorsOf = r => { const T = themeOf(r); return { floor: T.mapFloor, wall: T.mapWall, light: T.light }; };

// 방 하나를 그린다. px(z) = ox - z*s, py(x) = oy + x*s
function drawRoom(g, r, s, ox, oy, { current = false } = {}) {
  const C = colorsOf(r);
  const x0 = ox - r.zStart * s, x1 = ox - r.zEnd * s;
  const y0 = oy - ROOM_W / 2 * s, y1 = oy + ROOM_W / 2 * s;
  g.fillStyle = C.floor;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  if (current) { g.fillStyle = 'rgba(255,225,170,0.07)'; g.fillRect(x0, y0, x1 - x0, y1 - y0); }

  g.strokeStyle = C.wall;
  g.lineWidth = Math.max(1.5, s * 0.14);
  g.lineCap = 'square';
  g.beginPath();
  g.moveTo(x0, y0); g.lineTo(x1, y0);
  g.moveTo(x0, y1); g.lineTo(x1, y1);
  const end = (x, door, dx = 0) => {
    if (door) {
      const d = DOOR_W / 2 * s, c = oy + dx * s;
      g.moveTo(x, y0); g.lineTo(x, c - d);
      g.moveTo(x, c + d); g.lineTo(x, y1);
    } else { g.moveTo(x, y0); g.lineTo(x, y1); }
  };
  end(x0, r.doorIn, r.doorInX); end(x1, r.doorOut, r.doorOutX);
  g.stroke();
  // 안내벽 / 로비 소개 글
  g.lineWidth = Math.max(1.5, s * 0.16);
  g.strokeStyle = C.light ? 'rgba(90,80,68,0.7)' : 'rgba(255,217,160,0.55)';
  g.beginPath();
  if (r.lobby) {
    const xe = x1 - g.lineWidth;
    g.moveTo(xe, oy - 3.2 * s); g.lineTo(xe, oy + 0.7 * s);
  } else if (r.introX !== undefined) {
    const xi = ox - (r.zStart - INTRO_S) * s;
    g.moveTo(xi, oy + (r.introX - INTRO_W / 2) * s); g.lineTo(xi, oy + (r.introX + INTRO_W / 2) * s);
  }
  g.stroke();

  // 사진 판: 걸린 사진은 따뜻한 빛, 빈 판은 흐리게
  g.lineCap = 'butt';
  g.lineWidth = Math.max(2, s * 0.22);
  for (const p of r.panels) {
    const y = oy + p.x * s + (p.wall === 'L' ? 1 : -1) * g.lineWidth * 0.6;
    g.strokeStyle = p.photo.imageId ? '#ffd9a0' : (C.light ? 'rgba(90,85,78,0.45)' : 'rgba(220,215,205,0.35)');
    g.beginPath();
    g.moveTo(ox - (p.z + p.w / 2) * s, y);
    g.lineTo(ox - (p.z - p.w / 2) * s, y);
    g.stroke();
  }
}

// 내 위치 화살표
function drawPlayer(g, x, y, yaw, size) {
  g.save();
  g.translate(x, y);
  g.rotate(-yaw);
  // 보는 방향 부채꼴
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, size * 3.2);
  grad.addColorStop(0, 'rgba(255,240,215,0.35)');
  grad.addColorStop(1, 'rgba(255,240,215,0)');
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, size * 3.2, -0.6, 0.6); g.closePath(); g.fill();
  g.fillStyle = '#fff4e2';
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(size, 0); g.lineTo(-size * 0.7, -size * 0.65); g.lineTo(-size * 0.35, 0); g.lineTo(-size * 0.7, size * 0.65);
  g.closePath(); g.fill(); g.stroke();
  g.restore();
}

function fitCanvas(c, w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.style.width = w + 'px'; c.style.height = h + 'px';
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return g;
}

// 지도에 쓸 작은 사진 (돌린 방향 그대로). imageId+rot 별로 기억.
const thumbs = new Map();
export function thumbURL(photo, size = 220) {
  const key = photo.imageId + '|' + (photo.rot || 0) + '|' + size;
  if (!thumbs.has(key)) thumbs.set(key, makeThumb(photo.imageId, photo.rot || 0, size).catch(() => null));
  return thumbs.get(key);
}
async function makeThumb(imageId, rot, size = 220) {
  const blob = await getImage(imageId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas');
    const odd = rot % 2 === 1;
    c.width = odd ? h : w; c.height = odd ? w : h;
    const g = c.getContext('2d');
    if (rot === 1) { g.translate(h, 0); g.rotate(Math.PI / 2); }
    if (rot === 2) { g.translate(w, h); g.rotate(Math.PI); }
    if (rot === 3) { g.translate(0, w); g.rotate(-Math.PI / 2); }
    g.drawImage(img, 0, 0, w, h);
    const out = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.82));
    return out ? URL.createObjectURL(out) : c.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}

const label = i => `ROOM ${String(i + 1).padStart(2, '0')}`;

export class MuseumMap {
  // opts: { controls, getLayout, getMuseum, mapDelta(dx,dy), toContent(sx,sy), onOpen(open), isBlocked(),
  //         onGo(ri), onReorder(ids), onSwap(photoIdA, photoIdB), onPhotoTap(ri, photoId), onRoomAction(act, ri) }
  constructor(opts) {
    Object.assign(this, opts);
    this.mini = document.querySelector('#minimap');
    this.miniCanvas = this.mini.querySelector('canvas');
    this.el = document.querySelector('#map');
    this.row = this.el.querySelector('.rooms');
    this.isOpen = false;
    this.zoom = 1;            // 지도 확대 배율 (두 손가락·휠·± 버튼). 많이 줄이면 '방 모드'
    this.el.querySelectorAll('.zoom button').forEach(b => b.addEventListener('click', () => this.setZoom(this.zoom * (b.dataset.z === '1' ? 1.5 : 1 / 1.5))));
    this._last = '';
    this.mini.addEventListener('click', () => this.open());
    this.el.querySelector('[data-act="close"]').addEventListener('click', () => this.close());
    this.el.addEventListener('click', e => {
      if (e.target.closest('.acts button')) {
        const b = e.target.closest('button');
        b.closest('.mroom').classList.remove('acts-open');
        this.onRoomAction(b.dataset.act, +b.closest('.mroom').dataset.i);
        return;
      }
      if (performance.now() - (this._handled || 0) < 500) return; // 방/사진 누르기에서 이어진 click
      if (e.target === this.el || e.target === this.row) { if (!this.isBlocked()) this.close(); }
    });
    window.addEventListener('keydown', e => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') { e.stopPropagation(); this.close(); }
    }, true);
    this._bindDrag();
    this.el.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ---------- 작은 지도 (매 프레임) ----------
  update() {
    const c = this.controls;
    const layout = this.getLayout();
    if (!layout || !layout.length) return;
    const key = `${c.pos.x.toFixed(2)},${c.pos.z.toFixed(2)},${c.yaw.toFixed(3)},${this._ver || 0}`;
    if (key === this._last) return;
    this._last = key;
    const W = 104, H = 56, s = 4.2;
    const g = fitCanvas(this.miniCanvas, W, H);
    const ox = W / 2 + c.pos.z * s, oy = H / 2;
    for (const r of [layout.lobby, ...layout, layout.exit]) {
      if (ox - r.zStart * s > W || ox - r.zEnd * s < 0) continue;
      drawRoom(g, r, s, ox, oy);
    }
    drawPlayer(g, W / 2, oy + c.pos.x * s, c.yaw, 4.5);
  }
  invalidate() { this._ver = (this._ver || 0) + 1; }

  // ---------- 큰 지도 ----------
  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.el.classList.add('open');
    this.onOpen && this.onOpen(true);
    this.render();
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('open');
    this.onOpen && this.onOpen(false);
  }
  _tip() {
    this.el.querySelector('.tip').textContent = this.roomsMode
        ? '방을 꾹 눌러 끌면 다른 방 사이에 넣어요 · 확대하면 사진이 보여요'
        : '사진을 꾹 눌러 끌어 사진 위에 놓으면 자리 바꾸기, 사이에 놓으면 끼워 넣기 · 축소하면 방만 보여요';
  }
  get roomsMode() { return this.zoom < 0.7; }
  // 확대·축소: 화면에서 (ax: 목록 안 x) 자리를 그대로 두고 바꾼다
  setZoom(z, ax) {
    z = Math.max(0.12, Math.min(3, z));
    if (Math.abs(z - this.zoom) < 0.001) return;
    const row = this.row;
    if (ax == null) ax = row.clientWidth / 2;
    const f = (row.scrollLeft + ax) / Math.max(1, row.scrollWidth);
    this.zoom = z;
    this.render(true);
    row.scrollLeft = f * row.scrollWidth - ax;
  }

  // keepScroll: 지도를 연 채로 내용만 바뀔 때 (사진 바꾸기 등)
  render(keepScroll = false) {
    const layout = this.getLayout();
    const museum = this.getMuseum();
    if (!layout || !museum) return;
    const c = this.controls;
    const scroll = this.row.scrollLeft;
    const here = layout.findIndex(r => c.pos.z <= r.zStart + 0.2 && c.pos.z >= r.zEnd - 0.2);
    this.row.innerHTML = '';
    this._tip();
    // 입구·출구: 누르면 그곳으로 바로
    const door = (kind) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'door ' + kind;
      b.setAttribute('aria-label', kind === 'lobby' ? '입구로 가기' : '출구로 가기');
      b.innerHTML = kind === 'lobby'
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V9l9-6 9 6v12"/></svg><small>입구</small>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h5v16h-5"/><path d="M10 8l4 4-4 4M3 12h11"/></svg><small>출구</small>';
      b.addEventListener('click', () => { this.close(); this.onGoPlace && this.onGoPlace(kind); });
      return b;
    };
    this.row.appendChild(door('lobby'));
    // 크기: 높이에 맞추고, 가장 긴 방도 한 화면에 들어가게. 방이 많으면 옆으로 넘겨 본다.
    const rw = this.row.clientWidth || 600;
    const rh = this.row.clientHeight || 260;
    const pad = 8;
    // 지도에는 사진이 걸린 부분만 그린다 (입구 쪽 안내벽 뒤 통로 같은 빈 공간은 잘라냄)
    const TH = 1.6;     // 사진을 실제 비율보다 이만큼 크게 (눈이 안 좋아도 알아보게)
    const span = r => {
      if (!r.panels.length) return [0, Math.min(r.length, 3)];
      let a = Infinity, b = -Infinity;
      for (const p of r.panels) {
        const c = r.zStart - p.z, hw = p.w * TH / 2;
        a = Math.min(a, c - hw); b = Math.max(b, c + hw);
      }
      return [Math.max(0, a - 0.9), Math.min(r.length, b + 0.9)];
    };
    const spans = layout.map(span);
    const maxLen = Math.max(...spans.map(([a, b]) => b - a));
    const sH = (rh - 112 - pad * 2) / ROOM_W;
    const sW = (rw - 60 - pad * 2) / maxLen;
    const s0 = Math.max(9, Math.min(36, sH, sW));
    const s = s0 * this.zoom;
    const rooms = this.roomsMode;
    this.el.classList.toggle('rooms-mode', rooms);
    const wallPx = Math.max(1.5, s * 0.14);
    this._order = museum.rooms.map(r => r.id);
    layout.forEach((r, i) => {
      const room = museum.rooms[i];
      const card = document.createElement('div');
      card.className = 'mroom' + (i === here ? ' here' : '');
      card.dataset.id = room.id;
      card.dataset.i = i;
      const plan = document.createElement('div');
      plan.className = 'plan';
      // 방 모드에서도 누를 수 있게 너무 작아지지는 않게
      const [sa, sb] = spans[i];
      const w = Math.max(rooms ? 64 : 0, (sb - sa) * s + pad * 2), h = Math.max(rooms ? 64 : 0, ROOM_W * s + pad * 2);
      plan.style.width = w + 'px'; plan.style.height = h + 'px';
      card.style.setProperty('--plan-h', h + 'px');
      const ox = pad + (r.zStart - sa) * s, oy = pad + ROOM_W / 2 * s;
      // 시안 M7: 방은 그 방 벽 색의 둥근 카드 (길이는 그 방 길이대로), 지금 방은 빨갛게 빛남
      const T = themeOf(r);
      plan.style.background = T.mapWall;
      if (T.light) plan.classList.add('light');
      if (i === here) {
        const me = document.createElement('i');
        me.className = 'me';
        me.style.left = Math.max(pad + 6, Math.min(w - pad - 6, ox - c.pos.z * s)) + 'px';
        me.style.top = (oy + c.pos.x * s) + 'px';
        plan.appendChild(me);
      }
      // 액자 자리에 작은 사진 (방 모드에서는 숨김)
      for (const p of rooms ? [] : r.panels) {
        const t = document.createElement('div');
        t.className = 'thumb' + (p.photo.imageId ? '' : ' empty');
        t.dataset.pid = p.photo.id;
        // 원래 사진 비율대로 크게, 벽 하나가 방 높이의 42% 를 넘지 않게
        let tw = Math.max(12, p.w * s * TH), th = tw * (p.h / p.w);
        const thMax = ROOM_W * s * 0.42;
        if (th > thMax) { th = thMax; tw = th * (p.w / p.h); }
        t.style.width = tw + 'px'; t.style.height = th + 'px';
        t.style.left = (ox - p.z * s - tw / 2) + 'px';
        t.style.top = (p.wall === 'L' ? oy - ROOM_W / 2 * s + wallPx + 2 : oy + ROOM_W / 2 * s - wallPx - 2 - th) + 'px';
        if (p.photo.imageId) {
          thumbURL(p.photo).then(u => { if (u) t.style.backgroundImage = `url("${u}")`; });
        } else t.textContent = '+';
        plan.appendChild(t);
      }
      const hung = room.photos.filter(p => p.imageId).length;
      const cap = document.createElement('div');
      cap.className = 'cap';
      const nm = document.createElement('i');
      nm.textContent = room.name || '이름 없음';
      if (!room.name) nm.className = 'none';
      cap.innerHTML = `<b>${label(i)}</b>`;
      cap.firstChild.after(nm);
      cap.insertAdjacentHTML('beforeend', `<span>${themeOf(r).label} · 사진 ${hung}${i === here ? ' · 지금 여기' : ''}</span>`);
      // 방마다 편집 버튼 (오른쪽 위). 누르면 방 안에 아이콘이 펼쳐진다 — 평소엔 숨김
      const eb = document.createElement('button');
      eb.type = 'button'; eb.className = 'redit'; eb.setAttribute('aria-label', `${label(i)} 편집`);
      eb.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>';
      eb.addEventListener('click', e => { e.stopPropagation(); this._toggleActs(card); });
      const acts = document.createElement('div');
      acts.className = 'acts';
      const ic = {
        rename: '<path d="M5 6h14M5 12h14M5 18h9"/>',
        fill: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M12 9v6M9 12h6"/>',
        clear: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M9 12h6"/>',
        delete: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
      };
      const act = (k, t, dis) => `<button data-act="${k}"${dis ? ' disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ic[k]}</svg><small>${t}</small></button>`;
      acts.innerHTML = act('rename', '이름·설명') + act('fill', '사진 넣기') + act('clear', '모두 내리기', !hung) + act('delete', '방 지우기', layout.length <= 1);
      plan.append(eb, acts);
      if (rooms) cap.querySelector('span').textContent = `사진 ${hung}`;
      card.append(plan, cap);
      this.row.appendChild(card);
    });
    this.row.appendChild(door('exit'));
    // 입구·출구 아이콘을 방 카드 가운데 높이에 맞춘다
    const c0 = this.row.querySelector('.mroom');
    if (c0) this.row.style.setProperty('--door-y', (c0.querySelector('.plan').offsetHeight / 2 - c0.offsetHeight / 2) + 'px');
    if (keepScroll) { this.row.scrollLeft = scroll; return; }
    // 지금 있는 방이 보이게
    const cur = this._cards()[here];
    if (cur) this.row.scrollLeft = Math.max(0, cur.offsetLeft - rw / 2 + cur.offsetWidth / 2);
  }

  _relabel() {
    this._cards().forEach((card, i) => { card.querySelector('.cap b').textContent = label(i); });
  }

  _commitOrder() {
    const ids = this._cards().map(c => c.dataset.id);
    if (ids.join() !== (this._order || []).join()) {
      this._order = ids;
      this.onReorder(ids);
      this.render(true);
    }
  }

  // 방 누르기 = 이동 / 방 모드(축소)에서 방 꾹 눌러 끌기 = 순서 바꾸기
  // 사진 누르기 = 메뉴 / 사진 꾹 눌러 끌기(마우스는 바로 끌기) = 다른 사진과 자리 바꾸기
  _bindDrag() {
    let d = null;
    const row = this.row;
    // 두 손가락 벌리기·오므리기 = 지도 확대·축소
    const pts = new Map();
    let pinch = null, pinchRaf = 0;
    const pinchInfo = () => {
      const [a, b] = [...pts.values()];
      const [cx] = this.toContent((a.x + b.x) / 2, (a.y + b.y) / 2);
      return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, ax: cx - row.offsetLeft };
    };
    row.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); }, true);
    row.addEventListener('pointerdown', e => {
      if (pts.size === 2 && !(d && (d.started || d.mode === 'photo'))) {
        if (d) { clearTimeout(d.timer); d = null; }
        const pi = pinchInfo();
        pinch = { d0: pi.dist, z0: this.zoom };
        for (const id of pts.keys()) { try { row.setPointerCapture(id); } catch (er) {} }
        return;
      }
      if (pinch) return;
    }, true);
    const pmove = e => {
      const pt = pts.get(e.pointerId);
      if (pt) { pt.x = e.clientX; pt.y = e.clientY; }
      if (!pinch || pts.size < 2) return false;
      cancelAnimationFrame(pinchRaf);
      pinchRaf = requestAnimationFrame(() => { if (!pinch || pts.size < 2) return; const pi = pinchInfo(); this.setZoom(pinch.z0 * pi.dist / pinch.d0, pi.ax); });
      return true;
    };
    const pend = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    row.addEventListener('pointerup', pend, true);
    row.addEventListener('pointercancel', pend, true);
    // 컴퓨터: 휠을 위아래로 굴리면 확대·축소 (옆으로 굴리면 넘겨 보기)
    row.addEventListener('wheel', e => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      const [cx] = this.toContent(e.clientX, e.clientY);
      this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.0022), cx - row.offsetLeft);
    }, { passive: false });
    row.addEventListener('pointerdown', e => {
      cancelAnimationFrame(this._glide); // 흘러가던 것을 잡으면 멈춘다
      if (pinch || pts.size > 1) return;
      if (e.target.closest('button')) return;
      if (this.isBlocked()) { d = null; return; }
      // 카드 밖 빈 곳이나 방 아래 글씨 쪽을 끌면 좌우로 넘겨 보기만 한다.
      // 편집 중에는 방 평면도(.plan)를 끌 때만 방 순서를 바꾼다.
      const card = e.target.closest('.mroom');
      const onPlan = !!e.target.closest('.plan');
      e.preventDefault();
      row.setPointerCapture(e.pointerId);
      const thumb = e.target.closest('.thumb');
      d = { id: e.pointerId, card, thumb, onPlan, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, dx: 0, moved: 0,
        left0: card ? card.offsetLeft : 0, scroll0: row.scrollLeft, started: false, mode: null };
      if (thumb && e.pointerType !== 'mouse') {
        const dd = d;
        d.timer = setTimeout(() => { if (d === dd && dd.moved < 10) this._lift(dd); }, 380);
      }
      // 방 모드: 방을 꾹 누르면 들어 올려 다른 방 사이로 옮긴다 (마우스는 끌기 시작하면 바로)
      if (this.roomsMode && card && onPlan) {
        const dd = d;
        d.roomCan = true;
        if (e.pointerType !== 'mouse') d.timer = setTimeout(() => { if (d === dd && dd.moved < 10) this._liftRoom(dd); }, 380);
      }
    });
    row.addEventListener('pointermove', e => {
      if (pmove(e)) return;
      if (!d || e.pointerId !== d.id) return;
      let [mx, my] = this.mapDelta(e.clientX - d.x, e.clientY - d.y);
      d.x = e.clientX; d.y = e.clientY;
      d.moved += Math.abs(mx) + Math.abs(my);
      if (d.mode === 'photo') { this._moveGhost(d); return; }
      if (d.thumb && e.pointerType === 'mouse' && d.moved > 4) { this._lift(d); return; }
      if (d.roomCan && e.pointerType === 'mouse' && !d.roomLift && d.moved > 4) this._liftRoom(d);
      if (d.timer && d.moved > 10) { clearTimeout(d.timer); d.timer = null; }
      if (!d.roomLift) { // 넘겨 보기 (손 뗀 뒤 흘러가도록 빠르기를 기억)
        row.scrollLeft -= mx;
        const now = performance.now(), dt = Math.max(1, now - (d.vt || now - 16));
        d.v = (d.v || 0) * 0.5 + (-mx / dt) * 0.5; d.vt = now; d.scrolled = true;
        return;
      }
      d.dx += mx;
      this._dragStep(d);
    });
    const end = e => {
      if (!d || e.pointerId !== d.id) return;
      const dd = d; d = null;
      this._handled = performance.now();
      clearTimeout(dd.timer);
      cancelAnimationFrame(this._auto);
      if (dd.mode === 'photo') { this._drop(dd); return; }
      // 손을 뗀 뒤에도 조금 더 흘러가다 천천히 멈춘다
      if (dd.scrolled && dd.v && performance.now() - dd.vt < 150) {
        // 아이폰 스크롤처럼: 손 뗀 빠르기로 미끄러지다 0.35초 시간 상수로 잦아든다 (화면 빠르기와 상관없이 같은 거리)
        let v = Math.max(-5, Math.min(5, dd.v)); // px/ms
        let last = performance.now();
        const glide = now => {
          const dt = Math.min(50, now - last); last = now;
          v *= Math.exp(-dt / 350);
          if (Math.abs(v) < 0.02) return;
          const prev = row.scrollLeft;
          row.scrollLeft += v * dt;
          if (row.scrollLeft === prev && dt > 0) return; // 끝에 닿음
          this._glide = requestAnimationFrame(glide);
        };
        this._glide = requestAnimationFrame(glide);
      }
      if (dd.started) {
        dd.card.classList.remove('drag');
        dd.card.style.transform = '';
        if (dd.roomLift) this._commitOrder(); // 방 모드에서 옮긴 것은 바로 저장
        return;
      }
      if (dd.moved < 10 && e.type === 'pointerup' && this.row.querySelector('.acts-open')) {
        for (const c of this._cards()) c.classList.remove('acts-open'); // 펼친 편집 아이콘만 닫는다
        return;
      }
      if (dd.moved < 10 && e.type === 'pointerup') {
        if (!dd.card) return;
        if (dd.thumb) { this.onPhotoTap(+dd.card.dataset.i, dd.thumb.dataset.pid); return; }
        const ri = +dd.card.dataset.i;
        this.close();
        this.onGo(ri);
      }
    };
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', end);
    this._dragState = () => d;
  }

  // 방 들어 올리기 (방 모드에서 꾹 누름)
  _liftRoom(d) {
    clearTimeout(d.timer); d.timer = null;
    d.roomLift = true; d.started = true;
    d.card.classList.add('drag');
    d.f0 = this.toContent(d.sx, d.sy)[0] - this.row.offsetLeft;
    if (navigator.vibrate) navigator.vibrate(12);
  }

  // 사진 들어 올리기: 손가락을 따라다니는 복사본
  _lift(d) {
    clearTimeout(d.timer); d.timer = null;
    d.mode = 'photo';
    const t = d.thumb;
    const g = t.cloneNode(true);
    g.className = 'thumb ghost' + (t.classList.contains('empty') ? ' empty' : '');
    g.style.width = t.offsetWidth + 'px'; g.style.height = t.offsetHeight + 'px';
    this.el.appendChild(g);
    d.ghost = g;
    t.classList.add('lifted');
    if (navigator.vibrate) navigator.vibrate(12);
    this._moveGhost(d);
    const step = () => {
      if (this._dragState() !== d) return;
      const [cx] = this.toContent(d.x, d.y);
      const W = this.el.clientWidth;
      const E = 28; // 화면 끝 이만큼 안에 들어가야 자동으로 넘긴다
      const v = cx < E ? -(E - cx) * 0.4 - 2 : (cx > W - E ? (cx - (W - E)) * 0.4 + 2 : 0);
      if (v) { this.row.scrollLeft += v; this._moveGhost(d); }
      this._auto = requestAnimationFrame(step);
    };
    this._auto = requestAnimationFrame(step);
  }
  // 끌고 있는 사진을 어디에 놓을지:
  //  - 다른 사진의 한가운데 → 자리 바꾸기 (swap)
  //  - 사진과 사진 사이(빈 곳, 다른 방도) → 그 사이에 끼워 넣기 (insert, 빨간 세로줄로 보여 줌)
  _target(d) {
    const el = document.elementFromPoint(d.x, d.y);
    if (!el || !el.closest) return null;
    const plan = el.closest('#map .rooms .plan');
    if (!plan) return null;
    const card = plan.closest('.mroom');
    const [cx] = this.toContent(d.x, d.y);
    const px = cx - (card.offsetLeft + plan.offsetLeft - this.row.scrollLeft); // 방 그림 안 x
    const t = el.closest('.thumb');
    if (t && t !== d.thumb && !t.classList.contains('ins')) {
      const tc = t.offsetLeft + t.offsetWidth / 2;
      if (Math.abs(px - tc) < t.offsetWidth * 0.3) return { kind: 'swap', el: t };
    }
    // 끼워 넣을 자리: 이 방 사진들(끌고 있는 것 빼고)을 왼쪽부터 세어 손가락 앞에 몇 장 있나
    const thumbs = [...plan.querySelectorAll('.thumb:not(.ghost)')].filter(x => x !== d.thumb)
      .map(x => ({ el: x, c: x.offsetLeft + x.offsetWidth / 2 })).sort((a, b) => a.c - b.c);
    let k = 0;
    while (k < thumbs.length && thumbs[k].c < px) k++;
    const before = thumbs[k] ? thumbs[k].el.dataset.pid : null;
    const lx = k === 0 ? (thumbs[0] ? thumbs[0].c - thumbs[0].el.offsetWidth / 2 - 6 : px)
      : k === thumbs.length ? thumbs[k - 1].c + thumbs[k - 1].el.offsetWidth / 2 + 6
      : (thumbs[k - 1].c + thumbs[k].c) / 2;
    return { kind: 'insert', plan, ri: +card.dataset.i, before, lx };
  }
  _moveGhost(d) {
    const [cx, cy] = this.toContent(d.x, d.y);
    const g = d.ghost;
    g.style.left = (cx - g.offsetWidth / 2) + 'px';
    g.style.top = (cy - g.offsetHeight / 2) + 'px';
    const t = this._target(d);
    // 자리 바꾸기 강조
    const over = t && t.kind === 'swap' ? t.el : null;
    if (over !== d.over) {
      if (d.over) d.over.classList.remove('over');
      if (over) over.classList.add('over');
      d.over = over;
    }
    // 끼워 넣기 줄
    if (!this._insLine) { this._insLine = document.createElement('i'); this._insLine.className = 'ins-line'; }
    const L = this._insLine;
    if (t && t.kind === 'insert') {
      if (L.parentNode !== t.plan) t.plan.appendChild(L);
      L.style.left = (t.lx - 2) + 'px';
    } else if (L.parentNode) L.remove();
    d.target = t;
  }
  // 손을 뗀 순간 보이던 대로 놓는다 (휴대폰은 꾹 누른 뒤 pointercancel 로 끝나기도 해서)
  _drop(d) {
    const t = d.target;
    if (d.over) d.over.classList.remove('over');
    if (this._insLine && this._insLine.parentNode) this._insLine.remove();
    d.ghost.remove();
    d.thumb.classList.remove('lifted');
    if (!t) return;
    if (t.kind === 'swap') this.onSwap(d.thumb.dataset.pid, t.el.dataset.pid);
    else if (t.before !== d.thumb.dataset.pid) this.onInsert && this.onInsert(d.thumb.dataset.pid, t.ri, t.before);
  }

  _toggleActs(card) {
    const open = !card.classList.contains('acts-open');
    for (const c of this._cards()) c.classList.remove('acts-open');
    if (open) card.classList.add('acts-open');
  }
  _cards() { return [...this.row.querySelectorAll(':scope > .mroom')]; }
  _dragStep(d) {
    const row = this.row;
    const cards = this._cards();
    const visual = d.left0 + d.dx + (row.scrollLeft - d.scroll0); // 끌리는 방의 왼쪽 (row 좌표)
    // 손가락이 옆 방 가운데를 넘어가면 자리를 바꾼다 (카드가 커도 조금만 끌면 되게)
    const center = d.f0 + d.dx + row.offsetLeft + row.scrollLeft;
    // 들어갈 자리
    const others = cards.filter(c => c !== d.card);
    let idx = others.length;
    for (let i = 0; i < others.length; i++) {
      const c = others[i];
      if (center < c.offsetLeft + c.offsetWidth / 2) { idx = i; break; }
    }
    if (cards.indexOf(d.card) !== idx) {
      const before = new Map(others.map(c => [c, c.offsetLeft]));
      const ref = others[idx] || this.row.querySelector(':scope > .door.exit');
      row.insertBefore(d.card, ref);
      // 다른 방들은 부드럽게 미끄러지기
      for (const c of others) {
        const dx = before.get(c) - c.offsetLeft;
        if (!dx) continue;
        c.style.transition = 'none';
        c.style.transform = `translateX(${dx}px)`;
        c.getBoundingClientRect();
        c.style.transition = '';
        c.style.transform = '';
      }
      this._relabel();
    }
    d.card.style.transform = `translateX(${visual - d.card.offsetLeft}px) scale(1.04)`;
    // 끝에 닿으면 자동으로 넘기기
    cancelAnimationFrame(this._auto);
    // 카드가 아니라 손가락이 화면 끝에 닿았을 때만 (휴대폰에선 카드가 화면 반 이상이라)
    const f = d.f0 + d.dx;
    const E = Math.min(48, row.clientWidth * 0.1);
    const edge = f < E && d.dx < 0 ? -1 : (f > row.clientWidth - E && d.dx > 0 ? 1 : 0);
    if (edge) {
      this._auto = requestAnimationFrame(() => {
        if (this._dragState() !== d) return;
        const prev = row.scrollLeft;
        row.scrollLeft += edge * 8;
        if (row.scrollLeft !== prev) this._dragStep(d);
      });
    }
  }
}

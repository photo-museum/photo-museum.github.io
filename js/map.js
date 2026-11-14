// 지도: 오른쪽 위 작은 지도 + 누르면 열리는 큰 평면도.
// 평면도 방향: 방이 이어지는 쪽(-Z)이 오른쪽, 왼쪽 벽(x<0)이 위쪽. (앞을 보고 걸으면 오른쪽으로 간다)
// 큰 지도에서 방을 누르면 그 방으로 이동, '편집'을 누르면 방을 끌어서 순서를 바꾼다.
import { ROOM_W, DOOR_W, INTRO_S, INTRO_W } from './layout.js';
import { getImage } from './store.js';

const COLORS = {
  dark: { floor: '#2b2927', wall: '#8d8780' },
  white: { floor: '#d8cfc1', wall: '#f4efe6' },
};

// 방 하나를 그린다. px(z) = ox - z*s, py(x) = oy + x*s
function drawRoom(g, r, s, ox, oy, { current = false } = {}) {
  const C = COLORS[r.theme] || COLORS.dark;
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
  g.strokeStyle = r.theme === 'white' ? 'rgba(90,80,68,0.7)' : 'rgba(255,217,160,0.55)';
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
    g.strokeStyle = p.photo.imageId ? '#ffd9a0' : (r.theme === 'white' ? 'rgba(90,85,78,0.45)' : 'rgba(220,215,205,0.35)');
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
export function thumbURL(photo) {
  const key = photo.imageId + '|' + (photo.rot || 0);
  if (!thumbs.has(key)) thumbs.set(key, makeThumb(photo.imageId, photo.rot || 0).catch(() => null));
  return thumbs.get(key);
}
async function makeThumb(imageId, rot) {
  const blob = await getImage(imageId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = 220 / Math.max(img.naturalWidth, img.naturalHeight);
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
    this.editBtn = this.el.querySelector('[data-act="edit"]');
    this.isOpen = false;
    this.editing = false;
    this._last = '';
    this.mini.addEventListener('click', () => this.open());
    this.el.querySelector('[data-act="close"]').addEventListener('click', () => this.close());
    this.editBtn.addEventListener('click', () => this.setEditing(!this.editing));
    this.el.addEventListener('click', e => {
      if (e.target.closest('.acts button')) {
        const b = e.target.closest('button');
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
    for (const r of [layout.lobby, ...layout]) {
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
    if (this.editing) this.setEditing(false);
    this.isOpen = false;
    this.el.classList.remove('open');
    this.onOpen && this.onOpen(false);
  }
  setEditing(on) {
    this.editing = on;
    this.el.classList.toggle('editing', on);
    this.editBtn.textContent = on ? '완료' : '편집';
    this._tip();
    if (!on) this._commitOrder();
  }
  _tip() {
    this.el.querySelector('.tip').textContent = this.editing
      ? '방을 끌어서 순서를 바꾸세요'
      : '방을 누르면 그 방으로 · 사진을 꾹 눌러 끌면 자리 바꾸기';
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
    // 크기: 높이에 맞추고, 가장 긴 방도 한 화면에 들어가게. 방이 많으면 옆으로 넘겨 본다.
    const rw = this.row.clientWidth || 600;
    const rh = this.row.clientHeight || 260;
    const pad = 8;
    const maxLen = Math.max(...layout.map(r => r.length));
    const sH = (rh - 112 - pad * 2) / ROOM_W;
    const sW = (rw - 60 - pad * 2) / maxLen;
    const s = Math.max(9, Math.min(36, sH, sW));
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
      const cv = document.createElement('canvas');
      const w = r.length * s + pad * 2, h = ROOM_W * s + pad * 2;
      plan.style.width = w + 'px'; plan.style.height = h + 'px';
      const g = fitCanvas(cv, w, h);
      const ox = pad + r.zStart * s, oy = pad + ROOM_W / 2 * s;
      drawRoom(g, r, s, ox, oy, { current: i === here });
      if (i === here) drawPlayer(g, ox - c.pos.z * s, oy + c.pos.x * s, c.yaw, Math.max(6, s * 0.38));
      plan.appendChild(cv);
      // 액자 자리에 작은 사진
      for (const p of r.panels) {
        const t = document.createElement('div');
        t.className = 'thumb' + (p.photo.imageId ? '' : ' empty');
        t.dataset.pid = p.photo.id;
        const tw = Math.max(10, p.w * s), th = Math.max(8, Math.min(p.h * s * 0.85, ROOM_W * s * 0.3));
        t.style.width = tw + 'px'; t.style.height = th + 'px';
        t.style.left = (ox - (p.z + p.w / 2) * s) + 'px';
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
      cap.insertAdjacentHTML('beforeend', `<span>${r.theme === 'white' ? '하얀 방' : '어두운 방'} · 사진 ${hung}${i === here ? ' · 지금 여기' : ''}</span>`);
      const acts = document.createElement('div');
      acts.className = 'acts';
      acts.innerHTML = `<button data-act="rename">이름·설명</button><button data-act="fill">+ 사진 넣기</button>`
        + `<button data-act="clear" class="quiet"${hung ? '' : ' disabled'}>모두 내리기</button>`
        + `<button data-act="delete" class="quiet"${layout.length > 1 ? '' : ' disabled'}>방 지우기</button>`;
      card.append(plan, cap, acts);
      this.row.appendChild(card);
    });
    if (keepScroll) { this.row.scrollLeft = scroll; return; }
    // 지금 있는 방이 보이게
    const cur = this.row.children[here];
    if (cur) this.row.scrollLeft = Math.max(0, cur.offsetLeft - rw / 2 + cur.offsetWidth / 2);
  }

  _relabel() {
    [...this.row.children].forEach((card, i) => { card.querySelector('b').textContent = label(i); });
  }

  _commitOrder() {
    const ids = [...this.row.children].map(c => c.dataset.id);
    if (ids.join() !== (this._order || []).join()) {
      this._order = ids;
      this.onReorder(ids);
      this.render(true);
    }
  }

  // 방 누르기 = 이동 / 편집 중 방 끌기 = 순서 바꾸기
  // 사진 누르기 = 메뉴 / 사진 꾹 눌러 끌기(마우스는 바로 끌기) = 다른 사진과 자리 바꾸기
  _bindDrag() {
    let d = null;
    const row = this.row;
    row.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      if (this.isBlocked()) { d = null; return; }
      const card = e.target.closest('.mroom');
      if (!card) return;
      e.preventDefault();
      row.setPointerCapture(e.pointerId);
      const thumb = e.target.closest('.thumb');
      d = { id: e.pointerId, card, thumb, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, dx: 0, moved: 0,
        left0: card.offsetLeft, scroll0: row.scrollLeft, started: false, mode: null };
      if (thumb && e.pointerType !== 'mouse' && !this.editing) {
        const dd = d;
        d.timer = setTimeout(() => { if (d === dd && dd.moved < 10) this._lift(dd); }, 380);
      }
    });
    row.addEventListener('pointermove', e => {
      if (!d || e.pointerId !== d.id) return;
      let [mx, my] = this.mapDelta(e.clientX - d.x, e.clientY - d.y);
      d.x = e.clientX; d.y = e.clientY;
      d.moved += Math.abs(mx) + Math.abs(my);
      if (d.mode === 'photo') { this._moveGhost(d); return; }
      if (d.thumb && (e.pointerType === 'mouse' || this.editing) && d.moved > 4) { this._lift(d); return; }
      if (d.timer && d.moved > 10) { clearTimeout(d.timer); d.timer = null; }
      if (!this.editing) { row.scrollLeft -= mx; return; } // 평소엔 옆으로 넘겨 보기
      d.dx += mx;
      if (!d.started && d.moved > 4) { d.started = true; d.card.classList.add('drag'); }
      if (!d.started) return;
      this._dragStep(d);
    });
    const end = e => {
      if (!d || e.pointerId !== d.id) return;
      const dd = d; d = null;
      this._handled = performance.now();
      clearTimeout(dd.timer);
      cancelAnimationFrame(this._auto);
      if (dd.mode === 'photo') { this._drop(dd); return; }
      if (dd.started) {
        dd.card.classList.remove('drag');
        dd.card.style.transform = '';
        return;
      }
      if (dd.moved < 10 && e.type === 'pointerup') {
        if (dd.thumb) { this.onPhotoTap(+dd.card.dataset.i, dd.thumb.dataset.pid); return; }
        if (this.editing) return;
        const ri = +dd.card.dataset.i;
        this.close();
        this.onGo(ri);
      }
    };
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', end);
    this._dragState = () => d;
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
  _target(d) {
    const el = document.elementFromPoint(d.x, d.y);
    const t = el && el.closest && el.closest('#map .rooms .thumb');
    return t && t !== d.thumb ? t : null;
  }
  _moveGhost(d) {
    const [cx, cy] = this.toContent(d.x, d.y);
    const g = d.ghost;
    g.style.left = (cx - g.offsetWidth / 2) + 'px';
    g.style.top = (cy - g.offsetHeight / 2) + 'px';
    const t = this._target(d);
    if (t !== d.over) {
      if (d.over) d.over.classList.remove('over');
      if (t) t.classList.add('over');
      d.over = t;
    }
  }
  // 손을 뗀 순간 강조돼 있던 판에 놓는다 (휴대폰은 꾹 누른 뒤 pointercancel 로 끝나기도 해서)
  _drop(d) {
    const t = d.over;
    if (d.over) d.over.classList.remove('over');
    d.ghost.remove();
    d.thumb.classList.remove('lifted');
    if (t) this.onSwap(d.thumb.dataset.pid, t.dataset.pid);
  }

  _dragStep(d) {
    const row = this.row;
    const cards = [...row.children];
    const visual = d.left0 + d.dx + (row.scrollLeft - d.scroll0); // 끌리는 방의 왼쪽 (row 좌표)
    const center = visual + d.card.offsetWidth / 2;
    // 들어갈 자리
    const others = cards.filter(c => c !== d.card);
    let idx = others.length;
    for (let i = 0; i < others.length; i++) {
      const c = others[i];
      if (center < c.offsetLeft + c.offsetWidth / 2) { idx = i; break; }
    }
    if (cards.indexOf(d.card) !== idx) {
      const before = new Map(others.map(c => [c, c.offsetLeft]));
      const ref = others[idx] || null;
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
    const rel = visual - row.scrollLeft;
    const edge = rel < 30 ? -1 : (rel + d.card.offsetWidth > row.clientWidth - 30 ? 1 : 0);
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

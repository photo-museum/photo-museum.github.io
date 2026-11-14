// 지도: 오른쪽 위 작은 지도 + 누르면 열리는 큰 평면도.
// 평면도 방향: 방이 이어지는 쪽(-Z)이 오른쪽, 왼쪽 벽(x<0)이 위쪽. (앞을 보고 걸으면 오른쪽으로 간다)
// 큰 지도에서 방을 누르면 그 방으로 이동, '편집'을 누르면 방을 끌어서 순서를 바꾼다.
import { ROOM_W, DOOR_W } from './layout.js';

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
  const end = (x, door) => {
    if (door) {
      const d = DOOR_W / 2 * s;
      g.moveTo(x, y0); g.lineTo(x, oy - d);
      g.moveTo(x, oy + d); g.lineTo(x, y1);
    } else { g.moveTo(x, y0); g.lineTo(x, y1); }
  };
  end(x0, r.doorIn); end(x1, r.doorOut);
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

const label = i => `ROOM ${String(i + 1).padStart(2, '0')}`;

export class MuseumMap {
  // opts: { controls, getLayout, getMuseum, onGo(ri), onReorder(ids), mapDelta(dx,dy), onOpen(open) }
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
    this.el.addEventListener('click', e => { if (e.target === this.el || e.target === this.row) this.close(); });
    window.addEventListener('keydown', e => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') { e.stopPropagation(); this.close(); }
    }, true);
    this._bindDrag();
  }

  // ---------- 작은 지도 (매 프레임) ----------
  update() {
    const c = this.controls;
    const layout = this.getLayout();
    if (!layout || !layout.length) return;
    const key = `${c.pos.x.toFixed(2)},${c.pos.z.toFixed(2)},${c.yaw.toFixed(3)},${this._ver || 0}`;
    if (key === this._last) return;
    this._last = key;
    const W = 150, H = 92, s = 6.2;
    const g = fitCanvas(this.miniCanvas, W, H);
    const ox = W / 2 + c.pos.z * s, oy = H / 2;
    for (const r of layout) {
      if (ox - r.zStart * s > W || ox - r.zEnd * s < 0) continue;
      drawRoom(g, r, s, ox, oy);
    }
    drawPlayer(g, W / 2, oy + c.pos.x * s, c.yaw, 6);
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
    this.el.querySelector('.tip').textContent = on
      ? '방을 끌어서 순서를 바꾸세요'
      : '방을 누르면 그 방으로 가요';
    if (!on) this._commitOrder();
  }

  render() {
    const layout = this.getLayout();
    const museum = this.getMuseum();
    const c = this.controls;
    const here = layout.findIndex(r => c.pos.z <= r.zStart + 0.2 && c.pos.z >= r.zEnd - 0.2);
    this.row.innerHTML = '';
    // 크기: 모든 방이 한 화면에 들어가게. 너무 작아지면 옆으로 넘겨 본다.
    const rw = this.row.clientWidth || 600;
    const rh = this.row.clientHeight || 200;
    const gap = 14, pad = 8;
    const total = layout.reduce((a, r) => a + r.length, 0);
    const sH = (rh - 46 - pad * 2) / ROOM_W;
    const sW = (rw - 32 - gap * (layout.length - 1) - pad * 2 * layout.length) / total;
    const s = Math.max(9, Math.min(34, sH, sW));
    this._order = museum.rooms.map(r => r.id);
    layout.forEach((r, i) => {
      const room = museum.rooms[i];
      const card = document.createElement('div');
      card.className = 'mroom' + (i === here ? ' here' : '');
      card.dataset.id = room.id;
      card.dataset.i = i;
      const cv = document.createElement('canvas');
      const w = r.length * s + pad * 2, h = ROOM_W * s + pad * 2;
      const g = fitCanvas(cv, w, h);
      const ox = pad + r.zStart * s, oy = pad + ROOM_W / 2 * s;
      drawRoom(g, r, s, ox, oy, { current: i === here });
      if (i === here) drawPlayer(g, ox - c.pos.z * s, oy + c.pos.x * s, c.yaw, Math.max(6, s * 0.38));
      const hung = room.photos.filter(p => p.imageId).length;
      const cap = document.createElement('div');
      cap.className = 'cap';
      cap.innerHTML = `<b>${label(i)}</b><span>${r.theme === 'white' ? '하얀 방' : '어두운 방'} · 사진 ${hung}${i === here ? ' · 지금 여기' : ''}</span>`;
      card.append(cv, cap);
      this.row.appendChild(card);
    });
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
      this.onReorder(ids);
      this._order = ids;
      this.render();
    }
  }

  // 누르기 = 이동 / 편집 중 끌기 = 순서 바꾸기
  _bindDrag() {
    let d = null;
    const row = this.row;
    row.addEventListener('pointerdown', e => {
      const card = e.target.closest('.mroom');
      if (!card) return;
      e.preventDefault();
      row.setPointerCapture(e.pointerId);
      d = { id: e.pointerId, card, x: e.clientX, y: e.clientY, dx: 0, moved: 0,
        left0: card.offsetLeft, scroll0: row.scrollLeft, started: false };
    });
    row.addEventListener('pointermove', e => {
      if (!d || e.pointerId !== d.id) return;
      let [mx, my] = this.mapDelta(e.clientX - d.x, e.clientY - d.y);
      d.x = e.clientX; d.y = e.clientY;
      d.moved += Math.abs(mx) + Math.abs(my);
      if (!this.editing) { row.scrollLeft -= mx; return; } // 평소엔 옆으로 넘겨 보기
      d.dx += mx;
      if (!d.started && d.moved > 4) { d.started = true; d.card.classList.add('drag'); }
      if (!d.started) return;
      this._dragStep(d);
    });
    const end = e => {
      if (!d || e.pointerId !== d.id) return;
      const dd = d; d = null;
      cancelAnimationFrame(this._auto);
      if (this.editing) {
        dd.card.classList.remove('drag');
        dd.card.style.transform = '';
        return;
      }
      if (dd.moved < 8 && e.type === 'pointerup') {
        const ri = +dd.card.dataset.i;
        this.close();
        this.onGo(ri);
      }
    };
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', end);
    this._dragState = () => d;
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

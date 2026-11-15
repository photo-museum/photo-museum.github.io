// 전시장 지도 (정식 구조 R2): 방을 위에서 아래로 쌓고, 방마다 사진을 관람 순서대로 한 줄(넘치면 다음 줄)로 편다.
// 방 모양은 그리지 않는다 — 순서가 한눈에 보여서 끼워 넣기·여러 장 옮기기가 헷갈리지 않는 것이 먼저.
//  · 위아래로 밀어 넘겨 본다 · 방(빈 곳)을 누르면 그 방으로
//  · 사진: 톡 = 메뉴, 꾹 눌러 끌기 = 옮기기(위에 놓으면 자리 바꾸기, 사이에 놓으면 끼워 넣기), 꾹 눌렀다 떼기 = 여러 장 고르기
//  · 방 순서: 방 이름 왼쪽 ≡ 를 끌어 위아래로
// 작은 지도(오른쪽 위)와 고르기·놓기(_drop, _syncSel)는 map.js 것을 그대로 쓴다.
import { MuseumMap, thumbURL } from './map.js';
import { themeOf } from './builder.js';

const label = i => `ROOM ${String(i + 1).padStart(2, '0')}`;
const PEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>';
const IC = {
  rename: '<path d="M5 6h14M5 12h14M5 18h9"/>',
  style: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none"/>',
  fill: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M12 9v6M9 12h6"/>',
  captions: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  clear: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M9 12h6"/>',
  delete: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};

export class MuseumMap2 extends MuseumMap {
  get roomsMode() { return false; }
  setZoom(z) {
    z = Math.max(0.6, Math.min(2.4, z));
    if (Math.abs(z - this.zoom) < 0.001) return;
    this.zoom = z;
    this.render(true);
  }
  _tip() {
    const tip = this.el.querySelector('.tip');
    if (this.sel && this.sel.size) { tip.textContent = `${this.sel.size}장 고름 · 톡 눌러 더 고르고, 꾹 눌러 끌어 옮겨요 · 빈 곳을 누르면 취소`; return; }
    tip.textContent = '사진을 꾹 눌러 옮겨요 · ≡ 를 끌면 방 순서가 바뀌어요';
  }
  // el 의 왼쪽 위 (지도 안 좌표: 돌린 화면에서도 맞게 offset 으로 센다)
  _at(el) {
    let x = 0, y = 0;
    for (let e = el; e && e !== this.el; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; if (e.offsetParent === this.row) y -= this.row.scrollTop; }
    return { x, y };
  }

  render(keepScroll = false) {
    const layout = this.getLayout(), museum = this.getMuseum(), c = this.controls, row = this.row;
    if (!layout || !museum) return;
    const scroll = row.scrollTop;
    this.el.classList.add('v');
    this.el.classList.remove('rooms-mode');
    row.innerHTML = '';
    const here = layout.findIndex(r => c.pos.z <= r.zStart + 0.3 && c.pos.z > r.zEnd - 0.3);
    const TH = Math.round(58 * this.zoom); // 사진 높이
    this._order = museum.rooms.map(r => r.id);
    // 방마다 사진을 접어 둘 수 있다 (방 이름 줄의 ⌃). 접힌 방에도 사진을 끌어다 놓을 수 있다 (맨 끝에 들어감)
    if (!this.folded) this.folded = new Set();
    const allBtn = this.el.querySelector('.bar .foldall') || (() => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'foldall';
      b.addEventListener('click', () => {
        const ids = this.getMuseum().rooms.map(r => r.id);
        if (ids.every(id => this.folded.has(id))) this.folded.clear(); else for (const id of ids) this.folded.add(id);
        this.render(true);
      });
      this.el.querySelector('.bar .zoom').before(b);
      return b;
    })();
    allBtn.textContent = museum.rooms.every(r => this.folded.has(r.id)) ? '모두 펴기' : '모두 접기';
    const place = (kind, text, d) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'vplace ' + kind;
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg><span>${text}</span>`;
      row.appendChild(b);
      return b;
    };
    place('lobby', '입구', '<path d="M3 21V9l9-6 9 6v12"/>').addEventListener('click', () => { this.close(); this.onGoPlace && this.onGoPlace('lobby'); });
    layout.forEach((r, i) => {
      const room = museum.rooms[i];
      const hung = room.photos.filter(p => p.imageId).length;
      const card = document.createElement('div');
      const folded = this.folded.has(room.id);
      card.className = 'mroom v' + (i === here ? ' here' : '') + (folded ? ' folded' : '');
      card.dataset.id = room.id; card.dataset.i = i;
      const hd = document.createElement('div');
      hd.className = 'rhd';
      hd.innerHTML = `<button type="button" class="grip" aria-label="${label(i)} 순서 바꾸기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14"/></svg></button><b>${label(i)}</b><i></i><span>사진 ${hung}${i === here ? ' · 지금 여기' : ''}</span>`;
      const nm = hd.querySelector('i');
      nm.textContent = room.name || '이름 없음';
      if (!room.name) nm.className = 'none';
      const eb = document.createElement('button');
      eb.type = 'button'; eb.className = 'redit'; eb.setAttribute('aria-label', `${label(i)} 편집`);
      eb.innerHTML = PEN;
      eb.addEventListener('click', e => { e.stopPropagation(); if (this.folded.delete(room.id)) { this.render(true); return; } this._toggleActs(card); });
      const fb = document.createElement('button');
      fb.type = 'button'; fb.className = 'fold'; fb.setAttribute('aria-label', `${label(i)} 사진 ${folded ? '펴기' : '접기'}`); fb.setAttribute('aria-expanded', folded ? 'false' : 'true');
      fb.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>';
      fb.addEventListener('click', e => { e.stopPropagation(); if (!this.folded.delete(room.id)) this.folded.add(room.id); this.render(true); });
      hd.append(fb, eb);
      const plan = document.createElement('div');
      plan.className = 'plan strip';
      const T = themeOf(r);
      plan.style.background = T.mapWall;
      plan.style.minHeight = (TH + 20) + 'px';
      if (T.light) plan.classList.add('light');
      for (const p of [...r.panels].sort((a, b) => a.index - b.index)) {
        const t = document.createElement('div');
        t.className = 'thumb' + (p.photo.imageId ? '' : ' empty');
        t.dataset.pid = p.photo.id;
        t.style.height = TH + 'px';
        t.style.width = Math.round(TH * (p.w / p.h)) + 'px';
        if (p.photo.imageId) thumbURL(p.photo).then(u => { if (u) t.style.backgroundImage = `url("${u}")`; });
        else t.textContent = '+';
        plan.appendChild(t);
      }
      const acts = document.createElement('div');
      acts.className = 'acts';
      const act = (k, t, dis) => `<button data-act="${k}"${dis ? ' disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${IC[k]}</svg><small>${t}</small></button>`;
      acts.innerHTML = act('rename', '이름·설명') + act('style', '방 꾸미기') + act('fill', '사진 넣기') + act('captions', '사진 설명', !hung) + act('clear', '모두 내리기', !hung) + act('delete', '방 지우기', layout.length <= 1);
      plan.appendChild(acts);
      card.append(hd, plan);
      row.appendChild(card);
    });
    place('add', '방 만들기', '<path d="M12 5v14M5 12h14"/>').addEventListener('click', () => {
      this._handled = performance.now();
      this.onAddRoom && this.onAddRoom();
      const cards = this._cards(); const last = cards[cards.length - 1];
      if (last) row.scrollTop = Math.max(0, last.offsetTop - 40);
    });
    place('exit', '출구', '<path d="M14 4h5v16h-5"/><path d="M10 8l4 4-4 4M3 12h11"/>').addEventListener('click', () => { this.close(); this.onGoPlace && this.onGoPlace('exit'); });
    this._syncSel();
    // 연결선: 입구 가운데에서 출구 가운데까지 곧은 선 하나 (방을 접거나 줄이 바뀌어도 끊기지 않게 높이를 재서 그린다)
    const line = document.createElement('i');
    line.className = 'vline';
    const a = row.querySelector('.vplace.lobby'), z = row.querySelector('.vplace.exit');
    line.style.top = (a.offsetTop + a.offsetHeight / 2) + 'px';
    line.style.height = (z.offsetTop + z.offsetHeight / 2 - (a.offsetTop + a.offsetHeight / 2)) + 'px';
    row.prepend(line);
    if (keepScroll) { row.scrollTop = scroll; return; }
    const cur = this._cards()[here];
    row.scrollTop = cur ? Math.max(0, cur.offsetTop - 44) : 0;
  }

  // 끌고 있는 사진을 어디에 놓을지 (줄이 여러 개여도: 손가락이 있는 줄에서 왼쪽부터 센다)
  _target(d) {
    const el = document.elementFromPoint(d.x, d.y);
    if (!el || !el.closest) return null;
    const card = el.closest('#map .mroom.v');
    if (!card) return null;
    const plan = card.querySelector('.plan');
    if (card.classList.contains('folded')) return { kind: 'insert', plan: null, card, ri: +card.dataset.i, before: null }; // 접힌 방: 맨 끝에 넣는다
    const [cx, cy] = this.toContent(d.x, d.y);
    const o = this._at(plan);
    const px = cx - o.x, py = cy - o.y;
    const t = el.closest('.thumb');
    if (!d.multi && t && t !== d.thumb && plan.contains(t) && Math.abs(px - (t.offsetLeft + t.offsetWidth / 2)) < t.offsetWidth * 0.3) return { kind: 'swap', el: t };
    const thumbs = [...plan.querySelectorAll('.thumb')].filter(x => x !== d.thumb && !(d.multi && d.multi.includes(x)));
    let before = null;
    for (const x of thumbs) {
      if (py < x.offsetTop - 4) { before = x; break; }
      if (py <= x.offsetTop + x.offsetHeight + 4 && px < x.offsetLeft + x.offsetWidth / 2) { before = x; break; }
    }
    const last = thumbs[thumbs.length - 1];
    const line = before ? { x: before.offsetLeft - 6, y: before.offsetTop, h: before.offsetHeight }
      : last ? { x: last.offsetLeft + last.offsetWidth + 2, y: last.offsetTop, h: last.offsetHeight }
      : { x: 10, y: 10, h: 40 };
    return { kind: 'insert', plan, ri: +card.dataset.i, before: before ? before.dataset.pid : null, line };
  }
  _moveGhost(d) {
    const [cx, cy] = this.toContent(d.x, d.y);
    const g = d.ghost;
    g.style.left = (cx - g.offsetWidth / 2) + 'px';
    g.style.top = (cy - g.offsetHeight / 2) + 'px';
    const t = this._target(d);
    const over = t && t.kind === 'swap' ? t.el : null;
    if (over !== d.over) {
      if (d.over) d.over.classList.remove('over');
      if (over) over.classList.add('over');
      d.over = over;
    }
    if (!this._insLine) { this._insLine = document.createElement('i'); this._insLine.className = 'ins-line'; }
    const L = this._insLine;
    const dropCard = t && t.kind === 'insert' && !t.plan ? t.card : null; // 접힌 방 위: 방 줄을 통째로 강조
    if (dropCard !== d.dropCard) { if (d.dropCard) d.dropCard.classList.remove('drop'); if (dropCard) dropCard.classList.add('drop'); d.dropCard = dropCard; }
    if (t && t.kind === 'insert' && t.plan) {
      if (L.parentNode !== t.plan) t.plan.appendChild(L);
      L.style.left = t.line.x + 'px'; L.style.top = t.line.y + 'px'; L.style.bottom = 'auto'; L.style.height = t.line.h + 'px';
    } else if (L.parentNode) L.remove();
    d.target = t;
  }
  // 화면 위·아래 끝에 가까이 끌면 저절로 넘긴다
  _edgeScroll(d, then) {
    const step = () => {
      if (this._dragState() !== d) return;
      const [, cy] = this.toContent(d.x, d.y);
      const top = this._at(this.row).y, H = this.row.clientHeight, E = 34;
      const v = cy < top + E ? -(top + E - cy) * 0.35 - 2 : (cy > top + H - E ? (cy - (top + H - E)) * 0.35 + 2 : 0);
      if (v) { this.row.scrollTop += v; then(); }
      this._auto = requestAnimationFrame(step);
    };
    this._auto = requestAnimationFrame(step);
  }
  _lift(d) {
    clearTimeout(d.timer); d.timer = null;
    d.mode = 'photo';
    const t = d.thumb;
    const g = t.cloneNode(true);
    g.className = 'thumb ghost' + (t.classList.contains('empty') ? ' empty' : '');
    g.style.width = t.offsetWidth + 'px'; g.style.height = t.offsetHeight + 'px';
    this.el.appendChild(g);
    d.ghost = g;
    d.moved0 = d.moved;
    if (this.sel && this.sel.size > 1 && this.sel.has(t.dataset.pid)) {
      d.multi = [...this.row.querySelectorAll('.thumb.sel')];
      g.dataset.n = d.multi.length;
      for (const x of d.multi) x.classList.add('lifted');
    }
    t.classList.add('lifted');
    if (navigator.vibrate) navigator.vibrate(12);
    this._moveGhost(d);
    this._edgeScroll(d, () => this._moveGhost(d));
  }

  // 방 순서: ≡ 를 잡고 위아래로. 놓을 자리를 빨간 가로줄로 보여 준다
  _roomMove(d) {
    const cards = this._cards();
    d.card.style.transform = `translateY(${d.dy}px)`;
    const mid = d.card.offsetTop + d.card.offsetHeight / 2 + d.dy + (this.row.scrollTop - d.scroll0);
    let to = 0;
    for (const c of cards) if (c !== d.card && c.offsetTop + c.offsetHeight / 2 < mid) to++;
    d.to = to;
    if (!this._rowLine) { this._rowLine = document.createElement('i'); this._rowLine.className = 'row-line'; }
    const others = cards.filter(c => c !== d.card);
    const ref = others[to];
    const y = ref ? ref.offsetTop - 6 : (others.length ? others[others.length - 1].offsetTop + others[others.length - 1].offsetHeight + 4 : 0);
    if (this._rowLine.parentNode !== this.row) this.row.appendChild(this._rowLine);
    this._rowLine.style.top = y + 'px';
  }
  _roomDrop(d) {
    d.card.classList.remove('drag');
    d.card.style.transform = '';
    if (this._rowLine && this._rowLine.parentNode) this._rowLine.remove();
    const ids = this._order.filter(id => id !== d.card.dataset.id);
    if (d.to == null) return;
    ids.splice(d.to, 0, d.card.dataset.id);
    if (ids.join() !== this._order.join()) this.onReorder(ids);
  }

  _bindDrag() {
    const row = this.row;
    let d = null;
    this._dragState = () => d;
    row.addEventListener('wheel', e => { if (!this.el.classList.contains('v')) return; e.preventDefault(); row.scrollTop += e.deltaY; }, { passive: false });
    row.addEventListener('pointerdown', e => {
      cancelAnimationFrame(this._glide);
      const grip = e.target.closest('.grip');
      if (!grip && e.target.closest('button')) return;
      if (this.isBlocked()) { d = null; return; }
      e.preventDefault();
      row.setPointerCapture(e.pointerId);
      const card = e.target.closest('.mroom');
      const thumb = grip ? null : e.target.closest('.thumb');
      d = { id: e.pointerId, card, thumb, x: e.clientX, y: e.clientY, moved: 0, dy: 0, scroll0: row.scrollTop, mode: null };
      if (grip) {
        d.mode = 'room';
        card.classList.add('drag');
        for (const c of this._cards()) c.classList.remove('acts-open');
        if (navigator.vibrate) navigator.vibrate(12);
        this._edgeScroll(d, () => this._roomMove(d));
        return;
      }
      if (thumb && e.pointerType !== 'mouse') {
        const dd = d;
        d.timer = setTimeout(() => { if (d === dd && dd.moved < 10) this._lift(dd); }, 380);
      }
    });
    row.addEventListener('pointermove', e => {
      if (!d || e.pointerId !== d.id) return;
      const [mx, my] = this.mapDelta(e.clientX - d.x, e.clientY - d.y);
      d.x = e.clientX; d.y = e.clientY;
      d.moved += Math.abs(mx) + Math.abs(my);
      if (d.mode === 'photo') { this._moveGhost(d); return; }
      if (d.mode === 'room') { d.dy += my; this._roomMove(d); return; }
      if (d.thumb && e.pointerType === 'mouse' && d.moved > 4) { this._lift(d); return; }
      if (d.timer && d.moved > 10) { clearTimeout(d.timer); d.timer = null; }
      row.scrollTop -= my; // 넘겨 보기 (손 뗀 뒤 흘러가도록 빠르기를 기억)
      const now = performance.now(), dt = Math.max(1, now - (d.vt || now - 16));
      d.v = (d.v || 0) * 0.5 + (-my / dt) * 0.5; d.vt = now; d.scrolled = true;
    });
    const end = e => {
      if (!d || e.pointerId !== d.id) return;
      const dd = d; d = null;
      this._handled = performance.now();
      clearTimeout(dd.timer);
      cancelAnimationFrame(this._auto);
      if (dd.mode === 'photo') { if (dd.dropCard) dd.dropCard.classList.remove('drop'); this._drop(dd); return; }
      if (dd.mode === 'room') { this._roomDrop(dd); return; }
      if (dd.scrolled && dd.v && performance.now() - dd.vt < 150) {
        let v = Math.max(-5, Math.min(5, dd.v)), last = performance.now();
        const glide = now => {
          const dt = Math.min(50, now - last); last = now;
          v *= Math.exp(-dt / 350);
          if (Math.abs(v) < 0.02) return;
          const prev = row.scrollTop;
          row.scrollTop += v * dt;
          if (row.scrollTop === prev && dt > 0) return;
          this._glide = requestAnimationFrame(glide);
        };
        this._glide = requestAnimationFrame(glide);
      }
      if (dd.moved >= 10 || e.type !== 'pointerup') return;
      if (row.querySelector('.acts-open')) { for (const c of this._cards()) c.classList.remove('acts-open'); return; }
      if (this.sel && this.sel.size) {
        const pid = dd.thumb && dd.thumb.dataset.pid;
        if (pid) { if (this.sel.has(pid)) this.sel.delete(pid); else this.sel.add(pid); } else this.sel.clear();
        this._syncSel();
        return;
      }
      if (!dd.card) return;
      if (dd.thumb && (e.ctrlKey || e.metaKey || e.shiftKey)) { this.sel = this.sel || new Set(); this.sel.add(dd.thumb.dataset.pid); this._syncSel(); return; }
      if (dd.thumb) { this.onPhotoTap(+dd.card.dataset.i, dd.thumb.dataset.pid); return; }
      const ri = +dd.card.dataset.i;
      this.close();
      this.onGo(ri);
    };
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', end);
  }
}

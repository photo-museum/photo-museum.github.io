// 방 꾸미기 창: 벽 · 천장 · 바닥 · 조명을 따로 고른다 (입구·출구도). 벽을 바꾸면 추천만 보여 주고, '추천대로'를 눌러야 맞춰진다.
// main.js 가 initStylePanel(a) 로 한 번 부른다. a.museum 은 읽을 때마다 지금 전시실.
import { texOf } from './builder.js';
import { WALLS, CEILINGS, FLOORS, LIGHTS, WALL_BY, CEIL_BY, FLOOR_BY, LIGHT_BY, styleOf, recOf, PRESETS, presetOf } from './styles.js';

const SIMPLE = true; // 밝은 방 / 어두운 방 두 가지만 고른다. false 로 하면 예전 벽·천장·바닥·조명 탭

const $ = s => document.querySelector(s);

export function initStylePanel(a) {
  const { controls, museumScene, toast, persist, rebuild, pushUndo, closeSheet, route } = a;

  // ---------- 방 꾸미기: 벽 · 천장 · 바닥 · 조명 ----------
  // 벽·천장·바닥·조명을 따로 고른다. 벽을 바꾸면 추천만 보여 주고, '추천대로'를 눌러야 맞춰진다.
  const stylePanel = $('#style-panel');
  let styleTab = 'wall', styleRi = 0;
  const swCache = new Map();
  function swatchURL(kind, item, wallColor) {
    const key = kind + item.id + (kind === 'ceil' && item.tint === 'wall' ? wallColor : '');
    if (swCache.has(key)) return swCache.get(key);
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const g = c.getContext('2d');
    const hex = n => '#' + n.toString(16).padStart(6, '0');
    if (kind === 'light') {
      // 어두운 벽에 떨어지는 빛 모양
      const [a, b] = item.sw;
      g.fillStyle = b; g.fillRect(0, 0, 96, 96);
      const blob = (x, y, rx, ry, al) => { const gr = g.createRadialGradient(x, y, 0, x, y, 1); g.save(); g.translate(x, y); g.scale(rx, ry); const r = g.createRadialGradient(0, 0, 0, 0, 0, 1); r.addColorStop(0, a); r.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = al; g.fillStyle = r; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore(); };
      if (item.spots) { blob(30, 50, 22, 34, 0.95); blob(70, 50, 22, 34, 0.95); g.fillStyle = '#111'; g.fillRect(26, 4, 8, 8); g.fillRect(66, 4, 8, 8); }
      else if (item.sky) { const gr = g.createLinearGradient(0, 0, 0, 96); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, 96, 96); }
      else if (item.cove) { const gr = g.createLinearGradient(0, 0, 0, 60); gr.addColorStop(0, a); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 8, 96, 60); g.fillStyle = a; g.fillRect(0, 6, 96, 3); }
      else if (item.up) { for (const x of [20, 48, 76]) blob(x, 96, 10, 60, 0.95); }
      else { blob(48, 48, 60, 60, item.wash ? 0.9 : 0.6); }
      g.fillStyle = 'rgba(245,240,230,.9)'; g.fillRect(36, 38, 24, 18); // 사진 한 장
    } else if (kind === 'wall') {
      g.fillStyle = hex(item.color); g.fillRect(0, 0, 96, 96);
      if (item.map) { const t = texOf(museumScene.res, item.map); if (t && t.image) { g.globalCompositeOperation = 'multiply'; g.drawImage(t.image, 0, 0, 96, item.map === 'brick' ? 48 : 96); if (item.map === 'brick') g.drawImage(t.image, 0, 48, 96, 48); g.globalCompositeOperation = 'source-over'; } }
      if (item.crown) { g.fillStyle = hex(item.crown); g.fillRect(0, 0, 96, 14); }
      if (item.wainscot) { g.fillStyle = hex(item.wainscot.c); const h = Math.max(14, item.wainscot.h * 40); g.fillRect(0, 96 - h, 96, h); }
    } else {
      const t = texOf(museumScene.res, item.tex);
      const tint = item.tint === 'wall' ? wallColor : (item.tint ?? 0xffffff);
      if (t && t.image) {
        // 한 장 크기에 맞춰 약 1.6m 를 보여 준다
        const sx = 96 / (item.tile[0] / 1.6), sy = 96 / (item.tile[1] / 1.6);
        for (let x = 0; x < 96; x += sx) for (let y = 0; y < 96; y += sy) g.drawImage(t.image, x, y, sx + 0.5, sy + 0.5);
        if (tint !== 0xffffff) { g.globalCompositeOperation = 'multiply'; g.fillStyle = hex(tint); g.fillRect(0, 0, 96, 96); g.globalCompositeOperation = 'source-over'; }
      } else { g.fillStyle = hex(tint); g.fillRect(0, 0, 96, 96); }
    }
    const u = c.toDataURL('image/jpeg', 0.85);
    swCache.set(key, u);
    return u;
  }
  function openStylePanel(ri, tab = 'wall') {
    styleRi = ri; styleTab = tab;
    closeSheet();
    stylePanel.classList.add('open');
    document.body.classList.add('style-open');
    renderStylePanel();
  }
  function closeStylePanel() { stylePanel.classList.remove('open'); document.body.classList.remove('style-open'); }
  // 꾸밀 곳: 방 (0..n-1), 입구 (-1), 출구 (n). 입구·출구는 따로 정하지 않으면 첫 방·마지막 방을 따른다.
  function styleTarget(ri = styleRi) {
    const n = a.museum.rooms.length;
    if (ri < 0 || ri >= n) {
      const lobby = ri < 0, key = lobby ? 'lobbyStyle' : 'exitStyle', base = a.museum.rooms[lobby ? 0 : n - 1];
      return {
        label: lobby ? '입구' : '출구', key, follows: !a.museum[key], baseName: lobby ? '첫 방' : '마지막 방',
        room: { style: a.museum[key] || base.style, theme: base.theme },
        set(st) { a.museum[key] = st; },
      };
    }
    const room = a.museum.rooms[ri];
    return room && { label: `ROOM ${String(ri + 1).padStart(2, '0')}`, room, set(st) { room.style = st; } };
  }
  function renderStylePanel() {
    const tg = styleTarget();
    if (!tg) return;
    const room = tg.room;
    const st = styleOf(room);
    const W = WALL_BY[st.wall];
    const rec = recOf(st.wall);
    stylePanel.querySelector('.ttl').textContent = `${tg.label} 꾸미기`;
    const fol = stylePanel.querySelector('.follow');
    fol.hidden = !tg.key || tg.follows;
    if (tg.key) fol.textContent = `${tg.baseName}과 같게`;
    if (SIMPLE) {
      // 카드 두 장: 밝은 방 / 어두운 방
      stylePanel.classList.add('simple');
      const cur = presetOf(st);
      stylePanel.querySelector('.now').textContent = tg.key && tg.follows ? `지금은 ${tg.baseName}과 같아요 · 고르면 ${tg.label}만 따로 바뀌어요`
        : cur ? cur.sub : `지금: ${W.label} (예전에 꾸민 방) · 고르면 바뀌어요`;
      stylePanel.querySelector('.reset').hidden = true;
      stylePanel.querySelector('.rec').hidden = true;
      const box = stylePanel.querySelector('.items');
      box.innerHTML = '';
      for (const P of PRESETS) {
        const b = document.createElement('button');
        b.className = 'preset' + (cur === P && !(tg.key && tg.follows) ? ' on' : '');
        b.dataset.preset = P.id;
        b.innerHTML = `<i style="background: linear-gradient(180deg, ${P.wallCss} 0 64%, ${P.floorCss} 64%)"><u></u></i><span><b></b><small></small></span>`;
        b.querySelector('b').textContent = P.label;
        b.querySelector('small').textContent = P.sub;
        b.addEventListener('click', () => applyPreset(P.id));
        box.appendChild(b);
      }
      return;
    }
    stylePanel.querySelector('.now').textContent = tg.key && tg.follows ? `지금은 ${tg.baseName}과 같아요 · 고르면 ${tg.label}만 따로 바뀌어요` : '';
    if (!(tg.key && tg.follows)) stylePanel.querySelector('.now').textContent = `${W.label} · ${CEIL_BY[st.ceil].label} · ${FLOOR_BY[st.floor].label} · ${LIGHT_BY[st.light].label}`;
    for (const b of stylePanel.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === styleTab);
    // 추천: 바꾸지는 않고 보여 주기만. '추천대로'를 누르면 천장·바닥·조명을 한꺼번에.
    const same = st.ceil === rec.ceil && st.floor === rec.floor && st.light === rec.light;
    const reset = stylePanel.querySelector('.reset');
    reset.hidden = same;
    const recLine = stylePanel.querySelector('.rec');
    recLine.hidden = same;
    recLine.textContent = `${W.label}에 어울리는 추천 · 천장 ${CEIL_BY[rec.ceil].label} · 바닥 ${FLOOR_BY[rec.floor].label} · 조명 ${LIGHT_BY[rec.light].label}`;
    const box = stylePanel.querySelector('.items');
    box.innerHTML = '';
    const add = (kind, item, on, isRec, groupHead) => {
      if (groupHead) { const h = document.createElement('span'); h.className = 'gh'; h.textContent = groupHead; box.appendChild(h); }
      const b = document.createElement('button');
      b.className = 'sw' + (on ? ' on' : '');
      b.innerHTML = `<i style="background-image:url('${swatchURL(kind, item, W.color)}')"></i><span></span>${isRec ? '<em>추천</em>' : ''}`;
      b.querySelector('span').textContent = item.label;
      b.addEventListener('click', () => applyStyle(kind, item.id));
      box.appendChild(b);
    };
    if (styleTab === 'wall') {
      let g = '';
      for (const w of WALLS) { add('wall', w, w.id === st.wall, false, w.g !== g ? w.g : ''); g = w.g; }
    } else if (styleTab === 'ceil') {
      for (const c of CEILINGS) add('ceil', c, c.id === st.ceil, c.id === rec.ceil);
    } else if (styleTab === 'floor') {
      for (const f of FLOORS) add('floor', f, f.id === st.floor, f.id === rec.floor);
    } else {
      for (const l of LIGHTS) add('light', l, l.id === st.light, l.id === rec.light);
    }
    const on = box.querySelector('.sw.on');
    if (on) box.scrollLeft = Math.max(0, on.offsetLeft - box.clientWidth / 2 + on.offsetWidth / 2);
  }
  function applyPreset(id) {
    const tg = styleTarget();
    const P = PRESETS.find(p => p.id === id);
    if (!tg || !P) return;
    pushUndo(`${tg.label} 꾸미기`);
    tg.set({ ...P.style });
    persist();
    rebuild();
    styleRi = Math.max(-1, Math.min(a.museum.rooms.length, styleRi));
    renderStylePanel();
  }
  function applyStyle(kind, id) {
    const tg = styleTarget();
    if (!tg) return;
    const st = styleOf(tg.room);
    pushUndo(`${tg.label} 꾸미기`);
    // 벽을 바꿔도 천장·바닥·조명은 그대로 (추천은 위에 보여 주기만)
    tg.set({ wall: st.wall, ceil: st.ceil, floor: st.floor, light: st.light, [kind]: id });
    persist();
    rebuild();
    styleRi = Math.max(-1, Math.min(a.museum.rooms.length, styleRi));
    renderStylePanel();
  }
  stylePanel.querySelector('.close').addEventListener('click', () => { closeStylePanel(); controls.pitchT = 0.02; });
  stylePanel.querySelector('.reset').addEventListener('click', () => {
    const tg = styleTarget();
    const wall = styleOf(tg.room).wall;
    pushUndo('추천대로');
    tg.set({ wall, ...recOf(wall) });
    persist(); rebuild(); renderStylePanel();
    toast('천장·바닥·조명을 추천대로 맞췄어요');
  });
  stylePanel.querySelector('.follow').addEventListener('click', () => {
    const tg = styleTarget();
    if (!tg || !tg.key) return;
    pushUndo(`${tg.label} 꾸미기`);
    delete a.museum[tg.key];
    persist(); rebuild(); renderStylePanel();
    toast(`${tg.label}을 ${tg.baseName}과 같게 맞췄어요`);
  });
  // 꾸밀 곳 옮기기: 입구 ‹ ROOM 01 … › 출구 (그곳으로 걸어가 보여 준다)
  for (const b of stylePanel.querySelectorAll('.pick')) b.addEventListener('click', () => {
    const n = a.museum.rooms.length;
    styleRi = Math.max(-1, Math.min(n, styleRi + (b.dataset.d === '1' ? 1 : -1)));
    const L = museumScene.layout;
    const r = styleRi < 0 ? L.lobby : styleRi >= n ? L.exit : L[styleRi];
    controls.joy.x = controls.joy.y = 0;
    const z = styleRi < 0 ? r.zEnd + 2.2 : r.zStart - (styleRi >= n ? 1.6 : 1.4);
    controls.walkPath(route(controls.pos.x, controls.pos.z, 0, z), 0);
    renderStylePanel();
  });
  // 탭에 맞춰 시선을 살짝: 천장은 위로, 바닥은 아래로
  const lookFor = tab => { controls.pitchT = tab === 'ceil' ? 0.6 : tab === 'floor' ? -0.5 : tab === 'light' ? 0.15 : 0.02; };
  for (const b of stylePanel.querySelectorAll('.tabs button')) b.addEventListener('click', () => { styleTab = b.dataset.tab; lookFor(styleTab); renderStylePanel(); });

  return { stylePanel, openStylePanel, closeStylePanel, renderStylePanel, applyStyle, applyPreset };
}

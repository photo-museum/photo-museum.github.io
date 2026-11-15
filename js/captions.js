// 사진 설명 한꺼번에 쓰기: 전시실의 모든 사진을 한 화면에 늘어놓고, 사진 옆 칸에 바로바로 적는다.
// a: main.js 가 건네는 것들 { museum(getter), homeOpen(getter), controls, map, pushUndo, persist, rebuild, toast }
import { thumbURL } from './map.js';

export function initCaptions(a) {
  const el = document.querySelector('#captions');
  const list = el.querySelector('.list');
  let rows = []; // { photo, ta }

  const grow = ta => { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight + 2) + 'px'; };

  function openCaptions(ri = 0) {
    const m = a.museum;
    if (!m) return;
    list.innerHTML = '';
    rows = [];
    let first = null;
    m.rooms.forEach((room, i) => {
      const photos = room.photos.filter(p => p.imageId);
      if (!photos.length) return;
      const h = document.createElement('p');
      h.className = 'rh';
      h.textContent = `ROOM ${String(i + 1).padStart(2, '0')}${room.name ? ' · ' + room.name : ''}`;
      list.appendChild(h);
      if (i === ri || (first === null && i > ri)) first = h;
      photos.forEach((photo, k) => {
        const row = document.createElement('label');
        row.className = 'crow';
        const img = document.createElement('i');
        thumbURL(photo, 220).then(u => { if (u) img.style.backgroundImage = `url(${u})`; });
        const ta = document.createElement('textarea');
        ta.rows = 2; ta.maxLength = 600;
        ta.value = photo.caption || '';
        ta.placeholder = k === 0 && !rows.length ? '첫 줄은 제목처럼 보여요\n예) 제주, 겨울 바다' : '설명';
        ta.addEventListener('input', () => grow(ta));
        row.append(img, ta);
        list.appendChild(row);
        rows.push({ photo, ta });
      });
    });
    if (!rows.length) { a.toast('먼저 사진을 걸어 주세요', 2200); return; }
    el.classList.add('open');
    a.controls.enabled = false;
    a.controls.joy.x = a.controls.joy.y = 0; a.controls.keys.clear();
    requestAnimationFrame(() => {
      for (const r of rows) grow(r.ta);
      list.scrollTop = first ? first.offsetTop - list.offsetTop : 0;
    });
  }
  function close() {
    el.classList.remove('open');
    a.controls.enabled = !a.map.isOpen && !a.homeOpen;
  }
  function save() {
    const changed = rows.filter(r => (r.photo.caption || '') !== r.ta.value.trim());
    if (changed.length) {
      a.pushUndo('사진 설명 쓰기');
      for (const r of changed) { const v = r.ta.value.trim(); if (v) r.photo.caption = v; else delete r.photo.caption; }
      a.persist();
      a.rebuild();
      a.toast(`사진 ${changed.length}장의 설명을 고쳤어요`);
    }
    close();
  }
  el.querySelector('.save').addEventListener('click', save);
  el.querySelector('.cancel').addEventListener('click', close);
  // 글 쓰는 동안 걷기 키가 새지 않게
  el.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') close(); });
  return { openCaptions, isOpen: () => el.classList.contains('open') };
}

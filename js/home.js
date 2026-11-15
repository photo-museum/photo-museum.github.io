// 홈 화면 (시안 H3): 고른 전시실의 대표 사진이 화면 가득, 왼쪽에 제목과 들어가기 버튼, 오른쪽 아래에 표지 띠.
// main.js 가 initHome(a) 로 한 번 부른다. a 에는 main 의 상태(library, homeOpen, viewW — 읽을 때마다 최신)와 함수들이 들어 있다.
import { themeOf } from './builder.js';
import { thumbURL } from './map.js';
import { ensureFont, fontFamily } from './fonts.js';
import { newExhibition } from './store.js';

const $ = s => document.querySelector(s);

export function initHome(a) {
  const { controls, editor, toast, persist, openSheet, sheetOpen, toContent, hasResume, enterExhibition, editExhibitionText,
    exportExhibitions, confirmDeleteExhibition, openBackupMenu, startTutorial, startShowcase } = a;

  function exhibitionStats(ex) {
    const photos = ex.rooms.flatMap(r => r.photos).filter(p => p.imageId);
    // 대표 사진: 고른 게 있으면 그것, 없으면 첫 사진
    const cover = photos.find(p => p.id === ex.coverId) || photos[0];
    return { rooms: ex.rooms.length, photos: photos.length, cover };
  }

  // 홈 카드 목록 넘기기. 휴대폰을 세로로 들면 화면을 돌려 보여 주기 때문에 기본 스크롤은 방향이 틀어진다.
  // 손가락 움직임을 화면 방향으로 바꿔 직접 넘기고, 놓으면 관성으로 조금 더 미끄러진다.
  function makeSwipe(list) {
    let d = null, vel = 0, raf = 0, dragged = false;
    list.addEventListener('pointerdown', e => {
      cancelAnimationFrame(raf);
      d = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, t: performance.now() };
      dragged = false; vel = 0;
    });
    list.addEventListener('pointermove', e => {
      if (!d || e.pointerId !== d.id) return;
      const [mx, my] = controls.mapDelta(e.clientX - d.x, e.clientY - d.y);
      d.x = e.clientX; d.y = e.clientY;
      d.moved += Math.abs(mx) + Math.abs(my);
      if (d.moved > 6 && !dragged) { dragged = true; try { list.setPointerCapture(e.pointerId); } catch (er) {} }
      if (!dragged) return;
      const now = performance.now(), dt = Math.max(1, now - d.t);
      d.t = now;
      list.scrollLeft -= mx;
      vel = vel * 0.6 + (-mx / dt) * 0.4; // px/ms
    });
    const end = e => {
      if (!d || e.pointerId !== d.id) return;
      d = null;
      if (!dragged) return;
      const glide = () => {
        if (Math.abs(vel) < 0.02) return;
        list.scrollLeft += vel * 16;
        vel *= 0.93;
        raf = requestAnimationFrame(glide);
      };
      raf = requestAnimationFrame(glide);
    };
    list.addEventListener('pointerup', end);
    list.addEventListener('pointercancel', end);
    // 끌어서 넘긴 뒤에는 카드가 눌리지 않게
    list.addEventListener('click', e => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, true);
    // 컴퓨터: 마우스 휠을 위아래로 굴려도 옆으로 넘어가게
    list.addEventListener('wheel', e => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { list.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
  }

  // 홈: 아코디언 (시안 F10). 전시실마다 세로 띠, 고른 하나가 넓게 펼쳐진다.
  // 접힌 띠를 누르면 펼쳐지고, 펼쳐진 띠를 누르면 들어간다.
  let homeSel = null; // 가운데 있는 전시실 id ('new' 면 새 전시실 카드)
  // 홈: 그레이 유리 거울 (시안 15). 전시실 표지가 가운데 크게, 양옆은 비스듬히 서고 유리 바닥에 비친다.
  // 옆으로 밀거나 옆 표지를 누르면 넘어가고, 가운데 표지나 '들어가기'를 누르면 들어간다.
  const flow = $('#home .flow'), fcap = $('#home .fcap');
  let flowItems = [], flowPos = 0, flowAnim = 0;
  function homeList() { return a.library.exhibitions.filter(ex => !ex.showcase); }
  // 홈 (시안 H3): 고른 전시실의 대표 사진이 화면 가득, 왼쪽에 큰 제목과 '들어가기',
  // 오른쪽 아래 유리 띠에 전시실 표지들. 화면을 옆으로 밀거나 띠의 표지를 누르면 넘어간다.
  const hstrip = $('#home .hstrip');
  makeSwipe(hstrip); // 띠는 손가락으로 옆으로 넘긴다 (끌고 난 뒤엔 표지가 눌리지 않음)
  // 양 끝에 더 있으면 그쪽 가장자리를 흐리게
  function stripEdges() {
    hstrip.classList.toggle('more-l', hstrip.scrollLeft > 2);
    hstrip.classList.toggle('more-r', hstrip.scrollLeft < hstrip.scrollWidth - hstrip.clientWidth - 2);
  }
  hstrip.addEventListener('scroll', stripEdges, { passive: true });
  const hbgs = [...document.querySelectorAll('#home .hbg3 .ph')];
  let hbgOn = 0, hbgKey = '';
  function renderHome() {
    const exs = homeList();
    if (!exs.some(ex => ex.id === homeSel) && homeSel !== 'new') homeSel = (exs.find(ex => ex.id === a.library.lastId) || exs[0] || {}).id || 'new';
    hstrip.innerHTML = '';
    flowItems = [...exs.map(ex => ({ ex })), { add: true }];
    flowItems.forEach((it, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'cv' + (it.add ? ' add' : '');
      el.setAttribute('role', 'option');
      if (it.add) { el.innerHTML = '<span>+</span>'; el.setAttribute('aria-label', '새 전시실'); }
      else {
        const st = exhibitionStats(it.ex);
        it.cover = st.cover;
        if (st.cover) thumbURL(st.cover, 200).then(u => { if (u) el.style.backgroundImage = `url("${u}")`; });
        else { const T = themeOf(it.ex.rooms[0]); el.style.backgroundImage = `linear-gradient(160deg, ${T.mapWall}, ${T.mapFloor})`; }
        el.setAttribute('aria-label', it.ex.title || '이름 없는 전시');
      }
      el.addEventListener('click', () => { if (i === Math.round(flowPos)) flowOpen(); else flowTo(i); });
      it.el = el;
      hstrip.appendChild(el);
    });
    const idx = Math.max(0, flowItems.findIndex(it => (it.add ? 'new' : it.ex.id) === homeSel));
    flowPos = idx;
    hbgKey = '';
    layoutFlow(false);
  }
  function flowSize() { return { S: Math.max(240, (flow.clientWidth || 800) * 0.45), W: flow.clientWidth || 800 }; }
  // 배경 사진 바꾸기: 두 장을 겹쳐 두고 스르륵 바꾼다
  function setHomeBg(it) {
    const key = it.add ? 'new' : it.ex.id + ':' + (it.cover ? it.cover.id : '');
    if (key === hbgKey) return;
    hbgKey = key;
    const next = hbgs[1 - hbgOn];
    const show = css => { next.style.backgroundImage = css; hbgs[hbgOn].classList.remove('on'); next.classList.add('on'); hbgOn = 1 - hbgOn; };
    if (it.add) show('linear-gradient(160deg, #4a4f58, #23262c)');
    else if (it.cover) thumbURL(it.cover, 1800).then(u => { if (hbgKey === key) show(u ? `url("${u}")` : 'none'); });
    else { const T = themeOf(it.ex.rooms[0]); show(`linear-gradient(160deg, ${T.mapWall}, ${T.mapFloor})`); }
  }
  // pos: 실수 (끄는 중엔 사이 값) — 끄는 동안 배경이 손가락을 살짝 따라온다
  function layoutFlow(animate = true) {
    const i = Math.round(Math.max(0, Math.min(flowItems.length - 1, flowPos)));
    const sel = flowItems[i];
    const drift = (flowPos - i) * -60;
    for (const ph of hbgs) { ph.style.transition = animate ? '' : 'opacity .6s ease'; ph.style.transform = `translateX(${drift}px) scale(1.06)`; }
    flowItems.forEach((it, k) => { it.el.classList.toggle('on', k === i); it.el.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
    if (!sel) return;
    setHomeBg(sel);
    // 띠에는 4개만 보이니, 고른 표지가 보이도록 띠를 옆으로 민다 (돌린 화면이라 scrollIntoView 대신 직접)
    if (sel.el) {
      const L = sel.el.offsetLeft - hstrip.clientWidth / 2 + sel.el.offsetWidth / 2;
      const to = Math.max(0, Math.min(hstrip.scrollWidth - hstrip.clientWidth, L));
      if (animate && hstrip.scrollTo) hstrip.scrollTo({ left: to, behavior: 'smooth' }); else hstrip.scrollLeft = to;
      stripEdges();
    }
    homeSel = sel.add ? 'new' : sel.ex.id;
    const exs = flowItems.length - 1;
    if (sel.add) {
      fcap.querySelector('.cnt').textContent = '새 전시실';
      fcap.querySelector('b').textContent = '새 전시실 만들기';
      fcap.querySelector('b').style.fontFamily = '';
      fcap.querySelector('span').textContent = '이름을 정하고 바로 들어가요';
      fcap.querySelector('.go').textContent = '만들기'; fcap.querySelector('.more').hidden = true;
      fcap.querySelector('.go2').hidden = true;
    } else {
      const st = exhibitionStats(sel.ex);
      fcap.querySelector('.cnt').textContent = `${i + 1} / ${exs} 전시실`;
      fcap.querySelector('b').textContent = sel.ex.title || '이름 없는 전시';
      fcap.querySelector('b').style.fontFamily = fontFamily(sel.ex.font);
      if (sel.ex.font) ensureFont(sel.ex.font);
      const intro = (sel.ex.intro || '').split('\n')[0];
      fcap.querySelector('span').textContent = `방 ${st.rooms} · 사진 ${st.photos}` + (intro ? ' · ' + intro : '');
      // 이어볼 자리가 있으면 [이어보기] [처음부터 보기], 없으면 [처음부터 보기] 하나
      const resume = hasResume(sel.ex);
      fcap.querySelector('.go').textContent = resume ? '이어보기' : '처음부터 보기';
      fcap.querySelector('.go2').hidden = !resume;
      fcap.querySelector('.more').hidden = false;
    }
  }
  function flowTo(i) {
    flowPos = Math.max(0, Math.min(flowItems.length - 1, i));
    layoutFlow(true);
  }
  function flowOpen(fresh = false) {
    const sel = flowItems[Math.round(flowPos)];
    if (!sel) return;
    if (sel.add) {
      const ex = newExhibition('');
      editExhibitionText(ex, () => { a.library.exhibitions.push(ex); persist(); enterExhibition(ex, true); });
    } else enterExhibition(sel.ex, fresh);
  }
  function flowMenu() {
    const sel = flowItems[Math.round(flowPos)];
    if (!sel || sel.add) return;
    const ex = sel.ex, title = ex.title || '이름 없는 전시';
    openSheet([
      { title: true, label: title },
      ...(hasResume(ex) ? [{ label: '이어보기', fn: () => enterExhibition(ex) }] : []),
      { label: '처음부터 보기', fn: () => enterExhibition(ex, true) },
      { label: '대표 사진 바꾸기', fn: () => openCoverPicker(ex) },
      { label: '이 전시실 보내기 (파일)', fn: () => exportExhibitions([ex], `${(ex.title || '전시').replace(/[\\/:*?"<>|]/g, '')}.pmbk`, false) },
      { label: '이름·설명 고치기', fn: () => editExhibitionText(ex) },
      { label: '전시실 지우기', danger: true, fn: () => confirmDeleteExhibition(ex) },
      { label: '닫기', quiet: true },
    ]);
  }
  fcap.querySelector('.go').addEventListener('click', () => flowOpen(false));
  fcap.querySelector('.go2').addEventListener('click', () => flowOpen(true));
  fcap.querySelector('.more').addEventListener('click', flowMenu);
  // 끌어서 넘기기 (돌린 화면에서도 맞는 방향으로)
  (function flowSwipe() {
    let d = null;
    flow.addEventListener('pointerdown', e => {
      d = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, pos0: flowPos, dx: 0, t: performance.now(), v: 0 };
      try { flow.setPointerCapture(e.pointerId); } catch (er) {}
    });
    flow.addEventListener('pointermove', e => {
      if (!d || e.pointerId !== d.id) return;
      const [mx, my] = controls.mapDelta(e.clientX - d.x, e.clientY - d.y);
      d.x = e.clientX; d.y = e.clientY;
      d.moved += Math.abs(mx) + Math.abs(my);
      d.dx += mx;
      const now = performance.now(); d.v = d.v * 0.6 + (mx / Math.max(1, now - d.t)) * 0.4; d.t = now;
      if (d.moved < 6) return;
      const { S } = flowSize();
      flowPos = Math.max(-0.4, Math.min(flowItems.length - 0.6, d.pos0 - d.dx / S));
      layoutFlow(false);
    });
    const end = e => {
      if (!d || e.pointerId !== d.id) return;
      const dd = d; d = null;
      if (dd.moved < 8) { flowTo(Math.round(flowPos)); return; } // 배경을 그냥 누른 것
      flowTo(Math.round(flowPos - Math.max(-1.2, Math.min(1.2, dd.v)) * 0.7)); // 휙 넘기면 한 칸 더
    };
    flow.addEventListener('pointerup', end);
    flow.addEventListener('pointercancel', end);
    flow.addEventListener('wheel', e => {
      e.preventDefault();
      clearTimeout(flowAnim);
      flowPos += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / 180;
      flowPos = Math.max(0, Math.min(flowItems.length - 1, flowPos));
      layoutFlow(false);
      flowAnim = setTimeout(() => flowTo(Math.round(flowPos)), 140);
    }, { passive: false });
    window.addEventListener('keydown', e => {
      if (!a.homeOpen || editor.classList.contains('open') || sheetOpen()) return;
      if (e.key === 'ArrowRight') flowTo(Math.round(flowPos) + 1);
      if (e.key === 'ArrowLeft') flowTo(Math.round(flowPos) - 1);
      if (e.key === 'Enter') flowOpen();
    });
    window.addEventListener('resize', () => { if (a.homeOpen) requestAnimationFrame(() => layoutFlow(false)); });
    // 글씨체가 늦게 들어오거나 화면 크기가 자리 잡으면서 칸 크기가 바뀌어도 바로 다시 맞춘다
    // (전에는 처음에 크게 나왔다가 한 번 만져야 작아졌다)
    let lastFlowSize = '';
    const refit = () => {
      const k = flow.clientWidth + 'x' + flow.clientHeight;
      if (k === lastFlowSize) return;
      lastFlowSize = k;
      if (a.homeOpen) layoutFlow(false);
    };
    if (window.ResizeObserver) new ResizeObserver(() => requestAnimationFrame(refit)).observe(flow);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => requestAnimationFrame(refit));
    for (const ms of [300, 1000, 2500]) setTimeout(() => requestAnimationFrame(refit), ms);
  })();
  // 대표 사진 고르기: 그 전시실에 걸린 사진들 중에서
  function openCoverPicker(ex) {
    const photos = ex.rooms.flatMap(r => r.photos).filter(p => p.imageId);
    if (!photos.length) { toast('먼저 전시실에 사진을 걸어 주세요', 2500); return; }
    const box = $('#cover-pick');
    const grid = box.querySelector('.grid');
    grid.innerHTML = '';
    const cur = exhibitionStats(ex).cover;
    for (const p of photos) {
      const b = document.createElement('button');
      b.className = 'cp' + (p === cur ? ' on' : '');
      b.setAttribute('aria-label', (p.caption || '사진').split('\n')[0] + ' 대표 사진으로');
      thumbURL(p, 400).then(u => { if (u) b.style.backgroundImage = `url("${u}")`; });
      b.addEventListener('click', () => {
        ex.coverId = p.id;
        persist();
        box.classList.remove('open');
        renderHome();
        toast('대표 사진을 바꿨어요');
      });
      grid.appendChild(b);
    }
    box.querySelector('.ttl').textContent = `'${ex.title || '이름 없는 전시'}' 대표 사진`;
    box.classList.add('open');
  }
  $('#cover-pick .close').addEventListener('click', () => $('#cover-pick').classList.remove('open'));
  $('#cover-pick').addEventListener('click', e => { if (e.target.id === 'cover-pick') e.currentTarget.classList.remove('open'); });

  // 홈 위 동그란 아이콘: 처음 누르면 아래에 이름표가 살짝 뜨고, 이름표를 누르면 들어간다
  // (아이콘만으로는 무엇인지 알기 어려워서)
  const homePop = $('#home-pop');
  let homePopFor = null, homePopTimer = 0;
  function showHomePop(btn, label, go) {
    if (homePopFor === btn && homePop.classList.contains('show')) { hideHomePop(); return; }
    homePopFor = btn;
    homePop.querySelector('span').textContent = label;
    homePop.onclick = () => { hideHomePop(); go(); };
    const hb = btn.getBoundingClientRect(), home = $('#home');
    // 돌린 화면에서도 맞게: 버튼 위치를 무대 좌표로
    const [cx, cy] = toContent(hb.left + hb.width / 2, hb.top + hb.height / 2);
    const [bx, by] = toContent(hb.right, hb.bottom);
    homePop.style.top = (Math.max(cy, by) + 10) + 'px';
    homePop.style.right = Math.max(12, (a.viewW - cx) - 22) + 'px';
    homePop.classList.add('show');
    clearTimeout(homePopTimer);
    homePopTimer = setTimeout(hideHomePop, 4500);
  }
  function hideHomePop() { homePop.classList.remove('show'); homePopFor = null; }
  $('#h-tour').addEventListener('click', e => showHomePop(e.currentTarget, '사용법 둘러보기', startTutorial));
  $('#h-styles').addEventListener('click', e => showHomePop(e.currentTarget, '방 스타일 둘러보기', startShowcase));
  document.addEventListener('pointerdown', e => { if (homePopFor && !e.target.closest('#home-pop, #h-tour, #h-styles')) hideHomePop(); }, true);
  $('#h-backup').addEventListener('click', () => openBackupMenu());

  return { renderHome, makeSwipe, exhibitionStats };
}

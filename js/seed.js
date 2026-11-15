// 처음 채워 넣는 전시실들: 사용법 예시(제주), 방 스타일 둘러보기, 예시 전시실 5개(js/demo.js), 사진 많은 시험용.
// 화면을 건드리지 않고 데이터만 만든다 (진행 글은 say 로 알려 준다).
import { EXAMPLE } from './example.js';
import { DEMO as DEMO_ALL, DEMO_VERSION } from './demo.js';
// 처음 온 사람에게는 예시 전시실 두 개만 보여 준다 (다섯 개 + 시험용은 너무 많다는 사용자 결정).
// 자동 시험(주소가 pm.test)에서는 예전처럼 다섯 개와 시험용 전시실을 모두 만든다: 시험이 그 전시실들에 기대고 있다.
export const TESTING = /pm\.test$/.test(location.hostname);
const FIRST = ['제주, 바람이 머문 자리', '교토, 단풍이 지는 소리'];
const DEMO = TESTING ? DEMO_ALL : FIRST.map(t => DEMO_ALL.find(d => d.title === t)).filter(Boolean);
import { WALL_BY, CEIL_BY, FLOOR_BY } from './styles.js';
import { putImage, clearImages, prepareImage, uid, newPhoto, newRoom, newExhibition, HD } from './store.js';

export async function buildExample() {
  const ex = newExhibition(EXAMPLE.title);
  ex.intro = EXAMPLE.intro;
  ex.tutorial = true;
  ex.rooms = [];
  for (const R of EXAMPLE.rooms) {
    const room = newRoom(0, R.theme);
    room.name = R.name;
    room.intro = R.intro;
    for (const P of R.photos) {
      const blob = await (await fetch(P.file)).blob();
      const { blob: small, hd, aspect } = await prepareImage(blob);
      const imageId = uid('img_');
      await putImage(imageId, small);
      if (hd) await putImage(imageId + HD, hd);
      const photo = newPhoto(imageId, aspect);
      photo.caption = P.caption;
      room.photos.push(photo);
    }
    ex.rooms.push(room);
  }
  return ex;
}

// 방 스타일 둘러보기: 모든 방 스타일을 한 전시실에 이어 붙여, 걸어 다니며 비교한다.
// 예시 사진 8장을 한 번만 저장하고 여러 방에서 같이 쓴다.
export const SHOWCASE = ['gallery', 'warmgray', 'stone', 'charcoal', 'louvre', 'dresden', 'salon', 'navy', 'cream', 'rose', 'mustard', 'powder', 'sage', 'hanji', 'brickwall', 'fabric', 'library', 'night'];
export async function buildShowcase() {
  const pics = [];
  for (const R of EXAMPLE.rooms) for (const P of R.photos) {
    const blob = await (await fetch(P.file)).blob();
    const { blob: small, hd, aspect } = await prepareImage(blob);
    const imageId = uid('img_');
    await putImage(imageId, small);
    if (hd) await putImage(imageId + HD, hd);
    pics.push({ imageId, aspect, caption: P.caption });
  }
  const ex = newExhibition('방 스타일 둘러보기');
  ex.intro = `방 스타일 ${SHOWCASE.length}가지를 차례로 이어 붙인 전시실이에요.\n`
    + '걸어 다니며 마음에 드는 방을 골라 보세요. 내 전시실에서는 오른쪽 아래 편집 → 방 꾸미기에서 벽·천장·바닥·조명을 고를 수 있어요.';
  ex.showcase = true;
  ex.rooms = SHOWCASE.map((id, k) => {
    const room = newRoom(0, 'white');
    room.style = { wall: id };
    room.name = WALL_BY[id].label;
    room.intro = `${CEIL_BY[WALL_BY[id].rec.ceil].label} · ${FLOOR_BY[WALL_BY[id].rec.floor].label}.`;
    for (let n = 0; n < 4; n++) {
      const P = pics[(k * 2 + n) % pics.length];
      const photo = newPhoto(P.imageId, P.aspect);
      photo.caption = P.caption;
      room.photos.push(photo);
    }
    return room;
  });
  return ex;
}

// 앱을 아껴 쓰는 사람이 만들었을 법한 예시 전시실들 (js/demo.js)
export async function buildDemoLibrary(library, say0) {
  const total = DEMO.reduce((a, ex) => a + ex.rooms.reduce((b, r) => b + r.photos.length, 0), 0);
  let done = 0;
  const say = () => say0(`예시 전시실을 준비하고 있어요 · ${done} / ${total}`);
  say();
  await clearImages();
  // 사진 파일들을 여러 장씩 한꺼번에 받아 넣는다 (예시 사진은 이미 작게 줄여 둔 것이라 다시 줄이지 않는다)
  const files = [...new Set(DEMO.flatMap(D => D.rooms.flatMap(R => R.photos.map(P => P.file))))];
  const cache = new Map();
  const one = async file => {
    const blob = await (await fetch(file)).blob();
    let rec;
    try {
      const bmp = await createImageBitmap(blob);
      const w = bmp.width, h = bmp.height; bmp.close && bmp.close();
      if (Math.max(w, h) <= 2048 && /jpe?g/.test(blob.type)) {
        const imageId = uid('img_');
        await putImage(imageId, blob);
        rec = { imageId, aspect: w / h };
      }
    } catch (e) { /* 아래에서 줄여서 */ }
    if (!rec) {
      const { blob: small, hd, aspect } = await prepareImage(blob);
      const imageId = uid('img_');
      await putImage(imageId, small);
      if (hd) await putImage(imageId + HD, hd);
      rec = { imageId, aspect };
    }
    cache.set(file, rec);
  };
  const queue = files.slice();
  const worker = async () => { while (queue.length) { const f = queue.shift(); await one(f); done += DEMO.reduce((a, D) => a + D.rooms.reduce((b, R) => b + R.photos.filter(P => P.file === f).length, 0), 0); say(); } };
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
  const exs = [];
  for (const D of DEMO) {
    const ex = newExhibition(D.title);
    ex.intro = D.intro || '';
    if (D.font) ex.font = D.font;
    ex.rooms = [];
    for (const R of D.rooms) {
      const room = newRoom(0, R.theme || 'white');
      room.name = R.name; if (R.intro) room.intro = R.intro; if (R.font) room.font = R.font;
      if (R.style) room.style = { ...R.style };
      for (const P of R.photos) {
        const rec = cache.get(P.file);
        const photo = newPhoto(rec.imageId, rec.aspect);
        if (P.caption) photo.caption = P.caption;
        if (P.cover) ex.coverId = photo.id;
        room.photos.push(photo);
      }
      ex.rooms.push(room);
    }
    ex.guestbook = (D.guestbook || []).map((g, k) => ({ id: uid('g_'), name: g.name, text: g.text, color: g.color || k % 6, at: Date.now() - (D.guestbook.length - k) * 86400000 }));
    exs.push(ex);
  }
  library.exhibitions = exs;
  library.demoVersion = DEMO_VERSION;
  library.lastId = exs[0]?.id;
  for (const k of Object.keys(localStorage)) if (k.startsWith('pm-pose-')) try { localStorage.removeItem(k); } catch (e) {}
}

// 사진이 아주 많은 시험용 전시실 (한 번만). 이미 저장된 예시 사진을 다시 쓰고, 모자라면 예시 파일을 받는다.
export async function addBigTestExhibition(library, say0) {
  const seen = new Map();
  for (const ex of library.exhibitions) for (const r of ex.rooms) for (const p of r.photos) if (p.imageId && !seen.has(p.imageId)) seen.set(p.imageId, p.aspect);
  let pool = [...seen].map(([imageId, aspect]) => ({ imageId, aspect }));
  if (pool.length < 12) {
    const files = [...new Set(DEMO.flatMap(D => D.rooms.flatMap(R => R.photos.map(P => P.file))))].slice(0, 30);
    for (const f of files) {
      say0(`시험용 전시실을 준비하고 있어요 · ${pool.length + 1} / ${files.length}`);
      const { blob, hd, aspect } = await prepareImage(await (await fetch(f)).blob());
      const imageId = uid('img_');
      await putImage(imageId, blob); if (hd) await putImage(imageId + HD, hd);
      pool.push({ imageId, aspect });
    }
  }
  if (!pool.length) return;
  let k = 0;
  const take = n => Array.from({ length: n }, () => { const q = pool[k++ % pool.length]; const ph = newPhoto(q.imageId, q.aspect); ph.caption = `사진 ${k}\n같은 방에 아주 많이 걸어 본 시험용 사진이에요`; return ph; });
  const ex = newExhibition('사진이 아주 많은 전시 (시험용)');
  ex.intro = '사진을 아주 많이 걸었을 때 지도와 걷기가 어떤지 느껴 보는 시험용 전시실이에요.\n마음껏 옮기고 지워 봐도 돼요.';
  const mk = (name, n, wall) => { const r = newRoom(0, 'white'); r.name = name; r.style = { wall }; r.photos = take(n); return r; };
  ex.rooms = [mk('보통 방', 6, 'gallery'), mk('아주 긴 방', 36, 'ivory'), mk('작은 방', 3, 'navy'), mk('긴 방', 20, 'sage'), mk('마지막 방', 8, 'charcoal')];
  library.exhibitions.push(ex);
  library.bigTest = 1;
}


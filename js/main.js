import * as THREE from 'three';
import { MuseumScene, THEMES, THEME_ORDER, themeOf } from './builder.js';
import { WalkControls } from './controls.js';
import { viewingSpot, INTRO_S, LOBBY_L } from './layout.js';
import { MuseumMap, thumbURL } from './map.js';
import { Guide } from './guide.js';
import { EXAMPLE } from './example.js';
import { loadFonts, ensureFont, ensureGlyphs, isFontReady, fontFamily, fontInfo, FONT_LIST, DEFAULT_FONT } from './fonts.js';
import {
  loadLibrary, saveLibrary, putImage, deleteImage, prepareImage, requestPersistence, uid,
  newPhoto, newRoom, newExhibition, EMPTY_ASPECT, HD,
} from './store.js';

const $ = s => document.querySelector(s);
const isTouch = matchMedia('(pointer: coarse)').matches;
const stage = $('#stage');

// ---------- 렌더러 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
// 사진과 글씨가 선명하도록 휴대폰도 2배까지 (3배 화면은 2배로 충분히 선명하고 훨씬 가볍다)
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.setClearColor(0x030303);
$('#app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 120);
const museumScene = new MuseumScene(renderer, scene);
museumScene.onTextureError = () => toast('사진 하나를 불러오지 못했어요. 판을 눌러 다시 넣어 주세요', 4000);

// 아이폰은 사진 고르는 동안 WebGL 을 잃어버릴 수 있다 → 돌아오면 다시 짓는다
renderer.domElement.addEventListener('webglcontextlost', e => e.preventDefault());
renderer.domElement.addEventListener('webglcontextrestored', () => {
  museumScene.resetTextures();
  if (museum) rebuild();
});
const controls = new WalkControls(camera, renderer.domElement);

// ---------- 가로 전용 ----------
// 휴대폰을 세로로 들고 있으면 화면 전체를 90도 돌려 가로로 보여 준다.
// (아이폰 Safari 는 화면 방향 고정을 허락하지 않아서 이렇게 흉내 낸다)
// 돌린 화면: 화면 좌표 (sx, sy) ↔ 내용 좌표 (cx, cy) = (sy, 화면폭 - sx)
let rotated = false;
let viewW = 1, viewH = 1;

function toContent(sx, sy) {
  return rotated ? [sy, window.innerWidth - sx] : [sx, sy];
}
controls.mapDelta = (dx, dy) => (rotated ? [dy, -dx] : [dx, dy]);
controls.toNorm = (sx, sy) => { const [cx, cy] = toContent(sx, sy); return [cx / viewW, cy / viewH]; };

// 잠깐 확대: 카메라가 보는 화면의 일부만 크게 그린다 (시선은 그대로)
let lastZoomKey = '';
function applyZoom() {
  const z = controls.zoom;
  if (z <= 1.001) {
    if (lastZoomKey) { camera.clearViewOffset(); lastZoomKey = ''; }
    return;
  }
  const w = viewW / z, h = viewH / z;
  let x = controls.zoomFocus.x * viewW - controls.zoomAt.x * w;
  let y = controls.zoomFocus.y * viewH - controls.zoomAt.y * h;
  x = Math.max(0, Math.min(viewW - w, x));
  y = Math.max(0, Math.min(viewH - h, y));
  // 화면 끝에 막혀 밀린 만큼 확대 점을 맞춰 둔다 (다시 확대할 때 튀지 않게)
  controls.zoomFocus = { x: (x + controls.zoomAt.x * w) / viewW, y: (y + controls.zoomAt.y * h) / viewH };
  const key = `${z.toFixed(4)},${x.toFixed(1)},${y.toFixed(1)},${viewW},${viewH}`;
  if (key === lastZoomKey) return;
  lastZoomKey = key;
  camera.setViewOffset(viewW, viewH, x, y, w, h);
}

function resize() {
  const sw = window.innerWidth, sh = window.innerHeight;
  const wasRotated = rotated;
  rotated = isTouch && sh > sw;
  viewW = rotated ? sh : sw;
  viewH = rotated ? sw : sh;
  document.body.classList.toggle('rotated', rotated);
  stage.style.width = viewW + 'px';
  stage.style.height = viewH + 'px';
  stage.style.transform = rotated ? `translateX(${sw}px) rotate(90deg)` : '';
  renderer.setSize(viewW, viewH);
  const aspect = viewW / viewH;
  const hfov = 66 * Math.PI / 180;
  const vfov = 2 * Math.atan(Math.tan(hfov / 2) / aspect) * 180 / Math.PI;
  camera.fov = Math.max(48, Math.min(75, vfov));
  camera.aspect = aspect;
  lastZoomKey = '';
  camera.updateProjectionMatrix();
  if (wasRotated !== rotated || !joystick) makeJoystick();
}
window.addEventListener('resize', () => requestAnimationFrame(resize));
window.addEventListener('orientationchange', () => setTimeout(resize, 250));

// ---------- 조이스틱 (휴대폰) ----------
// 조이스틱은 돌린 화면 밖(실제 화면 좌표)에 둔다. 돌린 화면에서는 내용의 왼쪽 아래 = 실제 화면 왼쪽 위.
let joystick = null;
function makeJoystick() {
  if (!isTouch || !window.nipplejs) return;
  if (joystick) { joystick.destroy(); joystick = null; }
  const zone = $('#joy');
  zone.style.display = 'block';
  joystick = window.nipplejs.create({
    zone, mode: 'static', position: { left: '50%', top: '50%' },
    color: 'rgba(235,228,215,0.8)', size: 112, restOpacity: 0.12, fadeTime: 180,
  });
  // 만지지 않을 때는 아주 연하게 (사진 감상을 가리지 않게), 만지면 밝게
  joystick.on('start', () => zone.classList.add('active'));
  joystick.on('end', () => zone.classList.remove('active'));
  joystick.on('move', (e, d) => {
    if (controls.joyBlocked) { controls.joy.x = controls.joy.y = 0; return; } // 두 손가락 벌리는 중
    const f = Math.min(1, d.force || 0);
    const vx = d.vector.x * f, vy = d.vector.y * f; // 화면 기준, y 위쪽 +
    if (rotated) { controls.joy.x = -vy; controls.joy.y = -vx; }
    else { controls.joy.x = vx; controls.joy.y = -vy; }
    hideHint();
  });
  joystick.on('end', () => { controls.joy.x = 0; controls.joy.y = 0; });
}

// ---------- 데이터 ----------
let library = null;   // 전시실 목록
let museum = null;    // 지금 들어와 있는 전시실 (rooms 를 가진다)
let currentRoom = -2;

// 다시 짓기. 앞쪽 방 길이가 바뀌거나 방 순서가 바뀌어도, 서 있던 방의 같은 자리에 그대로 있게 한다.
// 서 있던 방이 사라졌으면 fallbackRi 방 입구로.
// fresh: 다른 전시실로 들어올 때 (자리 맞추기 없음)
function rebuild(fallbackRi = 0, fresh = false) {
  const old = fresh ? null : museumScene.layout;
  let hereId = null, local = 0;
  if (old && old.length) {
    const ri = museumScene.roomIndexAt(controls.pos.z);
    if (ri >= old.length) { hereId = 'exit'; local = controls.pos.z - old.exit.zStart; }
    else if (ri >= 0) { hereId = old[ri]?.id; local = controls.pos.z - old[ri].zStart; }
  }
  const layout = museumScene.build(museum);
  controls.colliders = museumScene.colliders;
  currentRoom = -2;
  if (hereId) {
    const ni = hereId === 'exit' ? layout.length : layout.findIndex(r => r.id === hereId);
    if (ni >= 0) {
      const r = hereId === 'exit' ? layout.exit : layout[ni];
      const z = r.zStart + Math.max(-(r.length - 0.5), Math.min(-0.4, local));
      if (controls.auto) controls.auto.z += z - controls.pos.z;
      controls.pos.z = z;
    } else {
      const r = layout[Math.min(fallbackRi, layout.length - 1)];
      controls.auto = null;
      controls.setPose(0, r.zStart - 1.4, 0);
    }
  }
  map.invalidate();
  if (map.isOpen) map.render(true);
  ensureMuseumFonts();
  return layout;
}

function persist() { return saveLibrary(library); }

// 전시실마다 마지막 위치 기억 (이 브라우저에서만, 편의용)
function savePose() {
  if (!museum || homeOpen) return;
  try { localStorage.setItem('pm-pose-' + museum.id, JSON.stringify({ x: controls.pos.x, z: controls.pos.z, yaw: controls.yawT })); } catch (e) {}
}
function loadPose(id) {
  try { return JSON.parse(localStorage.getItem('pm-pose-' + id)); } catch (e) { return null; }
}

// ---------- 사진 넣기 (여러 장) ----------
const fileInput = $('#file');
let pickJob = null; // { roomIndex, startPhotoId?, replace? }

function pickPhotos(job) {
  pickJob = job;
  fileInput.multiple = !job.replace;
  fileInput.value = '';
  fileInput.click();
}

fileInput.addEventListener('change', async () => {
  const files = Array.from(fileInput.files || []);
  const job = pickJob;
  pickJob = null;
  if (!files.length || !job) return;
  await hangPhotos(job, files);
});

// 정한 판부터 빈 판을 차례로 채우고, 남는 사진은 판을 새로 만들어 단다 (벽이 길어짐)
async function hangPhotos(job, files) {
  const room = museum.rooms[job.roomIndex];
  if (!room) return;
  const targets = [];
  if (job.replace) {
    const p = room.photos.find(x => x.id === job.startPhotoId);
    if (p) targets.push(p);
  } else {
    const start = Math.max(0, room.photos.findIndex(x => x.id === job.startPhotoId));
    const order = room.photos.slice(start).concat(room.photos.slice(0, start));
    for (const p of order) if (!p.imageId) targets.push(p);
  }
  let ok = 0, failed = 0, lastMsg = '';
  for (let i = 0; i < files.length; i++) {
    toast(files.length > 1 ? `사진을 거는 중… ${i + 1} / ${files.length}` : '사진을 거는 중…', 8000);
    try {
      const { blob, hd, aspect } = await prepareImage(files[i]);
      const imageId = uid('img_');
      const tex = await museumScene.primeTexture(imageId, blob);
      if (!tex) throw new Error('사진을 화면에 올리지 못했어요');
      await putImage(imageId, blob);
      if (hd) await putImage(imageId + HD, hd);
      let photo = targets.shift();
      if (!photo) { photo = newPhoto(); room.photos.push(photo); }
      const old = photo.imageId;
      photo.imageId = imageId;
      photo.aspect = aspect;
      delete photo.rot;
      await persist();
      if (old) releaseImage(old);
      rebuild();
      ok++;
    } catch (e) {
      console.error(e);
      failed++;
      lastMsg = e.message;
    }
  }
  if (failed) toast(`${ok}장 걸고 ${failed}장은 못 걸었어요: ${lastMsg}`, 5000);
  else toast(ok > 1 ? `${ok}장을 걸었어요` : '걸었어요');
}

function removePhoto(t) {
  const photo = museum.rooms[t.roomIndex].photos.find(p => p.id === t.photoId);
  if (!photo || !photo.imageId) return;
  const old = photo.imageId;
  photo.imageId = null;
  photo.aspect = EMPTY_ASPECT;
  delete photo.rot;
  persist();
  releaseImage(old);
  rebuild();
}

function removePanel(t) {
  const room = museum.rooms[t.roomIndex];
  const i = room.photos.findIndex(p => p.id === t.photoId);
  if (i < 0) return;
  const [photo] = room.photos.splice(i, 1);
  if (photo.imageId) releaseImage(photo.imageId);
  persist();
  rebuild();
  toast('판을 뗐어요');
}

// ---------- 글 쓰기 창 (사진 설명, 방 이름·설명, 전시실 이름·설명) ----------
// 휴대폰 키보드 때문에 편집 창은 돌린 화면 밖에 둔다 (세로로 들고 쓰면 된다)
const editor = $('#editor');
const editorText = $('#caption');
const editorTitle = $('#ed-title');
let editJob = null;
let editFont = null;
// job: { head, title?: { label, value, placeholder }, body: { label, value, placeholder },
//        font?: { value, inherit?: 글씨 id (null 을 고르면 따라갈 글씨) }, onSave(title, body, font) }
function openText(job) {
  editJob = job;
  $('#ed-head').textContent = job.head;
  editor.classList.toggle('with-font', !!job.font);
  if (job.font) renderFontPicker(job.font);
  const hasTitle = !!job.title;
  editor.classList.toggle('with-title', hasTitle);
  if (hasTitle) {
    $('#ed-title-label').textContent = job.title.label;
    editorTitle.value = job.title.value || '';
    editorTitle.placeholder = job.title.placeholder || '';
  }
  $('#ed-body-label').textContent = job.body.label;
  editorText.value = job.body.value || '';
  editorText.placeholder = job.body.placeholder || '';
  editor.classList.add('open');
  controls.enabled = false;
  setTimeout(() => (hasTitle ? editorTitle : editorText).focus(), 50);
}
function closeEditor(save) {
  const job = editJob;
  editJob = null;
  editor.classList.remove('open');
  editorText.blur(); editorTitle.blur();
  controls.enabled = !map.isOpen && !homeOpen;
  if (save && job) job.onSave(editorTitle.value.trim(), editorText.value.replace(/\s+$/, ''), editFont);
}

// 글씨체 고르기: 미리보기 그림이라 글씨 파일을 내려받지 않아도 보인다
function renderFontPicker(opt) {
  const box = $('#ed-fonts');
  box.innerHTML = '';
  editFont = opt.value || null;
  const items = [];
  if (opt.inherit !== undefined) items.push({ id: null, img: opt.inherit, name: '전시실 글씨 따르기', inherit: true });
  for (const f of FONT_LIST) items.push({ id: f.id, img: f.id, name: f.name + (f.id === DEFAULT_FONT ? ' (기본)' : '') });
  if (opt.inherit === undefined && !editFont) editFont = DEFAULT_FONT;
  for (const it of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.className = (it.inherit ? 'inherit' : '') + (it.id === editFont ? ' on' : '');
    b.setAttribute('aria-checked', it.id === editFont);
    b.innerHTML = `<img src="assets/fonts/${fontInfo(it.img).id}.png" alt=""><span></span>`;
    b.querySelector('span').textContent = it.name;
    b.addEventListener('click', () => {
      editFont = it.id;
      for (const x of box.children) { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); }
      b.classList.add('on'); b.setAttribute('aria-checked', 'true');
      if (it.id) ensureFont(it.id); // 미리 받아 두기
    });
    box.appendChild(b);
  }
  const on = box.querySelector('.on');
  if (on) setTimeout(() => on.scrollIntoView({ inline: 'center', block: 'nearest' }), 30);
}

// 벽에 그릴 글자들을 글씨마다 미리 받아 두고, 새로 받은 게 있으면 다시 그린다
let glyphKey = '';
function ensureMuseumGlyphs() {
  const m = museum;
  const exFont = m.font || DEFAULT_FONT;
  const byFont = new Map();
  const add = (id, t) => { if (t) byFont.set(id, (byFont.get(id) || '') + t); };
  const fixed = '0123456789ROOMphotomuseum→—·관람해주셔서고맙습니다앞의방명록에한마디남겨주세요벽을눌러이전시에대한설명을적어이름과';
  add(exFont, fixed + (m.title || '') + (m.intro || '') + (m.guestbook || []).map(g => g.text + g.name).join(''));
  for (const r of m.rooms) {
    const f = r.font || exFont;
    add(f, fixed + (r.name || '') + (r.intro || '') + r.photos.map(p => p.caption || '').join(''));
  }
  const key = [...byFont].map(([k, v]) => k + ':' + [...new Set(v)].sort().join('')).join('|');
  if (key === glyphKey) return;
  glyphKey = key;
  Promise.all([...byFont].map(([id, t]) => ensureGlyphs(id, t))).then(r => {
    if (r.some(Boolean) && museum === m && !homeOpen) rebuild();
  });
}

// 지금 전시실에서 쓰는 글씨들을 내려받고, 다 받으면 벽 글씨를 다시 그린다
const failedFonts = new Set();
function ensureMuseumFonts() {
  if (!museum) return;
  ensureMuseumGlyphs();
  const ids = new Set([museum.font || DEFAULT_FONT, ...museum.rooms.map(r => r.font || museum.font || DEFAULT_FONT)]);
  const missing = [...ids].filter(id => !isFontReady(id) && !failedFonts.has(id));
  if (!missing.length) return;
  const m = museum;
  Promise.all(missing.map(id => ensureFont(id).then(ok => { if (!ok) failedFonts.add(id); return ok; }))).then(r => {
    if (museum === m && !homeOpen) rebuild();
    if (r.some(x => !x)) toast('글씨체를 불러오지 못해 기본 글씨로 보여요. 인터넷 연결을 확인해 주세요', 3500);
  });
}
function openEditor(t) {
  const photo = findPhoto(t.photoId)?.room.photos.find(p => p.id === t.photoId);
  if (!photo) return;
  openText({
    head: '사진 설명',
    body: { label: '사진 옆 벽에 적혀요', value: photo.caption, placeholder: '첫 줄은 제목처럼 보여요\n예) 제주, 겨울 바다\n2025. 1. 아침 7시' },
    onSave: (_, v) => {
      if (v) photo.caption = v; else delete photo.caption;
      persist();
      rebuild();
      toast(v ? '설명을 붙였어요' : '설명을 지웠어요');
    },
  });
}
function editRoomText(ri) {
  const room = museum.rooms[ri];
  if (!room) return;
  openText({
    head: `ROOM ${String(ri + 1).padStart(2, '0')} 안내벽`,
    title: { label: '방 이름', value: room.name, placeholder: '예) 바다, 아침 7시' },
    body: { label: '방 설명 (문 들어서 정면 벽에 적혀요)', value: room.intro, placeholder: '이 방에 어떤 사진들이 있는지 적어 주세요' },
    font: { value: room.font, inherit: museum.font || DEFAULT_FONT },
    onSave: (name, intro, font) => {
      if (name) room.name = name; else delete room.name;
      if (intro) room.intro = intro; else delete room.intro;
      if (font) room.font = font; else delete room.font;
      persist();
      rebuild();
      toast('안내벽을 고쳤어요');
    },
  });
}
function editExhibitionText(ex, after) {
  openText({
    head: '전시실',
    title: { label: '전시 이름', value: ex.title, placeholder: '예) 제주, 겨울의 빛' },
    body: { label: '전시 설명 (입구 정면 벽에 적혀요)', value: ex.intro, placeholder: '이 전시가 무엇을 담고 있는지 적어 주세요' },
    font: { value: ex.font || DEFAULT_FONT },
    onSave: (title, intro, font) => {
      ex.title = title || '이름 없는 전시';
      ex.intro = intro;
      if (font && font !== DEFAULT_FONT) ex.font = font; else delete ex.font;
      persist();
      if (ex === museum && !homeOpen) { rebuild(); $('#ex-title').textContent = ex.title; }
      if (homeOpen) renderHome();
      if (after) after();
    },
  });
}
$('#editor-save').addEventListener('click', () => closeEditor(true));
$('#editor-cancel').addEventListener('click', () => closeEditor(false));
editor.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Escape') closeEditor(false);
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) closeEditor(true);
});

// ---------- 방 ----------
function addRoom(theme) {
  museum.rooms.push(newRoom(4, theme));
  persist();
  rebuild();
  const n = museum.rooms.length;
  toast(`새 방(ROOM ${String(n).padStart(2, '0')})을 만들었어요. ROOM ${String(n - 1).padStart(2, '0')} 끝 문으로 들어가요`, 3500);
}

function setRoomTheme(ri, theme) {
  museum.rooms[ri].theme = theme;
  persist();
  rebuild();
  toast(`${THEMES[theme].label}으로 바꿨어요`);
}

// 사진·방 버튼이 쓸 방 (로비면 첫 방, 출구면 마지막 방)
function currentRoomIndex() { return Math.max(0, Math.min(museum.rooms.length - 1, museumScene.roomIndexAt(controls.pos.z))); }

// ---------- 사진 앞에 서기 도우미 ----------
// 걷다가 멈췄을 때 바라보는 쪽 가까이에 사진(또는 안내벽)이 있으면, 오른쪽에 '사진 앞으로' 버튼이 희미하게 뜬다.
// 누르면 그 정면으로 스르륵 가서 바라본다. 저절로 움직이지는 않는다 (실수로 움직였을 때 끌려가지 않게).
const SNAP_ANGLE = 70 * Math.PI / 180; // 이 각도 안에 있어야 (보고 있는 것)
const SNAP_DIST = 2.6;                 // 감상 자리까지 이 거리 안이면
function bestSpot() {
  const L = museumScene.layout;
  if (!L) return null;
  const ri = museumScene.roomIndexAt(controls.pos.z);
  const px = controls.pos.x, pz = controls.pos.z;
  const fx = -Math.sin(controls.yaw), fz = -Math.cos(controls.yaw);
  const cands = [];
  for (const r of L) {
    if (Math.abs(r.index - ri) > 1) continue;
    for (const p of r.panels) cands.push({ kind: p.photo.imageId ? '사진' : '빈 판', photoId: p.photo.id, cx: p.x, cz: p.z, spot: viewingSpot(p) });
    const iz = r.zStart - INTRO_S;
    cands.push({ kind: '안내벽', cx: r.introX, cz: iz, spot: { x: r.introX, z: iz + 2.3, yaw: 0 } });
  }
  if (ri < 0) cands.push({ kind: '전시 소개', cx: -1.25, cz: -LOBBY_L, spot: { x: -1.25, z: -LOBBY_L + 3.0, yaw: 0 } });
  if (L.exit && ri >= L.length) cands.push(...exitSpots(L.exit));
  let best = null, bestScore = Infinity;
  for (const c of cands) {
    const d = Math.hypot(c.spot.x - px, c.spot.z - pz);
    if (d > SNAP_DIST) continue;
    const vx = c.cx - px, vz = c.cz - pz, vl = Math.hypot(vx, vz) || 1;
    const ang = Math.acos(Math.max(-1, Math.min(1, (vx * fx + vz * fz) / vl)));
    if (ang > SNAP_ANGLE) continue;
    const score = ang + d * 0.35;
    if (score < bestScore) { bestScore = score; best = c; best.d = d; best.ang = ang; }
  }
  return best;
}

// 출구 방: 방명록 책상 앞, 인사 글 앞
function exitSpots(ex) {
  const dz = ex.zStart - 3.4;
  return [
    { kind: '방명록', cx: 0, cz: dz, spot: { x: 0, z: dz + 1.5, yaw: 0 } },
  ];
}

// ---------- 방명록 ----------
const gb = $('#guestbook');
let gbColor = 0;
function openGuestbook() {
  renderGuestbook();
  gb.classList.add('open');
  controls.enabled = false;
}
function closeGuestbook() {
  gb.classList.remove('open');
  $('#gb-text').blur(); $('#gb-name').blur();
  controls.enabled = !map.isOpen && !homeOpen;
}
function renderGuestbook() {
  const list = $('#gb-list');
  list.innerHTML = '';
  const entries = (museum.guestbook || []).slice().reverse();
  if (!entries.length) list.innerHTML = '<p class="empty">아직 남긴 글이 없어요. 첫 글을 남겨 주세요.</p>';
  for (const e of entries) {
    const d = document.createElement('div');
    d.className = 'note c' + (e.color || 0);
    const t = document.createElement('p'); t.textContent = e.text;
    const m = document.createElement('span');
    m.textContent = (e.name ? e.name + ' · ' : '') + new Date(e.at).toLocaleDateString('ko-KR');
    const x = document.createElement('button'); x.className = 'del'; x.textContent = '지우기'; x.setAttribute('aria-label', '이 글 지우기');
    x.addEventListener('click', () => {
      museum.guestbook = museum.guestbook.filter(g => g.id !== e.id);
      persist(); rebuild(); renderGuestbook();
    });
    d.append(t, m, x);
    list.appendChild(d);
  }
  const dots = $('#gb-colors');
  dots.innerHTML = '';
  ['#f6e7c8', '#f3d3d0', '#d6e6d2', '#d5e1ef', '#efe2f2', '#fff1a8'].forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.style.background = c; b.className = i === gbColor ? 'on' : '';
    b.setAttribute('aria-label', `쪽지 색 ${i + 1}`);
    b.addEventListener('click', () => { gbColor = i; renderGuestbook(); });
    dots.appendChild(b);
  });
}
$('#gb-close').addEventListener('click', closeGuestbook);
$('#gb-save').addEventListener('click', () => {
  const text = $('#gb-text').value.trim();
  if (!text) { $('#gb-text').focus(); return; }
  museum.guestbook = museum.guestbook || [];
  museum.guestbook.push({ id: uid('g_'), name: $('#gb-name').value.trim(), text, at: Date.now(), color: gbColor });
  $('#gb-text').value = '';
  persist(); rebuild(); renderGuestbook();
  toast('방명록에 남겼어요 ✦');
});
gb.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closeGuestbook(); });

const gotoBtn = $('#goto');
let gotoTarget = null;
function updateGoto() {
  const moving = Math.hypot(controls.vel.x, controls.vel.z) > 0.15 || controls.auto;
  let t = null;
  if (!moving && controls.enabled && !map.isOpen && !sheetOpen()) {
    t = bestSpot();
    // 이미 그 자리에서 그쪽을 보고 있으면 띄우지 않는다
    if (t) {
      let dy = t.spot.yaw - controls.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      if (t.d < 0.3 && Math.abs(dy) < 0.15) t = null;
    }
  }
  gotoTarget = t;
  gotoBtn.classList.toggle('show', !!t);
  if (t) gotoBtn.querySelector('span').textContent = `${t.kind} 앞으로`;
}
gotoBtn.addEventListener('click', () => {
  const t = gotoTarget;
  if (!t) return;
  controls.walkTo(t.spot.x, t.spot.z, t.spot.yaw);
  controls.pitchT = -0.02;
  gotoBtn.classList.remove('show');
});

// 사진 앞에 섰거나 확대해서 보고 있으면 그 사진 하나만 선명한 원본으로
function updateHD() {
  let id = null;
  const t = bestSpot();
  if (t && t.photoId && t.kind === '사진' && t.d < 1.2 && t.ang < 0.6) id = t.photoId;
  if (controls.zoom > 1.25) {
    ndc.set(controls.zoomAt.x * 2 - 1, -(controls.zoomAt.y * 2 - 1));
    raycaster.setFromCamera(ndc, camera);
    raycaster.far = 40;
    const hit = raycaster.intersectObjects(museumScene.pickables, false).find(h => visibleChain(h.object));
    if (hit && hit.object.userData.photoId && !hit.object.userData.empty && !hit.object.userData.label) id = hit.object.userData.photoId;
  }
  museumScene.setHD(id);
}

// ---------- 지도 ----------
const map = new MuseumMap({
  controls,
  getLayout: () => museumScene.layout,
  getMuseum: () => museum,
  mapDelta: (dx, dy) => controls.mapDelta(dx, dy),
  toContent: (sx, sy) => toContent(sx, sy),
  isBlocked: () => { if (sheetOpen()) { closeSheet(); return true; } return editor.classList.contains('open') || gb.classList.contains('open'); },
  onSwap: (a, b) => swapPhotos(a, b),
  onPhotoTap: (ri, pid) => openPanelSheet({ roomIndex: ri, photoId: pid, panel: panelFor(pid) }),
  onRoomAction: (act, ri) => roomAction(act, ri),
  onOpen: open => {
    controls.enabled = !open;
    controls.joy.x = controls.joy.y = 0;
    controls.keys.clear();
    document.body.classList.toggle('map-open', open);
    if (open) { closeSheet(); hideHint(); }
  },
  onGo: ri => goToRoom(ri),
  onReorder: ids => reorderRooms(ids),
});

// 방 입구에 서서 방 안쪽을 바라본다
function goToRoom(ri) {
  const r = museumScene.layout[ri];
  if (!r) return;
  controls.auto = null;
  controls.setPose(0, r.zStart - 1.4, 0);
  toast(`ROOM ${String(ri + 1).padStart(2, '0')}`);
}

// 방 순서 바꾸기. 지금 있던 방 안에서의 위치는 그대로 따라간다 (rebuild 가 맞춰 줌).
function reorderRooms(ids) {
  const byId = new Map(museum.rooms.map(r => [r.id, r]));
  const next = ids.map(id => byId.get(id)).filter(Boolean);
  if (next.length !== museum.rooms.length) return;
  museum.rooms = next;
  persist();
  rebuild();
  toast('방 순서를 바꿨어요');
}

// 두 판의 사진 자리 바꾸기 (다른 방끼리도, 빈 판이면 옮기기)
function findPhoto(pid) {
  for (const room of museum.rooms) {
    const i = room.photos.findIndex(p => p.id === pid);
    if (i >= 0) return { room, i };
  }
  return null;
}
const stats = { swaps: 0 };
function swapPhotos(a, b) {
  const A = findPhoto(a), B = findPhoto(b);
  if (!A || !B) return;
  stats.swaps++;
  const pa = A.room.photos[A.i], pb = B.room.photos[B.i];
  A.room.photos[A.i] = pb;
  B.room.photos[B.i] = pa;
  persist();
  rebuild();
  toast(pa.imageId && pb.imageId ? '두 사진 자리를 바꿨어요' : '사진을 옮겼어요');
}

// 지도의 방 아래 버튼들
function roomAction(act, ri) {
  const room = museum.rooms[ri];
  if (!room) return;
  const name = `ROOM ${String(ri + 1).padStart(2, '0')}`;
  const hung = room.photos.filter(p => p.imageId).length;
  if (act === 'fill') pickPhotos({ roomIndex: ri });
  if (act === 'rename') editRoomText(ri);
  if (act === 'clear') {
    openSheet([
      { title: true, label: `${name}의 사진 ${hung}장을 모두 내릴까요? 빈 판 4개만 남아요` },
      { label: '모두 내리기', danger: true, fn: () => clearRoom(ri) },
      { label: '취소', quiet: true },
    ]);
  }
  if (act === 'delete') {
    if (museum.rooms.length <= 1) { toast('방이 하나뿐이라 지울 수 없어요'); return; }
    openSheet([
      { title: true, label: hung ? `${name}을 지울까요? 걸린 사진 ${hung}장도 함께 지워져요` : `${name}을 지울까요?` },
      { label: '방 지우기', danger: true, fn: () => deleteRoom(ri) },
      { label: '취소', quiet: true },
    ]);
  }
}
function forgetPhotos(photos) {
  for (const p of photos) if (p.imageId) releaseImage(p.imageId);
}
// 사진 원본 지우기. 같은 사진을 다른 판(다른 전시실 포함)이 아직 쓰고 있으면 남겨 둔다.
// 데이터를 바꾼 직후에 부르므로 한 박자 뒤에 확인한다.
function releaseImage(id) {
  setTimeout(() => {
    const used = library.exhibitions.some(ex => ex.rooms.some(r => r.photos.some(p => p.imageId === id)));
    if (used) return;
    deleteImage(id);
    museumScene.forgetTexture(id);
  }, 0);
}
function clearRoom(ri) {
  const room = museum.rooms[ri];
  forgetPhotos(room.photos);
  room.photos = newRoom(4).photos;
  persist();
  rebuild();
  toast('사진을 모두 내렸어요');
}
function deleteRoom(ri) {
  if (museum.rooms.length <= 1) return;
  const [room] = museum.rooms.splice(ri, 1);
  forgetPhotos(room.photos);
  persist();
  rebuild(Math.min(ri, museum.rooms.length - 1));
  toast('방을 지웠어요');
}

// ---------- 탭 → 판 고르기 ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function visibleChain(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

controls.onTap = (sx, sy) => {
  if (sheetOpen()) { closeSheet(); return; }
  const [cx, cy] = toContent(sx, sy);
  ndc.set(cx / viewW * 2 - 1, -(cy / viewH) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  raycaster.far = 30;
  const hits = raycaster.intersectObject(museumScene.root, true).filter(h => visibleChain(h.object));
  const hit = hits[0];
  if (!hit) return;
  const ud = hit.object.userData;
  if (ud.wallText === 'room') { editRoomText(ud.roomIndex); return; }
  if (ud.wallText === 'exhibition') { editExhibitionText(museum); return; }
  if (ud.guestbook) { openGuestbook(); return; }
  if (ud.exitDoor) {
    openSheet([
      { title: true, label: '전시실을 나가 홈으로 갈까요?' },
      { label: '홈으로 나가기', fn: () => openHome() },
      { label: '더 둘러보기', quiet: true },
    ]);
    return;
  }
  if (!ud.photoId) return;
  const t = { roomIndex: ud.roomIndex, photoId: ud.photoId, panel: ud.panel };
  if (ud.label) { openEditor(t); return; }
  openPanelSheet(t);
};

function openPanelSheet(t) {
  const panel = panelFor(t.photoId) || t.panel;
  if (!panel) return;
  if (panel.photo.imageId) { openPhotoSheet(t); return; }
  const capLabel = panel.photo.caption ? '설명 고치기' : '설명 쓰기';
  openSheet([
    { label: '사진 걸기 (여러 장 가능)', fn: () => pickPhotos({ roomIndex: t.roomIndex, startPhotoId: t.photoId }) },
    { label: capLabel, fn: () => openEditor(t) },
    { label: '판 떼기', quiet: true, fn: () => removePanel(t) },
    { label: '닫기', quiet: true },
  ]);
}

// 사진이 걸린 판 메뉴. 돌리기 뒤에는 다시 열어서 계속 돌릴 수 있게.
function panelFor(photoId) {
  for (const r of museumScene.layout) for (const p of r.panels) if (p.photo.id === photoId) return p;
  return null;
}
function openPhotoSheet(t) {
  const panel = panelFor(t.photoId) || t.panel;
  const capLabel = panel.photo.caption ? '설명 고치기' : '설명 쓰기';
  openSheet([
    { label: '앞에 가서 보기', fn: () => {
      const v = viewingSpot(panelFor(t.photoId) || panel);
      if (map.isOpen) { map.close(); controls.auto = null; controls.setPose(v.x, v.z, v.yaw); }
      else controls.walkTo(v.x, v.z, v.yaw);
    } },
    { label: '↻ 90° 돌리기', fn: () => { rotatePhoto(t); openPhotoSheet(t); } },
    { label: capLabel, fn: () => openEditor(t) },
    { label: '사진 바꾸기', fn: () => pickPhotos({ roomIndex: t.roomIndex, startPhotoId: t.photoId, replace: true }) },
    { label: '사진 내리기 (빈 판으로)', quiet: true, fn: () => removePhoto(t) },
    { label: '판 떼기', quiet: true, fn: () => removePanel(t) },
    { label: '닫기', quiet: true },
  ]);
}

function rotatePhoto(t) {
  const photo = findPhoto(t.photoId)?.room.photos.find(p => p.id === t.photoId);
  if (!photo) return;
  photo.rot = ((photo.rot || 0) + 1) % 4;
  if (!photo.rot) delete photo.rot;
  persist();
  rebuild();
}

// ---------- 아래 시트 (버튼 목록) ----------
const sheet = $('#sheet');
let sheetItems = [];
function sheetOpen() { return sheet.classList.contains('open'); }
// 방 스타일 고르기 항목 (벽·바닥 색 견본 + 이름 + 설명)
function themeItems(cur, fn) {
  return THEME_ORDER.map(id => {
    const T = THEMES[id];
    return { label: T.label, sub: T.desc, swatch: [T.mapWall, T.mapFloor], on: id === cur, fn: () => fn(id) };
  });
}
function openSheet(items, kind = '') {
  sheetItems = items;
  sheet.innerHTML = '';
  sheet.className = kind;
  items.forEach((it, i) => {
    if (it.title) {
      const h = document.createElement('p');
      h.className = 'title';
      h.textContent = it.label;
      sheet.appendChild(h);
      return;
    }
    const b = document.createElement('button');
    b.textContent = it.label;
    b.dataset.i = i;
    if (it.swatch) {
      b.textContent = '';
      b.innerHTML = `<i class="sw" style="background:linear-gradient(180deg, ${it.swatch[0]} 0 58%, ${it.swatch[1]} 58%)"></i><span class="tx"><b></b><small></small></span>`;
      b.querySelector('b').textContent = (it.on ? '✓ ' : '') + it.label;
      b.querySelector('small').textContent = it.sub;
      b.classList.add('theme');
      if (it.on) b.classList.add('on');
    }
    if (it.quiet) b.className = 'quiet';
    if (it.danger) b.className = 'danger';
    sheet.appendChild(b);
  });
  sheet.classList.add('open');
  document.body.classList.add('sheet-open');
}
function closeSheet() { sheet.classList.remove('open'); document.body.classList.remove('sheet-open'); }
sheet.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const it = sheetItems[+b.dataset.i];
  closeSheet();
  if (it && it.fn) it.fn();
});

// ---------- 오른쪽 아래 도구 ----------
$('#tools').addEventListener('click', e => {
  const act = e.target.closest('button')?.dataset.act;
  if (!act) return;
  hideHint();
  const ri = currentRoomIndex();
  if (act === 'photos') pickPhotos({ roomIndex: ri });
  if (act === 'room') {
    openSheet([
      { title: true, label: '어떤 방을 만들까요?' },
      ...themeItems(null, id => addRoom(id)),
      { label: '닫기', quiet: true },
    ], 'grid');
  }
  if (act === 'theme') {
    const cur = museum.rooms[ri].theme || 'dark';
    openSheet([
      { title: true, label: `ROOM ${String(ri + 1).padStart(2, '0')} 방 스타일` },
      ...themeItems(cur, id => setRoomTheme(ri, id)),
      { label: '닫기', quiet: true },
    ], 'grid');
  }
});

// ---------- 안내 ----------
let toastTimer = 0;
function toast(msg, ms = 1800) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

$('#hint').innerHTML = isTouch
  ? '왼쪽 아래 조이스틱으로 걷고, 화면을 끌어 둘러보세요.<br>두 손가락을 벌리면 잠깐 확대돼요. 판을 누르면 사진을 걸 수 있어요.'
  : '<b>W A S D</b> 또는 방향키로 걷고, 마우스를 끌어 둘러보세요. <b>Shift</b> 빠르게.<br><b>휠</b>이나 <b>오른쪽 버튼</b>으로 잠깐 확대. 판을 누르면 사진을 걸 수 있어요.';
let hintHidden = false;
function hideHint() {
  if (hintHidden) return;
  hintHidden = true;
  $('#hint').classList.add('hide');
}

// ---------- 시작 ----------
async function start() {
  requestPersistence();
  [library] = await Promise.all([loadLibrary(), loadFonts()]);
  persist();
  openHome();
  $('#loading').classList.add('done');
  setTimeout(() => $('#loading').remove(), 1200);
  setInterval(savePose, 2000);
  window.addEventListener('pagehide', savePose);
  requestAnimationFrame(loop);
}

// ---------- 홈: 전시실 고르기 ----------
let homeOpen = false;
const home = $('#home');

function openHome() {
  if (guide.active) guide.stop();
  savePose();
  if (map.isOpen) map.close();
  closeSheet();
  homeOpen = true;
  controls.enabled = false;
  controls.joy.x = controls.joy.y = 0;
  controls.keys.clear();
  document.body.classList.add('home-open');
  renderHome();
}

function enterExhibition(ex) {
  museum = ex;
  homeOpen = false;
  document.body.classList.remove('home-open');
  controls.enabled = true;
  controls.auto = null;
  const layout = rebuild(0, true);
  const pose = loadPose(ex.id);
  const last = layout[layout.length - 1];
  if (pose && pose.z <= 0 && pose.z >= last.zEnd && Math.abs(pose.x) < 3.4) controls.setPose(pose.x, pose.z, pose.yaw);
  else { controls.setPose(0, -1.0, 0); controls.pitchT = controls.pitch = 0.04; }
  $('#ex-title').textContent = ex.title;
}

function exhibitionStats(ex) {
  const photos = ex.rooms.flatMap(r => r.photos).filter(p => p.imageId);
  return { rooms: ex.rooms.length, photos: photos.length, cover: photos[0] };
}

function renderHome() {
  const list = $('#home .list');
  list.innerHTML = '';
  const tour = document.createElement('button');
  tour.className = 'excard tour';
  tour.innerHTML = '<span class="eyebrow">처음이라면</span><b>사용법 둘러보기</b><span>제주 여행 예시 전시실을 걸으며<br>하나씩 따라 해 봐요</span><span class="go">시작하기 →</span>';
  tour.addEventListener('click', () => startTutorial());
  list.appendChild(tour);
  const styles = document.createElement('button');
  styles.className = 'excard tour styles';
  styles.innerHTML = `<span class="eyebrow">방 고르기</span><b>방 스타일 둘러보기</b><span>${THEME_ORDER.length}가지 방을 이어 붙인 전시실을<br>걸으며 비교해 봐요</span><span class="go">들어가기 →</span>`;
  styles.addEventListener('click', () => startShowcase());
  list.appendChild(styles);
  for (const ex of library.exhibitions) {
    if (ex.showcase) continue; // 방 스타일 둘러보기는 위 카드로
    const st = exhibitionStats(ex);
    const card = document.createElement('div');
    card.className = 'excard';
    card.innerHTML = `<div class="cover"></div><div class="info"><b></b><p></p><span>방 ${st.rooms} · 사진 ${st.photos}</span></div><button class="more" aria-label="전시실 메뉴">⋯</button>`;
    const tb = card.querySelector('b');
    tb.textContent = ex.title || '이름 없는 전시';
    tb.style.fontFamily = fontFamily(ex.font);
    if (ex.font) ensureFont(ex.font);
    card.querySelector('p').textContent = (ex.intro || '').split('\n')[0] || '설명이 아직 없어요';
    const cover = card.querySelector('.cover');
    if (st.cover) thumbURL(st.cover).then(u => { if (u) cover.style.backgroundImage = `url("${u}")`; });
    else cover.classList.add('empty');
    card.addEventListener('click', e => {
      if (e.target.closest('.more')) {
        openSheet([
          { title: true, label: ex.title },
          { label: '들어가기', fn: () => enterExhibition(ex) },
          { label: '이름·설명 고치기', fn: () => editExhibitionText(ex) },
          { label: '전시실 지우기', danger: true, fn: () => confirmDeleteExhibition(ex) },
          { label: '닫기', quiet: true },
        ]);
        return;
      }
      enterExhibition(ex);
    });
    list.appendChild(card);
  }
  const add = document.createElement('button');
  add.className = 'excard add';
  add.innerHTML = '<span class="plus">+</span><b>새 전시실</b><span>이름을 정하고 바로 들어가요</span>';
  add.addEventListener('click', () => {
    const ex = newExhibition('');
    editExhibitionText(ex, () => {
      library.exhibitions.push(ex);
      persist();
      enterExhibition(ex);
    });
  });
  list.appendChild(add);
}

function confirmDeleteExhibition(ex) {
  const st = exhibitionStats(ex);
  openSheet([
    { title: true, label: `'${ex.title}' 전시실을 지울까요? 방 ${st.rooms}개와 사진 ${st.photos}장이 모두 지워져요` },
    { label: '전시실 지우기', danger: true, fn: () => {
      for (const r of ex.rooms) forgetPhotos(r.photos);
      library.exhibitions = library.exhibitions.filter(x => x !== ex);
      if (museum === ex) museum = null;
      try { localStorage.removeItem('pm-pose-' + ex.id); } catch (e) {}
      persist();
      renderHome();
      toast('전시실을 지웠어요');
    } },
    { label: '취소', quiet: true },
  ]);
}

$('#home-btn').addEventListener('click', () => openHome());

// ---------- 튜토리얼: 제주 여행 예시 전시실 + 따라 하기 안내 ----------
const guide = new Guide({
  modal: $('#guide-modal'), pill: $('#guide'),
  onEnd: () => { setEditorTip(''); controls.enabled = !map.isOpen && !homeOpen; },
  // 안내 글이 떠 있는 동안은 걷지 않는다
  onModal: on => {
    if (on) { controls.joy.x = controls.joy.y = 0; controls.keys.clear(); }
    controls.enabled = !on && !map.isOpen && !homeOpen && !editor.classList.contains('open');
    document.body.classList.toggle('guide-modal', on);
  },
});
function setEditorTip(html) {
  const t = $('#ed-tip');
  t.innerHTML = html || '';
  t.hidden = !html;
}

let buildingExample = false;
async function buildExample() {
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
async function buildShowcase() {
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
  ex.intro = `방 스타일 ${THEME_ORDER.length}가지를 차례로 이어 붙인 전시실이에요.\n`
    + '걸어 다니며 마음에 드는 방을 골라 보세요. 내 전시실에서는 오른쪽 아래 ◐ 방 색에서 바꿀 수 있어요.';
  ex.showcase = true;
  ex.rooms = THEME_ORDER.map((id, k) => {
    const T = THEMES[id];
    const room = newRoom(0, id);
    room.name = T.label;
    room.intro = T.desc + '.';
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

async function startShowcase() {
  if (buildingExample) return;
  let ex = library.exhibitions.find(e => e.showcase);
  if (!ex) {
    buildingExample = true;
    toast('방 스타일 전시실을 준비하고 있어요…', 8000);
    try { ex = await buildShowcase(); }
    catch (e) { console.error(e); toast('예시 사진을 불러오지 못했어요. 인터넷 연결을 확인해 주세요', 4000); return; }
    finally { buildingExample = false; }
    library.exhibitions.unshift(ex);
    persist();
    toast('준비됐어요', 1200);
  }
  // 새 방 스타일이 생겼으면 이어 붙인다
  const have = new Set(ex.rooms.map(r => r.theme));
  const src = ex.rooms[0]?.photos || [];
  for (const id of THEME_ORDER) if (!have.has(id) && src.length) {
    const room = newRoom(0, id);
    room.name = THEMES[id].label; room.intro = THEMES[id].desc + '.';
    room.photos = src.map(p => ({ ...newPhoto(p.imageId, p.aspect), caption: p.caption }));
    ex.rooms.push(room);
  }
  persist();
  enterExhibition(ex);
}

async function startTutorial() {
  if (buildingExample) return;
  let ex = library.exhibitions.find(e => e.tutorial);
  if (!ex) {
    buildingExample = true;
    toast('예시 전시실을 준비하고 있어요…', 8000);
    try {
      ex = await buildExample();
    } catch (e) {
      console.error(e);
      toast('예시 사진을 불러오지 못했어요. 인터넷 연결을 확인해 주세요', 4000);
      return;
    } finally { buildingExample = false; }
    library.exhibitions.unshift(ex);
    persist();
    toast('준비됐어요', 1200);
  }
  try { localStorage.removeItem('pm-pose-' + ex.id); } catch (e) {}
  enterExhibition(ex);
  guide.start(tutorialSteps());
}

function atViewingSpot() {
  if (controls.auto) return false;
  for (const r of museumScene.layout || []) for (const p of r.panels) {
    const v = viewingSpot(p);
    if (Math.hypot(v.x - controls.pos.x, v.z - controls.pos.z) < 0.4) return true;
  }
  return false;
}

function tutorialSteps() {
  const seen = {};
  const editorOpen = () => editor.classList.contains('open');
  const walk = isTouch ? '왼쪽 아래 <b>조이스틱</b>' : '<b>W A S D</b>(또는 방향키)';
  const look = isTouch ? '화면을 손가락으로 끌면' : '마우스로 끌면';
  return [
    { title: '어서 오세요', text: '사용법을 함께 둘러봐요. 이곳은 <b>제주 여행 예시 전시실</b>이에요.<br>입구 정면 벽에 전시 이름과 설명이 적혀 있어요. 미술관처럼 먼저 읽고 들어가요.' },
    { title: '걸어서 들어가기', text: `${walk}로 걸을 수 있어요. ${look} 둘러볼 수 있고요.<br>오른쪽 문을 지나 <b>ROOM 01</b>로 들어가 보세요.`,
      task: '오른쪽 문을 지나 <b>ROOM 01</b>로 들어가 보세요', done: () => museumScene.roomIndexAt(controls.pos.z) >= 0 },
    { title: '방 안내벽', text: '방마다 문 앞에 <b>안내벽</b>이 있어요. 이 방이 어떤 방인지 적혀 있어요.<br>벽을 돌아 사진 쪽을 보고 멈추면 오른쪽에 <b>사진 앞으로</b> 버튼이 희미하게 떠요. 눌러 보세요.',
      task: '사진 쪽을 보고 멈춘 뒤, 오른쪽 <b>사진 앞으로</b>를 눌러 보세요', done: atViewingSpot },
    { title: '잠깐 확대해서 보기', text: isTouch
        ? '두 손가락을 <b>벌리면</b> 그 자리가 확대돼요. 사진 옆 설명 글씨도 또렷하게 볼 수 있어요. 손을 떼면 원래대로 돌아와요.'
        : '<b>휠</b>을 굴리거나 <b>오른쪽 버튼</b>을 누르고 있으면 그 자리가 확대돼요. 사진 옆 설명 글씨도 또렷하게 볼 수 있어요.',
      task: isTouch ? '두 손가락을 벌려 확대했다가 놓아 보세요' : '휠이나 오른쪽 버튼으로 확대했다가 놓아 보세요',
      done: () => { if (controls.zoom > 1.6) seen.zoom = true; return seen.zoom && controls.zoom < 1.05; } },
    { title: '사진 메뉴', text: '사진을 <b>누르면</b> 메뉴가 나와요. 90° 돌리기, 설명 쓰기, 사진 바꾸기, 내리기를 할 수 있어요.',
      task: '사진을 눌러 보세요', done: () => sheetOpen() },
    { title: '전시장 지도', text: '메뉴는 바깥을 누르면 닫혀요.<br>오른쪽 위의 <b>작은 지도</b>를 누르면 전시장 전체가 한눈에 보여요.',
      task: '오른쪽 위 <b>작은 지도</b>를 눌러 보세요', done: () => map.isOpen && !sheetOpen() },
    { title: '사진 자리 바꾸기', text: '지도에서 방을 누르면 그 방으로 바로 가요.<br>사진을 <b>꾹 눌러</b> 다른 사진 위에 놓으면 두 사진의 자리가 바뀌어요. 다른 방 사진과도 돼요.',
      task: '사진을 꾹 눌러 다른 사진 위에 놓아 보세요', done: () => stats.swaps > seen.swaps0, onEnter: () => { seen.swaps0 = stats.swaps; } },
    { title: '방 순서 바꾸기', text: '지도 오른쪽 위 <b>편집</b>을 누르면 방이 살짝 흔들려요. 그때 방을 끌어서 순서를 바꿀 수 있어요. 다 됐으면 <b>완료</b>.',
      task: '<b>편집</b>을 눌러 방을 끌어 보고 <b>완료</b>를 눌러요', done: () => { if (map.editing) seen.edit = true; return seen.edit && !map.editing; } },
    { title: '방 이름과 글씨체', text: '방 아래 <b>이름·설명</b>을 누르면 안내벽에 적힐 글을 고칠 수 있어요.<br>창 맨 아래에서 <b>글씨체</b>도 골라 보세요. 저장하면 그 방 글씨가 바뀌어요.',
      task: '방 아래 <b>이름·설명</b> → 글씨체 고르고 <b>저장</b>',
      editorTip: '맨 아래 <b>글씨체</b>에서 마음에 드는 글씨를 고르고 <b>저장</b>해 보세요.',
      done: () => { if (editorOpen()) seen.ed = true; return seen.ed && !editorOpen(); } },
    { title: '나만의 전시 꾸미기', text: '지도를 닫으면(✕) 오른쪽 아래에 버튼이 있어요.<br><b>+ 사진</b> 여러 장 한 번에 걸기 · <b>+ 방</b> 새 방 만들기 · <b>◐ 방 색</b> 어두운 방과 하얀 방.' },
    { title: '출구와 방명록', text: '마지막 방 끝에는 <b>출구</b>가 있어요. 방명록 책상을 누르면 한마디를 남길 수 있고, 남긴 글은 벽에 쪽지로 붙어요. 초록 <b>출구</b> 문을 누르면 홈으로 나가요.' },
    { title: '다 됐어요 ✦', text: '이제 왼쪽 위 <b>‹ 홈</b>에서 나만의 전시실을 만들어 보세요.<br>이 예시 전시실은 홈에서 지울 수 있고, <b>사용법 둘러보기</b>로 언제든 다시 볼 수 있어요.' },
  ];
}

let lastT = performance.now();
function loop(t) {
  const dt = (t - lastT) / 1000;
  lastT = t;
  if (homeOpen || !museum) { requestAnimationFrame(loop); return; } // 홈에서는 그리지 않는다
  controls.update(dt);
  guide.tick();
  const tip = (guide.active && editor.classList.contains('open') && guide.step.editorTip) || '';
  if (tip !== (loop.tip || '')) { loop.tip = tip; setEditorTip(tip); }
  if (Math.hypot(controls.vel.x, controls.vel.z) > 0.2) hideHint();
  const ri = museumScene.roomIndexAt(controls.pos.z);
  if (ri !== currentRoom) {
    currentRoom = ri;
    museumScene.setActiveRoom(ri);
    const nm = museum.rooms[ri]?.name;
    $('#room').textContent = ri < 0 ? '입구' : ri >= museum.rooms.length ? '출구'
      : `ROOM ${String(ri + 1).padStart(2, '0')}${nm ? ' · ' + nm : ''}`;
    document.body.classList.toggle('light-room', !!(museum.rooms[ri] && themeOf(museum.rooms[ri]).light));
  }
  applyZoom();
  if ((loop.n = (loop.n || 0) + 1) % 8 === 0) updateGoto();
  if (loop.n % 20 === 0) updateHD();
  map.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

resize();
start().catch(e => {
  console.error(e);
  $('#loading').textContent = '열지 못했어요: ' + e.message;
});

// 디버그/테스트용
window.__pm = { controls, museumScene, get museum() { return museum; }, camera, renderer, hangPhotos, addRoom, setRoomTheme, map, guide, startTutorial, startShowcase, goToRoom, reorderRooms, swapPhotos, roomAction, clearRoom, deleteRoom, get library() { return library; }, enterExhibition, openHome, editRoomText };

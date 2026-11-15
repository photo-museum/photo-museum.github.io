import * as THREE from 'three';
import { MuseumScene, themeOf, EXIT_TITLE, EXIT_NOTE } from './builder.js';
import { WALL_BY, CEIL_BY, FLOOR_BY, PRESETS, simplifyStyles, presetOf, styleOf } from './styles.js';
import { initCaptions } from './captions.js';
import { MuseumMap2 } from './map2.js';
import { WalkControls } from './controls.js';
import { viewingSpot, LOBBY_L, ROOM_W, WALL_T, R2 } from './layout.js';
import { MuseumMap } from './map.js';
import { Guide } from './guide.js';
import { Music } from './music.js';
import { DEMO_VERSION } from './demo.js';
import { tutorialSteps } from './tutorial.js';
import { initHome } from './home.js';
import { initStylePanel } from './stylepanel.js';
import { initBackup } from './backupui.js';
import { buildExample, buildShowcase, SHOWCASE, buildDemoLibrary, addBigTestExhibition } from './seed.js';
import { loadFonts, ensureFont, ensureGlyphs, isFontReady, fontInfo, FONT_LIST, DEFAULT_FONT } from './fonts.js';
import {
  loadLibrary, saveLibrary, putImage, deleteImage, prepareImage, requestPersistence, uid, sweepImages,
  newPhoto, newRoom, EMPTY_ASPECT, HD,
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
museumScene.camera = camera; // 미리 셰이더 만들기(warmUp)에 쓴다
museumScene.onTextureError = () => toast('사진 하나를 못 불러왔어요\n판을 눌러 다시 넣어 주세요', 4000);

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
const joyZone = document.querySelector('#joy');
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
  joystick.on('start', () => { zone.classList.add('active'); });
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
      controls.auto = null;
      controls.pos.z = z;
    } else {
      const r = layout[Math.min(fallbackRi, layout.length - 1)];
      controls.auto = null;
      controls.setPose(0, r.zStart - 1.4, 0);
    }
  }
  wake(2000);
  // 지금 서 있는 방 근처 사진을 바로 붙인다 (이미 올라간 사진은 같은 프레임에)
  museumScene.setActiveRoom(museumScene.roomIndexAt(controls.pos.z));
  map.invalidate();
  if (map.isOpen) map.render(true);
  ensureMuseumFonts();
  return layout;
}

function persist() { return saveLibrary(library); }

// ---------- 되돌리기 ----------
// 바꾸기 직전의 전체 목록을 기억해 두었다가 되돌린다 (최근 30번).
// 지운 사진 원본은 되돌릴 수도 있으니 바로 지우지 않고, 다음에 앱을 열 때 아무 데도 안 쓰이면 지운다.
const undoStack = [];
let undoTimer = 0;
function pushUndo(label) {
  if (!library) return;
  undoStack.push({ label, lib: JSON.stringify(library), exId: museum && museum.id, at: performance.now() });
  library.changedAt = Date.now();
  if (undoStack.length > 30) undoStack.shift();
  const el = $('#undo');
  el.querySelector('span').textContent = label;
  el.classList.add('show');
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => el.classList.remove('show'), 7000);
}
$('#undo').addEventListener('click', e => { e.stopPropagation(); undo(); });
window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
    if (e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return;
    e.preventDefault(); undo();
  }
});
function undo() {
  const u = undoStack.pop();
  $('#undo').classList.remove('show');
  if (!u) { toast('되돌릴 것이 없어요'); return; }
  library = JSON.parse(u.lib);
  persist();
  if (homeOpen) { renderHome(); toast(`되돌렸어요 · ${u.label}`); return; }
  const ex = library.exhibitions.find(e => e.id === (museum && museum.id)) || library.exhibitions.find(e => e.id === u.exId);
  if (ex) museum = ex;
  rebuild();
  if (map.isOpen) map.open();
  if (stylePanel.classList.contains('open')) renderStylePanel();
  if (gb.classList.contains('open')) renderGuestbook();
  toast(`되돌렸어요 · ${u.label}`);
  if (undoStack.length) { const el = $('#undo'); el.querySelector('span').textContent = undoStack[undoStack.length - 1].label; }
}

// 전시실마다 마지막 위치 기억 (이 브라우저에서만, 편의용)
function savePose() {
  if (!museum || homeOpen) return;
  try { localStorage.setItem('pm-pose-' + museum.id, JSON.stringify({ x: controls.pos.x, z: controls.pos.z, yaw: controls.yawT })); } catch (e) {}
}
function loadPose(id) {
  try { return JSON.parse(localStorage.getItem('pm-pose-' + id)); } catch (e) { return null; }
}
// 이어볼 자리가 있나 (입구 바로 앞에서 멈춘 건 이어보기로 치지 않는다)
function hasResume(ex) {
  const p = loadPose(ex.id);
  return !!(p && isFinite(p.z) && p.z < -2.5);
}

// ---------- 사진 넣기 (여러 장) ----------
// 사진을 거는 도중에 다른 방에 또 걸어도 되게:
//  · 고를 때마다 새 <input> 을 쓴다 (하나를 비우고 다시 쓰면, 아직 다 못 건 앞의 사진 파일이 사라질 수 있다)
//  · 거는 일은 줄을 세워 하나씩 한다 (둘이 한꺼번에 방을 다시 짓지 않게)
//  · 방은 고른 순간의 방을 기억한다 (그 사이 방 순서가 바뀌어도 그 방에 건다)
const fileProto = $('#file');
let hangQueue = Promise.resolve(), hangWaiting = 0;

function pickPhotos(job) {
  const ex = museum;
  job.room = ex.rooms[job.roomIndex];
  const input = fileProto.cloneNode();
  input.removeAttribute('id');
  input.multiple = !job.replace;
  fileProto.after(input);
  input.addEventListener('change', () => {
    const files = Array.from(input.files || []);
    if (!files.length) { input.remove(); return; }
    if (hangWaiting) toast('앞의 사진을 다 건 뒤에 이어서 걸게요', 2600);
    hangWaiting++;
    hangQueue = hangQueue.then(async () => {
      try { if (museum === ex) await hangPhotos(job, files); }
      finally { hangWaiting--; input.remove(); }
    });
  });
  input.addEventListener('cancel', () => input.remove());
  input.click();
}

// 정한 판부터 빈 판을 차례로 채우고, 남는 사진은 판을 새로 만들어 단다 (벽이 길어짐)
async function hangPhotos(job, files) {
  const room = job.room && museum.rooms.includes(job.room) ? job.room : museum.rooms[job.roomIndex];
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
      pushUndo('사진 걸기');
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
  pushUndo('사진 내리기');
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
  pushUndo('판 떼기');
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
  const fixed = '0123456789ROOMMyphotomuseum→—·관람해주셔서고맙습니다앞의방명록에한마디남겨주세요벽을눌러이전시에대한설명을적어이름과';
  add(exFont, fixed + (m.title || '') + (m.intro || '') + (m.exitTitle || '') + (m.exitNote || '') + (m.guestbook || []).map(g => g.text + g.name).join(''));
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
    if (r.some(x => !x)) toast('글씨체를 못 불러와 기본 글씨로 보여요\n인터넷 연결을 확인해 주세요', 3500);
  });
}
function openEditor(t) {
  const photo = findPhoto(t.photoId)?.room.photos.find(p => p.id === t.photoId);
  if (!photo) return;
  openText({
    head: '사진 설명',
    body: { label: '사진 옆 벽에 적혀요', value: photo.caption, placeholder: '첫 줄은 제목처럼 보여요\n예) 제주, 겨울 바다\n2025. 1. 아침 7시' },
    onSave: (_, v) => {
      pushUndo('설명 고치기');
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
    head: `ROOM ${String(ri + 1).padStart(2, '0')} 이름·소개`,
    title: { label: '방 이름', value: room.name, placeholder: '예) 바다, 아침 7시' },
    body: { label: '방 설명 (입구 옆 왼쪽 벽에 적혀요)', value: room.intro, placeholder: '이 방에 어떤 사진들이 있는지 적어 주세요' },
    font: { value: room.font, inherit: museum.font || DEFAULT_FONT },
    onSave: (name, intro, font) => {
      pushUndo('방 이름·설명');
      if (name) room.name = name; else delete room.name;
      if (intro) room.intro = intro; else delete room.intro;
      if (font) room.font = font; else delete room.font;
      persist();
      rebuild();
      toast('방 소개 글을 고쳤어요');
    },
  });
}
// 출구 벽 글 (맨 위 인사말 + 아래 한두 줄). 비우면 기본 글로.
function editExitText() {
  openText({
    head: '출구 벽 글',
    title: { label: '인사말 (크게)', value: museum.exitTitle || '', placeholder: EXIT_TITLE },
    body: { label: '아래 작은 글 (두 줄까지)', value: museum.exitNote ?? EXIT_NOTE, placeholder: EXIT_NOTE },
    onSave: (title, note) => {
      pushUndo('출구 벽 글');
      if (title) museum.exitTitle = title; else delete museum.exitTitle;
      museum.exitNote = note || '';
      persist();
      rebuild();
      toast('출구 벽 글을 고쳤어요');
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
      pushUndo('전시 이름·소개');
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
  pushUndo('방 만들기');
  const nr = newRoom(4, theme);
  // 새 방은 앞 방과 번갈아: 앞이 흰 방이면 어두운 방, 어두운 방이면 흰 방 (첫 방은 흰 방)
  const prev = museum.rooms[museum.rooms.length - 1];
  nr.style = { ...PRESETS[prev && presetOf(styleOf(prev)) === PRESETS[0] ? 1 : 0].style };
  museum.rooms.push(nr);
  persist();
  rebuild();
  const n = museum.rooms.length;
  toast(`새 방 ROOM ${String(n).padStart(2, '0')}을 만들었어요`, 2400);
}

// ---------- 방 꾸미기 창 (js/stylepanel.js) ----------
const { stylePanel, openStylePanel, closeStylePanel, renderStylePanel, applyStyle, applyPreset } = initStylePanel({
  get museum() { return museum; }, controls, museumScene, toast, persist, rebuild, pushUndo, closeSheet, route,
});

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
    cands.push({ kind: '방 소개', cx: r.introWall === 'R' ? ROOM_W / 2 : -ROOM_W / 2, cz: r.introSpot.z, spot: r.introSpot });
  }
  if (ri < 0) cands.push({ kind: '전시 소개', cx: -1.25, cz: -LOBBY_L, spot: { x: -1.25, z: -LOBBY_L + 4.9, yaw: 0 } });
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
      pushUndo('방명록 글 지우기');
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

// ---------- 이전 / 다음 사진 (터치 한 번으로) ----------
// 관람 순서: 전시 소개 → (방마다) 방 소개 글 → 걷는 순서대로 사진 → … → 방명록
function museumStops() {
  const L = museumScene.layout;
  if (!L) return [];
  const out = [{ kind: '전시 소개', spot: { x: -1.25, z: -LOBBY_L + 4.9, yaw: 0 } }];
  for (const r of L) {
    out.push({ kind: '방 소개', spot: r.introSpot });
    for (const p of [...r.panels].sort((a, b) => (R2 ? a.index - b.index : a.sAlong - b.sAlong))) {
      if (p.photo.imageId) out.push({ kind: '사진', photoId: p.photo.id, spot: viewingSpot(p) });
    }
  }
  if (L.exit) out.push({ kind: '방명록', spot: { x: 0, z: L.exit.zStart - 3.4 + 1.5, yaw: 0 } });
  return out;
}
// 지금 자리에서 목표까지: 방 사이는 문을 지나간다
function route(x0, z0, x1, z1) {
  const L = museumScene.layout;
  const fwd = z1 < z0;
  const ev = [];
  const cross = zc => (z0 - zc) * (z1 - zc) < 0;
  const doors = [{ zA: L.lobby.zEnd, x: L.lobby.doorOutX || 0 }, ...L.map(r => ({ zA: r.zEnd, x: r.doorOutX || 0 }))];
  for (const d of doors) {
    const zB = d.zA - WALL_T;
    if (!cross((d.zA + zB) / 2)) continue;
    const a = { x: d.x, z: d.zA + 0.5 }, b = { x: d.x, z: zB - 0.5 };
    ev.push({ z: (d.zA + zB) / 2, pts: fwd ? [a, b] : [b, a] });
  }
  ev.sort((a, b) => (fwd ? b.z - a.z : a.z - b.z));
  return [...ev.flatMap(e => e.pts), { x: x1, z: z1 }];
}
const navPrev = $('#nav-prev'), navNext = $('#nav-next');
let navTargets = { prev: null, next: null };
// 지금 자리에서 이전·다음 자리 (누르는 순간 새로 계산 — 막 도착했을 때도 맞게)
// 걸어가는 중이면 '가고 있는 자리'를 기준으로: 도착을 기다리지 않고 연달아 눌러 빨리 넘길 수 있다
function navFromHere() {
  const st = museumStops();
  const base = navPending ? navPending.spot : controls.auto || controls.pos;
  const px = base.x, pz = base.z;
  let at = -1, best = 0.6, prev = null, next = null;
  st.forEach((s, i) => { const d = Math.hypot(s.spot.x - px, s.spot.z - pz); if (d < best) { best = d; at = i; } });
  if (at >= 0) { prev = st[at - 1] || null; next = st[at + 1] || null; }
  else {
    next = st.find(s => s.spot.z < pz - 0.2) || null;
    prev = [...st].reverse().find(s => s.spot.z > pz + 0.2) || null;
  }
  return { prev, next };
}
function updateNav() {
  // 눌러서 걸어가는 중에도 그대로 보여 준다 (연달아 누르게). 조이스틱으로 걷는 동안만 숨긴다.
  const show = museum && !homeOpen && controls.enabled && !map.isOpen && !sheetOpen()
    && (controls.auto || Math.hypot(controls.vel.x, controls.vel.z) < 0.15);
  let prev = null, next = null;
  if (show) ({ prev, next } = navFromHere());
  navTargets = { prev, next };
  navPrev.classList.toggle('show', !!prev);
  navNext.classList.toggle('show', !!next);
  if (prev) navPrev.setAttribute('aria-label', `이전 ${prev.kind}으로`);
  if (next) navNext.setAttribute('aria-label', `다음 ${next.kind}으로`);
}
// 이전·다음: 걸어가며 왼쪽 벽·오른쪽 벽으로 번갈아 돌면 어지럽다 → 화면이 잠깐 어두워졌다가 그 자리에 바로 서 있다 (깜빡 넘기기).
// 어두운 동안 또 누르면 그다음 자리로 바뀐다.
const blink = $('#blink');
let navPending = null, blinkT = 0;
function goStop(s) {
  if (!s) return;
  controls.joy.x = controls.joy.y = 0; // 조이스틱이 같이 움직이지 않게
  controls.auto = null;
  navPending = s;
  stats.navs = (stats.navs || 0) + 1;
  hideHint();
  blink.classList.add('on');
  wake(700);
  clearTimeout(blinkT);
  blinkT = setTimeout(() => {
    const sp = navPending.spot;
    navPending = null;
    controls.setPose(sp.x, sp.z, sp.yaw);
    controls.pitch = controls.pitchT = -0.02;
    wake(900);
    requestAnimationFrame(() => requestAnimationFrame(() => blink.classList.remove('on')));
  }, 150);
}
navPrev.addEventListener('click', () => goStop(navFromHere().prev));
navNext.addEventListener('click', () => goStop(navFromHere().next));

// 전시실 안에서는 화면이 저절로 꺼지지 않게 (가만히 서서 사진을 볼 때). 홈에서는 풀어 준다.
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { const w = wakeLock; wakeLock = null; await w.release(); }
  } catch (e) { wakeLock = null; }
}
// 다른 앱에 다녀오면 풀리므로 돌아올 때 다시 건다
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !homeOpen) keepAwake(true); });

// 출구 문 앞까지 걸어가면 (누르지 않아도) 홈으로 갈지 묻는다. 물러났다 다시 와야 또 묻는다.
function askLeave() {
  openSheet([
    { title: true, label: '전시실을 나가 홈으로 갈까요?' },
    { label: '홈으로 나가기', fn: () => openHome() },
    { label: '더 둘러보기', quiet: true },
  ]);
}
let exitAsked = false;
function exitDoorTick() {
  const E = museumScene.layout && museumScene.layout.exit;
  if (!E || homeOpen || !controls.enabled) return;
  const dx = Math.abs(controls.pos.x - 2.35), dz = controls.pos.z - E.zEnd; // 출구 문: builder EXIT_DOOR.x
  const at = dx < 0.75 && dz < 0.85;
  if (!at) { if (dx > 1.4 || dz > 1.6) exitAsked = false; return; }
  if (exitAsked || sheetOpen() || map.isOpen || controls.auto) return;
  exitAsked = true;
  controls.joy.x = controls.joy.y = 0; controls.keys.clear();
  askLeave();
}

const gotoBtn = $('#goto');
const gbCta = $('#gb-cta');
gbCta.addEventListener('click', () => { gbCta.classList.remove('show'); openGuestbook(); });
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
  // 방명록 책상 가까이 오면 '방명록 쓰기' (그래야 눌러서 쓸 생각을 한다)
  const L = museumScene.layout;
  let nearDesk = false;
  if (L && L.exit && controls.enabled && !map.isOpen && !sheetOpen() && !gb.classList.contains('open')) {
    const dz = L.exit.zStart - 3.4; // 책상 자리 (builder GB_DESK.s)
    nearDesk = Math.hypot(controls.pos.x, controls.pos.z - dz) < 3.2 && controls.pos.z < L.exit.zStart + 0.5;
  }
  gbCta.classList.toggle('show', nearDesk);
  if (nearDesk && t && t.kind === '방명록') t = null; // 같은 자리를 두 번 말하지 않게
  gotoTarget = t;
  gotoBtn.classList.toggle('show', !!t);
  if (t) gotoBtn.querySelector('span').textContent = `${t.kind} 앞으로`;
}
// 조이스틱(또는 걷기 키)을 놓았을 때 사진 쪽을 보고 가까이 있으면 → 그 사진 정면으로 스르륵 가서 선다.
// (화면을 끌어 둘러보기만 할 때는 움직이지 않는다)
const snap = { armed: false, rel: 0 };
function snapTick() {
  const input = Math.hypot(controls.joy.x, controls.joy.y) > 0.05 || controls.keys.size > 0;
  if (input) { snap.armed = true; snap.rel = 0; return; }
  if (!snap.armed) return;
  const now = performance.now();
  if (!snap.rel) { snap.rel = now; return; }
  if (now - snap.rel < 250) return;
  snap.armed = false;
  if (controls.auto || !controls.enabled || map.isOpen || sheetOpen() || homeOpen || controls.zoom > 1.05) return;
  const t = bestSpot();
  if (!t || t.kind !== '사진' || t.ang > 0.65 || t.d > 2.4) return;
  let dy = t.spot.yaw - controls.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  if (t.d < 0.15 && Math.abs(dy) < 0.08) return; // 이미 그 자리
  controls.walkPath(route(controls.pos.x, controls.pos.z, t.spot.x, t.spot.z), t.spot.yaw);
  controls.pitchT = -0.02;
  gotoBtn.classList.remove('show');
}
gotoBtn.addEventListener('click', () => {
  const t = gotoTarget;
  if (!t) return;
  controls.walkPath(route(controls.pos.x, controls.pos.z, t.spot.x, t.spot.z), t.spot.yaw);
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
const map = new (R2 ? MuseumMap2 : MuseumMap)({ // 시험판 R2 는 세로 지도 (js/map2.js)
  controls,
  getLayout: () => museumScene.layout,
  getMuseum: () => museum,
  mapDelta: (dx, dy) => controls.mapDelta(dx, dy),
  toContent: (sx, sy) => toContent(sx, sy),
  isBlocked: () => { if (sheetOpen()) { closeSheet(); return true; } return editor.classList.contains('open') || gb.classList.contains('open'); },
  onSwap: (a, b) => swapPhotos(a, b),
  onInsert: (pid, ri, beforePid) => insertPhoto(pid, ri, beforePid),
  onInsertMany: (pids, ri, beforePid) => insertPhotos(pids, ri, beforePid),
  onPhotoTap: (ri, pid) => openPanelSheet({ roomIndex: ri, photoId: pid, panel: panelFor(pid) }),
  onRoomAction: (act, ri) => roomAction(act, ri),
  onAddRoom: () => addRoom('white'),
  onOpen: open => {
    controls.enabled = !open;
    controls.joy.x = controls.joy.y = 0;
    controls.keys.clear();
    document.body.classList.toggle('map-open', open);
    if (open) { closeSheet(); hideHint(); }
  },
  onGo: ri => goToRoom(ri),
  onGoPlace: kind => {
    const L = museumScene.layout;
    controls.auto = null;
    if (kind === 'lobby') { controls.setPose(0, -1.0, 0); toast('입구'); }
    else if (L && L.exit) { controls.setPose(0, L.exit.zStart - 1.4, 0); toast('출구'); }
  },
  onReorder: ids => reorderRooms(ids),
});

// 방 입구에 서서 방 안쪽을 바라본다
function goToRoom(ri) {
  const r = museumScene.layout[ri];
  if (!r) return;
  controls.auto = null;
  controls.setPose(r.doorInX || 0, r.zStart - 1.4, 0);
  toast(`ROOM ${String(ri + 1).padStart(2, '0')}`);
}

// 방 순서 바꾸기. 지금 있던 방 안에서의 위치는 그대로 따라간다 (rebuild 가 맞춰 줌).
function reorderRooms(ids) {
  const byId = new Map(museum.rooms.map(r => [r.id, r]));
  const next = ids.map(id => byId.get(id)).filter(Boolean);
  if (next.length !== museum.rooms.length) return;
  museum.rooms = next;
  stats.reorders = (stats.reorders || 0) + 1;
  pushUndo('방 순서');
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
  pushUndo('사진 자리 바꾸기');
  const pa = A.room.photos[A.i], pb = B.room.photos[B.i];
  A.room.photos[A.i] = pb;
  B.room.photos[B.i] = pa;
  persist();
  rebuild();
  toast(pa.imageId && pb.imageId ? '두 사진 자리를 바꿨어요' : '사진을 옮겼어요');
}

// 사진 하나를 (다른 방이어도) 다른 사진 앞에 끼워 넣기. beforePid 가 없으면 그 방 맨 끝.
function insertPhoto(pid, ri, beforePid) {
  const A = findPhoto(pid);
  const room = museum.rooms[ri];
  if (!A || !room) return;
  pushUndo('사진 끼워 넣기');
  const [ph] = A.room.photos.splice(A.i, 1);
  let k = beforePid ? room.photos.findIndex(p => p.id === beforePid) : -1;
  if (k < 0) k = room.photos.length;
  room.photos.splice(k, 0, ph);
  if (!A.room.photos.length) A.room.photos.push(newPhoto()); // 방이 텅 비지 않게 빈 판 하나
  stats.inserts = (stats.inserts || 0) + 1; // 사이에 끼워 넣기
  persist();
  rebuild();
  toast(A.room === room ? '사진 순서를 바꿨어요' : `ROOM ${String(ri + 1).padStart(2, '0')}에 넣었어요`);
}

// 지도에서 고른 여러 장을 한꺼번에 옮긴다 (지금 걸린 차례 그대로, beforePid 앞에. 없으면 방 끝에)
function insertPhotos(pids, ri, beforePid) {
  const room = museum.rooms[ri];
  if (!room || !pids.length) return;
  const want = new Set(pids);
  if (want.has(beforePid)) return;
  pushUndo('사진 여러 장 옮기기');
  const moved = [];
  for (const r of museum.rooms) {
    const keep = [];
    for (const p of r.photos) (want.has(p.id) ? moved : keep).push(p);
    r.photos = keep;
  }
  let k = beforePid ? room.photos.findIndex(p => p.id === beforePid) : -1;
  if (k < 0) k = room.photos.length;
  room.photos.splice(k, 0, ...moved);
  for (const r of museum.rooms) if (!r.photos.length) r.photos.push(newPhoto()); // 방이 텅 비지 않게 빈 판 하나
  stats.inserts = (stats.inserts || 0) + 1;
  persist();
  rebuild();
  toast(`${moved.length}장을 ROOM ${String(ri + 1).padStart(2, '0')}로 옮겼어요`);
}

// 사진 설명 한꺼번에 쓰기 (js/captions.js)
const { openCaptions } = initCaptions({
  get museum() { return museum; }, get homeOpen() { return homeOpen; }, controls, map, pushUndo, persist, rebuild, toast,
});

// 지도의 방 아래 버튼들
function roomAction(act, ri) {
  const room = museum.rooms[ri];
  if (!room) return;
  const name = `ROOM ${String(ri + 1).padStart(2, '0')}`;
  const hung = room.photos.filter(p => p.imageId).length;
  if (act === 'fill') pickPhotos({ roomIndex: ri });
  if (act === 'rename') editRoomText(ri);
  if (act === 'captions') openCaptions(ri);
  if (act === 'style') {
    const set = k => { pushUndo(`${name} 꾸미기`); room.style = { ...PRESETS[k].style }; persist(); rebuild(); };
    const cur = presetOf(styleOf(room));
    openSheet([
      { title: true, label: `${name} 꾸미기` },
      { label: (cur === PRESETS[0] ? '✓ ' : '') + '흰 방', fn: () => set(0) },
      { label: (cur === PRESETS[1] ? '✓ ' : '') + '어두운 방', fn: () => set(1) },
      { label: '닫기', quiet: true },
    ]);
  }
  if (act === 'clear') {
    openSheet([
      { title: true, label: `${name}의 사진 ${hung}장을 모두 내릴까요?\n빈 판 4개만 남아요` },
      { label: '모두 내리기', danger: true, fn: () => clearRoom(ri) },
      { label: '취소', quiet: true },
    ]);
  }
  if (act === 'delete') {
    if (museum.rooms.length <= 1) { toast('방이 하나뿐이라 지울 수 없어요'); return; }
    openSheet([
      { title: true, label: hung ? `${name}을 지울까요?\n걸린 사진 ${hung}장도 함께 지워져요` : `${name}을 지울까요?` },
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
    if (undoStack.some(u => u.lib.includes('"' + id + '"'))) return; // 되돌릴 수 있으니 남겨 둔다 (다음에 열 때 정리)
    deleteImage(id);
    museumScene.forgetTexture(id);
  }, 0);
}
function clearRoom(ri) {
  const room = museum.rooms[ri];
  pushUndo('모두 내리기');
  forgetPhotos(room.photos);
  room.photos = newRoom(4).photos;
  persist();
  rebuild();
  toast('사진을 모두 내렸어요');
}
function deleteRoom(ri) {
  if (museum.rooms.length <= 1) return;
  pushUndo('방 지우기');
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

// 꾹 누른 곳이 사진 설명판(글씨)이면 → 그 판의 화면 위치와, 판이 화면 폭의 절반쯤 되는 확대 배율
const _lp = new THREE.Vector3();
controls.longPressTarget = (sx, sy) => {
  const [nx, ny] = controls.toNorm(sx, sy);
  ndc.set(nx * 2 - 1, -(ny * 2 - 1));
  raycaster.setFromCamera(ndc, camera);
  raycaster.far = 30;
  const hit = raycaster.intersectObjects(museumScene.pickables, true).find(h => visibleChain(h.object));
  const o = hit && hit.object;
  if (!o || !o.userData.label) return null;
  const g = o.geometry.parameters || { width: 0.4, height: 0.3 };
  o.updateMatrixWorld();
  const c = o.getWorldPosition(new THREE.Vector3()).project(camera);
  // 판의 왼쪽·오른쪽 끝이 화면에서 얼마나 떨어져 있나
  const L = _lp.set(-g.width / 2, 0, 0).applyMatrix4(o.matrixWorld).project(camera).x;
  const R = _lp.set(g.width / 2, 0, 0).applyMatrix4(o.matrixWorld).project(camera).x;
  const wN = Math.abs(R - L) / 2; // 화면 폭 대비
  const hN = wN * (g.height / g.width) * (viewW / viewH);
  const z = Math.min(0.55 / Math.max(0.01, wN), 0.8 / Math.max(0.01, hN));
  return { x: (c.x + 1) / 2, y: (1 - c.y) / 2, zoom: Math.max(2, z) };
};
controls.onTap = (sx, sy) => { tapping = true; try { onSceneTap(sx, sy); } finally { tapping = false; } };
function onSceneTap(sx, sy) {
  if (sheetOpen()) { closeSheet(); return; }
  const [cx, cy] = toContent(sx, sy);
  ndc.set(cx / viewW * 2 - 1, -(cy / viewH) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  raycaster.far = 30;
  const hits = raycaster.intersectObject(museumScene.root, true).filter(h => visibleChain(h.object));
  const hit = hits[0];
  if (!hit) return;
  const ud = hit.object.userData;
  if (ud.guestbook) { openGuestbook(); return; }
  if (!editMode) { tapToWalk(ud, hit); return; } // 관람 중: 고치지 않고 그쪽으로 걸어간다
  if (ud.wallText === 'room') { editRoomText(ud.roomIndex); return; }
  if (ud.wallText === 'exhibition') { editExhibitionText(museum); return; }
  if (ud.wallText === 'exit') { editExitText(); return; }
  if (ud.exitDoor) { askLeave(); return; }
  if (ud.floor) { walkToFloor(hit.point); return; }
  if (!ud.photoId) { walkToFloor(hit.point); return; } // 그냥 벽
  const t = { roomIndex: ud.roomIndex, photoId: ud.photoId, panel: ud.panel };
  if (ud.label) { openEditor(t); return; }
  openPanelSheet(t);
}

// 관람 중 누르기: 사진 → 그 사진 앞, 벽 글 → 글 앞, 그 밖(바닥·벽) → 그 자리
let emptyHintAt = 0;
function tapToWalk(ud, hit) {
  const go = sp => { controls.joy.x = controls.joy.y = 0; controls.walkPath(route(controls.pos.x, controls.pos.z, sp.x, sp.z), sp.yaw); controls.pitchT = -0.02; hideHint(); };
  if (ud.exitDoor) { askLeave(); return; }
  const L = museumScene.layout;
  if (ud.photoId) {
    const panel = panelFor(ud.photoId) || ud.panel;
    if (panel) go(viewingSpot(panel));
    if (ud.empty && performance.now() - emptyHintAt > 6000) { emptyHintAt = performance.now(); toast('사진을 걸려면 편집을 켜세요', 2600); }
    return;
  }
  if (ud.wallText === 'room' && L[ud.roomIndex]) { go(L[ud.roomIndex].introSpot); return; }
  if (ud.wallText === 'exhibition') { go({ x: -1.25, z: -LOBBY_L + 4.9, yaw: 0 }); return; }
  if (ud.wallText === 'exit' && L.exit) { go({ x: -0.6, z: L.exit.zStart - 2.2, yaw: 0 }); return; }
  walkToFloor(hit.point);
}

// ---------- 바닥을 톡 누르면 그리로 걸어가기 ----------
// 길은 ‹ › 와 같아서 문은 알아서 지나간다. 누른 자리에 작은 원이 잠깐 뜬다.
const tapRing = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
tapRing.rotation.x = -Math.PI / 2;
tapRing.renderOrder = 20;
scene.add(tapRing);
let tapRingT = 0;
function walkToFloor(pt) {
  const hw = ROOM_W / 2 - 0.55;
  const x = Math.max(-hw, Math.min(hw, pt.x)), z = pt.z;
  const px = controls.pos.x, pz = controls.pos.z;
  const dx = x - px, dz = z - pz;
  if (Math.hypot(dx, dz) < 0.35) return;
  controls.joy.x = controls.joy.y = 0;
  controls.walkPath(route(px, pz, x, z), Math.atan2(-dx, -dz)); // 가는 쪽을 보며 선다
  tapRing.position.set(x, 0.012, z);
  tapRingT = performance.now();
  hideHint();
}
function tapRingTick() {
  if (!tapRingT) return;
  const k = (performance.now() - tapRingT) / 900;
  if (k >= 1) { tapRing.material.opacity = 0; tapRingT = 0; return; }
  tapRing.material.opacity = 0.85 * (1 - k);
  tapRing.scale.setScalar(1 + k * 0.6);
}

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
  pushUndo('사진 돌리기');
  photo.rot = ((photo.rot || 0) + 1) % 4;
  if (!photo.rot) delete photo.rot;
  persist();
  rebuild();
}

// ---------- 아래 시트 (버튼 목록) ----------
const sheet = $('#sheet');
let sheetItems = [];
function sheetOpen() { return sheet.classList.contains('open'); }
let sheetAt = 0, tapping = false;
function openSheet(items, kind = '') {
  sheetAt = tapping ? performance.now() : 0;
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
// 홈에서 메뉴(보관·⋯ 등)가 떠 있을 때 메뉴 밖을 누르면 닫힌다 (다른 아이콘을 누르면 닫히고 그 아이콘이 바로 동작)
document.addEventListener('pointerdown', e => {
  if (homeOpen && sheetOpen() && !e.target.closest('#sheet')) closeSheet();
}, true);
function closeSheet() { sheet.classList.remove('open'); document.body.classList.remove('sheet-open'); }
sheet.addEventListener('click', e => {
  // 메뉴가 손가락 바로 밑에 뜨기 때문에, 메뉴를 띄운 그 터치가 메뉴 버튼까지 누르는 일이 있었다 → 뜬 직후의 누르기는 무시
  if (performance.now() - sheetAt < 450) return;
  const b = e.target.closest('button');
  if (!b) return;
  const it = sheetItems[+b.dataset.i];
  closeSheet();
  if (it && it.fn) it.fn();
});

// ---------- 오른쪽 아래 도구 ----------
// 오른쪽 아래: [관람] [편집]. 편집을 누르면 할 일들이 위로 차르륵 올라온다.
const editMenu = $('#edit-menu');
const editBtn = $('#tools [data-act=edit]');
// 모드는 둘뿐이고 늘 둘 중 하나다: 관람(기본) / 편집. 켜진 쪽 버튼이 하얗다.
// 관람: 사진·벽을 누르면 그쪽으로 걸어갈 뿐 고치지 않는다. 편집: 사진·벽 글을 눌러 고치고, '사진 넣기 · 방 꾸미기 · 방 만들기'가 버튼 위에 떠 있다.
let editMode = false;
const tourBtn = $('#tools [data-act=tour]');
function setEditMode(on, quiet) {
  const changed = on !== editMode;
  editMode = on;
  document.body.classList.toggle('editing', on);
  editMenu.classList.toggle('open', on);
  editBtn.classList.toggle('on', on);
  tourBtn.classList.toggle('on', !on);
  editBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  tourBtn.setAttribute('aria-pressed', on ? 'false' : 'true');
  if (!on) closeStylePanel();
  if (changed && !quiet) toast(on ? '편집 모드 · 사진이나 벽 글을 눌러 고쳐요' : '관람 모드', on ? 2800 : 1200);
}
setEditMode(false, true);
$('#tools').addEventListener('click', e => {
  const act = e.target.closest('button')?.dataset.act;
  if (!act) return;
  hideHint();
  if (act === 'tour') setEditMode(false);
  if (act === 'edit') setEditMode(true);
});
editMenu.addEventListener('click', e => {
  const act = e.target.closest('button')?.dataset.act;
  if (!act) return;
  const ri = currentRoomIndex();
  if (act === 'photos') pickPhotos({ roomIndex: ri });
  if (act === 'room') addRoom('white');
  if (act === 'captions') openCaptions(Math.max(0, ri));
  if (act === 'theme') openStylePanel(Math.max(-1, Math.min(museum.rooms.length, museumScene.roomIndexAt(controls.pos.z))));
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
  ? '<b>바닥을 톡</b> 누르면 그리로 걸어가요. 조이스틱으로 걸어도 되고, 화면을 끌어 둘러보세요.<br>꾹 누르거나 두 손가락을 벌리면 잠깐 확대돼요. 사진을 걸거나 고치려면 <b>편집</b>을 켜요.'
  : '<b>바닥을 클릭</b>하면 그리로 걸어가요. <b>W A S D</b>·방향키로도 걷고, 마우스를 끌어 둘러보세요. <b>Shift</b> 빠르게.<br><b>휠</b>이나 <b>오른쪽 버튼</b>으로 잠깐 확대. 사진을 걸거나 고치려면 <b>편집</b>을 켜요.';
let hintHidden = false;
function hideHint() {
  if (hintHidden) return;
  hintHidden = true;
  $('#hint').classList.add('hide');
  try { localStorage.setItem('pm-hint-seen', String(hintSeen + 1)); } catch (e) {}
}
// 안내 글은 처음 몇 번만, 그리고 한 번 둘러보거나 9초가 지나면 사라진다
let hintSeen = 0;
try { hintSeen = +localStorage.getItem('pm-hint-seen') || 0; } catch (e) {}
if (hintSeen >= 3) { hintHidden = true; $('#hint').classList.add('hide'); }
let hintYaw = null;
function hintTick() {
  if (hintHidden || homeOpen) return;
  if (hintYaw === null) { hintYaw = controls.yaw; setTimeout(hideHint, 9000); return; }
  if (Math.abs(controls.yaw - hintYaw) > 0.5) hideHint();
}

// ---------- 시작 ----------
async function start() {
  requestPersistence();
  // 홈 화면 앱·오프라인용 (http(s) 에서만)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !/pm\.test$/.test(location.hostname)) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  [library] = await Promise.all([loadLibrary(), loadFonts()]);
  // 예시 전시실로 새로 시작 (한 번만): 지금까지의 전시실과 사진을 지우고 예시 5개를 만든다
  if (library.demoVersion !== DEMO_VERSION) {
    try { await buildDemoLibrary(library, t => { $('#loading').textContent = t; }); }
    catch (e) { console.error(e); $('#loading').textContent = '예시 사진을 불러오지 못했어요. 새로 고침해 주세요'; return; }
  }
  if (!library.bigTest) {
    try { await addBigTestExhibition(library, t => { $('#loading').textContent = t; }); } catch (e) { console.warn('시험용 전시실을 만들지 못함', e); }
  }
  persist();
  sweepImages(library); // 지난번에 지웠던 사진 원본 정리 (아직 아무것도 바꾸기 전에)
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
  keepAwake(false);
  setEditMode(false);
  music.stop();
  controls.enabled = false;
  controls.joy.x = controls.joy.y = 0;
  controls.keys.clear();
  document.body.classList.add('home-open');
  renderHome();
  nudgeBackup();
}

// ---------- 클래식 음악 ----------
const musicBtn = $('#music-btn');
const music = new Music({ onChange: () => {
  const on = music.enabled;
  musicBtn.classList.toggle('off', !on);
  musicBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  musicBtn.setAttribute('aria-label', on ? `음악 끄기 (지금: ${music.track.title})` : '음악 켜기');
} });
music.onChange();
musicBtn.addEventListener('click', e => {
  e.stopPropagation();
  const on = music.toggle();
  toast(on ? `♪ ${music.track.title} · ${music.track.who}` : '음악을 껐어요', 2200);
});
// 다른 앱으로 가면 멈추고, 돌아오면 다시
document.addEventListener('visibilitychange', () => {
  if (document.hidden) music.stop();
  else if (museum && !homeOpen) music.start();
});

// fresh: '처음부터 보기' — 저장된 자리를 무시하고 입구에서 시작
function enterExhibition(ex, fresh = false) {
  museum = ex;
  setEditMode(false, true); // 들어갈 때는 늘 관람 모드
  keepAwake(true); exitAsked = false;
  if (!ex.showcase && simplifyStyles(ex)) persist(); // 예전 색 방은 흰 방 / 어두운 방으로
  music.start(); // 누른 순간 안에서 시작해야 휴대폰에서도 소리가 난다
  if (!ex.showcase && !ex.tutorial) { library.lastId = ex.id; persist(); }
  homeOpen = false;
  document.body.classList.remove('home-open');
  controls.enabled = true;
  controls.auto = null;
  const layout = rebuild(0, true);
  const pose = fresh ? null : loadPose(ex.id);
  const last = layout[layout.length - 1];
  if (pose && pose.z <= 0 && pose.z >= last.zEnd && Math.abs(pose.x) < 3.4) controls.setPose(pose.x, pose.z, pose.yaw);
  else { controls.setPose(0, -1.0, 0); controls.pitchT = controls.pitch = 0.04; }
  museumScene.setActiveRoom(museumScene.roomIndexAt(controls.pos.z));
  $('#ex-title').textContent = ex.title;
}

// ---------- 보관 · 백업 (js/backupui.js) ----------
const { openBackupMenu, exportExhibitions, nudgeBackup } = initBackup({
  get library() { return library; }, get homeOpen() { return homeOpen; },
  toast, persist, pushUndo, openSheet, renderHome: () => renderHome(),
});

const { renderHome, makeSwipe, exhibitionStats } = initHome({
  get library() { return library; }, get homeOpen() { return homeOpen; }, get viewW() { return viewW; },
  controls, editor, toast, persist, openSheet, sheetOpen, toContent, hasResume, enterExhibition, editExhibitionText,
  exportExhibitions, confirmDeleteExhibition, openBackupMenu, startTutorial, startShowcase,
});
makeSwipe($('#style-panel .items'));

function confirmDeleteExhibition(ex) {
  const st = exhibitionStats(ex);
  openSheet([
    { title: true, label: `'${ex.title}' 전시실을 지울까요?\n방 ${st.rooms}개와 사진 ${st.photos}장이 모두 지워져요` },
    { label: '전시실 지우기', danger: true, fn: () => {
      for (const r of ex.rooms) forgetPhotos(r.photos);
      pushUndo('전시실 지우기');
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
async function startShowcase() {
  if (buildingExample) return;
  let ex = library.exhibitions.find(e => e.showcase);
  if (!ex) {
    buildingExample = true;
    toast('방 스타일 전시실을 준비하고 있어요…', 8000);
    try { ex = await buildShowcase(); }
    catch (e) { console.error(e); toast('예시 사진을 못 불러왔어요\n인터넷 연결을 확인해 주세요', 4000); return; }
    finally { buildingExample = false; }
    library.exhibitions.unshift(ex);
    persist();
    toast('준비됐어요', 1200);
  }
  // 방 스타일 목록이 바뀌었으면 (예: 색깔 방으로 정리) 같은 사진으로 다시 짠다
  if (ex.rooms.map(r => r.style && r.style.wall).join() !== SHOWCASE.join()) {
    const seen = new Set(), pics = [];
    for (const r of ex.rooms) for (const p of r.photos) if (p.imageId && !seen.has(p.imageId)) { seen.add(p.imageId); pics.push(p); }
    if (pics.length) {
      ex.rooms = SHOWCASE.map((id, k) => {
        const room = newRoom(0, 'white');
        room.style = { wall: id };
        room.name = WALL_BY[id].label; room.intro = `${CEIL_BY[WALL_BY[id].rec.ceil].label} · ${FLOOR_BY[WALL_BY[id].rec.floor].label}.`;
        for (let n = 0; n < 4; n++) { const P = pics[(k * 2 + n) % pics.length]; room.photos.push({ ...newPhoto(P.imageId, P.aspect), caption: P.caption }); }
        return room;
      });
      ex.intro = `방 스타일 ${SHOWCASE.length}가지를 차례로 이어 붙인 전시실이에요.\n걸어 다니며 마음에 드는 방을 골라 보세요. 내 전시실에서는 오른쪽 아래 편집 → 방 꾸미기에서 벽·천장·바닥·조명을 고를 수 있어요.`;
    }
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
      toast('예시 사진을 못 불러왔어요\n인터넷 연결을 확인해 주세요', 4000);
      return;
    } finally { buildingExample = false; }
    library.exhibitions.unshift(ex);
    persist();
    toast('준비됐어요', 1200);
  }
  try { localStorage.removeItem('pm-pose-' + ex.id); } catch (e) {}
  enterExhibition(ex);
  guide.start(tutorialSteps({ isTouch, controls, museumScene, map, editor, stylePanel, gb, stats, sheetOpen, get editMode() { return editMode; } }));
}

// 가만히 보고 있을 때는 휴대폰 화면 원래 해상도(최대 3배)로 또렷하게, 움직이는 동안은 2배로 부드럽게
const DPR_MOVE = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2), DPR_STILL = Math.min(window.devicePixelRatio || 1, isTouch ? 2.5 : 3);
const sharp = { key: '', since: 0, on: false };
function sharpTick() {
  if (DPR_STILL <= DPR_MOVE) return;
  const k = `${controls.pos.x.toFixed(3)},${controls.pos.z.toFixed(3)},${controls.yaw.toFixed(4)},${controls.pitch.toFixed(4)},${controls.zoom.toFixed(3)}`;
  const now = performance.now();
  if (k !== sharp.key) { sharp.key = k; sharp.since = now; if (sharp.on) { sharp.on = false; renderer.setPixelRatio(DPR_MOVE); renderer.setSize(viewW, viewH); } return; }
  if (!sharp.on && now - sharp.since > 350) { sharp.on = true; renderer.setPixelRatio(DPR_STILL); renderer.setSize(viewW, viewH); }
}

let lastT = performance.now();
function loop(t) {
  const dt = (t - lastT) / 1000;
  lastT = t;
  if (homeOpen || !museum) { requestAnimationFrame(loop); return; } // 홈에서는 그리지 않는다
  controls.update(dt);
  if (joyZone && joyZone.classList.contains('blocked') !== controls.joyBlocked) joyZone.classList.toggle('blocked', controls.joyBlocked);
  guide.tick();
  const tip = (guide.active && editor.classList.contains('open') && guide.step.editorTip) || '';
  if (tip !== (loop.tip || '')) { loop.tip = tip; setEditorTip(tip); }
  if (Math.hypot(controls.vel.x, controls.vel.z) > 0.2) hideHint();
  hintTick();
  const ri = museumScene.roomIndexAt(controls.pos.z);
  if (ri !== currentRoom) {
    currentRoom = ri;
    wake(1500);
    museumScene.setActiveRoom(ri);
    const nm = museum.rooms[ri]?.name;
    $('#room').textContent = ri < 0 ? '입구' : ri >= museum.rooms.length ? '출구'
      : `ROOM ${String(ri + 1).padStart(2, '0')}${nm ? ' · ' + nm : ''}`;
    const L = museumScene.layout;
    const here = ri < 0 ? L.lobby : ri >= L.length ? L.exit : museum.rooms[ri];
    document.body.classList.toggle('light-room', !!(here && themeOf(here).light));
  }
  applyZoom();
  if ((loop.n = (loop.n || 0) + 1) % 8 === 0) { updateGoto(); updateNav(); }
  snapTick();
  exitDoorTick();
  if (loop.n % 20 === 0) updateHD();
  map.update();
  tapRingTick();
  sharpTick();
  // 바뀐 것이 있을 때만 다시 그린다 (가만히 사진을 보는 동안 휴대폰이 뜨거워지지 않게).
  // 사진이 뒤늦게 올라오는 것 등은 0.3초마다 한 번 그려 따라잡는다.
  const rk = `${controls.pos.x.toFixed(3)},${controls.pos.z.toFixed(3)},${controls.yaw.toFixed(4)},${controls.pitch.toFixed(4)},${controls.zoom.toFixed(3)},${controls.zoomAt.x.toFixed(3)},${controls.zoomAt.y.toFixed(3)},${sharp.on},${viewW},${viewH}`;
  if (rk !== loop.rk || t < renderUntil || tapRingT || t - loop.rt > 300) {
    loop.rk = rk; loop.rt = t;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
}
let renderUntil = 0;
function wake(ms = 1200) { renderUntil = Math.max(renderUntil, performance.now() + ms); }

resize();
start().catch(e => {
  console.error(e);
  $('#loading').textContent = '열지 못했어요: ' + e.message;
});

// 디버그/테스트용
window.__pm = { music, openCaptions, applyPreset, setEditMode, get editMode() { return editMode; }, undoStack, controls, museumScene, get museum() { return museum; }, camera, renderer, hangPhotos, addRoom, openStylePanel, applyStyle, map, guide, startTutorial, startShowcase, museumStops, route, goToRoom, reorderRooms, swapPhotos, roomAction, clearRoom, deleteRoom, get library() { return library; }, enterExhibition, openHome, editRoomText };

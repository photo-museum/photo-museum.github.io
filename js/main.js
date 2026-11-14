import * as THREE from 'three';
import { MuseumScene, themeOf, texOf } from './builder.js';
import { WALLS, WALL_GROUPS, CEILINGS, FLOORS, LIGHTS, WALL_BY, CEIL_BY, FLOOR_BY, LIGHT_BY, styleOf, recOf } from './styles.js';
import { WalkControls } from './controls.js';
import { viewingSpot, INTRO_S, INTRO_W, LOBBY_L, ROOM_W, WALL_T } from './layout.js';
import { MuseumMap, thumbURL } from './map.js';
import { Guide } from './guide.js';
import { makeBackup, readBackup, saveFile } from './backup.js';
import { EXAMPLE } from './example.js';
import { DEMO, DEMO_VERSION } from './demo.js';
import { loadFonts, ensureFont, ensureGlyphs, isFontReady, fontFamily, fontInfo, FONT_LIST, DEFAULT_FONT } from './fonts.js';
import {
  loadLibrary, saveLibrary, putImage, deleteImage, clearImages, prepareImage, requestPersistence, uid, sweepImages,
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
museumScene.camera = camera; // 미리 셰이더 만들기(warmUp)에 쓴다
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
  joystick.on('start', () => { zone.classList.add('active'); if (tour.on) stopTour('관람을 멈췄어요'); });
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
    head: `ROOM ${String(ri + 1).padStart(2, '0')} 안내벽`,
    title: { label: '방 이름', value: room.name, placeholder: '예) 바다, 아침 7시' },
    body: { label: '방 설명 (문 들어서 정면 벽에 적혀요)', value: room.intro, placeholder: '이 방에 어떤 사진들이 있는지 적어 주세요' },
    font: { value: room.font, inherit: museum.font || DEFAULT_FONT },
    onSave: (name, intro, font) => {
      pushUndo('방 이름·설명');
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
  museum.rooms.push(newRoom(4, theme));
  persist();
  rebuild();
  const n = museum.rooms.length;
  toast(`새 방(ROOM ${String(n).padStart(2, '0')})을 만들었어요. 그 방에서 ◐ 방 꾸미기로 벽·천장·바닥을 고를 수 있어요`, 3800);
}

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
  const n = museum.rooms.length;
  if (ri < 0 || ri >= n) {
    const lobby = ri < 0, key = lobby ? 'lobbyStyle' : 'exitStyle', base = museum.rooms[lobby ? 0 : n - 1];
    return {
      label: lobby ? '입구' : '출구', key, follows: !museum[key], baseName: lobby ? '첫 방' : '마지막 방',
      room: { style: museum[key] || base.style, theme: base.theme },
      set(st) { museum[key] = st; },
    };
  }
  const room = museum.rooms[ri];
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
function applyStyle(kind, id) {
  const tg = styleTarget();
  if (!tg) return;
  const st = styleOf(tg.room);
  pushUndo(`${tg.label} 꾸미기`);
  // 벽을 바꿔도 천장·바닥·조명은 그대로 (추천은 위에 보여 주기만)
  tg.set({ wall: st.wall, ceil: st.ceil, floor: st.floor, light: st.light, [kind]: id });
  persist();
  rebuild();
  styleRi = Math.max(-1, Math.min(museum.rooms.length, styleRi));
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
  delete museum[tg.key];
  persist(); rebuild(); renderStylePanel();
  toast(`${tg.label}을 ${tg.baseName}과 같게 맞췄어요`);
});
// 꾸밀 곳 옮기기: 입구 ‹ ROOM 01 … › 출구 (그곳으로 걸어가 보여 준다)
for (const b of stylePanel.querySelectorAll('.pick')) b.addEventListener('click', () => {
  const n = museum.rooms.length;
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
    cands.push({ kind: '안내벽', cx: r.introX, cz: iz, spot: { x: r.introX, z: iz + 3.4, yaw: 0 } });
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
// 관람 순서: 전시 소개 → (방마다) 안내벽 → 걷는 순서대로 사진 → … → 방명록
function museumStops() {
  const L = museumScene.layout;
  if (!L) return [];
  const out = [{ kind: '전시 소개', spot: { x: -1.25, z: -LOBBY_L + 3.0, yaw: 0 } }];
  for (const r of L) {
    const iz = r.zStart - INTRO_S;
    out.push({ kind: '안내벽', spot: { x: r.introX, z: iz + 3.4, yaw: 0 } });
    for (const p of [...r.panels].sort((a, b) => a.sAlong - b.sAlong)) {
      if (p.photo.imageId) out.push({ kind: '사진', photoId: p.photo.id, spot: viewingSpot(p) });
    }
  }
  if (L.exit) out.push({ kind: '방명록', spot: { x: 0, z: L.exit.zStart - 3.4 + 1.5, yaw: 0 } });
  return out;
}
// 지금 자리에서 목표까지: 안내벽은 옆으로 돌아가고, 방 사이는 문을 지나간다
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
  const gx = INTRO_W / 2 + (ROOM_W / 2 - INTRO_W / 2) / 2; // 안내벽 옆 통로 가운데
  for (const r of L) {
    const iz = r.zStart - INTRO_S;
    if (!cross(iz)) continue;
    const side = Math.sign(x1) || Math.sign(x0) || -1;
    const a = { x: side * gx, z: iz + 0.7 }, b = { x: side * gx, z: iz - 0.7 };
    ev.push({ z: iz, pts: fwd ? [a, b] : [b, a] });
  }
  ev.sort((a, b) => (fwd ? b.z - a.z : a.z - b.z));
  return [...ev.flatMap(e => e.pts), { x: x1, z: z1 }];
}
const navPrev = $('#nav-prev'), navNext = $('#nav-next');
let navTargets = { prev: null, next: null };
function updateNav() {
  const show = museum && !homeOpen && !tour.on && controls.enabled && !map.isOpen && !sheetOpen() && !controls.auto
    && Math.hypot(controls.vel.x, controls.vel.z) < 0.15;
  let prev = null, next = null;
  if (show) {
    const st = museumStops();
    const px = controls.pos.x, pz = controls.pos.z;
    let at = -1, best = 0.6;
    st.forEach((s, i) => { const d = Math.hypot(s.spot.x - px, s.spot.z - pz); if (d < best) { best = d; at = i; } });
    if (at >= 0) { prev = st[at - 1] || null; next = st[at + 1] || null; }
    else {
      next = st.find(s => s.spot.z < pz - 0.2) || null;
      prev = [...st].reverse().find(s => s.spot.z > pz + 0.2) || null;
    }
  }
  navTargets = { prev, next };
  navPrev.classList.toggle('show', !!prev);
  navNext.classList.toggle('show', !!next);
  if (prev) navPrev.setAttribute('aria-label', `이전 ${prev.kind}으로`);
  if (next) navNext.setAttribute('aria-label', `다음 ${next.kind}으로`);
}
function goStop(s) {
  if (!s) return;
  controls.joy.x = controls.joy.y = 0; // 조이스틱이 같이 움직이지 않게
  controls.walkPath(route(controls.pos.x, controls.pos.z, s.spot.x, s.spot.z), s.spot.yaw);
  controls.pitchT = -0.02;
  navPrev.classList.remove('show'); navNext.classList.remove('show');
  hideHint();
}
navPrev.addEventListener('click', () => goStop(navTargets.prev));
navNext.addEventListener('click', () => goStop(navTargets.next));

const gotoBtn = $('#goto');
let gotoTarget = null;
function updateGoto() {
  const moving = Math.hypot(controls.vel.x, controls.vel.z) > 0.15 || controls.auto;
  let t = null;
  if (!moving && !tour.on && controls.enabled && !map.isOpen && !sheetOpen()) {
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

controls.onTap = (sx, sy) => {
  if (performance.now() - tourSwallow < 1500) { tourSwallow = 0; return; } // 관람을 멈추려고 누른 것
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
  if (act === 'room') addRoom('white');
  if (act === 'theme') openStylePanel(Math.max(-1, Math.min(museum.rooms.length, museumScene.roomIndexAt(controls.pos.z))));
  if (act === 'tour') startTour();
});

// ---------- 관람 모드 ----------
// 사진 앞에 차례로 저절로 걸어가 잠시 멈춰 보여 준다. 화면을 만지거나 키를 누르면 멈춘다.
const DWELL = { '사진': 7000, '안내벽': 5500, '전시 소개': 6000, '방명록': 4000 };
const tour = { on: false, until: 0, last: -1 };
function startTour() {
  if (!museum || homeOpen) return;
  closeStylePanel(); closeSheet();
  if (map.isOpen) map.close();
  tour.on = true; tour.until = 0;
  document.body.classList.add('touring');
  controls.joy.x = controls.joy.y = 0;
  hideHint();
  toast('관람을 시작해요 · 화면을 누르면 멈춰요', 2600);
  tourStep(true);
}
function stopTour(msg) {
  if (!tour.on) return;
  tour.on = false;
  document.body.classList.remove('touring');
  controls.auto = null;
  if (msg) toast(msg, 2200);
}
function tourStep(first) {
  const st = museumStops();
  const px = controls.pos.x, pz = controls.pos.z;
  let at = -1, best = 0.6;
  st.forEach((s, i) => { const d = Math.hypot(s.spot.x - px, s.spot.z - pz); if (d < best) { best = d; at = i; } });
  let next = at >= 0 ? (first ? null : st[at + 1]) : st.find(s => s.spot.z < pz - 0.2);
  if (first && at >= 0) { tour.until = performance.now() + 1500; return; } // 이미 서 있는 자리부터
  if (!next) { stopTour('관람을 마쳤어요. 방명록에 한마디 남겨 보세요'); return; }
  controls.walkPath(route(px, pz, next.spot.x, next.spot.z), next.spot.yaw);
  controls.pitchT = -0.02;
  tour.kind = next.kind;
  tour.until = 0;
}
function tourTick() {
  if (!tour.on) return;
  if (homeOpen || map.isOpen || editor.classList.contains('open')) { stopTour(); return; }
  if (controls.auto) return; // 걸어가는 중
  const now = performance.now();
  if (!tour.until) { tour.until = now + (DWELL[tour.kind] || 5000); return; }
  if (now >= tour.until) tourStep(false);
}
// 사람이 직접 움직이면 관람을 멈춘다
// (멈추려고 누른 그 한 번은 판·벽 누르기로 치지 않는다)
let tourSwallow = 0;
for (const ev of ['pointerdown', 'wheel']) renderer.domElement.addEventListener(ev, () => { if (tour.on) { stopTour('관람을 멈췄어요'); tourSwallow = performance.now(); } }, { capture: true });

window.addEventListener('keydown', e => { if (tour.on && !e.metaKey && !e.ctrlKey) stopTour('관람을 멈췄어요'); }, { capture: true });
$('#tour-stop').addEventListener('click', () => stopTour('관람을 멈췄어요'));

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
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !/pm\.test$/.test(location.hostname)) navigator.serviceWorker.register('sw.js').catch(() => {});
  [library] = await Promise.all([loadLibrary(), loadFonts()]);
  // 예시 전시실로 새로 시작 (한 번만): 지금까지의 전시실과 사진을 지우고 예시 5개를 만든다
  if (library.demoVersion !== DEMO_VERSION) {
    try { await buildDemoLibrary(); }
    catch (e) { console.error(e); $('#loading').textContent = '예시 사진을 불러오지 못했어요. 새로 고침해 주세요'; return; }
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
  controls.enabled = false;
  controls.joy.x = controls.joy.y = 0;
  controls.keys.clear();
  document.body.classList.add('home-open');
  renderHome();
  nudgeBackup();
}

function enterExhibition(ex) {
  museum = ex;
  if (!ex.showcase && !ex.tutorial) { library.lastId = ex.id; persist(); }
  homeOpen = false;
  document.body.classList.remove('home-open');
  controls.enabled = true;
  controls.auto = null;
  const layout = rebuild(0, true);
  const pose = loadPose(ex.id);
  const last = layout[layout.length - 1];
  if (pose && pose.z <= 0 && pose.z >= last.zEnd && Math.abs(pose.x) < 3.4) controls.setPose(pose.x, pose.z, pose.yaw);
  else { controls.setPose(0, -1.0, 0); controls.pitchT = controls.pitch = 0.04; }
  museumScene.setActiveRoom(museumScene.roomIndexAt(controls.pos.z));
  $('#ex-title').textContent = ex.title;
}

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
makeSwipe($('#style-panel .items'));

// 홈: 아코디언 (시안 F10). 전시실마다 세로 띠, 고른 하나가 넓게 펼쳐진다.
// 접힌 띠를 누르면 펼쳐지고, 펼쳐진 띠를 누르면 들어간다.
let homeSel = null; // 가운데 있는 전시실 id ('new' 면 새 전시실 카드)
// 홈: 그레이 유리 거울 (시안 15). 전시실 표지가 가운데 크게, 양옆은 비스듬히 서고 유리 바닥에 비친다.
// 옆으로 밀거나 옆 표지를 누르면 넘어가고, 가운데 표지나 '들어가기'를 누르면 들어간다.
const flow = $('#home .flow'), fcap = $('#home .fcap');
let flowItems = [], flowPos = 0, flowAnim = 0;
function homeList() { return library.exhibitions.filter(ex => !ex.showcase); }
function renderHome() {
  const exs = homeList();
  if (!exs.some(ex => ex.id === homeSel) && homeSel !== 'new') homeSel = (exs.find(ex => ex.id === library.lastId) || exs[0] || {}).id || 'new';
  flow.innerHTML = '';
  flowItems = [...exs.map(ex => ({ ex })), { add: true }];
  flowItems.forEach((it, i) => {
    const el = document.createElement('div');
    el.className = 'cv' + (it.add ? ' add' : '');
    el.setAttribute('role', 'option');
    if (it.add) el.innerHTML = '<span>+</span>';
    else {
      const st = exhibitionStats(it.ex);
      if (st.cover) thumbURL(st.cover, 900).then(u => { if (u) el.style.backgroundImage = `url("${u}")`; });
      else { const T = themeOf(it.ex.rooms[0]); el.style.backgroundImage = `linear-gradient(160deg, ${T.mapWall}, ${T.mapFloor})`; }
      el.setAttribute('aria-label', it.ex.title || '이름 없는 전시');
    }
    it.el = el;
    flow.appendChild(el);
  });
  const idx = Math.max(0, flowItems.findIndex(it => (it.add ? 'new' : it.ex.id) === homeSel));
  flowPos = idx;
  layoutFlow(false);
}
function flowSize() {
  const H = flow.clientHeight || 260, W = flow.clientWidth || 700;
  return { S: Math.min(H * 0.78, W * 0.3, 260), W };
}
// pos: 실수 (끄는 중엔 사이 값)
function layoutFlow(animate = true) {
  const { S } = flowSize();
  const gap1 = S * 0.78, gapN = S * 0.42;
  // 유리 바닥 선을 표지 아랫단에 맞춘다
  const fl = $('#home .hbg2 .floor');
  if (fl && flow.clientHeight) fl.style.top = (flow.offsetTop + flow.clientHeight * 0.8) + 'px';
  flowItems.forEach((it, i) => {
    const d = i - flowPos, a = Math.abs(d), sg = Math.sign(d);
    const x = a < 1 ? d * gap1 : sg * (gap1 + (a - 1) * gapN);
    const rot = -Math.max(-1, Math.min(1, d)) * 55;
    const sc = a < 1 ? 1.15 - 0.15 * a : 1;
    const el = it.el;
    el.style.width = el.style.height = S + 'px';
    el.style.transition = animate ? '' : 'none';
    el.style.transform = `translateX(calc(-50% + ${x}px)) rotateY(${rot}deg) scale(${sc})`;
    el.style.zIndex = String(100 - Math.round(a * 10));
    el.style.opacity = a > 4.5 ? 0 : String(Math.max(0.35, 1 - Math.max(0, a - 1) * 0.18));
    el.classList.toggle('on', a < 0.5);
  });
  const sel = flowItems[Math.round(Math.max(0, Math.min(flowItems.length - 1, flowPos)))];
  if (sel) {
    homeSel = sel.add ? 'new' : sel.ex.id;
    if (sel.add) { fcap.querySelector('b').textContent = '새 전시실'; fcap.querySelector('span').textContent = '이름을 정하고 바로 들어가요'; fcap.querySelector('.go').textContent = '만들기 →'; fcap.querySelector('.more').hidden = true; }
    else {
      const st = exhibitionStats(sel.ex);
      fcap.querySelector('b').textContent = sel.ex.title || '이름 없는 전시';
      fcap.querySelector('b').style.fontFamily = fontFamily(sel.ex.font);
      if (sel.ex.font) ensureFont(sel.ex.font);
      fcap.querySelector('span').textContent = `방 ${st.rooms} · 사진 ${st.photos}` + ((sel.ex.intro || '').split('\n')[0] ? ' · ' + sel.ex.intro.split('\n')[0] : '');
      fcap.querySelector('.go').textContent = '들어가기 →'; fcap.querySelector('.more').hidden = false;
    }
  }
}
function flowTo(i) {
  flowPos = Math.max(0, Math.min(flowItems.length - 1, i));
  layoutFlow(true);
}
function flowOpen() {
  const sel = flowItems[Math.round(flowPos)];
  if (!sel) return;
  if (sel.add) {
    const ex = newExhibition('');
    editExhibitionText(ex, () => { library.exhibitions.push(ex); persist(); enterExhibition(ex); });
  } else enterExhibition(sel.ex);
}
function flowMenu() {
  const sel = flowItems[Math.round(flowPos)];
  if (!sel || sel.add) return;
  const ex = sel.ex, title = ex.title || '이름 없는 전시';
  openSheet([
    { title: true, label: title },
    { label: '들어가기', fn: () => enterExhibition(ex) },
    { label: '대표 사진 바꾸기', fn: () => openCoverPicker(ex) },
    { label: '이 전시실 보내기 (파일)', fn: () => exportExhibitions([ex], `${(ex.title || '전시').replace(/[\\/:*?"<>|]/g, '')}.pmbk`, false) },
    { label: '이름·설명 고치기', fn: () => editExhibitionText(ex) },
    { label: '전시실 지우기', danger: true, fn: () => confirmDeleteExhibition(ex) },
    { label: '닫기', quiet: true },
  ]);
}
fcap.querySelector('.go').addEventListener('click', flowOpen);
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
    flowPos = Math.max(-0.4, Math.min(flowItems.length - 0.6, d.pos0 - d.dx / (S * 0.6)));
    layoutFlow(false);
  });
  const end = e => {
    if (!d || e.pointerId !== d.id) return;
    const dd = d; d = null;
    if (dd.moved < 8 && e.type === 'pointerup') {
      // 누른 표지
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const i = flowItems.findIndex(it => it.el === (hit && hit.closest && hit.closest('.cv')));
      if (i < 0) return;
      if (i === Math.round(flowPos)) flowOpen(); else flowTo(i);
      return;
    }
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
    if (!homeOpen || editor.classList.contains('open') || sheetOpen()) return;
    if (e.key === 'ArrowRight') flowTo(Math.round(flowPos) + 1);
    if (e.key === 'ArrowLeft') flowTo(Math.round(flowPos) - 1);
    if (e.key === 'Enter') flowOpen();
  });
  window.addEventListener('resize', () => { if (homeOpen) requestAnimationFrame(() => layoutFlow(false)); });
  // 글씨체가 늦게 들어오거나 화면 크기가 자리 잡으면서 칸 크기가 바뀌어도 바로 다시 맞춘다
  // (전에는 처음에 크게 나왔다가 한 번 만져야 작아졌다)
  let lastFlowSize = '';
  const refit = () => {
    const k = flow.clientWidth + 'x' + flow.clientHeight;
    if (k === lastFlowSize) return;
    lastFlowSize = k;
    if (homeOpen) layoutFlow(false);
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

$('#h-tour').addEventListener('click', () => startTutorial());
$('#h-styles').addEventListener('click', () => startShowcase());
$('#h-backup').addEventListener('click', () => openBackupMenu());

// ---------- 백업 · 불러오기 · 공유 ----------
// 사진은 이 기기 브라우저 안에만 저장된다. 아이폰 Safari 는 오래 안 쓰면 지울 수도 있어서
// (1) 홈 화면 앱으로 설치하면 더 안전하고 (2) 백업 파일로 저장해 두면 언제든 되살릴 수 있다.
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ownExhibitions = () => library.exhibitions.filter(e => !e.showcase && !e.tutorial);
function dateTag() { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; }
function backupAge() {
  if (!library.lastBackup) return '아직 백업한 적이 없어요';
  const days = Math.floor((Date.now() - library.lastBackup) / 86400000);
  return days < 1 ? '오늘 백업했어요' : `마지막 백업 ${days}일 전`;
}
function openBackupMenu() {
  openSheet([
    { title: true, label: `보관 · ${backupAge()}` },
    { label: '⤓ 모든 전시실을 백업 파일로 저장', fn: () => exportExhibitions(ownExhibitions(), `PhotoMuseum-백업-${dateTag()}.pmbk`, true) },
    { label: '⤒ 백업 파일에서 불러오기', fn: () => importPick() },
    { label: isStandalone() ? '✓ 홈 화면 앱으로 쓰고 있어요' : '홈 화면에 앱으로 추가하는 법', fn: () => installHelp() },
    { label: '닫기', quiet: true },
  ]);
}
async function exportExhibitions(list, name, full) {
  if (!list.length) { toast('저장할 전시실이 없어요'); return; }
  try {
    const blob = await makeBackup(JSON.parse(JSON.stringify(list)), (i, n) => toast(`사진 묶는 중… ${i} / ${n}`, 4000));
    const r = await saveFile(blob, name);
    if (r === 'cancel') { toast('저장을 취소했어요'); return; }
    if (full) { library.lastBackup = Date.now(); persist(); }
    toast(r === 'shared' ? '파일을 보냈어요. "파일에 저장"을 고르면 아이폰에 남아요' : `백업 파일을 저장했어요 (${(blob.size / 1048576).toFixed(1)}MB)`, 4200);
  } catch (e) { console.error(e); toast('백업 파일을 만들지 못했어요: ' + e.message, 4000); }
}
const importInput = document.createElement('input');
importInput.type = 'file'; importInput.hidden = true;
document.body.appendChild(importInput);
function importPick() { importInput.value = ''; importInput.click(); }
importInput.addEventListener('change', async () => {
  const f = importInput.files && importInput.files[0];
  if (!f) return;
  try {
    const head = await readBackup(f, (i, n) => toast(`사진 넣는 중… ${i} / ${n}`, 4000));
    pushUndo('백업 불러오기');
    let added = 0, replaced = 0;
    for (const ex of head.exhibitions) {
      const i = library.exhibitions.findIndex(e => e.id === ex.id);
      if (i >= 0) { library.exhibitions[i] = ex; replaced++; } else { library.exhibitions.push(ex); added++; }
    }
    await persist();
    if (homeOpen) renderHome();
    toast(`전시실 ${added}개를 불러왔어요${replaced ? ` · ${replaced}개는 백업 내용으로 바꿨어요` : ''}`, 4000);
  } catch (e) { console.error(e); toast(e.message || '불러오지 못했어요', 4000); }
});
function installHelp() {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  openSheet([
    { title: true, label: ios
      ? 'Safari 아래쪽 공유 버튼(□↑) → "홈 화면에 추가". 홈 화면 앱은 사진을 지우지 않고 오래 보관해요. 앱은 Safari 와 저장 공간이 따로라서, 먼저 여기서 백업 파일을 저장한 뒤 앱에서 불러오세요.'
      : '브라우저 메뉴에서 "앱 설치" 또는 "홈 화면에 추가"를 고르세요. 설치한 앱은 사진을 더 오래 안전하게 보관해요.' },
    ...(deferredInstall ? [{ label: '지금 설치하기', fn: () => { deferredInstall.prompt(); deferredInstall = null; } }] : []),
    { label: '먼저 백업 파일 저장', fn: () => exportExhibitions(ownExhibitions(), `PhotoMuseum-백업-${dateTag()}.pmbk`, true) },
    { label: '닫기', quiet: true },
  ]);
}
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });
// 바꾼 것이 있는데 일주일 넘게 백업하지 않았으면 홈에서 한 번 알려 준다
let backupNudged = false;
function nudgeBackup() {
  if (backupNudged || !library.changedAt) return;
  if (library.lastBackup && library.lastBackup > library.changedAt) return;
  if (library.lastBackup && Date.now() - library.lastBackup < 7 * 86400000) return;
  backupNudged = true;
  setTimeout(() => toast('소중한 사진을 지키려면 오른쪽 위 "보관"에서 백업 파일을 저장해 두세요', 4500), 1200);
}

function confirmDeleteExhibition(ex) {
  const st = exhibitionStats(ex);
  openSheet([
    { title: true, label: `'${ex.title}' 전시실을 지울까요? 방 ${st.rooms}개와 사진 ${st.photos}장이 모두 지워져요` },
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
const SHOWCASE = ['gallery', 'warmgray', 'stone', 'charcoal', 'louvre', 'dresden', 'salon', 'navy', 'cream', 'rose', 'mustard', 'powder', 'sage', 'hanji', 'brickwall', 'fabric', 'library', 'night'];
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
  ex.intro = `방 스타일 ${SHOWCASE.length}가지를 차례로 이어 붙인 전시실이에요.\n`
    + '걸어 다니며 마음에 드는 방을 골라 보세요. 내 전시실에서는 오른쪽 아래 ◐ 방 꾸미기에서 벽·천장·바닥을 고를 수 있어요.';
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
async function buildDemoLibrary() {
  const total = DEMO.reduce((a, ex) => a + ex.rooms.reduce((b, r) => b + r.photos.length, 0), 0);
  let done = 0;
  const say = () => { $('#loading').textContent = `예시 전시실을 준비하고 있어요 · ${done} / ${total}`; };
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
      ex.intro = `방 스타일 ${SHOWCASE.length}가지를 차례로 이어 붙인 전시실이에요.\n걸어 다니며 마음에 드는 방을 골라 보세요. 내 전시실에서는 오른쪽 아래 ◐ 방 꾸미기에서 벽·천장·바닥을 고를 수 있어요.`;
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
    { title: '나만의 전시 꾸미기', text: '지도를 닫으면(✕) 오른쪽 아래에 버튼이 있어요.<br><b>+ 사진</b> 여러 장 한 번에 걸기 · <b>+ 방</b> 새 방 만들기 · <b>◐ 방 꾸미기</b> 벽·천장·바닥 고르기.' },
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
  if (joyZone && joyZone.classList.contains('blocked') !== controls.joyBlocked) joyZone.classList.toggle('blocked', controls.joyBlocked);
  guide.tick();
  const tip = (guide.active && editor.classList.contains('open') && guide.step.editorTip) || '';
  if (tip !== (loop.tip || '')) { loop.tip = tip; setEditorTip(tip); }
  if (Math.hypot(controls.vel.x, controls.vel.z) > 0.2) hideHint();
  hintTick();
  const ri = museumScene.roomIndexAt(controls.pos.z);
  if (ri !== currentRoom) {
    currentRoom = ri;
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
  tourTick();
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
window.__pm = { get tour() { return tour; }, undoStack, controls, museumScene, get museum() { return museum; }, camera, renderer, hangPhotos, addRoom, openStylePanel, applyStyle, map, guide, startTutorial, startShowcase, museumStops, route, goToRoom, reorderRooms, swapPhotos, roomAction, clearRoom, deleteRoom, get library() { return library; }, enterExhibition, openHome, editRoomText };

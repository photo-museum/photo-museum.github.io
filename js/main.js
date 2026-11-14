import * as THREE from 'three';
import { MuseumScene, THEMES } from './builder.js';
import { WalkControls } from './controls.js';
import { viewingSpot } from './layout.js';
import {
  loadMuseum, saveMuseum, putImage, deleteImage, prepareImage, requestPersistence, uid,
  newPhoto, newRoom, EMPTY_ASPECT,
} from './store.js';

const $ = s => document.querySelector(s);
const isTouch = matchMedia('(pointer: coarse)').matches;
const stage = $('#stage');

// ---------- 렌더러 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.75 : 2));
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
    color: 'rgba(235,228,215,0.9)', size: 112, restOpacity: 0.35,
  });
  joystick.on('move', (e, d) => {
    const f = Math.min(1, d.force || 0);
    const vx = d.vector.x * f, vy = d.vector.y * f; // 화면 기준, y 위쪽 +
    if (rotated) { controls.joy.x = -vy; controls.joy.y = -vx; }
    else { controls.joy.x = vx; controls.joy.y = -vy; }
    hideHint();
  });
  joystick.on('end', () => { controls.joy.x = 0; controls.joy.y = 0; });
}

// ---------- 데이터 ----------
let museum = null;
let currentRoom = -1;

function rebuild() {
  const layout = museumScene.build(museum);
  controls.colliders = museumScene.colliders;
  currentRoom = -1;
  return layout;
}

function persist() { return saveMuseum(museum); }

// 마지막 위치 기억 (이 브라우저에서만, 편의용)
function savePose() {
  try { localStorage.setItem('pm-pose', JSON.stringify({ x: controls.pos.x, z: controls.pos.z, yaw: controls.yawT })); } catch (e) {}
}
function loadPose() {
  try { return JSON.parse(localStorage.getItem('pm-pose')); } catch (e) { return null; }
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
      const { blob, aspect } = await prepareImage(files[i]);
      const imageId = uid('img_');
      const tex = await museumScene.primeTexture(imageId, blob);
      if (!tex) throw new Error('사진을 화면에 올리지 못했어요');
      await putImage(imageId, blob);
      let photo = targets.shift();
      if (!photo) { photo = newPhoto(); room.photos.push(photo); }
      const old = photo.imageId;
      photo.imageId = imageId;
      photo.aspect = aspect;
      await persist();
      if (old) { deleteImage(old); museumScene.forgetTexture(old); }
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
  persist();
  deleteImage(old); museumScene.forgetTexture(old);
  rebuild();
}

function removePanel(t) {
  const room = museum.rooms[t.roomIndex];
  const i = room.photos.findIndex(p => p.id === t.photoId);
  if (i < 0) return;
  const [photo] = room.photos.splice(i, 1);
  if (photo.imageId) { deleteImage(photo.imageId); museumScene.forgetTexture(photo.imageId); }
  persist();
  rebuild();
  toast('판을 뗐어요');
}

// ---------- 방 ----------
function addRoom(theme) {
  museum.rooms.push(newRoom(3, theme));
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

function currentRoomIndex() { return Math.max(0, museumScene.roomIndexAt(controls.pos.z)); }

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
  if (!hit || !hit.object.userData.photoId) return;
  const ud = hit.object.userData;
  const t = { roomIndex: ud.roomIndex, photoId: ud.photoId, panel: ud.panel };
  if (ud.empty) {
    openSheet([
      { label: '사진 걸기 (여러 장 가능)', fn: () => pickPhotos({ roomIndex: t.roomIndex, startPhotoId: t.photoId }) },
      { label: '판 떼기', quiet: true, fn: () => removePanel(t) },
      { label: '닫기', quiet: true },
    ]);
  } else {
    openSheet([
      { label: '앞에 가서 보기', fn: () => { const v = viewingSpot(t.panel); controls.walkTo(v.x, v.z, v.yaw); } },
      { label: '사진 바꾸기', fn: () => pickPhotos({ roomIndex: t.roomIndex, startPhotoId: t.photoId, replace: true }) },
      { label: '사진 내리기 (빈 판으로)', quiet: true, fn: () => removePhoto(t) },
      { label: '판 떼기', quiet: true, fn: () => removePanel(t) },
      { label: '닫기', quiet: true },
    ]);
  }
};

// ---------- 아래 시트 (버튼 목록) ----------
const sheet = $('#sheet');
let sheetItems = [];
function sheetOpen() { return sheet.classList.contains('open'); }
function openSheet(items) {
  sheetItems = items;
  sheet.innerHTML = '';
  items.forEach((it, i) => {
    const b = document.createElement('button');
    b.textContent = it.label;
    b.dataset.i = i;
    if (it.quiet) b.className = 'quiet';
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
      { label: '+ 어두운 방 만들기', fn: () => addRoom('dark') },
      { label: '+ 하얀 방 만들기', fn: () => addRoom('white') },
      { label: '닫기', quiet: true },
    ]);
  }
  if (act === 'theme') {
    const cur = museum.rooms[ri].theme || 'dark';
    openSheet([
      { label: `${cur === 'dark' ? '✓ ' : ''}어두운 방`, fn: () => setRoomTheme(ri, 'dark') },
      { label: `${cur === 'white' ? '✓ ' : ''}하얀 방`, fn: () => setRoomTheme(ri, 'white') },
      { label: '닫기', quiet: true },
    ]);
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
  ? '왼쪽 아래 조이스틱으로 걷고, 화면을 끌어 둘러보세요.<br>판을 누르면 사진을 걸 수 있어요.'
  : '<b>W A S D</b> 또는 방향키로 걷고, 마우스를 끌어 둘러보세요. <b>Shift</b> 빠르게.<br>판을 누르면 사진을 걸 수 있어요.';
let hintHidden = false;
function hideHint() {
  if (hintHidden) return;
  hintHidden = true;
  $('#hint').classList.add('hide');
}

// ---------- 시작 ----------
async function start() {
  requestPersistence();
  museum = await loadMuseum();
  persist();
  const layout = rebuild();
  const pose = loadPose();
  const last = layout[layout.length - 1];
  if (pose && pose.z <= 0.5 && pose.z >= last.zEnd && Math.abs(pose.x) < 3.4) controls.setPose(pose.x, pose.z, pose.yaw);
  else controls.setPose(0, -1.4, 0);
  $('#loading').classList.add('done');
  setTimeout(() => $('#loading').remove(), 1200);
  setInterval(savePose, 2000);
  window.addEventListener('pagehide', savePose);
  requestAnimationFrame(loop);
}

let lastT = performance.now();
function loop(t) {
  const dt = (t - lastT) / 1000;
  lastT = t;
  controls.update(dt);
  if (Math.hypot(controls.vel.x, controls.vel.z) > 0.2) hideHint();
  const ri = museumScene.roomIndexAt(controls.pos.z);
  if (ri !== currentRoom) {
    currentRoom = ri;
    museumScene.setActiveRoom(ri);
    $('#room').textContent = `ROOM ${String(ri + 1).padStart(2, '0')}`;
    document.body.classList.toggle('light-room', (museum.rooms[ri]?.theme) === 'white');
  }
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

resize();
start().catch(e => {
  console.error(e);
  $('#loading').textContent = '열지 못했어요: ' + e.message;
});

// 디버그/테스트용
window.__pm = { controls, museumScene, get museum() { return museum; }, camera, renderer, hangPhotos, addRoom, setRoomTheme };

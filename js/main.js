import * as THREE from 'three';
import { MuseumScene } from './builder.js';
import { WalkControls } from './controls.js';
import { viewingSpot } from './layout.js';
import {
  loadMuseum, saveMuseum, putImage, deleteImage, prepareImage, requestPersistence, uid,
} from './store.js';

const $ = s => document.querySelector(s);
const isTouch = matchMedia('(pointer: coarse)').matches;

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
const controls = new WalkControls(camera, renderer.domElement);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  const aspect = w / h;
  // 세로 화면에서도 옆이 너무 좁지 않게: 가로 시야 약 62도를 목표로, 세로 시야는 55~80도
  const hfov = 62 * Math.PI / 180;
  const vfov = 2 * Math.atan(Math.tan(hfov / 2) / aspect) * 180 / Math.PI;
  camera.fov = Math.max(55, Math.min(80, vfov));
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- 데이터 ----------
let museum = null;
let currentRoom = -1;

function rebuild() {
  const layout = museumScene.build(museum);
  controls.colliders = museumScene.colliders;
  currentRoom = -1;
  return layout;
}

function persist() { saveMuseum(museum); }

// 마지막 위치 기억 (이 브라우저에서만, 편의용)
function savePose() {
  try { localStorage.setItem('pm-pose', JSON.stringify({ x: controls.pos.x, z: controls.pos.z, yaw: controls.yawT })); } catch (e) {}
}
function loadPose() {
  try { return JSON.parse(localStorage.getItem('pm-pose')); } catch (e) { return null; }
}

// ---------- 사진 넣기 ----------
const fileInput = $('#file');
let pickTarget = null;      // { roomIndex, photoId }

function choosePhotoFor(target) {
  pickTarget = target;
  fileInput.value = '';
  fileInput.click();
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files && fileInput.files[0];
  const target = pickTarget;
  pickTarget = null;
  if (!file || !target) return;
  toast('사진을 거는 중…', 4000);
  try {
    const { blob, aspect } = await prepareImage(file);
    const imageId = uid('img_');
    await putImage(imageId, blob);
    const room = museum.rooms[target.roomIndex];
    const photo = room && room.photos.find(p => p.id === target.photoId);
    if (!photo) return;
    const old = photo.imageId;
    photo.imageId = imageId;
    photo.aspect = aspect;
    await saveMuseum(museum);
    if (old) { deleteImage(old); museumScene.forgetTexture(old); }
    rebuild();
    toast('걸었어요');
  } catch (e) {
    console.error(e);
    toast('사진을 넣지 못했어요: ' + e.message, 4000);
  }
});

function removePhoto(target) {
  const photo = museum.rooms[target.roomIndex].photos.find(p => p.id === target.photoId);
  if (!photo || !photo.imageId) return;
  const old = photo.imageId;
  photo.imageId = null;
  photo.aspect = 1.2 / 1.6;
  persist();
  deleteImage(old); museumScene.forgetTexture(old);
  rebuild();
}

// ---------- 탭 → 판 고르기 ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function visibleChain(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

controls.onTap = (cx, cy) => {
  if (sheetOpen()) { closeSheet(); return; }
  ndc.set(cx / window.innerWidth * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  raycaster.far = 30;
  const hits = raycaster.intersectObject(museumScene.root, true).filter(h => visibleChain(h.object));
  const hit = hits[0];
  if (!hit || !hit.object.userData.photoId) return;
  const ud = hit.object.userData;
  const target = { roomIndex: ud.roomIndex, photoId: ud.photoId, panel: ud.panel };
  if (ud.empty) choosePhotoFor(target);
  else openSheet(target);
};

// ---------- 아래 시트 ----------
const sheet = $('#sheet');
let sheetTarget = null;
function sheetOpen() { return sheet.classList.contains('open'); }
function openSheet(target) {
  sheetTarget = target;
  sheet.classList.add('open');
  controls.enabled = true;
}
function closeSheet() { sheet.classList.remove('open'); sheetTarget = null; }
sheet.addEventListener('click', e => {
  const act = e.target.closest('button')?.dataset.act;
  if (!act) return;
  const t = sheetTarget;
  closeSheet();
  if (!t) return;
  if (act === 'view') { const v = viewingSpot(t.panel); controls.walkTo(v.x, v.z, v.yaw); }
  if (act === 'replace') choosePhotoFor(t);
  if (act === 'remove') removePhoto(t);
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
  ? '왼쪽 아래 조이스틱으로 걷고, 화면을 끌어 둘러보세요.<br>빈 판을 누르면 사진을 걸 수 있어요.'
  : '<b>W A S D</b> 또는 방향키로 걷고, 마우스를 끌어 둘러보세요. <b>Shift</b> 빠르게.<br>빈 판을 누르면 사진을 걸 수 있어요.';
let hintHidden = false;
function hideHint() {
  if (hintHidden) return;
  hintHidden = true;
  $('#hint').classList.add('hide');
}

// ---------- 조이스틱 (휴대폰) ----------
if (isTouch && window.nipplejs) {
  const zone = $('#joy');
  zone.style.display = 'block';
  const joy = window.nipplejs.create({
    zone, mode: 'static', position: { left: '50%', top: '50%' },
    color: 'rgba(235,228,215,0.9)', size: 112, restOpacity: 0.35,
  });
  joy.on('move', (e, d) => {
    const f = Math.min(1, d.force || 0);
    controls.joy.x = d.vector.x * f;
    controls.joy.y = -d.vector.y * f;
    hideHint();
  });
  joy.on('end', () => { controls.joy.x = 0; controls.joy.y = 0; });
}

// ---------- 시작 ----------
async function start() {
  requestPersistence();
  museum = await loadMuseum();
  // 처음이면 저장해 둔다
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
  }
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

start().catch(e => {
  console.error(e);
  $('#loading').textContent = '열지 못했어요: ' + e.message;
});

// 디버그/테스트용
window.__pm = { controls, museumScene, get museum() { return museum; }, camera, renderer };

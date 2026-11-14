// 전시 데이터(방 목록, 방마다 사진 목록)와 IndexedDB 저장.
// 서버 없이 이 기기에만 저장된다.
//
// museum = {
//   version: 1,
//   rooms: [
//     { id, photos: [ { id, imageId: string|null, aspect: number } ] }
//   ]
// }
// imageId 가 가리키는 사진 원본(축소본)은 'images' 저장소에 Blob 으로 따로 둔다.

const DB_NAME = 'photo-museum';
const DB_VERSION = 1;
const STATE_KEY = 'museum';

export const EMPTY_ASPECT = 1.2 / 1.6; // 빈 판: 세로로 긴 판 (가로/세로)

export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function newPhoto(imageId = null, aspect = EMPTY_ASPECT) {
  return { id: uid('p_'), imageId, aspect };
}

export function newRoom(photoCount = 3) {
  return { id: uid('r_'), photos: Array.from({ length: photoCount }, () => newPhoto()) };
}

export function defaultMuseum() {
  return { version: 1, rooms: [newRoom(3)] };
}

let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB 없음'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const r = fn(s);
    if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export async function loadMuseum() {
  try {
    const m = await tx('kv', 'readonly', s => s.get(STATE_KEY));
    if (m && Array.isArray(m.rooms) && m.rooms.length) return m;
  } catch (e) {
    console.warn('불러오기 실패, 새 전시로 시작', e);
  }
  return defaultMuseum();
}

export function saveMuseum(museum) {
  // 구조화 복제로 저장 (Blob 은 따로)
  return tx('kv', 'readwrite', s => s.put(JSON.parse(JSON.stringify(museum)), STATE_KEY))
    .catch(e => console.warn('저장 실패', e));
}

// 아이폰 Safari 는 IndexedDB 에 넣은 Blob 을 다시 꺼내 이미지로 열 때 실패하는 버그가 있다.
// 그래서 Blob 대신 바이트(ArrayBuffer)로 저장하고, 꺼낼 때 새 Blob 을 만든다.
export async function putImage(id, blob) {
  const buf = await blob.arrayBuffer();
  return tx('images', 'readwrite', s => s.put({ buf, type: blob.type || 'image/jpeg' }, id));
}

export async function getImage(id) {
  const rec = await tx('images', 'readonly', s => s.get(id));
  if (!rec) return null;
  if (rec.buf) return new Blob([rec.buf], { type: rec.type || 'image/jpeg' });
  if (rec instanceof Blob) {
    // 예전 방식으로 저장된 사진
    try { return new Blob([await rec.arrayBuffer()], { type: rec.type || 'image/jpeg' }); }
    catch (e) { return rec; }
  }
  return null;
}

export function deleteImage(id) {
  return tx('images', 'readwrite', s => s.delete(id)).catch(() => {});
}

// 브라우저가 저장소를 임의로 지우지 않도록 요청 (지원하는 곳에서만)
export function requestPersistence() {
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
}

// 사진 파일 → 적당한 크기로 줄인 JPEG Blob + 비율
// 휴대폰 GPU 메모리를 생각해 긴 변 2048px 로 제한.
export async function prepareImage(file, maxSide = 2048) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('이 형식의 사진은 열 수 없어요 (JPEG/PNG로 시도해 주세요)'));
      im.src = url;
    });
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, w, h);
    let blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.9));
    if (!blob) {
      // toBlob 이 실패하는 기기 대비
      const data = c.toDataURL('image/jpeg', 0.9);
      blob = await (await fetch(data)).blob();
    }
    c.width = c.height = 1; // 아이폰 캔버스 메모리 바로 반납
    return { blob, aspect: w / h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

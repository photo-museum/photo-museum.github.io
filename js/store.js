// 전시 데이터와 IndexedDB 저장. 서버 없이 이 기기에만 저장된다.
//
// library = {
//   version: 2,
//   exhibitions: [                              // 전시실 여러 개
//     { id, title, intro, created,
//       rooms: [                                // 전시실 안에서 문으로 이어진 방들
//         { id, theme, name?, intro?,
//           photos: [ { id, imageId: string|null, aspect, rot?, caption? } ] }
//       ] }
//   ]
// }
// imageId 가 가리키는 사진(축소본)은 'images' 저장소에 바이트로 따로 둔다.

const DB_NAME = 'photo-museum';
const DB_VERSION = 1;
const OLD_KEY = 'museum';     // version 1: 전시실 하나
const LIB_KEY = 'library';

export const EMPTY_ASPECT = 1.2 / 1.6; // 빈 판: 세로로 긴 판 (가로/세로)

export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function newPhoto(imageId = null, aspect = EMPTY_ASPECT) {
  return { id: uid('p_'), imageId, aspect };
}

export function newRoom(photoCount = 4, theme = 'dark') {
  return { id: uid('r_'), theme, photos: Array.from({ length: photoCount }, () => newPhoto()) };
}

export function newExhibition(title = '새 전시') {
  return { id: uid('x_'), title, intro: '', created: Date.now(), rooms: [newRoom(4)] };
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

export async function loadLibrary() {
  try {
    const lib = await tx('kv', 'readonly', s => s.get(LIB_KEY));
    if (lib && Array.isArray(lib.exhibitions)) return lib;
    // 예전 방식(전시실 하나)은 첫 전시실로 옮긴다
    const old = await tx('kv', 'readonly', s => s.get(OLD_KEY));
    if (old && Array.isArray(old.rooms) && old.rooms.length) {
      const ex = newExhibition('나의 첫 전시');
      ex.rooms = old.rooms;
      return { version: 2, exhibitions: [ex] };
    }
  } catch (e) {
    console.warn('불러오기 실패, 새로 시작', e);
  }
  return { version: 2, exhibitions: [newExhibition('나의 첫 전시')] };
}

export function saveLibrary(lib) {
  return tx('kv', 'readwrite', s => s.put(JSON.parse(JSON.stringify(lib)), LIB_KEY))
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
  tx('images', 'readwrite', s => s.delete(id + HD)).catch(() => {});
  return tx('images', 'readwrite', s => s.delete(id)).catch(() => {});
}

// 선명한 원본 (사진 앞에 섰을 때만 쓴다). 없으면 null.
export const HD = '@hd';
export function getImageHD(id) { return getImage(id + HD).catch(() => null); }

// 브라우저가 저장소를 임의로 지우지 않도록 요청 (지원하는 곳에서만)
export function requestPersistence() {
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
}

// 사진 파일 → 적당한 크기로 줄인 JPEG Blob + 비율
// 평소에는 긴 변 2048px (휴대폰 GPU 메모리), 사진 앞에 섰을 때 쓸 선명한 판은 긴 변 3072px 까지 따로.
export async function prepareImage(file, maxSide = 2048, hdSide = 3072) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('이 형식의 사진은 열 수 없어요 (JPEG/PNG로 시도해 주세요)'));
      im.src = url;
    });
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    const encode = async (side, q) => {
      const scale = Math.min(1, side / Math.max(w0, h0));
      const w = Math.max(1, Math.round(w0 * scale));
      const h = Math.max(1, Math.round(h0 * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, w, h);
      let blob = await new Promise(res => c.toBlob(res, 'image/jpeg', q));
      if (!blob) {
        // toBlob 이 실패하는 기기 대비
        const data = c.toDataURL('image/jpeg', q);
        blob = await (await fetch(data)).blob();
      }
      c.width = c.height = 1; // 아이폰 캔버스 메모리 바로 반납
      return blob;
    };
    const blob = await encode(maxSide, 0.92);
    const hd = Math.max(w0, h0) > maxSide * 1.15 ? await encode(hdSide, 0.92) : null;
    return { blob, hd, aspect: w0 / h0 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

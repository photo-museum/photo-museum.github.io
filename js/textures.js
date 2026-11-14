// 이미지 파일 없이 캔버스로 그리는 재질 무늬들
import * as THREE from 'three';

function hash(ix, iy, seed) {
  let h = ix * 374761393 + iy * 668265263 + seed * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

// 이어 붙여도 이음새 없는 값 노이즈
function tileNoise(x, y, px, py, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const m = (a, p) => ((a % p) + p) % p;
  const a = hash(m(ix, px), m(iy, py), seed);
  const b = hash(m(ix + 1, px), m(iy, py), seed);
  const c = hash(m(ix, px), m(iy + 1, py), seed);
  const d = hash(m(ix + 1, px), m(iy + 1, py), seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x, y, px, py, seed, oct = 5) {
  let v = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    v += amp * tileNoise(x * f, y * f, px * f, py * f, seed + o * 17);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return v / norm;
}

function canvasTex(canvas, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// 콘크리트 / 미장 벽. 회색 얼룩 + 세로로 흘러내린 자국
export function concreteTexture(size = 512, seed = 1, streak = true, base = 0.5, contrast = 1) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const P = 6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size * P, v = y / size * P;
      let n = fbm(u, v, P, P, seed, 5);
      if (streak) n = n * 0.7 + 0.3 * fbm(u * 3, v * 0.35, P * 3, Math.max(1, Math.round(P * 0.35)), seed + 99, 3);
      const blot = fbm(u * 0.5, v * 0.5, P / 2, P / 2, seed + 5, 3);
      const grain = hash(x, y, seed + 7);
      let l = base + ((n - 0.5) * 0.2 + (blot - 0.5) * 0.12 + (grain - 0.5) * 0.05) * contrast;
      l = Math.max(0, Math.min(1, l));
      const i = (y * size + x) * 4;
      const val = l * 255;
      img.data[i] = val; img.data[i + 1] = val; img.data[i + 2] = val * 0.98; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return canvasTex(c);
}

// 짙은 나무 살 천장. 가로줄(u 방향)로 길게 이어지는 가는 나무 띠들
export function woodSlatsTexture(w = 256, h = 1024, seed = 3) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  // 세로(v) 방향으로 띠를 쌓는다. 띠 하나는 h 픽셀 중 일부.
  const bands = [];
  let y = 0, k = 0;
  while (y < h) {
    const bh = 10 + Math.floor(hash(k, 1, seed) * 16);
    bands.push({ y0: y, y1: Math.min(h, y + bh), tone: hash(k, 2, seed), k });
    y += bh; k++;
  }
  for (const b of bands) {
    for (let yy = b.y0; yy < b.y1; yy++) {
      const edge = Math.min(yy - b.y0, b.y1 - 1 - yy);
      const gap = edge < 1 ? 0.25 : edge < 2 ? 0.7 : 1;
      for (let x = 0; x < w; x++) {
        const grain = fbm(x / w * 4, (yy / h) * 64 + b.k * 3.1, 4, 64, seed + b.k, 3);
        const fine = hash(x, yy, seed);
        // 나무 판 끝 이음새 (가끔)
        const seamX = Math.floor(hash(b.k, 9, seed) * w);
        const seam = Math.abs(x - seamX) < 1 && hash(b.k, 11, seed) > 0.5 ? 0.45 : 1;
        const base = 0.45 + b.tone * 0.55;
        const l = base * (0.75 + grain * 0.4 + (fine - 0.5) * 0.08) * gap * seam;
        const i = (yy * w + x) * 4;
        img.data[i] = Math.min(255, 108 * l);
        img.data[i + 1] = Math.min(255, 82 * l);
        img.data[i + 2] = Math.min(255, 64 * l);
        img.data[i + 3] = 255;
      }
    }
  }
  g.putImageData(img, 0, 0);
  return canvasTex(c);
}

// 빈 판: 흰 석고처럼 오돌토돌 (레퍼런스 가운데 흰 작품 느낌)
export function plasterTexture(size = 512, seed = 11) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size * 8, v = y / size * 8;
      const n = fbm(u, v, 8, 8, seed, 5);
      const ridge = 1 - Math.abs(fbm(u * 2, v * 2, 16, 16, seed + 3, 3) - 0.5) * 2;
      let l = 0.86 + (n - 0.5) * 0.18 + (ridge - 0.5) * 0.08 + (hash(x, y, seed) - 0.5) * 0.03;
      l = Math.max(0, Math.min(1, l));
      const i = (y * size + x) * 4;
      img.data[i] = 244 * l; img.data[i + 1] = 236 * l; img.data[i + 2] = 222 * l; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return canvasTex(c);
}

// 판 아래로 지는 옅은 그림자 (알파만)
export function shadowTexture() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,1)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.6)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  // 가장자리는 더 부드럽게 보이도록 가로세로로 늘려 쓰면 된다
  return canvasTex(c, { srgb: false, repeat: false });
}

// 밝은 원목 마루. 판이 v(방 길이) 방향으로 길게 놓인다. 한 장 = 가로 2m x 세로 4m 를 덮는다고 보고 그림
export function oakFloorTexture(w = 512, h = 1024, seed = 51) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const PLANKS = 14;                 // 2m / 14 ≈ 14cm 폭
  const pw = w / PLANKS;
  for (let x = 0; x < w; x++) {
    const k = Math.floor(x / pw);
    const inX = x - k * pw;
    const gapX = inX < 1 ? 0.8 : 1;
    // 판마다 끝 이음새 위치를 엇갈리게 (한 판 길이 = 한 장 높이의 절반~전체)
    const off = hash(k, 3, seed) * h;
    for (let y = 0; y < h; y++) {
      const yy = (y + off) % h;
      const seg = Math.floor(yy / (h / 2));
      const inY = yy - seg * (h / 2);
      const gapY = inY < 1.5 ? 0.82 : 1;
      const tone = hash(k * 7 + seg, 5, seed);
      const grain = fbm(inX / pw * 1.5 + k * 3.3, yy / h * 6, 64, 6, seed + k, 3);
      const streak = fbm(inX / pw * 9 + k, yy / h * 1.2, 64, 2, seed + 200 + k, 2);
      const l = (0.93 + tone * 0.09) * (0.9 + grain * 0.1 + (streak - 0.5) * 0.07) * gapX * gapY;
      const i = (y * w + x) * 4;
      img.data[i] = Math.min(255, 212 * l);
      img.data[i + 1] = Math.min(255, 170 * l);
      img.data[i + 2] = Math.min(255, 120 * l);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return canvasTex(c);
}

// 빛나는 격자 유리 천장. 한 장 = 격자 한 칸
export function lightGridTexture(size = 256) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.75);
  grd.addColorStop(0, '#fbfcfc');
  grd.addColorStop(1, '#e4e8e9');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  // 테두리 살 (반쪽씩 → 이어 붙이면 한 줄)
  g.fillStyle = '#9c9b95';
  const t = 3;
  g.fillRect(0, 0, size, t); g.fillRect(0, size - t, size, t);
  g.fillRect(0, 0, t, size); g.fillRect(size - t, 0, t, size);
  g.fillStyle = 'rgba(120,118,112,0.35)';
  g.fillRect(0, t, size, 2); g.fillRect(0, size - t - 2, size, 2);
  g.fillRect(t, 0, 2, size); g.fillRect(size - t - 2, 0, 2, size);
  return canvasTex(c);
}

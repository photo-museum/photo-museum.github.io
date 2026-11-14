// 배치(layout) → three.js 장면. 방마다 그룹 하나 + 바닥 반사용 거울 그룹.
import * as THREE from 'three';
import {
  ROOM_W, ROOM_H, WALL_T, DOOR_W, DOOR_H, PANEL_D, PANEL_GAP, layoutMuseum,
  INTRO_S, INTRO_W, INTRO_H, INTRO_D,
} from './layout.js';
import { fontsFor } from './fonts.js';
import {
  concreteTexture, woodSlatsTexture, plasterTexture, oakFloorTexture, lightGridTexture,
  herringboneTexture, parquetTexture, marbleTexture, terracottaTexture, louverTexture,
} from './textures.js';
import { surfaceMaterial, photoMaterial } from './materials.js';
import { getImage, getImageHD } from './store.js';

const SPOT_COLOR = 0xffe9cf;   // 따뜻한 할로겐 빛
const TRACK_INSET = 1.5;       // 조명 레일: 벽에서 안쪽으로

// 방 테마. 방마다 room.theme 으로 고른다.
// light: 밝은 방(글씨·화면 요소를 어둡게). mapFloor/mapWall: 지도 색. desc: 고르는 창 설명.
// ceilSpec: 구석 그림자(ao)를 그리는 방의 천장 { map, tile, tint, amb }
const CEIL_GRID = { map: 'grid', tile: [1.2, 1.2], tint: 0xffffff, amb: 0.94 };
const CEIL_PLASTER = { map: 'wallWhite', tile: [3, 3], tint: 0xf6f3ee, amb: 0.82 };
const CEIL_LOUVER = { map: 'louver', tile: [0.6, 0.6], tint: 0xffffff, amb: 1.0 };
export const THEMES = {
  dark: {
    label: '어두운 방', desc: '콘크리트 벽, 사진마다 스포트라이트', light: false, mapFloor: '#2b2927', mapWall: '#8d8780',
    wallMap: 'wall', wallTint: 0x707274, wallAmb: 0.27, wallLm: 3.0, endAmb: 0.19, endLm: 2.2,
    floorMap: 'floor', floorTint: 0x6a6866, floorAmb: 0.2, floorLm: 2.4, reflect: 0.26,
    ceil: 'ceilingDark', jambTint: 0x6a6662, jambAmb: 0.2, edges: 'edgesDark',
    spots: true,
  },
  white: {
    label: '하얀 방', desc: '흰 벽, 원목 마루, 빛나는 격자 천장', light: true, mapFloor: '#d8cfc1', mapWall: '#f4efe6',
    wallMap: 'wallWhite', wallTint: 0xe9e3d9, wallAmb: 0.5, wallLm: 0.95, endAmb: 0.48, endLm: 0.8,
    floorMap: 'oak', floorTint: 0xf2e6d6, floorAmb: 0.5, floorLm: 0.9, reflect: 0.13, floorTile: [2.0, 4.0],
    ceil: 'ceilingGrid', ceilSpec: CEIL_GRID, jambTint: 0xd8d2c8, jambAmb: 0.42, edges: 'edgesWhite',
    wash: true, ao: true, skyGlow: true,
  },
  cove: {
    label: '빛줄기 방', desc: '천장 가장자리로 빛 한 줄이 흐르는 고요한 방', light: false, mapFloor: '#232224', mapWall: '#777679',
    wallMap: 'wall', wallTint: 0x606164, wallAmb: 0.2, wallLm: 2.7, endAmb: 0.16, endLm: 1.9,
    floorMap: 'floor', floorTint: 0x504d4b, floorAmb: 0.16, floorLm: 2.2, reflect: 0.32,
    ceil: 'ceilingCove', jambTint: 0x5a5856, jambAmb: 0.18, edges: 'edgesDark',
    spots: true, rails: false, cove: true,
  },
  water: {
    label: '물 위의 유리관', desc: '밤, 아래에서 비추는 따뜻한 빛, 물처럼 비치는 바닥', light: false, mapFloor: '#141821', mapWall: '#a08f7a',
    wallMap: 'wall', wallTint: 0x8c8172, wallAmb: 0.15, wallLm: 2.5, endAmb: 0.13, endLm: 1.8,
    floorMap: 'floor', floorTint: 0x22232a, floorAmb: 0.1, floorLm: 1.0, reflect: 0.62,
    ceil: 'ceilingNight', jambTint: 0x6a6158, jambAmb: 0.16, edges: 'edgesDark',
    spots: true, rails: false, uplight: true,
  },
  salon: {
    label: '버건디 살롱', desc: '짙은 와인색 벽, 밝은 원목 바닥, 금빛 테두리', light: false, mapFloor: '#b89a74', mapWall: '#7a2e30',
    wallMap: 'wallWhite', wallTint: 0x7c2c30, wallAmb: 0.55, wallLm: 1.4, endAmb: 0.5, endLm: 1.1,
    floorMap: 'oak', floorTint: 0xe9d3b5, floorAmb: 0.42, floorLm: 0.9, reflect: 0.14, floorTile: [2.0, 4.0],
    ceil: 'ceilingWhite', ceilSpec: CEIL_PLASTER, jambTint: 0x5c2224, jambAmb: 0.5, edges: 'edgesGold',
    wash: true, ao: true, introBg: '#5a2024',
  },
  conservatory: {
    label: '유리 온실', desc: '유리 천장 아래 햇빛, 테라코타 타일', light: true, mapFloor: '#c07a58', mapWall: '#f3efe6',
    wallMap: 'wallWhite', wallTint: 0xf2eee5, wallAmb: 0.62, wallLm: 0.8, endAmb: 0.58, endLm: 0.7,
    floorMap: 'terracotta', floorTint: 0xffffff, floorAmb: 0.56, floorLm: 0.7, reflect: 0.1, floorTile: [1.6, 1.6],
    ceil: 'ceilingGrid', ceilSpec: { ...CEIL_GRID, amb: 1.0 }, jambTint: 0xe0dad0, jambAmb: 0.5, edges: 'edgesWhite',
    wash: true, ao: true, skyGlow: true,
  },
  oakgallery: {
    label: '원목 갤러리', desc: '따뜻한 흰 벽, 지그재그 원목 마루', light: true, mapFloor: '#b9875a', mapWall: '#f1ebe1',
    wallMap: 'wallWhite', wallTint: 0xf0e9de, wallAmb: 0.52, wallLm: 1.1, endAmb: 0.5, endLm: 0.9,
    floorMap: 'herringbone', floorTint: 0xffffff, floorAmb: 0.5, floorLm: 1.0, reflect: 0.12, floorTile: [1.6, 1.6],
    ceil: 'ceilingWhite', ceilSpec: CEIL_PLASTER, jambTint: 0xdcd4c8, jambAmb: 0.45, edges: 'edgesWhite',
    wash: true, ao: true,
  },
  blue: {
    label: '푸른 응접실', desc: '깊은 파란 벽, 체크 쪽마루, 금빛 테두리', light: false, mapFloor: '#9a6a44', mapWall: '#34557f',
    wallMap: 'wallWhite', wallTint: 0x35567f, wallAmb: 0.58, wallLm: 1.3, endAmb: 0.54, endLm: 1.0,
    floorMap: 'parquet', floorTint: 0xffffff, floorAmb: 0.45, floorLm: 0.9, reflect: 0.12, floorTile: [1.4, 1.4],
    ceil: 'ceilingWhite', ceilSpec: CEIL_PLASTER, jambTint: 0x2a4566, jambAmb: 0.5, edges: 'edgesGold',
    wash: true, ao: true, introBg: '#26405f',
  },
  hall: {
    label: '천창 회랑', desc: '아이보리 벽, 대리석 바닥, 유리 천장', light: true, mapFloor: '#ece7de', mapWall: '#eee4d2',
    wallMap: 'wallWhite', wallTint: 0xeee3d0, wallAmb: 0.6, wallLm: 0.8, endAmb: 0.56, endLm: 0.7,
    floorMap: 'marble', floorTint: 0xffffff, floorAmb: 0.6, floorLm: 0.7, reflect: 0.22, floorTile: [2.4, 2.4],
    ceil: 'ceilingGrid', ceilSpec: CEIL_GRID, jambTint: 0xdcd2c0, jambAmb: 0.5, edges: 'edgesWhite',
    wash: true, ao: true, skyGlow: true,
  },
  cube: {
    label: '화이트 큐브', desc: '하얀 루버 천장 사이로 고른 빛, 연회색 바닥', light: true, mapFloor: '#d9d8d4', mapWall: '#f6f6f4',
    wallMap: 'wallWhite', wallTint: 0xf4f4f2, wallAmb: 0.62, wallLm: 0.7, endAmb: 0.58, endLm: 0.6,
    floorMap: 'floorWhite', floorTint: 0xdad9d5, floorAmb: 0.55, floorLm: 0.6, reflect: 0.1, floorTile: [3.2, 3.2],
    ceil: 'ceilingLouver', ceilSpec: CEIL_LOUVER, jambTint: 0xe6e6e3, jambAmb: 0.5, edges: 'edgesWhite',
    wash: true, ao: true, skyGlow: true,
  },
  fold: {
    label: '사진 갤러리', desc: '하얗고 밝은 방, 검은 얇은 테두리 (흑백 사진에 잘 어울림)', light: true, mapFloor: '#efeeeb', mapWall: '#fbfbfa',
    wallMap: 'wallWhite', wallTint: 0xf8f8f7, wallAmb: 0.6, wallLm: 0.7, endAmb: 0.56, endLm: 0.6,
    floorMap: 'floorWhite', floorTint: 0xf0efec, floorAmb: 0.58, floorLm: 0.6, reflect: 0.08, floorTile: [3.2, 3.2],
    ceil: 'ceilingLouver', ceilSpec: { ...CEIL_LOUVER, tile: [1.4, 1.4] }, jambTint: 0xebebea, jambAmb: 0.5, edges: 'edgesBlack',
    wash: true, ao: true, skyGlow: true,
  },
  lounge: {
    label: '사진 라운지', desc: '흰 벽, 짙은 원목 마루, 검은 테두리, 따뜻한 빛', light: true, mapFloor: '#8a6444', mapWall: '#f2efea',
    wallMap: 'wallWhite', wallTint: 0xf1ede6, wallAmb: 0.48, wallLm: 1.2, endAmb: 0.46, endLm: 1.0,
    floorMap: 'oak', floorTint: 0xb98d63, floorAmb: 0.42, floorLm: 1.0, reflect: 0.14, floorTile: [2.0, 4.0],
    ceil: 'ceilingWhite', ceilSpec: CEIL_PLASTER, jambTint: 0xd8d2c8, jambAmb: 0.42, edges: 'edgesBlack',
    wash: true, ao: true,
  },
};
export const THEME_ORDER = ['dark', 'white', 'cove', 'water', 'salon', 'conservatory', 'oakgallery', 'blue', 'hall', 'cube', 'fold', 'lounge'];
export function themeOf(room) { return THEMES[room && room.theme] || THEMES.dark; }

// ---------- 공용 자원 (한 번만 만든다) ----------
let shared = null;
function getShared(maxAniso) {
  if (shared) return shared;
  const wall = concreteTexture(512, 1, true);
  const floor = concreteTexture(512, 21, false);
  const wood = woodSlatsTexture();
  const plaster = plasterTexture();
  const wallWhite = concreteTexture(512, 31, false, 0.93, 0.22);
  const floorWhite = concreteTexture(512, 41, false, 0.8, 0.55);
  const oak = oakFloorTexture();
  const grid = lightGridTexture();
  const herringbone = herringboneTexture(), parquet = parquetTexture(), marble = marbleTexture();
  const terracotta = terracottaTexture(), louver = louverTexture();
  for (const t of [wall, floor, wood, plaster, wallWhite, floorWhite, oak, grid, herringbone, parquet, marble, terracotta, louver]) t.anisotropy = Math.min(8, maxAniso);
  const black = new THREE.DataTexture(new Uint8Array([0, 255, 0, 255]), 1, 1);
  black.needsUpdate = true;
  shared = {
    wall, floor, wood, plaster, black, wallWhite, floorWhite, oak, grid, herringbone, parquet, marble, terracotta, louver,
    edgesGold: {
      top: new THREE.MeshBasicMaterial({ color: 0xe0bd72 }),
      side: new THREE.MeshBasicMaterial({ color: 0xa8833e }),
      bottom: new THREE.MeshBasicMaterial({ color: 0x3a2c18 }),
    },
    edgesBlack: {
      top: new THREE.MeshBasicMaterial({ color: 0x2c2c2c }),
      side: new THREE.MeshBasicMaterial({ color: 0x161616 }),
      bottom: new THREE.MeshBasicMaterial({ color: 0x080808 }),
    },
    ceilingCove: surfaceMaterial({ map: plaster, tile: [3, 3], tint: 0x3c3c3f, lightMap: black, ambient: 0.4, lmIntensity: 0 }),
    ceilingNight: surfaceMaterial({ map: plaster, tile: [3, 3], tint: 0x1e2436, lightMap: black, ambient: 0.4, lmIntensity: 0 }),
    ceilingLouver: surfaceMaterial({ map: louver, tile: [0.6, 0.6], tint: 0xffffff, lightMap: black, ambient: 1.0, lmIntensity: 0 }),
    edgesDark: {
      top: new THREE.MeshBasicMaterial({ color: 0x8c8274 }),
      side: new THREE.MeshBasicMaterial({ color: 0x3e3933 }),
      bottom: new THREE.MeshBasicMaterial({ color: 0x100e0c }),
    },
    edgesWhite: {
      top: new THREE.MeshBasicMaterial({ color: 0xe6e1d8 }),
      side: new THREE.MeshBasicMaterial({ color: 0xa8a39a }),
      bottom: new THREE.MeshBasicMaterial({ color: 0x6e6a64 }),
    },
    fixtureMat: new THREE.MeshBasicMaterial({ color: 0x141414 }),
    fixtureGeo: new THREE.CylinderGeometry(0.055, 0.065, 0.2, 14),
    stemGeo: new THREE.BoxGeometry(0.02, 0.12, 0.02),
    // 빛나는 천장: 1.2m 격자, 스스로 밝다
    ceilingGrid: surfaceMaterial({ map: grid, tile: [1.2, 1.2], tint: 0xffffff, lightMap: black, ambient: 1.05, lmIntensity: 0 }),
    benchTop: new THREE.MeshBasicMaterial({ color: 0xd8b07c }),
    benchSide: new THREE.MeshBasicMaterial({ color: 0xbb8f5d }),
    benchEnd: new THREE.MeshBasicMaterial({ color: 0xa57b4d }),
    benchBottom: new THREE.MeshBasicMaterial({ color: 0x3a3128 }),
    ceilingWhite: surfaceMaterial({ map: wallWhite, tile: [3.0, 3.0], tint: 0xffffff, lightMap: black, ambient: 0.8, lmIntensity: 0 }),
    ceilingDark: surfaceMaterial({ map: wood, tile: [1.0, 3.2], tint: 0x8c8274, lightMap: black, ambient: 0.3, lmIntensity: 0 }),
  };
  return shared;
}

// uv 를 미터 단위로 바꾼 평면
function meterPlane(w, h) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  return g;
}

// 문 구멍이 있는 끝벽 (uv = 미터, x 0..W)
// doorU: 벽 모양 안에서 문 가운데 위치 (0 ~ ROOM_W)
function endWallGeometry(withDoor, doorU = ROOM_W / 2) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(ROOM_W, 0); s.lineTo(ROOM_W, ROOM_H); s.lineTo(0, ROOM_H); s.lineTo(0, 0);
  if (withDoor) {
    const x0 = doorU - DOOR_W / 2;
    // 문은 바닥까지 뚫려 있어야 하므로 바깥 모양 자체를 문 모양으로 파낸다
    const s2 = new THREE.Shape();
    s2.moveTo(0, 0); s2.lineTo(x0, 0); s2.lineTo(x0, DOOR_H); s2.lineTo(x0 + DOOR_W, DOOR_H);
    s2.lineTo(x0 + DOOR_W, 0); s2.lineTo(ROOM_W, 0); s2.lineTo(ROOM_W, ROOM_H); s2.lineTo(0, ROOM_H); s2.lineTo(0, 0);
    return new THREE.ShapeGeometry(s2);
  }
  return new THREE.ShapeGeometry(s);
}

function lightCanvas(wMeters, hMeters, ppmMax = 56) {
  const ppm = Math.min(ppmMax, 4096 / wMeters, 4096 / hMeters);
  const c = document.createElement('canvas');
  c.width = Math.max(4, Math.round(wMeters * ppm));
  c.height = Math.max(4, Math.round(hMeters * ppm));
  const g = c.getContext('2d');
  // R = 스포트라이트 빛, G = 주변광이 닿는 정도(그림자면 낮아짐)
  g.fillStyle = 'rgb(0,255,0)';
  g.fillRect(0, 0, c.width, c.height);
  return { c, g, ppm };
}

function lightTex(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// 타원형 빛 웅덩이 하나 (덧칠)
function glow(g, cx, cy, rx, ry, stops) {
  g.save();
  g.translate(cx, cy);
  g.scale(rx, ry);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [o, v] of stops) grd.addColorStop(o, `rgba(255,0,0,${v})`);
  g.fillStyle = grd;
  g.globalCompositeOperation = 'lighter';
  g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill();
  g.restore();
}

// 벽에 떨어지는 스포트라이트 + 판 아래 옅은 그림자를 빛 무늬에 그린다
// u: 벽 가로 위치(m), y: 높이(m)
function paintWallSpot(L, u, p, spots = true) {
  const { g, ppm, c } = L;
  const X = u * ppm, Y = c.height - p.y * ppm;
  const hw = p.w / 2, hh = p.h / 2;
  if (!spots) {
    // 고른 빛: 판 바로 아래로 아주 옅고 넓게 퍼진 그림자만
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowBlur = 0.14 * ppm;
    g.shadowOffsetY = 0.05 * ppm;
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(X - hw * ppm, Y - hh * ppm, p.w * ppm, p.h * ppm);
    g.restore();
    return;
  }
  // 넓고 옅은 번짐
  glow(g, X, Y - 0.35 * ppm, (hw + 1.25) * ppm, (hh + 1.55) * ppm,
    [[0, 0.62], [0.45, 0.42], [0.8, 0.12], [1, 0]]);
  // 사진 둘레 밝은 원
  glow(g, X, Y - 0.12 * ppm, (hw + 0.55) * ppm, (hh + 0.6) * ppm,
    [[0, 0.62], [0.55, 0.55], [0.85, 0.2], [1, 0]]);
  // 그림자: 판이 벽에서 떠 있어 아래쪽으로 살짝 밀린 부드러운 어둠
  g.save();
  g.globalCompositeOperation = 'source-over';
  g.shadowColor = 'rgba(0,0,0,0.75)';
  g.shadowBlur = 0.09 * ppm;
  g.shadowOffsetY = 0.07 * ppm;
  g.fillStyle = 'rgba(0,0,0,0.75)';
  g.fillRect(X - hw * ppm, Y - hh * ppm, p.w * ppm, p.h * ppm);
  g.restore();
}

// ---------- 설명판: 사진 옆 벽에 붙는 작은 글씨 ----------
const LABEL_W = 0.4;           // m
const LABEL_PX = 1150;         // 1m 당 픽셀 (작을수록 글씨가 커짐)
const LABEL_SS = 2.4;          // 실제로는 이만큼 더 촘촘하게 그린다 (선명하게)
let MAX_ANISO = 8;             // 기기가 허락하는 만큼 (MuseumScene 에서 정함)
function wrapLines(g, text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of para) {
      if (g.measureText(line + ch).width > maxW && line) {
        // 한글은 글자 단위, 영어는 가능하면 띄어쓰기에서 자르기
        const sp = line.lastIndexOf(' ');
        if (sp > line.length * 0.5 && /[A-Za-z0-9]/.test(ch)) { out.push(line.slice(0, sp)); line = line.slice(sp + 1) + ch; }
        else { out.push(line); line = ch === ' ' ? '' : ch; }
      } else line += ch;
    }
    out.push(line);
  }
  return out;
}
function makeLabel(text, light, FONTS) {
  const W = Math.round(LABEL_W * LABEL_PX);
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const titleF = FONTS.strong(30), bodyF = FONTS.text(24);
  const lines = text.trim().split('\n');
  g.font = titleF;
  const title = wrapLines(g, lines[0], W).slice(0, 3);
  g.font = bodyF;
  const body = lines.length > 1 ? wrapLines(g, lines.slice(1).join('\n'), W).slice(0, 14) : [];
  const H = Math.round(title.length * 40 + (body.length ? 14 + body.length * 34 : 0) + 8);
  const S = LABEL_SS;               // 글씨를 더 촘촘하게 그려 선명하게
  c.width = Math.round(W * S); c.height = Math.round(H * S);
  g.scale(S, S);
  const ink = light ? 'rgba(38,36,33,0.92)' : 'rgba(226,219,206,0.9)';
  const sub = light ? 'rgba(70,67,62,0.85)' : 'rgba(200,193,181,0.78)';
  g.textBaseline = 'top';
  let y = 2;
  g.font = titleF; g.fillStyle = ink;
  for (const l of title) { g.fillText(l, 0, y); y += 40; }
  y += 14;
  g.font = bodyF; g.fillStyle = sub;
  for (const l of body) { g.fillText(l, 0, y); y += 34; }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = MAX_ANISO;
  const h = H / LABEL_PX;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(LABEL_W, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  mesh.userData.h = h;
  return mesh;
}

// ---------- 벽에 적힌 글: 전시 소개(로비), 방 안내벽 ----------
// lines: [{ text, font, color, lh(줄 높이 px), gap(위 여백 px), max(최대 줄), track(자간 px) }]
function drawTextBlock(g, x, y, maxW, lines) {
  for (const L of lines) {
    if (!L || !L.text) continue;
    y += L.gap || 0;
    g.font = L.font;
    g.fillStyle = L.color;
    if ('letterSpacing' in g) g.letterSpacing = (L.track || 0) + 'px';
    const rows = wrapLines(g, L.text, maxW).slice(0, L.max || 99);
    for (const r of rows) { g.fillText(r, x, y); y += L.lh; }
    if ('letterSpacing' in g) g.letterSpacing = '0px';
  }
  return y;
}

// 로비 정면 벽의 전시 소개 (투명 바탕, 벽 위에 붙임)
const LOBBY_TEXT = { w: 3.9, h: 2.9, x: -1.25, y: 1.75 };
function makeLobbyText(museum, FONTS) {
  const ppm = 300;
  const c = document.createElement('canvas');
  const S = 1.7; // 글씨를 더 촘촘하게 그려 선명하게
  const CW = Math.round(LOBBY_TEXT.w * ppm), CH = Math.round(LOBBY_TEXT.h * ppm);
  c.width = Math.round(CW * S); c.height = Math.round(CH * S);
  const g = c.getContext('2d');
  g.scale(S, S);
  g.textBaseline = 'top';
  const ink = 'rgba(238,231,219,0.95)', sub = 'rgba(214,206,193,0.8)', faint = 'rgba(214,206,193,0.42)';
  const title = (museum.title || '').trim() || '이름 없는 전시';
  const intro = (museum.intro || '').trim();
  let y = drawTextBlock(g, 0, 40, CW, [
    { text: 'photo-museum', font: FONTS.mark(42), color: sub, lh: 60, track: 3 },
    { text: title, font: FONTS.title(112), color: ink, lh: 140, gap: 26, max: 2 },
  ]);
  g.fillStyle = 'rgba(255,217,160,0.65)';
  g.fillRect(0, y + 30, 120, 3);
  y += 66;
  drawTextBlock(g, 0, y, CW * 0.92, intro
    ? [{ text: intro, font: FONTS.text(40), color: sub, lh: 70, max: Math.floor((CH - y - 90) / 70) }]
    : [{ text: '벽을 눌러 이 전시에 대한 설명을 적어 주세요.', font: FONTS.text(38), color: faint, lh: 64 }]);
  drawTextBlock(g, 0, CH - 60, CW, [
    { text: 'ROOM 01 →', font: FONTS.mark(34), color: faint, lh: 50, track: 6 },
  ]);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = MAX_ANISO;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(LOBBY_TEXT.w, LOBBY_TEXT.h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
  );
}

// 방 안내벽 앞면: 벽 색 바탕 + 위에서 비추는 빛 + 글
function introCanvas(room, light, FONTS, bg) {
  const ppm = 400;
  const c = document.createElement('canvas');
  const S = 1.6; // 글씨를 더 촘촘하게 그려 선명하게
  const CW = Math.round(INTRO_W * ppm), CH = Math.round(INTRO_H * ppm);
  c.width = Math.round(CW * S); c.height = Math.round(CH * S);
  const g = c.getContext('2d');
  g.scale(S, S);
  g.fillStyle = bg || (light ? '#d6cfc3' : '#232220');
  g.fillRect(0, 0, CW, CH);
  const grd = g.createRadialGradient(CW / 2, -CH * 0.15, 0, CW / 2, -CH * 0.15, CH * 1.25);
  grd.addColorStop(0, light ? 'rgba(255,246,230,0.5)' : 'rgba(255,226,180,0.22)');
  grd.addColorStop(1, 'rgba(255,226,180,0)');
  g.fillStyle = grd; g.fillRect(0, 0, CW, CH);
  const sh = g.createLinearGradient(0, CH * 0.8, 0, CH);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, light ? 'rgba(60,45,30,0.16)' : 'rgba(0,0,0,0.35)');
  g.fillStyle = sh; g.fillRect(0, 0, CW, CH);
  g.textBaseline = 'top';
  const ink = light ? 'rgba(36,33,30,0.94)' : 'rgba(236,229,217,0.94)';
  const sub = light ? 'rgba(62,58,52,0.85)' : 'rgba(208,200,187,0.82)';
  const faint = light ? 'rgba(62,58,52,0.42)' : 'rgba(208,200,187,0.4)';
  const pad = 0.26 * ppm, W = CW - pad * 2;
  const no = `ROOM ${String(room.index + 1).padStart(2, '0')}`;
  const lines = [{ text: no, font: FONTS.mark(36), color: sub, lh: 56, track: 10 }];
  if (room.name) lines.push({ text: room.name, font: FONTS.title(92), color: ink, lh: 118, gap: 18, max: 2 });
  let y = drawTextBlock(g, pad, pad + 10, W, lines);
  if (room.intro) {
    g.fillStyle = light ? 'rgba(150,110,60,0.55)' : 'rgba(255,217,160,0.6)';
    g.fillRect(pad, y + 26, 90, 3);
    y += 58;
    drawTextBlock(g, pad, y, W, [{ text: room.intro, font: FONTS.text(40), color: sub, lh: 68, max: Math.floor((CH - y - pad) / 68) }]);
  } else if (!room.name) {
    drawTextBlock(g, pad, y + 26, W, [{ text: '벽을 눌러 이 방의 이름과 설명을 적어 주세요.', font: FONTS.text(38), color: faint, lh: 62 }]);
  }
  return c;
}

// 빛줄기 방: 천장 가장자리 빛이 벽 위쪽을 따라 번진다
function paintCove(L) {
  const { g, c, ppm } = L;
  const y0 = 0.32 * ppm;
  const grd = g.createLinearGradient(0, y0 - 0.15 * ppm, 0, y0 + 1.4 * ppm);
  grd.addColorStop(0, 'rgba(255,0,0,0.25)');
  grd.addColorStop(0.12, 'rgba(255,0,0,0.85)');
  grd.addColorStop(0.45, 'rgba(255,0,0,0.3)');
  grd.addColorStop(1, 'rgba(255,0,0,0)');
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = grd;
  g.fillRect(0, 0, c.width, y0 + 1.4 * ppm);
  g.restore();
}
// 물 위의 유리관: 벽 아래에서 위로 쏘는 따뜻한 빛 (1.6m 마다)
function paintUplights(L, Lr) {
  const { g, c, ppm } = L;
  for (let u = 0.8; u < Lr; u += 1.6) {
    glow(g, u * ppm, c.height, 0.42 * ppm, 2.6 * ppm, [[0, 0.75], [0.4, 0.35], [1, 0]]);
  }
}

// 위 천장에서 내려오는 빛: 벽 위쪽이 조금 더 밝다
function paintSkyGlow(L) {
  const { g, c } = L;
  const grd = g.createLinearGradient(0, 0, 0, c.height);
  grd.addColorStop(0, 'rgba(255,0,0,0.85)');
  grd.addColorStop(0.55, 'rgba(255,0,0,0.35)');
  grd.addColorStop(1, 'rgba(255,0,0,0.12)');
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);
  g.restore();
}

// 가장자리(구석·이음새) 어둡게: G 채널(주변광)을 낮춘다. edges = { l|r|t|b: [폭 m, 세기] }
function paintEdgeAO(L, edges) {
  const { g, ppm, c } = L;
  const W = c.width, H = c.height;
  const band = (x0, y0, x1, y1, a) => {
    const grd = g.createLinearGradient(x0, y0, x1, y1);
    grd.addColorStop(0, `rgba(0,0,0,${a})`);
    grd.addColorStop(0.45, `rgba(0,0,0,${a * 0.35})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    return grd;
  };
  g.save();
  for (const [k, [w, a]] of Object.entries(edges)) {
    const d = w * ppm;
    if (k === 'l') { g.fillStyle = band(0, 0, d, 0, a); g.fillRect(0, 0, d, H); }
    if (k === 'r') { g.fillStyle = band(W, 0, W - d, 0, a); g.fillRect(W - d, 0, d, H); }
    if (k === 't') { g.fillStyle = band(0, 0, 0, d, a); g.fillRect(0, 0, W, d); }
    if (k === 'b') { g.fillStyle = band(0, H, 0, H - d, a); g.fillRect(0, H - d, W, d); }
  }
  g.restore();
}

const BENCH = { w: 0.55, h: 0.44, l: 2.4 };
// 방 길이에 맞춰 벤치 위치 (방 시작에서 거리 s). 문 앞은 비운다.
function benchSpots(Lr) {
  const n = Math.max(1, Math.floor((Lr - 4) / 9));
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: 0, s: Lr * (i + 1) / (n + 1) });
  return out;
}
// 바닥 빛 무늬 G 채널에 벤치 그림자
function paintFloorShadow(L, b) {
  const { g, ppm, c } = L;
  const X = (b.x + ROOM_W / 2) * ppm, Y = c.height - b.s * ppm;
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.7)';
  g.shadowBlur = 0.18 * ppm;
  g.fillStyle = 'rgba(0,0,0,0.7)';
  g.fillRect(X - (BENCH.w / 2 + 0.04) * ppm, Y - (BENCH.l / 2 + 0.04) * ppm, (BENCH.w + 0.08) * ppm, (BENCH.l + 0.08) * ppm);
  g.restore();
}

// ---------- 출구 방: 인사 글, 출구 문, 방명록 ----------
const EXIT_DOOR = { x: 2.35, w: 1.1, h: 2.3 };
const GB_DESK = { w: 1.2, h: 0.95, d: 0.6, s: 3.4 }; // s: 방 시작에서 거리

function makeExitText(museum, FONTS) {
  const ppm = 300, S = 1.7, CW = Math.round(3.6 * ppm), CH = Math.round(1.5 * ppm);
  const c = document.createElement('canvas');
  c.width = Math.round(CW * S); c.height = Math.round(CH * S);
  const g = c.getContext('2d');
  g.scale(S, S);
  g.textBaseline = 'top';
  g.textAlign = 'center';
  const ink = 'rgba(238,231,219,0.95)', sub = 'rgba(214,206,193,0.75)';
  const line = (t, font, color, y) => { g.font = font; g.fillStyle = color; g.fillText(t, CW / 2, y); };
  line('관람해 주셔서 고맙습니다', FONTS.title(96), ink, 40);
  line((museum.title || '').trim(), FONTS.text(44), sub, 190);
  g.fillStyle = 'rgba(255,217,160,0.65)'; g.fillRect(CW / 2 - 50, 270, 100, 3);
  line('앞의 방명록에 한마디 남겨 주세요', FONTS.text(38), sub, 300);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = MAX_ANISO;
  return new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.5),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
}

// 방명록에 남긴 글: 왼쪽 벽에 색색의 쪽지로 붙인다 (최근 12장)
const NOTE_COLORS = ['#f6e7c8', '#f3d3d0', '#d6e6d2', '#d5e1ef', '#efe2f2', '#fff1a8'];
function makeGuestNotes(entries, FONTS) {
  const W = 5.2, H = 2.0, ppm = 260, S = 1.5;
  const CW = Math.round(W * ppm), CH = Math.round(H * ppm);
  const c = document.createElement('canvas');
  c.width = Math.round(CW * S); c.height = Math.round(CH * S);
  const g = c.getContext('2d');
  g.scale(S, S);
  const list = entries.slice(-12).reverse();
  if (!list.length) list.push({ name: '', text: '첫 방명록을 남겨 주세요 ✦', color: 0, placeholder: true });
  const cols = 6, cw = CW / cols, rh = CH / 2;
  list.forEach((e, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = col * cw + cw / 2, y = row * rh + rh / 2;
    let seed = 0; for (const ch of (e.id || String(i))) seed = (seed * 31 + ch.charCodeAt(0)) % 997;
    g.save();
    g.translate(x, y);
    g.rotate(((seed % 9) - 4) * 0.012);
    const w = cw * 0.8, h = rh * 0.8;
    g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 14; g.shadowOffsetY = 6;
    g.fillStyle = e.placeholder ? 'rgba(246,231,200,0.5)' : NOTE_COLORS[(e.color || 0) % NOTE_COLORS.length];
    g.fillRect(-w / 2, -h / 2, w, h);
    g.shadowColor = 'transparent';
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-w * 0.18, -h / 2 - 8, w * 0.36, 16); // 마스킹 테이프
    g.fillStyle = 'rgba(40,34,28,0.9)';
    g.textBaseline = 'top';
    g.font = FONTS.text(19);
    const lines = wrapLines(g, e.text || '', w - 28).slice(0, 6);
    lines.forEach((l, k) => g.fillText(l, -w / 2 + 14, -h / 2 + 18 + k * 26));
    if (e.name) { g.font = FONTS.strong(17); g.fillStyle = 'rgba(40,34,28,0.7)'; g.textAlign = 'right'; g.fillText('— ' + e.name, w / 2 - 12, h / 2 - 28); g.textAlign = 'left'; }
    g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = MAX_ANISO;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  return m;
}

export class MuseumScene {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.rooms = [];          // { layout, group, mirror, disposables }
    this.colliders = [];      // [x1, z1, x2, z2]
    this.pickables = [];
    this.textureCache = new Map(); // imageId -> Promise<Texture>
    this.root = new THREE.Group();
    this.mirrorRoot = new THREE.Group();
    this.mirrorRoot.scale.y = -1;   // 바닥 아래로 뒤집힌 세계 = 바닥 반사
    scene.add(this.mirrorRoot, this.root);
    this.res = getShared(renderer.capabilities.getMaxAnisotropy());
    MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
    this.fronts = new Map();  // photoId -> { front 재질, photo } (선명한 판 바꿔 끼우기용)
    this.hd = null;           // { photoId, tex }
  }

  build(museum) {
    this.clear();
    const layout = layoutMuseum(museum);
    this.layout = layout;
    this.museum = museum;
    this.buildRoom(layout.lobby);
    for (const room of layout) this.buildRoom(room);
    this.buildRoom(layout.exit);
    return layout;
  }

  clear() {
    for (const r of this.rooms) {
      this.root.remove(r.group);
      this.mirrorRoot.remove(r.mirror);
      for (const d of r.disposables) d.dispose();
    }
    this.rooms = [];
    this.colliders = [];
    this.pickables = [];
    this.fronts = new Map();
    this.setHD(null);
  }

  buildExit(room, group, both, keep) {
    const { zStart, zEnd } = room;
    const F = fontsFor(room.font);
    // 인사 글
    const t = makeExitText(this.museum, F);
    keep(t.geometry, t.material, t.material.map);
    t.position.set(-0.6, 2.75, zEnd + 0.004);
    group.add(t);
    // 출구 문 (누르면 홈으로)
    const doorMat = keep(new THREE.MeshBasicMaterial({ color: 0x0b0a09 }));
    const frameMat = keep(new THREE.MeshBasicMaterial({ color: 0x3a3632 }));
    const frame = new THREE.Mesh(keep(new THREE.BoxGeometry(EXIT_DOOR.w + 0.12, EXIT_DOOR.h + 0.06, 0.04)), frameMat);
    frame.position.set(EXIT_DOOR.x, (EXIT_DOOR.h + 0.06) / 2, zEnd + 0.02);
    const door = new THREE.Mesh(keep(new THREE.PlaneGeometry(EXIT_DOOR.w, EXIT_DOOR.h)), doorMat);
    door.position.set(EXIT_DOOR.x, EXIT_DOOR.h / 2, zEnd + 0.045);
    door.userData = { exitDoor: true };
    both(frame); both(door);
    this.pickables.push(door);
    // 초록 출구 표시등
    const sc = document.createElement('canvas'); sc.width = 512; sc.height = 192;
    const sg = sc.getContext('2d');
    sg.fillStyle = '#1f9d55'; sg.fillRect(0, 0, 512, 192);
    sg.fillStyle = '#eafff1'; sg.font = '700 96px -apple-system, "Apple SD Gothic Neo", sans-serif';
    sg.textAlign = 'center'; sg.textBaseline = 'middle'; sg.fillText('출구 EXIT', 256, 100);
    const stex = keep(new THREE.CanvasTexture(sc)); stex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.62, 0.23)), keep(new THREE.MeshBasicMaterial({ map: stex, toneMapped: false })));
    sign.position.set(EXIT_DOOR.x, EXIT_DOOR.h + 0.32, zEnd + 0.03);
    sign.userData = { exitDoor: true };
    both(sign);
    this.pickables.push(sign);
    // 방명록 책상과 펼친 책
    const dz = zStart - GB_DESK.s;
    const wood = keep(new THREE.MeshBasicMaterial({ color: 0x3b2d23 }));
    const woodTop = keep(new THREE.MeshBasicMaterial({ color: 0x5a4434 }));
    const desk = new THREE.Mesh(keep(new THREE.BoxGeometry(GB_DESK.w, GB_DESK.h, GB_DESK.d)), [wood, wood, woodTop, wood, wood, wood]);
    desk.position.set(0, GB_DESK.h / 2, dz);
    desk.userData = { guestbook: true };
    both(desk);
    this.pickables.push(desk);
    const bc = document.createElement('canvas'); bc.width = 1024; bc.height = 640;
    const bg = bc.getContext('2d');
    bg.fillStyle = '#f4ecdd'; bg.fillRect(0, 0, 1024, 640);
    bg.fillStyle = 'rgba(0,0,0,0.12)'; bg.fillRect(506, 0, 12, 640);
    bg.strokeStyle = 'rgba(120,100,80,0.25)'; bg.lineWidth = 3;
    for (let y = 150; y < 600; y += 56) { bg.beginPath(); bg.moveTo(50, y); bg.lineTo(470, y); bg.moveTo(554, y); bg.lineTo(974, y); bg.stroke(); }
    bg.fillStyle = 'rgba(60,48,36,0.85)'; bg.font = F.title(64); bg.textAlign = 'center'; bg.fillText('방명록', 260, 100);
    bg.font = F.text(36); bg.fillText('Guest Book', 764, 100);
    const btex = keep(new THREE.CanvasTexture(bc)); btex.colorSpace = THREE.SRGBColorSpace; btex.anisotropy = MAX_ANISO;
    const book = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.62, 0.39)), keep(new THREE.MeshBasicMaterial({ map: btex, toneMapped: false })));
    book.rotation.x = -Math.PI / 2 + 0.35;
    book.position.set(0, GB_DESK.h + 0.05, dz + 0.02);
    book.userData = { guestbook: true };
    both(book);
    this.pickables.push(book);
    const x0 = -GB_DESK.w / 2, x1 = GB_DESK.w / 2, z0 = dz - GB_DESK.d / 2, z1 = dz + GB_DESK.d / 2;
    this.colliders.push([x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]);
    // 방명록 쪽지 (왼쪽 벽)
    const notes = makeGuestNotes(this.museum.guestbook || [], F);
    keep(notes.geometry, notes.material, notes.material.map);
    notes.rotation.y = Math.PI / 2;
    notes.position.set(-ROOM_W / 2 + 0.01, 1.75, (zStart + zEnd) / 2);
    notes.userData = { guestbook: true };
    group.add(notes);
    this.pickables.push(notes);
  }

  // 사진 앞에 섰을 때 그 사진 하나만 선명한 원본(긴 변 3072px)으로 바꿔 끼운다. null 이면 되돌린다.
  setHD(photoId) {
    if ((this.hd && this.hd.photoId) === photoId) return;
    const prev = this.hd;
    this.hd = null;
    if (prev) {
      const f = this.fronts.get(prev.photoId);
      if (f && prev.base) f.front.uniforms.map.value = prev.base;
      if (prev.tex) prev.tex.then(t => t && t.dispose());
    }
    if (!photoId) return;
    const f = this.fronts.get(photoId);
    if (!f || !f.photo.imageId) return;
    const job = { photoId, base: f.front.uniforms.map.value };
    job.tex = getImageHD(f.photo.imageId).then(b => (b ? this.textureFromBlob(b) : null)).catch(() => null);
    job.tex.then(t => {
      if (!t || this.hd !== job) return;
      const cur = this.fronts.get(photoId);
      if (cur && cur.front === f.front) { job.base = f.front.uniforms.map.value; f.front.uniforms.map.value = t; }
    });
    this.hd = job;
  }

  buildRoom(room) {
    const R = this.res;
    const T = themeOf(room);
    const { length: Lr, zStart, zEnd } = room;
    const zMid = (zStart + zEnd) / 2;
    const group = new THREE.Group();
    const mirror = new THREE.Group();
    const disposables = [];
    const keep = (...xs) => { disposables.push(...xs); return xs[0]; };
    const both = (mesh, inMirror = true) => {
      group.add(mesh);
      if (inMirror) mirror.add(mesh.clone());
    };

    // ----- 빛 무늬 캔버스 -----
    const lmL = lightCanvas(Lr, ROOM_H);
    const lmR = lightCanvas(Lr, ROOM_H);
    const lmF = lightCanvas(ROOM_W, Lr, 24);
    if (T.skyGlow) { paintSkyGlow(lmL); paintSkyGlow(lmR); }
    if (T.cove) { paintCove(lmL); paintCove(lmR); }
    if (T.uplight) { paintUplights(lmL, Lr); paintUplights(lmR, Lr); }
    const benches = T.benches ? benchSpots(Lr) : [];
    for (const b of benches) paintFloorShadow(lmF, b);
    for (const p of room.panels) {
      const s = p.sAlong;
      const lit = T.spots || T.wash;
      if (p.wall === 'L') paintWallSpot(lmL, s, p, lit);    // 왼벽: u = 방 시작부터 거리
      else paintWallSpot(lmR, Lr - s, p, lit);              // 오른벽: u 가 반대 방향
      if (!T.spots) continue;
      // 바닥: 벽 밑에 밝게 번진 띠
      const { g, ppm, c } = lmF;
      const fx = (p.wall === 'L' ? 0.0 : ROOM_W) * ppm;
      const fy = c.height - s * ppm;
      glow(g, fx, fy, 1.9 * ppm, (p.w / 2 + 1.4) * ppm, [[0, 0.62], [0.5, 0.32], [1, 0]]);
      glow(g, fx, fy, 0.6 * ppm, (p.w / 2 + 0.7) * ppm, [[0, 0.5], [1, 0]]);
    }
    if (T.ao) {
      // 천장 빛이 방 가운데 바닥에 가장 많이 떨어진다
      glow(lmF.g, ROOM_W / 2 * lmF.ppm, lmF.c.height / 2, ROOM_W * 0.62 * lmF.ppm, (Lr / 2 + 1) * lmF.ppm,
        [[0, 0.75], [0.6, 0.5], [1, 0.1]]);
      // 구석과 이음새는 어둡게
      const wallAO = { b: [0.55, 0.42], t: [0.45, 0.3], l: [0.9, 0.38], r: [0.9, 0.38] };
      paintEdgeAO(lmL, wallAO); paintEdgeAO(lmR, wallAO);
      paintEdgeAO(lmF, { l: [0.8, 0.45], r: [0.8, 0.45], t: [0.7, 0.3], b: [0.7, 0.3] });
    }
    const texL = keep(lightTex(lmL.c)), texR = keep(lightTex(lmR.c)), texF = keep(lightTex(lmF.c));

    // ----- 바닥 (반투명: 아래 거울 세계가 은은히 비친다) -----
    const floorGeo = keep(meterPlane(ROOM_W, Lr));
    const floorMat = keep(surfaceMaterial({
      map: R[T.floorMap], tile: T.floorTile || [3.2, 3.2], tint: T.floorTint, lightMap: texF, lmSize: [ROOM_W, Lr],
      ambient: T.floorAmb, lmIntensity: T.floorLm, lightColor: SPOT_COLOR, reflectAlpha: T.reflect,
    }));
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, zMid);
    floor.renderOrder = 10;
    group.add(floor);

    // ----- 천장 -----
    const ceilGeo = keep(meterPlane(ROOM_W, Lr));
    let ceilMat = R[T.ceil];
    if (T.ao) {
      // 빛나는 천장도 벽 쪽으로 갈수록 조금 어둡게
      const lmC = lightCanvas(ROOM_W, Lr, 16);
      paintEdgeAO(lmC, { l: [1.8, 0.55], r: [1.8, 0.55], t: [1.4, 0.4], b: [1.4, 0.4] });
      const C = T.ceilSpec || CEIL_GRID;
      ceilMat = keep(surfaceMaterial({ map: R[C.map], tile: C.tile, tint: C.tint, lightMap: keep(lightTex(lmC.c)), lmSize: [ROOM_W, Lr], ambient: C.amb, lmIntensity: 0 }));
    }
    const ceil = new THREE.Mesh(ceilGeo, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, ROOM_H, zMid);
    both(ceil);

    // ----- 옆벽 -----
    const wallGeo = keep(meterPlane(Lr, ROOM_H));
    const wallOpts = { map: R[T.wallMap], tile: [3.0, 3.0], tint: T.wallTint, lmSize: [Lr, ROOM_H], ambient: T.wallAmb, lmIntensity: T.wallLm, lightColor: SPOT_COLOR };
    const matL = keep(surfaceMaterial({ ...wallOpts, lightMap: texL }));
    const matR = keep(surfaceMaterial({ ...wallOpts, lightMap: texR }));
    const wl = new THREE.Mesh(wallGeo, matL);
    wl.rotation.y = Math.PI / 2; wl.position.set(-ROOM_W / 2, ROOM_H / 2, zMid);
    both(wl);
    const wr = new THREE.Mesh(wallGeo, matR);
    wr.rotation.y = -Math.PI / 2; wr.position.set(ROOM_W / 2, ROOM_H / 2, zMid);
    both(wr);

    // ----- 끝벽 (앞/뒤). 문이 있으면 문 주변이 은은히 밝다 -----
    // u0: 빛 가운데 (벽 모양 좌표, 0 ~ ROOM_W)
    const endLight = (withDoor, u0 = ROOM_W / 2, lobbyText = false) => {
      const L = lightCanvas(ROOM_W, ROOM_H, 32);
      const { g, ppm, c } = L;
      if (T.skyGlow) paintSkyGlow(L);
      if (lobbyText === 'exit') {
        // 인사 글과 방명록 쪽을 비추는 빛
        glow(g, ROOM_W / 2 * ppm, c.height - 2.9 * ppm, 3.4 * ppm, 2.4 * ppm, [[0, 0.6], [0.55, 0.28], [1, 0]]);
        glow(g, (ROOM_W / 2 + EXIT_DOOR.x) * ppm, c.height - (EXIT_DOOR.h + 0.25) * ppm, 0.8 * ppm, 0.5 * ppm, [[0, 0.25], [1, 0]]);
      } else if (lobbyText) {
        // 전시 소개 글을 비추는 넓은 빛 + 문 위 은은한 빛
        const tu = LOBBY_TEXT.x + ROOM_W / 2;
        glow(g, tu * ppm, c.height - (LOBBY_TEXT.y + 0.6) * ppm, 3.0 * ppm, 2.6 * ppm, [[0, 0.62], [0.55, 0.3], [1, 0]]);
        glow(g, u0 * ppm, c.height - (DOOR_H + 0.2) * ppm, 1.6 * ppm, 1.4 * ppm, [[0, 0.3], [1, 0]]);
      } else
      glow(g, u0 * ppm, c.height - (withDoor ? DOOR_H + 0.2 : 1.9) * ppm, 3.2 * ppm, 2.6 * ppm,
        [[0, withDoor ? 0.42 : 0.34], [0.6, 0.18], [1, 0]]);
      if (T.ao) paintEdgeAO(L, { l: [0.9, 0.4], r: [0.9, 0.4], b: [0.55, 0.42], t: [0.45, 0.3] });
      return keep(lightTex(c));
    };
    const endMat = (withDoor, u0, lobbyText) => keep(surfaceMaterial({
      map: R[T.wallMap], tile: [3.0, 3.0], tint: T.wallTint, lightMap: endLight(withDoor, u0, lobbyText), lmSize: [ROOM_W, ROOM_H],
      ambient: T.endAmb, lmIntensity: T.endLm, lightColor: SPOT_COLOR,
    }));
    // 시작 벽 (방 안쪽을 보며 +z 쪽에 있음 → -z 를 향해야 함)
    // 시작 벽은 180도 돌아 있어서 벽 모양 좌표 u = ROOM_W/2 - x
    const inU = ROOM_W / 2 - (room.doorInX || 0), outU = ROOM_W / 2 + (room.doorOutX || 0);
    const startGeo = keep(endWallGeometry(room.doorIn, inU));
    const startWall = new THREE.Mesh(startGeo, endMat(room.doorIn, inU));
    startWall.rotation.y = Math.PI; startWall.position.set(ROOM_W / 2, 0, zStart);
    both(startWall);
    // 끝 벽 (+z 를 향함)
    const endGeo = keep(endWallGeometry(room.doorOut, outU));
    const endWall = new THREE.Mesh(endGeo, endMat(room.doorOut, outU, room.exit ? 'exit' : !!room.lobby));
    endWall.position.set(-ROOM_W / 2, 0, zEnd);
    both(endWall);
    if (room.exit) this.buildExit(room, group, both, keep);
    if (room.lobby) {
      const t = makeLobbyText(this.museum, fontsFor(room.font));
      keep(t.geometry, t.material, t.material.map);
      t.position.set(LOBBY_TEXT.x, LOBBY_TEXT.y, zEnd + 0.004);
      t.userData = { wallText: 'exhibition' };
      group.add(t);
      this.pickables.push(t);
    }

    // ----- 문틀 (벽 두께) + 문턱 바닥 -----
    if (room.doorOut) {
      const jambMat = keep(surfaceMaterial({ map: R[T.wallMap], tile: [3, 3], tint: T.jambTint, lightMap: R.black, ambient: T.jambAmb, lmIntensity: 0 }));
      const jambGeo = keep(meterPlane(WALL_T, DOOR_H));
      const zc = zEnd - WALL_T / 2;
      const dx = room.doorOutX || 0;
      const jl = new THREE.Mesh(jambGeo, jambMat); jl.rotation.y = Math.PI / 2; jl.position.set(dx - DOOR_W / 2, DOOR_H / 2, zc); both(jl);
      const jr = new THREE.Mesh(jambGeo, jambMat); jr.rotation.y = -Math.PI / 2; jr.position.set(dx + DOOR_W / 2, DOOR_H / 2, zc); both(jr);
      const topGeo = keep(meterPlane(DOOR_W, WALL_T));
      const jt = new THREE.Mesh(topGeo, jambMat); jt.rotation.x = Math.PI / 2; jt.position.set(dx, DOOR_H, zc); both(jt);
      const thGeo = keep(meterPlane(DOOR_W, WALL_T));
      const thMat = keep(surfaceMaterial({ map: R[T.floorMap], tile: [3.2, 3.2], tint: T.floorTint, lightMap: R.black, ambient: T.floorAmb, lmIntensity: 0 }));
      const th = new THREE.Mesh(thGeo, thMat); th.rotation.x = -Math.PI / 2; th.position.set(dx, 0.0005, zc); group.add(th);
    }

    // ----- 조명 레일 (스포트라이트 방만) -----
    if (T.spots && T.rails !== false && !room.lobby && !room.exit) {
      const railGeo = keep(new THREE.BoxGeometry(0.035, 0.035, Lr - 0.6));
      for (const sx of [-1, 1]) {
        const rail = new THREE.Mesh(railGeo, R.fixtureMat);
        rail.position.set(sx * (ROOM_W / 2 - TRACK_INSET), ROOM_H - 0.03, zMid);
        group.add(rail);
      }
    }

    // ----- 나무 벤치 (방 가운데 줄) -----
    for (const b of benches) {
      const geo = keep(new THREE.BoxGeometry(BENCH.w, BENCH.h, BENCH.l));
      // 면 순서: +x, -x, +y, -y, +z, -z
      const mats = [R.benchSide, R.benchSide, R.benchTop, R.benchBottom, R.benchEnd, R.benchEnd];
      const mesh = new THREE.Mesh(geo, mats);
      mesh.position.set(b.x, BENCH.h / 2, zStart - b.s);
      both(mesh);
      const z0 = zStart - b.s - BENCH.l / 2, z1 = zStart - b.s + BENCH.l / 2;
      const x0 = b.x - BENCH.w / 2, x1 = b.x + BENCH.w / 2;
      this.colliders.push([x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]);
    }

    // ----- 빛줄기: 천장 가장자리를 따라 빛나는 띠 -----
    if (T.cove) {
      const stripGeo = keep(new THREE.BoxGeometry(0.05, 0.03, Lr - 0.3));
      const stripMat = keep(new THREE.MeshBasicMaterial({ color: 0xfff1da, toneMapped: false }));
      for (const sx of [-1, 1]) {
        const st = new THREE.Mesh(stripGeo, stripMat);
        st.position.set(sx * (ROOM_W / 2 - 0.03), ROOM_H - 0.32, zMid);
        both(st);
      }
    }

    // ----- 방 안내벽 (문 들어서 정면, 홀로 선 벽) -----
    if (!room.lobby && !room.exit) {
      const light = !!T.light;
      const tex = keep(new THREE.CanvasTexture(introCanvas(room, light, fontsFor(room.font), T.introBg)));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = MAX_ANISO;
      const front = keep(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      const sideC = light ? 0xc9c1b4 : 0x1d1c1b;
      const side = keep(new THREE.MeshBasicMaterial({ color: sideC }));
      const back = keep(new THREE.MeshBasicMaterial({ color: light ? 0xcfc8bb : 0x222120 }));
      const geo = keep(new THREE.BoxGeometry(INTRO_W, INTRO_H, INTRO_D));
      // 면 순서: +x, -x, +y, -y, +z(앞: 문 쪽), -z
      const wall = new THREE.Mesh(geo, [side, side, side, side, front, back]);
      const iz = zStart - INTRO_S;
      wall.position.set(room.introX, INTRO_H / 2, iz);
      wall.userData = { wallText: 'room', roomIndex: room.index };
      both(wall);
      this.pickables.push(wall);
      const x0 = room.introX - INTRO_W / 2, x1 = room.introX + INTRO_W / 2;
      const z0 = iz - INTRO_D / 2, z1 = iz + INTRO_D / 2;
      this.colliders.push([x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]);
    }

    // ----- 사진 판 -----
    for (const p of room.panels) this.buildPanel(room, p, group, mirror, keep, T);

    // ----- 충돌 벽 (x,z 선분) -----
    const hw = ROOM_W / 2;
    const C = this.colliders;
    C.push([-hw, zStart, -hw, zEnd - (room.doorOut ? WALL_T : 0)]);
    C.push([hw, zStart, hw, zEnd - (room.doorOut ? WALL_T : 0)]);
    if (!room.doorIn) C.push([-hw, zStart, hw, zStart]);
    if (room.doorOut) {
      const z2 = zEnd - WALL_T;
      const a = (room.doorOutX || 0) - DOOR_W / 2, b = (room.doorOutX || 0) + DOOR_W / 2;
      C.push([-hw, zEnd, a, zEnd], [b, zEnd, hw, zEnd], [-hw, z2, a, z2], [b, z2, hw, z2]);
      C.push([a, zEnd, a, z2], [b, zEnd, b, z2]);
    } else {
      C.push([-hw, zEnd, hw, zEnd]);
    }

    this.root.add(group);
    this.mirrorRoot.add(mirror);
    this.rooms.push({ layout: room, group, mirror, disposables });
  }

  buildPanel(room, p, group, mirror, keep, T) {
    const R = this.res;
    const geo = keep(new THREE.BoxGeometry(p.w, p.h, PANEL_D));
    const empty = !p.photo.imageId;
    const front = keep(photoMaterial(R.plaster, { tile: [p.w / 1.3, p.h / 1.3], intensity: 0.8, aspect: p.w / p.h }));
    // BoxGeometry 면 순서: +x, -x, +y, -y, +z(앞), -z(뒤)
    const E = R[themeOf(room).edges];
    const mats = [E.side, E.side, E.top, E.bottom, front, E.bottom];
    const mesh = new THREE.Mesh(geo, mats);
    mesh.position.set(p.x, p.y, p.z);
    mesh.rotation.y = p.rotY;
    mesh.userData = { roomIndex: room.index, photoIndex: p.index, photoId: p.photo.id, panel: p, empty };
    group.add(mesh);
    if (p.photo.caption && p.photo.caption.trim()) {
      const label = makeLabel(p.photo.caption, !!themeOf(room).light, fontsFor(room.font));
      keep(label.geometry, label.material, label.material.map);
      // 판 기준 오른쪽(보는 사람 오른쪽) 벽 위, 아래 끝을 사진 아래 끝에 맞춤
      label.position.set(p.w / 2 + 0.22 + LABEL_W / 2, -p.h / 2 + label.userData.h / 2, -(PANEL_D / 2 + PANEL_GAP) + 0.003);
      label.userData = { ...mesh.userData, label: true };
      mesh.add(label);
    }
    const mm = new THREE.Mesh(geo, mats);
    mm.position.copy(mesh.position); mm.rotation.copy(mesh.rotation);
    mirror.add(mm);
    this.pickables.push(mesh);
    this.fronts.set(p.photo.id, { front, photo: p.photo });

    if (!empty) {
      this.loadTexture(p.photo.imageId).then(tex => {
        if (!tex) { if (this.onTextureError) this.onTextureError(p.photo); return; }
        front.uniforms.map.value = tex;
        front.uniforms.tile.value.set(1, 1);
        front.uniforms.rot.value = ((p.photo.rot || 0) % 4 + 4) % 4;
        if (!T.spots) front.uniforms.spotMix.value = T.wash ? 0.55 : 0; // 은은한 조명: 가운데가 조금 더 밝게
        front.uniforms.intensity.value = 1.0;
      });
    }

    if (!T.spots) return;
    // 천장 조명 하나: 사진을 향해 기울어진 검은 통
    const sx = p.wall === 'L' ? -1 : 1;
    const fx = sx * (ROOM_W / 2 - TRACK_INSET);
    const fy = 4.2 - 0.2;
    const fixture = new THREE.Group();
    const body = new THREE.Mesh(R.fixtureGeo, R.fixtureMat);
    const stem = new THREE.Mesh(R.stemGeo, R.fixtureMat);
    stem.position.set(fx, fy + 0.12, p.z);
    fixture.add(stem);
    body.position.set(fx, fy, p.z);
    // 통의 아래(-y) 방향이 사진 중심을 보도록
    const dir = new THREE.Vector3(p.x - fx, p.y - fy, 0).normalize();
    body.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    fixture.add(body);
    group.add(fixture);
  }

  loadTexture(imageId) {
    if (this.textureCache.has(imageId)) return this.textureCache.get(imageId);
    const pr = getImage(imageId).then(blob => (blob ? this.textureFromBlob(blob) : null)).catch(e => {
      console.warn('사진 불러오기 실패', imageId, e);
      return null;
    });
    this.textureCache.set(imageId, pr);
    // 실패한 것은 다음에 다시 시도할 수 있게 캐시에서 뺀다
    pr.then(t => { if (!t && this.textureCache.get(imageId) === pr) this.textureCache.delete(imageId); });
    return pr;
  }

  // 방금 고른 사진은 저장소를 다시 거치지 않고 바로 텍스처로 만든다
  primeTexture(imageId, blob) {
    const pr = this.textureFromBlob(blob).catch(() => null);
    this.textureCache.set(imageId, pr);
    return pr;
  }

  async textureFromBlob(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('image decode failed'));
        im.src = url;
      });
      const t = new THREE.Texture(img);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = MAX_ANISO;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.needsUpdate = true;
      return t;
    } finally {
      // 이미지가 GPU 로 올라간 뒤에 풀어야 아이폰에서 안전하다
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }

  resetTextures() {
    this.textureCache.clear();
  }

  forgetTexture(imageId) {
    const pr = this.textureCache.get(imageId);
    if (pr) pr.then(t => t && t.dispose());
    this.textureCache.delete(imageId);
  }

  // 지금 방 ±1 만 그린다 (휴대폰 부담 줄이기)
  // i = -1 은 로비
  setActiveRoom(i) {
    for (const r of this.rooms) {
      const v = Math.abs(r.layout.index - i) <= 1;
      r.group.visible = v;
      r.mirror.visible = v;
    }
  }

  // 로비면 -1
  roomIndexAt(z) {
    const L = this.layout;
    if (z >= L.lobby.zEnd - WALL_T / 2) return -1;
    for (let i = 0; i < L.length; i++) {
      if (z <= L[i].zStart + 0.01 && z >= L[i].zEnd - WALL_T / 2) return i;
    }
    return L.length; // 출구 방
  }
}

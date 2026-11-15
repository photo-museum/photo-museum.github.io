// 배치(layout) → three.js 장면. 방마다 그룹 하나 + 바닥 반사용 거울 그룹.
import * as THREE from 'three';
import {
  ROOM_W, ROOM_H, WALL_T, DOOR_W, DOOR_H, PANEL_D, PANEL_GAP, layoutMuseum,
  INTRO_S, INTRO_W, INTRO_H, INTRO_CY, panelNormal, R2, guestDesk } from './layout.js';
import { fontsFor } from './fonts.js';
import {
  concreteTexture, woodSlatsTexture, plasterTexture, oakFloorTexture, lightGridTexture,
  herringboneTexture, parquetTexture, marbleTexture, terracottaTexture, louverTexture,
  plankTexture, slabTexture, terrazzoTexture, checkerTexture, hexTexture, tatamiTexture, brickTexture, fabricTexture,
  trackTexture, stripTexture, cofferTexture, beamsTexture, darkSpotsTexture, starsTexture, skyTexture,
} from './textures.js';
import { WALL_BY, CEIL_BY, FLOOR_BY, LIGHT_BY, styleOf } from './styles.js';
import { surfaceMaterial, photoMaterial } from './materials.js';
import { getImage, getImageHD } from './store.js';

const SPOT_COLOR = 0xffe9cf;   // 따뜻한 할로겐 빛
const TRACK_INSET = 1.5;       // 조명 레일: 벽에서 안쪽으로

// 방 테마. 방마다 room.theme 으로 고른다.
// 방 스타일 = 색깔 방. 벽·바닥·천장을 같은 계열의 따뜻한 색으로 칠하고, 바닥 반사는 없다 (사진에 집중).
// 사진마다 은은한 조명(wash), 구석·이음새 그림자(ao)로 현실감만 남긴다.
// light: 밝은 방(글씨·화면 요소를 어둡게). mapFloor/mapWall: 지도 색. desc: 고르는 창 설명.
const hexToRgb = h => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
const rgbToHex = ([r, g, b]) => (Math.round(Math.min(1, r) * 255) << 16) | (Math.round(Math.min(1, g) * 255) << 8) | Math.round(Math.min(1, b) * 255);
const css = h => '#' + h.toString(16).padStart(6, '0');
// 무늬(밝기 base)에 곱해 원하는 색이 나오도록 색을 나눠 둔다
const tintFor = (hex, base) => rgbToHex(hexToRgb(hex).map(v => v / base));
// 벽·천장·바닥 고른 것(styles.js)을 그리기 설정 T 로 바꾼다
const themeCache = new Map();
function composeTheme(st) {
  const key = st.wall + '|' + st.ceil + '|' + st.floor + '|' + st.light;
  if (themeCache.has(key)) return themeCache.get(key);
  const W = WALL_BY[st.wall], C = CEIL_BY[st.ceil], F = FLOOR_BY[st.floor], Li = LIGHT_BY[st.light] || LIGHT_BY.soft;
  const A = Li.amb, M = Li.lm;
  // 빛 색이 방 전체(벽·바닥·천장)에 묻는다: 노을빛·촛불은 따뜻하게, 자연광은 살짝 푸르게
  const lc = hexToRgb(Li.color), k = Li.tint || 0;
  const lit = hex => k ? rgbToHex(hexToRgb(hex).map((v, i) => v * (1 - k + k * lc[i] / Math.max(...lc)))) : hex;
  const [r, g, b] = hexToRgb(W.color);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const dark = lum < 0.3, light = lum > 0.45;
  const wallBase = W.map === 'brick' ? 0.92 : W.map === 'fabric' ? 0.93 : W.map === 'plaster' ? 0.9 : 0.93;
  const ceilTint = C.tint === 'wall' ? tintFor(W.color, 0.93) : C.tex === 'wallWhite' ? tintFor(C.tint, 0.93) : C.tint;
  const T = {
    label: W.label, desc: `${C.label} · ${F.label}`, light, mapFloor: css(F.map), mapWall: css(W.color),
    wallMap: W.map || 'wallWhite', wallTile: W.tile || [3, 3], wallTint: lit(tintFor(W.color, wallBase)),
    wallAmb: (dark ? 0.56 : 0.7) * A, wallLm: (dark ? 0.75 : 0.42) * M * (Li.spots && !dark ? 1.5 : 1),
    endAmb: (dark ? 0.52 : 0.66) * A, endLm: (dark ? 0.6 : 0.35) * M,
    floorMap: F.tex, floorTint: lit(F.base ? tintFor(F.tint, F.base) : F.tint), floorAmb: (dark ? 0.66 : 0.72) * A, floorLm: (dark ? 0.35 : 0.25) * M * (Li.spots ? 1.6 : 1),
    reflect: 0, floorTile: F.tile,
    ceil: 'ceilingWhite', ceilSpec: { map: C.tex, tile: C.tile, tint: lit(ceilTint), amb: C.bright ? Math.min(1.05, A) : C.dark ? 0.95 * Math.min(1, A + 0.2) : (dark ? 0.62 : 0.76) * A },
    skyGlow: !!C.bright || !!Li.sky, jambTint: lit(tintFor(W.color, wallBase)), jambAmb: 0.62 * A,
    spots: !!Li.spots, cove: !!Li.cove, uplight: !!Li.up, lightColor: Li.color, lightId: Li.id,
    edges: W.crown === 0xc9a45a || W.crown === 0xb99a5a ? 'edgesGold' : light ? 'edgesWhite' : 'edgesDark',
    wash: !!Li.wash, ao: true, introBg: css(rgbToHex(hexToRgb(W.color).map(v => v * 0.86))),
    wainscot: W.wainscot || null, crown: W.crown || null,
  };
  themeCache.set(key, T);
  return T;
}
export function themeOf(room) { return composeTheme(styleOf(room)); }

// 카탈로그 무늬는 처음 쓸 때 만든다
const LAZY_TEX = {
  track: () => trackTexture(false), trackDark: () => trackTexture(true), strip: stripTexture,
  coffer: () => cofferTexture(false, false), cofferGold: () => cofferTexture(true, false), cofferSky: () => cofferTexture(false, true),
  beams: beamsTexture, darkSpots: darkSpotsTexture, stars: starsTexture, sky: skyTexture,
  slabLight: () => slabTexture([216, 210, 199]), slabDark: () => slabTexture([78, 77, 74]),
  maple: () => plankTexture([226, 192, 142], 53, 18), walnut: () => plankTexture([122, 84, 56], 57),
  terrazzo: () => terrazzoTexture('#ebe7e0', ['#8a8a8a', '#d9c7a8', '#b46a52', '#ffffff', '#6f8597']),
  terrazzoDark: () => terrazzoTexture('#5a5754', ['#8c8c8c', '#c9b48e', '#a6584a', '#dddddd']),
  checkerBW: () => checkerTexture('#f1efea', '#262626'), checkerCream: () => checkerTexture('#efe9dd', '#7c6a57'),
  hex: () => hexTexture('#e6e0d4', '#bdb3a2'), tatami: tatamiTexture, brick: brickTexture, fabric: fabricTexture,
};
let ANISO = 8;
export function texOf(R, key) {
  if (!R[key] && LAZY_TEX[key]) { R[key] = LAZY_TEX[key](); R[key].anisotropy = Math.min(8, ANISO); }
  return R[key];
}

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
    ceilingWhite: surfaceMaterial({ map: wallWhite, tile: [3.0, 3.0], tint: 0xffffff, lightMap: black, ambient: 0.8, lmIntensity: 0 }),
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
const ROOM_W0 = ROOM_W; // 기본 방 폭 (buildRoom 안에서는 그 방의 폭을 ROOM_W 라는 이름으로 쓴다)
function endWallGeometry(withDoor, doorU = ROOM_W0 / 2, ROOM_W = ROOM_W0) {
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
const LABEL_W = 0.62;          // m
const LABEL_PX = 720;          // 1m 당 픽셀 (작을수록 글씨가 커짐)
const LABEL_SS = 3.0;          // 실제로는 이만큼 더 촘촘하게 그린다 (꾹 눌러 크게 봐도 선명하게)
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
function makeLobbyText(museum, FONTS, light = false) {
  const ppm = 300;
  const c = document.createElement('canvas');
  const S = 1.7; // 글씨를 더 촘촘하게 그려 선명하게
  const CW = Math.round(LOBBY_TEXT.w * ppm), CH = Math.round(LOBBY_TEXT.h * ppm);
  c.width = Math.round(CW * S); c.height = Math.round(CH * S);
  const g = c.getContext('2d');
  g.scale(S, S);
  g.textBaseline = 'top';
  const ink = light ? 'rgba(34,30,26,0.94)' : 'rgba(238,231,219,0.95)';
  const sub = light ? 'rgba(60,54,48,0.8)' : 'rgba(214,206,193,0.8)';
  const faint = light ? 'rgba(60,54,48,0.42)' : 'rgba(214,206,193,0.42)';
  const title = (museum.title || '').trim() || '이름 없는 전시';
  const intro = (museum.intro || '').trim();
  let y = drawTextBlock(g, 0, 40, CW, [
    { text: 'My Museum', font: FONTS.mark(42), color: sub, lh: 60, track: 3 },
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

// 방 소개 글 (왼쪽 옆벽에 바로 적는다: 바탕은 투명)
function introCanvas(room, light, FONTS, bg) {
  const ppm = 400;
  const c = document.createElement('canvas');
  const S = 1.6; // 글씨를 더 촘촘하게 그려 선명하게
  // 글 크기는 예전 안내벽(4.4m 폭) 기준으로 짜여 있어, 그 비율로 그린 뒤 벽에는 INTRO_W 폭으로 붙인다
  const CW = Math.round(4.4 * ppm), CH = Math.round(4.4 * INTRO_H / INTRO_W * ppm);
  c.width = Math.round(CW * S); c.height = Math.round(CH * S);
  const g = c.getContext('2d');
  g.scale(S, S);
  g.textBaseline = 'top';
  const ink = light ? 'rgba(36,33,30,0.94)' : 'rgba(236,229,217,0.94)';
  const sub = light ? 'rgba(62,58,52,0.85)' : 'rgba(208,200,187,0.82)';
  const faint = light ? 'rgba(62,58,52,0.42)' : 'rgba(208,200,187,0.4)';
  // 글은 가운데로 모아 컴팩트하게 (폭의 60% 안에서 가운데 정렬, 위아래도 가운데)
  const W = CW * 0.82, cx = CW / 2;
  const no = `ROOM ${String(room.index + 1).padStart(2, '0')}`;
  const blocks = [{ text: no, font: FONTS.mark(34), color: sub, lh: 54, track: 10 }];
  if (room.name) blocks.push({ text: room.name, font: FONTS.title(96), color: ink, lh: 120, gap: 14, max: 2 });
  const rule = !!room.intro;
  const body = room.intro
    ? [{ text: room.intro, font: FONTS.text(40), color: sub, lh: 66, max: 6 }]
    : (!room.name ? [{ text: '벽을 눌러 이 방의 이름과 설명을 적어 주세요.', font: FONTS.text(38), color: faint, lh: 62 }] : []);
  g.textAlign = 'center';
  // 높이 재기 (투명하게 한 번 그려 본다)
  const ghost = arr => arr.map(b => ({ ...b, color: 'rgba(0,0,0,0)' }));
  const h1 = drawTextBlock(g, cx, 0, W, ghost(blocks));
  const h2 = body.length ? drawTextBlock(g, cx, 0, W, ghost(body)) : 0;
  const total = h1 + (rule ? 58 : body.length ? 30 : 0) + h2;
  let y = Math.max(CH * 0.08, (CH - total) / 2 - CH * 0.04);
  y = drawTextBlock(g, cx, y, W, blocks);
  if (rule) {
    g.fillStyle = light ? 'rgba(150,110,60,0.55)' : 'rgba(255,217,160,0.6)';
    g.fillRect(cx - 45, y + 24, 90, 3);
    y += 58;
  } else if (body.length) y += 30;
  if (body.length) drawTextBlock(g, cx, y, W, body);
  g.textAlign = 'left';
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


// ---------- 출구 방: 인사 글, 출구 문, 방명록 ----------
const EXIT_DOOR = { x: 2.35, w: 1.1, h: 2.3 };
const GB_DESK = { w: 1.2, h: 0.95, d: 0.6, s: 3.4 }; // s: 방 시작에서 거리

export const EXIT_TITLE = '관람해 주셔서 고맙습니다';
export const EXIT_NOTE = R2 ? '아래 방명록에 한마디 남겨 주세요' : '앞의 방명록에 한마디 남겨 주세요';
function makeExitText(museum, FONTS, light = false) {
  const ppm = 300, S = 1.7, CW = Math.round(3.6 * ppm), CH = Math.round(1.5 * ppm);
  const c = document.createElement('canvas');
  c.width = Math.round(CW * S); c.height = Math.round(CH * S);
  const g = c.getContext('2d');
  g.scale(S, S);
  g.textBaseline = 'top';
  g.textAlign = 'center';
  const ink = light ? 'rgba(34,30,26,0.94)' : 'rgba(238,231,219,0.95)';
  const sub = light ? 'rgba(60,54,48,0.75)' : 'rgba(214,206,193,0.75)';
  const line = (t, font, color, y) => { g.font = font; g.fillStyle = color; g.fillText(t, CW / 2, y); };
  // 출구 벽 글은 고칠 수 있다 (museum.exitTitle / exitNote, 없으면 기본 글)
  // 길어도 자르지 않는다: 글씨 크기를 줄여 한 줄에 다 넣는다
  const fitLine = (t, mk, size, min, y) => {
    let sz = size;
    g.font = mk(sz);
    while (sz > min && g.measureText(t).width > CW - 70) { sz -= 2; g.font = mk(sz); }
    return [mk(sz), y + (size - sz) * 0.45];
  };
  const head = (museum.exitTitle || '').trim() || EXIT_TITLE;
  const note = (museum.exitNote ?? EXIT_NOTE).trim();
  { const [f, y] = fitLine(head, FONTS.title, 96, 36, 40); line(head, f, ink, y); }
  { const t = (museum.title || '').trim(); const [f, y] = fitLine(t, FONTS.text, 44, 22, 190); line(t, f, sub, y); }
  g.fillStyle = 'rgba(255,217,160,0.65)'; g.fillRect(CW / 2 - 50, 270, 100, 3);
  if (note) {
    note.split('\n').slice(0, 2).forEach((l, k) => { const [f, y] = fitLine(l, FONTS.text, 38, 20, 300 + k * 56); line(l, f, sub, y); });
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = MAX_ANISO;
  return new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.5),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
}

// 방명록에 남긴 글: 왼쪽 벽에 색색의 쪽지로 붙인다 (최근 12장)
const NOTE_COLORS = ['#f6e7c8', '#f3d3d0', '#d6e6d2', '#d5e1ef', '#efe2f2', '#fff1a8'];
// 방명록 쪽지: 한 가지 색, 반듯하게 줄 맞춰 붙인다.
// 모양(GB): card = 흰 카드 / cream = 크림 카드 / text = 종이 없이 벽에 글씨만 / board = 큰 판 한 장
function makeGuestNotes(entries, FONTS, light = false) {
  const GB = globalThis.__GB || 'text'; // 벽에 글씨만 (쪽지 종이 없음)
  const W = 5.2, H = 2.0, ppm = 260, S = 1.5;
  const CW = Math.round(W * ppm), CH = Math.round(H * ppm);
  const c = document.createElement('canvas');
  c.width = Math.round(CW * S); c.height = Math.round(CH * S);
  const g = c.getContext('2d');
  g.scale(S, S);
  const list = entries.slice(-12); // 쓴 순서대로: 오래된 글이 앞, 새 글이 뒤 (12개가 넘으면 최근 12개)
  if (!list.length) list.push({ name: '', text: '첫 방명록을 남겨 주세요 ✦', color: 0, placeholder: true });
  const cols = 6, cw = CW / cols, rh = CH / 2;
  if (GB === 'board') {
    g.shadowColor = 'rgba(0,0,0,0.4)'; g.shadowBlur = 18; g.shadowOffsetY = 8;
    g.fillStyle = '#f7f4ee'; g.fillRect(24, 24, CW - 48, CH - 48);
    g.shadowColor = 'transparent';
    g.strokeStyle = 'rgba(40,34,28,0.13)'; g.lineWidth = 1.5;
    for (let k = 1; k < cols; k++) { g.beginPath(); g.moveTo(24 + (CW - 48) * k / cols, 52); g.lineTo(24 + (CW - 48) * k / cols, CH - 52); g.stroke(); }
    g.beginPath(); g.moveTo(52, CH / 2); g.lineTo(CW - 52, CH / 2); g.stroke();
  }
  list.forEach((e, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = col * cw + cw / 2, y = row * rh + rh / 2;
    let seed = 0; for (const ch of (e.id || String(i))) seed = (seed * 31 + ch.charCodeAt(0)) % 997;
    g.save();
    g.translate(x, y);
    const w = cw * 0.8, h = rh * 0.8;
    let ink = 'rgba(40,34,28,0.9)', ink2 = 'rgba(40,34,28,0.6)';
    if (GB === 'old') {
      g.rotate(((seed % 9) - 4) * 0.012);
      g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 14; g.shadowOffsetY = 6;
      g.fillStyle = e.placeholder ? 'rgba(246,231,200,0.5)' : NOTE_COLORS[(e.color || 0) % NOTE_COLORS.length];
      g.fillRect(-w / 2, -h / 2, w, h);
      g.shadowColor = 'transparent';
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-w * 0.18, -h / 2 - 8, w * 0.36, 16); // 마스킹 테이프
    } else if (GB === 'card' || GB === 'cream') {
      g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 12; g.shadowOffsetY = 5;
      g.globalAlpha = e.placeholder ? 0.6 : 1;
      g.fillStyle = GB === 'card' ? '#fbfaf7' : '#efe6d4';
      g.fillRect(-w / 2, -h / 2, w, h);
      g.globalAlpha = 1;
      g.shadowColor = 'transparent';
    } else if (GB === 'text') {
      ink = light ? 'rgba(34,30,26,0.9)' : 'rgba(238,231,219,0.94)';
      ink2 = light ? 'rgba(60,54,48,0.6)' : 'rgba(214,206,193,0.65)';
      g.fillStyle = ink2; g.fillRect(-w / 2 + 14, -h / 2 + 4, 26, 2); // 글 위 짧은 줄
    }
    g.fillStyle = ink;
    g.textBaseline = 'top';
    g.font = FONTS.text(19);
    const lines = wrapLines(g, e.text || '', w - 28).slice(0, 6);
    lines.forEach((l, k) => g.fillText(l, -w / 2 + 14, -h / 2 + 18 + k * 26));
    if (e.name) { g.font = FONTS.strong(17); g.fillStyle = ink2; g.textAlign = 'right'; g.fillText('— ' + e.name, w / 2 - 12, h / 2 - 28); g.textAlign = 'left'; }
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
    this.rooms = [];          // { layout, group, disposables }
    this.colliders = [];      // [x1, z1, x2, z2]
    this.pickables = [];
    this.textureCache = new Map(); // imageId -> Promise<Texture>
    this.texReady = new Map();     // imageId -> Texture (이미 올라간 것: 다시 지을 때 한 프레임도 비지 않게)
    this.photoJobs = [];           // 판마다 사진 붙이기/떼기
    this.activeRoom = 0;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.res = getShared(renderer.capabilities.getMaxAnisotropy());
    ANISO = renderer.capabilities.getMaxAnisotropy();
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
    // 빛 무늬·글씨 무늬를 지금 미리 그래픽 메모리에 올려 둔다 (방이 보이는 순간 올리느라 멈칫하는 것 막기)
    this.warmUp();
    return layout;
  }

  // 모든 방의 재질에 붙은 그림을 미리 그래픽 메모리에 올리고 셰이더도 미리 만든다
  warmUp() {
    const seen = new Set();
    const up = t => { if (t && t.isTexture && !seen.has(t)) { seen.add(t); try { this.renderer.initTexture(t); } catch (e) {} } };
    this.root.traverse(o => {
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) {
        up(m.map);
        if (m.uniforms) for (const k in m.uniforms) up(m.uniforms[k].value);
      }
    });
    if (this.camera) {
      const vis = this.rooms.map(r => r.group.visible);
      for (const r of this.rooms) r.group.visible = true;
      try { this.renderer.compile(this.scene, this.camera); } catch (e) {}
      this.rooms.forEach((r, i) => { r.group.visible = vis[i]; });
    }
  }

  clear() {
    for (const r of this.rooms) {
      this.root.remove(r.group);
      for (const d of r.disposables) d.dispose();
    }
    this.rooms = [];
    this.colliders = [];
    this.pickables = [];
    this.fronts = new Map();
    this.photoJobs = [];
    this.setHD(null);
  }

  buildExit(room, group, both, keep) {
    const { zStart, zEnd } = room;
    const F = fontsFor(room.font);
    // 인사 글
    const t = makeExitText(this.museum, F, !!themeOf(room).light);
    keep(t.geometry, t.material, t.material.map);
    t.position.set(-0.6, 2.75, zEnd + 0.004);
    t.userData = { wallText: 'exit' };
    group.add(t);
    this.pickables.push(t);
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
    const gd = guestDesk(room), dz = gd.z, gx = gd.x; // 방명록 책상 (layout.js guestDesk)
    const wood = keep(new THREE.MeshBasicMaterial({ color: 0x3b2d23 }));
    const woodTop = keep(new THREE.MeshBasicMaterial({ color: 0x5a4434 }));
    const desk = new THREE.Mesh(keep(new THREE.BoxGeometry(GB_DESK.w, GB_DESK.h, GB_DESK.d)), [wood, wood, woodTop, wood, wood, wood]);
    desk.position.set(gx, GB_DESK.h / 2, dz);
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
    book.position.set(gx, GB_DESK.h + 0.05, dz + 0.02);
    book.userData = { guestbook: true };
    both(book);
    this.pickables.push(book);
    const x0 = gx - GB_DESK.w / 2, x1 = gx + GB_DESK.w / 2, z0 = dz - GB_DESK.d / 2, z1 = dz + GB_DESK.d / 2;
    this.colliders.push([x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]);
    // 방명록 쪽지 (왼쪽 벽)
    const notes = makeGuestNotes(this.museum.guestbook || [], F, !!themeOf(room).light);
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
    // R2: 방마다 폭(width)과 가운데(cx)가 다르다. 아래는 모두 '방 가운데가 x=0' 인 좌표로 짓고, 묶음을 cx 만큼 옮긴다.
    const room0 = room, cx = room.cx || 0, c0 = this.colliders.length;
    const ROOM_W = room.width || ROOM_W0;
    if (cx) {
      room = { ...room, doorInX: (room.doorInX || 0) - cx, doorOutX: (room.doorOutX || 0) - cx,
        panels: room.panels.map(p => ({ ...p, x: p.x - cx, orig: p })),
        introSpot: room.introSpot && { ...room.introSpot, x: room.introSpot.x - cx } };
      group.position.x = cx;
    }
    const disposables = [];
    const keep = (...xs) => { disposables.push(...xs); return xs[0]; };
    // 바닥 반사를 쓰지 않으므로 거울 세계에는 아무것도 넣지 않는다
    const both = (mesh) => { group.add(mesh); };

    // ----- 빛 무늬 캔버스 -----
    const lmL = lightCanvas(Lr, ROOM_H);
    const lmR = lightCanvas(Lr, ROOM_H);
    const lmF = lightCanvas(ROOM_W, Lr, 24);
    if (T.skyGlow) { paintSkyGlow(lmL); paintSkyGlow(lmR); }
    if (T.cove) { paintCove(lmL); paintCove(lmR); }
    if (T.uplight) { paintUplights(lmL, Lr); paintUplights(lmR, Lr); }
    for (const p of room.panels) {
      const s = p.sAlong;
      const lit = T.spots || T.wash;
      if (p.wall === 'F' || p.wall === 'B') {
        // R2: 문 옆 벽(앞·뒤 벽)에 걸린 사진. 벽 빛은 endLight 에서, 여기서는 바닥 띠만
        if (!T.spots) continue;
        const { g, ppm, c } = lmF;
        const fx = (p.x + ROOM_W / 2) * ppm, fy = p.wall === 'F' ? c.height : c.height - Lr * ppm;
        glow(g, fx, fy, (p.w / 2 + 1.4) * ppm, 1.9 * ppm, [[0, 0.62], [0.5, 0.32], [1, 0]]);
        glow(g, fx, fy, (p.w / 2 + 0.7) * ppm, 0.6 * ppm, [[0, 0.5], [1, 0]]);
        continue;
      }
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
      map: texOf(R, T.floorMap), tile: T.floorTile || [3.2, 3.2], tint: T.floorTint, lightMap: texF, lmSize: [ROOM_W, Lr],
      ambient: T.floorAmb, lmIntensity: T.floorLm, lightColor: T.lightColor || SPOT_COLOR, reflectAlpha: T.reflect,
    }));
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, zMid);
    floor.renderOrder = 10;
    floor.userData = { floor: true }; // 바닥을 톡 누르면 그리로 걸어간다
    group.add(floor);

    // ----- 천장 -----
    const ceilGeo = keep(meterPlane(ROOM_W, Lr));
    let ceilMat = R[T.ceil];
    if (T.ao) {
      // 빛나는 천장도 벽 쪽으로 갈수록 조금 어둡게
      const lmC = lightCanvas(ROOM_W, Lr, 16);
      paintEdgeAO(lmC, { l: [1.8, 0.55], r: [1.8, 0.55], t: [1.4, 0.4], b: [1.4, 0.4] });
      let C = T.ceilSpec || { map: 'wallWhite', tile: [3, 3], tint: 0xf2ece2, amb: 0.82 };
      // R2: 천장 무늬의 레일 선은 조명 줄과 어긋난다 → 무늬는 민무늬로 하고, 레일은 조명 바로 위에 진짜로 단다 (아래 '조명 레일')
      if (R2 && C.map === 'track') C = { ...C, map: 'wallWhite', tile: [3, 3] };
      // 무늬 있는 천장(박힌 전등 등): 방 크기에 딱 맞게 무늬 간격을 조금 늘이거나 줄인다 → 벽에서 잘리지 않고 간격이 고르다
      else if (R2 && C.map !== 'wallWhite') C = { ...C, tile: [ROOM_W / Math.max(1, Math.round(ROOM_W / C.tile[0])), Lr / Math.max(1, Math.round(Lr / C.tile[1]))] };
      ceilMat = keep(surfaceMaterial({ map: texOf(R, C.map), tile: C.tile, tint: C.tint, lightMap: keep(lightTex(lmC.c)), lmSize: [ROOM_W, Lr], ambient: C.amb, lmIntensity: 0 }));
    }
    const ceil = new THREE.Mesh(ceilGeo, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, ROOM_H, zMid);
    both(ceil);

    // ----- 옆벽 -----
    const wallGeo = keep(meterPlane(Lr, ROOM_H));
    const wallOpts = { map: texOf(R, T.wallMap), tile: T.wallTile || [3, 3], tint: T.wallTint, lmSize: [Lr, ROOM_H], ambient: T.wallAmb, lmIntensity: T.wallLm, lightColor: T.lightColor || SPOT_COLOR };
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
    const endLight = (withDoor, u0 = ROOM_W / 2, lobbyText = false, side = '') => {
      const hung = side ? room.panels.filter(p => p.wall === side) : [];
      const L = lightCanvas(ROOM_W, ROOM_H, hung.length ? 64 : 32);
      const { g, ppm, c } = L;
      if (T.skyGlow) paintSkyGlow(L);
      // R2: 이 벽에 걸린 사진의 스포트 (F 벽은 돌아 있어 u = W/2 - x, B 벽은 u = W/2 + x)
      for (const p of hung) paintWallSpot(L, side === 'F' ? ROOM_W / 2 - p.x : ROOM_W / 2 + p.x, p, T.spots || T.wash);
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
    const endMat = (withDoor, u0, lobbyText, side) => keep(surfaceMaterial({
      map: texOf(R, T.wallMap), tile: T.wallTile || [3, 3], tint: T.wallTint, lightMap: endLight(withDoor, u0, lobbyText, side), lmSize: [ROOM_W, ROOM_H],
      ambient: T.endAmb, lmIntensity: T.endLm, lightColor: T.lightColor || SPOT_COLOR,
    }));
    // 시작 벽 (방 안쪽을 보며 +z 쪽에 있음 → -z 를 향해야 함)
    // 시작 벽은 180도 돌아 있어서 벽 모양 좌표 u = ROOM_W/2 - x
    const inU = ROOM_W / 2 - (room.doorInX || 0), outU = ROOM_W / 2 + (room.doorOutX || 0);
    const startGeo = keep(endWallGeometry(room.doorIn, inU, ROOM_W));
    const startWall = new THREE.Mesh(startGeo, endMat(room.doorIn, inU, false, 'F'));
    startWall.rotation.y = Math.PI; startWall.position.set(ROOM_W / 2, 0, zStart);
    both(startWall);
    // 끝 벽 (+z 를 향함)
    const endGeo = keep(endWallGeometry(room.doorOut, outU, ROOM_W));
    const endWall = new THREE.Mesh(endGeo, endMat(room.doorOut, outU, room.exit ? 'exit' : !!room.lobby, 'B'));
    endWall.position.set(-ROOM_W / 2, 0, zEnd);
    both(endWall);
    if (room.exit) this.buildExit(room, group, both, keep);
    // 다음 방 안내: 문 위에 작게
    if (room.doorOut && !room.lobby) {
      const next = room.index + 2 <= this.layout.length ? `ROOM ${String(room.index + 2).padStart(2, '0')} 다음 방` : '출구';
      const sc = document.createElement('canvas'); sc.width = 1024; sc.height = 200;
      const sg = sc.getContext('2d');
      sg.font = fontsFor(room.font).text(64);
      sg.fillStyle = T.light ? 'rgba(40,34,28,0.72)' : 'rgba(240,232,220,0.72)';
      sg.textAlign = 'center'; sg.textBaseline = 'middle';
      sg.fillText(`↑  ${next}`, 512, 100);
      const stex = keep(new THREE.CanvasTexture(sc)); stex.colorSpace = THREE.SRGBColorSpace; stex.anisotropy = MAX_ANISO;
      const sign = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.5, 0.29)), keep(new THREE.MeshBasicMaterial({ map: stex, transparent: true, depthWrite: false, toneMapped: false })));
      sign.position.set(room.doorOutX || 0, DOOR_H + 0.34, zEnd + 0.006);
      group.add(sign);
    }
    if (room.lobby) {
      const t = makeLobbyText(this.museum, fontsFor(room.font), !!T.light);
      keep(t.geometry, t.material, t.material.map);
      t.position.set(LOBBY_TEXT.x, LOBBY_TEXT.y, zEnd + 0.004);
      t.userData = { wallText: 'exhibition' };
      group.add(t);
      this.pickables.push(t);
    }

    // ----- 징두리판(아래)과 몰딩(위): 벽 앞에 얇은 띠 -----
    if (T.wainscot || T.crown) {
      const bandMat = (color, k = 1) => keep(surfaceMaterial({ map: R.wallWhite, tile: [3, 3], tint: rgbToHex(hexToRgb(tintFor(color, 0.93)).map(v => Math.min(1, v * k))), lightMap: R.black, ambient: T.wallAmb, lmIntensity: 0 }));
      const band = (len, h, y, x, z, ry, mat) => {
        if (len <= 0.01) return;
        const m = new THREE.Mesh(keep(meterPlane(len, h)), mat);
        m.position.set(x, y, z); m.rotation.y = ry; both(m);
      };
      const e = 0.006;
      const spans = (dx, door) => door ? [[-ROOM_W / 2, dx - DOOR_W / 2 - 0.06], [dx + DOOR_W / 2 + 0.06, ROOM_W / 2]] : [[-ROOM_W / 2, ROOM_W / 2]];
      const ring = (h, y, mat, avoidDoors) => {
        band(Lr, h, y, -ROOM_W / 2 + e, zMid, Math.PI / 2, mat);
        band(Lr, h, y, ROOM_W / 2 - e, zMid, -Math.PI / 2, mat);
        for (const [a, b] of spans(room.doorInX || 0, avoidDoors && room.doorIn)) band(b - a, h, y, (a + b) / 2, zStart - e, Math.PI, mat);
        for (const [a, b] of spans(room.doorOutX || 0, avoidDoors && room.doorOut)) band(b - a, h, y, (a + b) / 2, zEnd + e, 0, mat);
      };
      if (T.wainscot) {
        const h = T.wainscot.h;
        ring(h, h / 2, bandMat(T.wainscot.c), true);
        ring(0.035, h + 0.0175, bandMat(T.wainscot.c, 1.35), true); // 위 테
      }
      if (T.crown) {
        ring(0.3, ROOM_H - 0.15, bandMat(T.crown), false);
        ring(0.03, ROOM_H - 0.315, bandMat(T.crown, 0.7), false); // 아래 그림자 줄
      }
    }

    // ----- 문틀 (벽 두께) + 문턱 바닥 -----
    if (room.doorOut) {
      const jambMat = keep(surfaceMaterial({ map: texOf(R, T.wallMap), tile: T.wallTile || [3, 3], tint: T.jambTint, lightMap: R.black, ambient: T.jambAmb, lmIntensity: 0 }));
      const jambGeo = keep(meterPlane(WALL_T, DOOR_H));
      const zc = zEnd - WALL_T / 2;
      const dx = room.doorOutX || 0;
      const jl = new THREE.Mesh(jambGeo, jambMat); jl.rotation.y = Math.PI / 2; jl.position.set(dx - DOOR_W / 2, DOOR_H / 2, zc); both(jl);
      const jr = new THREE.Mesh(jambGeo, jambMat); jr.rotation.y = -Math.PI / 2; jr.position.set(dx + DOOR_W / 2, DOOR_H / 2, zc); both(jr);
      const topGeo = keep(meterPlane(DOOR_W, WALL_T));
      const jt = new THREE.Mesh(topGeo, jambMat); jt.rotation.x = Math.PI / 2; jt.position.set(dx, DOOR_H, zc); both(jt);
      const thGeo = keep(meterPlane(DOOR_W, WALL_T));
      const thMat = keep(surfaceMaterial({ map: texOf(R, T.floorMap), tile: [3.2, 3.2], tint: T.floorTint, lightMap: R.black, ambient: T.floorAmb, lmIntensity: 0 }));
      const th = new THREE.Mesh(thGeo, thMat); th.rotation.x = -Math.PI / 2; th.position.set(dx, 0.0005, zc); th.userData = { floor: true }; group.add(th);
    }

    // ----- 바닥 화살표: 문 앞에서 어느 쪽으로 가는지 (R2) -----
    //  · 들어온 문 안쪽: 첫 사진 쪽(문 옆 벽을 따라 왼쪽)  · 나가는 문 앞: 문 쪽(다음 방)
    if (R2 && !room.exit) {
      const ac = document.createElement('canvas'); ac.width = 256; ac.height = 128;
      const ag = ac.getContext('2d');
      ag.strokeStyle = T.light ? 'rgba(40,36,32,0.5)' : 'rgba(240,232,220,0.5)';
      ag.lineWidth = 13; ag.lineCap = 'round'; ag.lineJoin = 'round';
      ag.beginPath(); ag.moveTo(28, 64); ag.lineTo(224, 64); ag.moveTo(172, 22); ag.lineTo(228, 64); ag.lineTo(172, 106); ag.stroke();
      const atex = keep(new THREE.CanvasTexture(ac)); atex.colorSpace = THREE.SRGBColorSpace; atex.anisotropy = MAX_ANISO;
      const amat = keep(new THREE.MeshBasicMaterial({ map: atex, transparent: true, depthWrite: false, toneMapped: false }));
      const ageo = keep(new THREE.PlaneGeometry(1.1, 0.55));
      // dir: 0 = +x, π = -x, π/2 = 앞(-z)
      const arrow = (x, z, dir) => { const m = new THREE.Mesh(ageo, amat); m.rotation.x = -Math.PI / 2; m.rotation.z = dir; m.position.set(x, 0.006, z); m.renderOrder = 2; group.add(m); };
      if (room.doorIn && room.panels.some(p => p.wall === 'F')) arrow((room.doorInX || 0) - 1.6, zStart - 1.3, Math.PI);
      if (room.doorOut) arrow(room.doorOutX || 0, zEnd + 1.3, Math.PI / 2);
    }

    // ----- 조명 레일 (스포트라이트 방만) -----
    if (T.spots && T.rails !== false && !room.lobby && !room.exit) {
      if (R2) {
        // 조명이 달린 줄마다 그 바로 위로 레일 한 줄: 문 옆 두 벽은 가로(x)로, 안쪽 벽은 세로(z)로
        const inset = TRACK_INSET + PANEL_D / 2;
        const has = w => room.panels.some(p => p.wall === w);
        const railX = keep(new THREE.BoxGeometry(ROOM_W - 0.6, 0.035, 0.035));
        for (const [w, z] of [['F', zStart - inset], ['B', zEnd + inset]]) {
          if (!has(w)) continue;
          const rail = new THREE.Mesh(railX, R.fixtureMat);
          rail.position.set(0, ROOM_H - 0.03, z);
          group.add(rail);
        }
        if (has('L')) {
          const rail = new THREE.Mesh(keep(new THREE.BoxGeometry(0.035, 0.035, Lr - 0.6)), R.fixtureMat);
          rail.position.set(-ROOM_W / 2 + inset, ROOM_H - 0.03, zMid);
          group.add(rail);
        }
      }
      const railGeo = keep(new THREE.BoxGeometry(0.035, 0.035, Lr - 0.6));
      for (const sx of R2 ? [] : [-1, 1]) {
        const rail = new THREE.Mesh(railGeo, R.fixtureMat);
        rail.position.set(sx * (ROOM_W / 2 - TRACK_INSET), ROOM_H - 0.03, zMid);
        group.add(rail);
      }
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

    // ----- 방 소개 글: 들어서자마자 왼쪽 옆벽 (입구 가까운 쪽) -----
    if (!room.lobby && !room.exit) {
      const tex = keep(new THREE.CanvasTexture(introCanvas(room, !!T.light, fontsFor(room.font))));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = MAX_ANISO;
      const mat = keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
      const txt = new THREE.Mesh(keep(new THREE.PlaneGeometry(INTRO_W, INTRO_H)), mat);
      if (room.introWall === 'R') { // R2: 문 바로 옆 오른쪽 벽
        txt.rotation.y = -Math.PI / 2;
        txt.position.set(ROOM_W / 2 - 0.006, INTRO_CY, room.introSpot.z);
      } else {
        txt.rotation.y = Math.PI / 2;
        txt.position.set(-ROOM_W / 2 + 0.006, INTRO_CY, zStart - INTRO_S);
      }
      txt.userData = { wallText: 'room', roomIndex: room.index };
      group.add(txt);
      this.pickables.push(txt);
    }

    // ----- 사진 판 -----
    for (const p of room.panels) this.buildPanel(room, p, group, keep, T);

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

    if (cx) for (let i = c0; i < C.length; i++) { C[i][0] += cx; C[i][2] += cx; } // 충돌 벽도 제자리로
    this.root.add(group);
    this.rooms.push({ layout: room0, group, disposables });
  }

  buildPanel(room, p, group, keep, T) {
    const R = this.res;
    const geo = keep(new THREE.BoxGeometry(p.w, p.h, PANEL_D));
    const empty = !p.photo.imageId;
    const front = keep(photoMaterial(R.plaster, { tile: [p.w / 1.3, p.h / 1.3], intensity: 0.8, aspect: p.w / p.h }));
    // 조명 색이 사진에도 아주 살짝 묻는다
    if (T.lightColor && T.lightColor !== 0xffe9cf) front.uniforms.lightColor.value.lerp(new THREE.Color(T.lightColor), 0.22);
    // BoxGeometry 면 순서: +x, -x, +y, -y, +z(앞), -z(뒤)
    const E = R[themeOf(room).edges];
    const mats = [E.side, E.side, E.top, E.bottom, front, E.bottom];
    const mesh = new THREE.Mesh(geo, mats);
    mesh.position.set(p.x, p.y, p.z);
    mesh.rotation.y = p.rotY;
    mesh.userData = { roomIndex: room.index, photoIndex: p.index, photoId: p.photo.id, panel: p.orig || p, empty };
    group.add(mesh);
    if (p.photo.caption && p.photo.caption.trim()) {
      const label = makeLabel(p.photo.caption, !!themeOf(room).light, fontsFor(room.font));
      keep(label.geometry, label.material, label.material.map);
      // 판 기준 오른쪽(보는 사람 오른쪽) 벽 위, 아래 끝을 사진 아래 끝에 맞춤
      label.position.set(p.w / 2 + 0.22 + LABEL_W / 2, -p.h / 2 + label.userData.h / 2, -(PANEL_D / 2 + PANEL_GAP) + 0.003);
      label.userData = { ...mesh.userData, label: true };
      mesh.add(label);
    }
    this.pickables.push(mesh);
    this.fronts.set(p.photo.id, { front, photo: p.photo });

    if (!empty) {
      // 사진은 바로 올리지 않고, 가까운 방이 되면 올린다 (setActiveRoom → syncPhotos)
      const blank = { map: front.uniforms.map.value, tile: front.uniforms.tile.value.clone(), intensity: front.uniforms.intensity.value };
      this.photoJobs.push({
        roomIndex: room.index, imageId: p.photo.imageId, photo: p.photo, front, shown: false,
        apply: tex => {
          front.uniforms.map.value = tex;
          front.uniforms.tile.value.set(1, 1);
          front.uniforms.rot.value = ((p.photo.rot || 0) % 4 + 4) % 4;
          front.uniforms.spotMix.value = T.spots ? 1 : T.wash ? 0.55 : 0; // 은은한 조명: 가운데가 조금 더 밝게
          front.uniforms.intensity.value = 1.0;
        },
        unapply: () => {
          front.uniforms.map.value = blank.map;
          front.uniforms.tile.value.copy(blank.tile);
          front.uniforms.rot.value = 0;
          front.uniforms.intensity.value = blank.intensity;
        },
      });
    }

    if (!T.spots) return;
    // 천장 조명 하나: 사진을 향해 기울어진 검은 통
    // 벽에서 방 안쪽으로 TRACK_INSET 만큼 들어온 자리 (어느 벽이든)
    const [nx, nz] = panelNormal(p);
    const fx = p.x + nx * (TRACK_INSET - PANEL_GAP), fz = p.z + nz * (TRACK_INSET - PANEL_GAP);
    const fy = ROOM_H - 0.2;
    const fixture = new THREE.Group();
    const body = new THREE.Mesh(R.fixtureGeo, R.fixtureMat);
    const stem = new THREE.Mesh(R.stemGeo, R.fixtureMat);
    stem.position.set(fx, fy + 0.12, fz);
    fixture.add(stem);
    body.position.set(fx, fy, fz);
    // 통의 아래(-y) 방향이 사진 중심을 보도록
    const dir = new THREE.Vector3(p.x - fx, p.y - fy, p.z - fz).normalize();
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
    pr.then(t => { if (!t && this.textureCache.get(imageId) === pr) this.textureCache.delete(imageId); else if (t && this.textureCache.get(imageId) === pr) this.texReady.set(imageId, t); });
    return pr;
  }

  // 방금 고른 사진은 저장소를 다시 거치지 않고 바로 텍스처로 만든다
  primeTexture(imageId, blob) {
    const pr = this.textureFromBlob(blob).catch(() => null);
    this.textureCache.set(imageId, pr);
    pr.then(t => { if (t && this.textureCache.get(imageId) === pr) this.texReady.set(imageId, t); });
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
      try { this.renderer.initTexture(t); } catch (e) {} // 불러오자마자 올려 둔다 (보이는 순간 멈칫 방지)
      return t;
    } finally {
      // 이미지가 GPU 로 올라간 뒤에 풀어야 아이폰에서 안전하다
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }

  resetTextures() {
    this.textureCache.clear();
    this.texReady.clear();
    for (const j of this.photoJobs) j.shown = false;
  }

  forgetTexture(imageId) {
    const pr = this.textureCache.get(imageId);
    if (pr) pr.then(t => t && t.dispose());
    this.textureCache.delete(imageId);
    this.texReady.delete(imageId);
  }

  // 사진 원본은 지금 방 ±LOAD_NEAR 만 그래픽 메모리에 올리고, ±KEEP_FAR 보다 먼 방의 것은 내린다.
  // (사진이 많은 전시실도 휴대폰 메모리가 넘치지 않게)
  syncPhotos(i) {
    const LOAD_NEAR = 3, KEEP_FAR = 4; // 안내벽이 없어 문 너머 먼 방까지 보인다
    const need = new Set();
    for (const j of this.photoJobs) {
      const d = Math.abs(j.roomIndex - i);
      if (d <= KEEP_FAR) need.add(j.imageId);
      if (d > LOAD_NEAR || j.shown) continue;
      j.shown = true;
      const ready = this.texReady.get(j.imageId);
      if (ready) { j.apply(ready); continue; } // 이미 올라가 있으면 바로 (깜빡임 없이)
      this.loadTexture(j.imageId).then(tex => {
        if (!this.photoJobs.includes(j) || !j.shown) return;
        if (!tex) { j.shown = false; if (this.onTextureError) this.onTextureError(j.photo); return; }
        j.apply(tex);
      });
    }
    // 먼 방 사진 내리기 (같은 사진이 가까운 판에도 걸려 있으면 그대로)
    for (const [id, t] of this.texReady) {
      if (need.has(id)) continue;
      if (this.hd && this.hd.base === t) continue;
      for (const j of this.photoJobs) if (j.imageId === id && j.shown) { j.unapply(); j.shown = false; }
      t.dispose();
      this.texReady.delete(id);
      this.textureCache.delete(id);
    }
  }

  // 지금 방 ±1 만 그린다 (휴대폰 부담 줄이기)
  // i = -1 은 로비
  setActiveRoom(i) {
    this.activeRoom = i;
    this.syncPhotos(i);
    for (const r of this.rooms) {
      // 문이 일직선이라 여러 칸 너머까지 보인다 → 네 칸까지 그려 둔다 (먼 문 너머가 검게 비었다 나타나는 깜빡임 없애기)
      const v = Math.abs(r.layout.index - i) <= 4;
      r.group.visible = v;
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

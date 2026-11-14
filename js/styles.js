// 방 꾸미기 카탈로그: 벽 · 천장 · 바닥.
// 미술관·박물관 사진들(사용자가 보내 준 레퍼런스 포함)에서 모은 마감을 세 가지로 나눴다.
// 벽만 고르면 천장과 바닥은 그 벽에 어울리는 추천(rec)으로 정해지고, 원하면 따로 바꿀 수 있다.
// room.style = { wall, ceil?, floor?, light? }  (ceil/floor 가 없으면 벽의 추천, light 가 없으면 은은한 빛)
// 벽을 바꿔도 천장·바닥·조명은 그대로 두고 추천만 보여 준다. '추천대로'를 누르면 셋 다 추천으로.

// ---------- 벽 ----------
// color: 벽 색, map: 마감 무늬, wainscot: 아래 징두리판 { c, h }, crown: 위 몰딩 색
export const WALL_GROUPS = ['하양·회색', '클래식', '부드러운 색', '깊은 색', '마감'];
export const WALLS = [
  { id: 'gallery', g: '하양·회색', label: '갤러리 화이트', color: 0xf4f3f0, rec: { ceil: 'track', floor: 'concrete' } },
  { id: 'ivory', g: '하양·회색', label: '아이보리', color: 0xebe3d5, rec: { ceil: 'same', floor: 'oak' } },
  { id: 'warmgray', g: '하양·회색', label: '웜 그레이', color: 0xd9d4cc, rec: { ceil: 'skylight', floor: 'stone' } },
  { id: 'paper', g: '하양·회색', label: '종이 흰색', color: 0xf6f4ee, rec: { ceil: 'strip', floor: 'concrete-dark' } },
  { id: 'stone', g: '하양·회색', label: '스톤 그레이', color: 0xaeaaa3, rec: { ceil: 'louver', floor: 'slate' } },
  { id: 'charcoal', g: '하양·회색', label: '차콜', color: 0x2e2a27, rec: { ceil: 'darkspots', floor: 'concrete-dark' } },
  { id: 'black', g: '하양·회색', label: '블랙', color: 0x1b1a19, rec: { ceil: 'darkspots', floor: 'slate' } },

  { id: 'louvre', g: '클래식', label: '루브르 테라코타', color: 0x8e4b3e, wainscot: { c: 0x1f1a17, h: 0.3 }, rec: { ceil: 'same', floor: 'chevron' } },
  { id: 'dresden', g: '클래식', label: '드레스덴 레드', color: 0xa63a3d, crown: 0xe8e0cf, wainscot: { c: 0x4a2a1d, h: 0.45 }, rec: { ceil: 'coffer-sky', floor: 'parquet-dark' } },
  { id: 'burgundy', g: '클래식', label: '버건디', color: 0x6c2430, rec: { ceil: 'same', floor: 'chevron' } },
  { id: 'salon', g: '클래식', label: '그린 살롱', color: 0x4f6f5a, crown: 0x7a5a3a, wainscot: { c: 0x9c7044, h: 0.45 }, rec: { ceil: 'skylight', floor: 'oak' } },
  { id: 'navy', g: '클래식', label: '네이비 살롱', color: 0x22324f, crown: 0xc9a45a, rec: { ceil: 'same', floor: 'walnut' } },
  { id: 'plum', g: '클래식', label: '자두빛 보라', color: 0x4b2a45, crown: 0xc9a45a, rec: { ceil: 'same', floor: 'chevron' } },
  { id: 'cream', g: '클래식', label: '크림 몰딩', color: 0xefe4d0, crown: 0xf6efe2, rec: { ceil: 'coffer', floor: 'marble' } },

  { id: 'rose', g: '부드러운 색', label: '로즈 핑크', color: 0xd79a96, rec: { ceil: 'same', floor: 'maple' } },
  { id: 'blush', g: '부드러운 색', label: '블러시', color: 0xe8c9c3, rec: { ceil: 'same', floor: 'marble' } },
  { id: 'peach', g: '부드러운 색', label: '피치', color: 0xefb8a0, rec: { ceil: 'same', floor: 'oak' } },
  { id: 'butter', g: '부드러운 색', label: '버터 옐로', color: 0xecd38c, rec: { ceil: 'same', floor: 'maple' } },
  { id: 'mustard', g: '부드러운 색', label: '머스터드', color: 0xd6a54a, rec: { ceil: 'same', floor: 'maple' } },
  { id: 'sage', g: '부드러운 색', label: '세이지', color: 0xa7b59b, rec: { ceil: 'same', floor: 'terracotta' } },
  { id: 'mint', g: '부드러운 색', label: '민트', color: 0xa8d4c4, rec: { ceil: 'same', floor: 'terrazzo' } },
  { id: 'powder', g: '부드러운 색', label: '파우더 블루', color: 0xa9c2d6, rec: { ceil: 'same', floor: 'maple' } },
  { id: 'lavender', g: '부드러운 색', label: '라벤더', color: 0xb9acc9, rec: { ceil: 'same', floor: 'oak' } },

  { id: 'brick', g: '깊은 색', label: '벽돌빛 빨강', color: 0x983b2d, rec: { ceil: 'same', floor: 'concrete-dark' } },
  { id: 'terracotta', g: '깊은 색', label: '구운 흙 주황', color: 0xb2643b, rec: { ceil: 'same', floor: 'slate' } },
  { id: 'ochre', g: '깊은 색', label: '황토', color: 0xc98f3b, rec: { ceil: 'same', floor: 'checker-cream' } },
  { id: 'olive', g: '깊은 색', label: '올리브', color: 0x6b6a3c, wainscot: { c: 0x3c3a22, h: 0.35 }, rec: { ceil: 'same', floor: 'parquet' } },
  { id: 'forest', g: '깊은 색', label: '깊은 숲', color: 0x2f4a39, crown: 0xb99a5a, rec: { ceil: 'same', floor: 'walnut' } },
  { id: 'cobalt', g: '깊은 색', label: '코발트', color: 0x2b54a3, rec: { ceil: 'white', floor: 'stone' } },
  { id: 'stoneblue', g: '깊은 색', label: '스톤 블루', color: 0x6f8597, rec: { ceil: 'track-black', floor: 'concrete' } },
  { id: 'mocha', g: '깊은 색', label: '모카', color: 0x8a6a55, rec: { ceil: 'same', floor: 'concrete' } },

  { id: 'hanji', g: '마감', label: '한지', color: 0xefe7d6, map: 'plaster', wainscot: { c: 0x6b4e36, h: 0.22 }, rec: { ceil: 'beams', floor: 'oak' } },
  { id: 'brickwall', g: '마감', label: '붉은 벽돌', color: 0xb5674c, map: 'brick', tile: [2, 1], rec: { ceil: 'darkspots', floor: 'concrete' } },
  { id: 'fabric', g: '마감', label: '자주 천 벽', color: 0x7b4b6a, map: 'fabric', crown: 0xe8dcc6, rec: { ceil: 'coffer-gold', floor: 'parquet-dark' } },
  { id: 'library', g: '마감', label: '서재 나무', color: 0x5a3e2b, map: 'fabric', wainscot: { c: 0x3a2618, h: 0.9 }, crown: 0x6b4a32, rec: { ceil: 'beams', floor: 'carpet' } },
  { id: 'night', g: '마감', label: '밤하늘 남색', color: 0x1f2640, rec: { ceil: 'stars', floor: 'concrete-dark' } },
];

// ---------- 천장 ----------
// tex: 무늬, tile: 한 장 크기(m), tint: 'wall' 이면 벽 색을 입힌다, amb: 밝기, bright: 스스로 빛남
export const CEILINGS = [
  { id: 'same', label: '벽과 같은 색', tex: 'wallWhite', tile: [3, 3], tint: 'wall' },
  { id: 'white', label: '흰 천장', tex: 'wallWhite', tile: [3, 3], tint: 0xf4f1ec },
  { id: 'track', label: '트랙 조명 (흰)', tex: 'track', tile: [7, 1.4], tint: 'wall' },
  { id: 'track-black', label: '트랙 조명 (검정)', tex: 'trackDark', tile: [7, 1.4], tint: 'wall' },
  { id: 'skylight', label: '격자 천창', tex: 'grid', tile: [1.2, 1.2], tint: 0xffffff, bright: true },
  { id: 'louver', label: '루버 천창', tex: 'louver', tile: [0.6, 0.6], tint: 0xffffff, bright: true },
  { id: 'strip', label: '빛의 띠', tex: 'strip', tile: [7, 2.4], tint: 0xffffff, bright: true },
  { id: 'coffer', label: '우물 반자', tex: 'coffer', tile: [7, 1.4], tint: 0xffffff },
  { id: 'coffer-gold', label: '금선 우물 반자', tex: 'cofferGold', tile: [7, 1.4], tint: 0xffffff },
  { id: 'coffer-sky', label: '반자 + 천창', tex: 'cofferSky', tile: [7, 1.4], tint: 0xffffff },
  { id: 'beams', label: '나무 보', tex: 'beams', tile: [1.3, 1.1], tint: 0xffffff },
  { id: 'darkspots', label: '검은 천장 + 스포트', tex: 'darkSpots', tile: [7, 1.5], tint: 0xffffff, dark: true },
  { id: 'stars', label: '별빛 천장', tex: 'stars', tile: [3, 3], tint: 0xffffff, dark: true },
  { id: 'sky', label: '구름 하늘', tex: 'sky', tile: [5, 5], tint: 0xffffff, bright: true },
];

// ---------- 바닥 ----------
// map 색은 지도에 쓴다
export const FLOORS = [
  { id: 'warmwhite', label: '따뜻한 흰 바닥', tex: 'floorWhite', tile: [3.2, 3.2], tint: 0xe8e2d8, base: 0.8, map: 0xe8e2d8 },
  { id: 'concrete', label: '밝은 콘크리트', tex: 'floorWhite', tile: [3.2, 3.2], tint: 0xd5d0c8, base: 0.8, map: 0xd5d0c8 },
  { id: 'concrete-dark', label: '짙은 콘크리트', tex: 'floorWhite', tile: [3.2, 3.2], tint: 0x5e5b57, base: 0.8, map: 0x5e5b57 },
  { id: 'stone', label: '밝은 석판', tex: 'slabLight', tile: [2.4, 1.2], tint: 0xffffff, map: 0xd8d2c7 },
  { id: 'slate', label: '짙은 석판', tex: 'slabDark', tile: [2.4, 1.2], tint: 0xffffff, map: 0x4c4b49 },
  { id: 'oak', label: '원목 오크', tex: 'oak', tile: [2, 4], tint: 0xffffff, map: 0xc9a26b },
  { id: 'maple', label: '메이플', tex: 'maple', tile: [2, 4], tint: 0xffffff, map: 0xddb987 },
  { id: 'walnut', label: '월넛', tex: 'walnut', tile: [2, 4], tint: 0xffffff, map: 0x7a5236 },
  { id: 'chevron', label: '쉐브론 마루', tex: 'herringbone', tile: [1.6, 1.6], tint: 0xffffff, map: 0xc79c63 },
  { id: 'parquet', label: '바구니 쪽마루', tex: 'parquet', tile: [1.4, 1.4], tint: 0xffffff, map: 0x9a6a3e },
  { id: 'parquet-dark', label: '짙은 쪽마루', tex: 'parquet', tile: [1.4, 1.4], tint: 0x9a8676, map: 0x6e4c32 },
  { id: 'marble', label: '흰 대리석', tex: 'marble', tile: [2.4, 2.4], tint: 0xffffff, map: 0xece7df },
  { id: 'terrazzo', label: '테라조', tex: 'terrazzo', tile: [1.6, 1.6], tint: 0xffffff, map: 0xe9e5de },
  { id: 'terrazzo-dark', label: '짙은 테라조', tex: 'terrazzoDark', tile: [1.6, 1.6], tint: 0xffffff, map: 0x5a5754 },
  { id: 'checker-bw', label: '흑백 체크', tex: 'checkerBW', tile: [1.2, 1.2], tint: 0xffffff, map: 0x8a8a8a },
  { id: 'checker-cream', label: '크림 갈색 체크', tex: 'checkerCream', tile: [1.0, 1.0], tint: 0xffffff, map: 0xb8a68f },
  { id: 'hex', label: '육각 타일', tex: 'hex', tile: [0.66, 0.38], tint: 0xffffff, map: 0xe2dccf },
  { id: 'terracotta', label: '테라코타 타일', tex: 'terracotta', tile: [1.6, 1.6], tint: 0xffffff, map: 0xc07a58 },
  { id: 'tatami', label: '다다미', tex: 'tatami', tile: [3.64, 1.82], tint: 0xffffff, map: 0xcdbf86 },
  { id: 'carpet', label: '버건디 카펫', tex: 'fabric', tile: [1, 1], tint: 0x5b2a2c, map: 0x5b2a2c },
];

// ---------- 조명 ----------
// spots: 사진마다 천장 스포트(레일·등기구), wash: 사진 둘레가 은은히 밝게, sky: 위에서 내려오는 빛,
// cove: 천장 가장자리 빛 띠, up: 벽 아래 업라이트, color: 빛 색, tint: 방 전체에 빛 색이 묻는 정도, amb: 방 전체 밝기 배율, lm: 빛 무늬 세기 배율
export const LIGHTS = [
  { id: 'soft', label: '은은한 빛', wash: true, color: 0xffe9cf, amb: 1, lm: 1, sw: ['#fff4e2', '#d9cbb6'] },
  { id: 'even', label: '고른 흰 빛', color: 0xffffff, amb: 1.12, lm: 0.6, sw: ['#ffffff', '#ecebe8'] },
  { id: 'spot', label: '스포트라이트', spots: true, color: 0xffe9cf, amb: 0.92, lm: 1.15, sw: ['#ffe2b8', '#3a332c'] },
  { id: 'spot-cool', label: '하얀 스포트', spots: true, color: 0xf3f6ff, tint: 0.08, amb: 0.95, lm: 1.1, sw: ['#f4f7ff', '#40444c'] },
  { id: 'theater', label: '어둠 속 스포트', spots: true, color: 0xffe2c0, amb: 0.36, lm: 2.1, sw: ['#ffd9a8', '#0d0c0b'] },
  { id: 'daylight', label: '천창 자연광', sky: true, wash: true, color: 0xf2f6ff, tint: 0.1, amb: 1.08, lm: 0.85, sw: ['#ffffff', '#c9d6e6'] },
  { id: 'cove', label: '간접 조명 띠', cove: true, color: 0xfff1da, tint: 0.05, amb: 0.78, lm: 1, sw: ['#fff1da', '#6b6156'] },
  { id: 'uplight', label: '바닥 업라이트', up: true, wash: true, color: 0xffd9a6, tint: 0.12, amb: 0.7, lm: 1.1, sw: ['#3b3128', '#ffd9a6'] },
  { id: 'sunset', label: '노을빛', sky: true, wash: true, color: 0xffa66b, tint: 0.4, amb: 0.9, lm: 1.1, sw: ['#ffc48f', '#b5654a'] },
  { id: 'candle', label: '촛불 저녁', spots: true, color: 0xffa04f, tint: 0.35, amb: 0.48, lm: 1.6, sw: ['#ffb46b', '#2a1d14'] },
];

const BY = list => Object.fromEntries(list.map(x => [x.id, x]));
export const WALL_BY = BY(WALLS), CEIL_BY = BY(CEILINGS), FLOOR_BY = BY(FLOORS), LIGHT_BY = BY(LIGHTS);

// 벽마다 추천 조명 (따로 적지 않았으면 추천 천장에서 정한다)
export function recOf(wallId) {
  const W = WALL_BY[wallId] || WALL_BY.ivory;
  const c = W.rec.ceil;
  const lum = (W.color >> 16 & 255) * 0.2126 + (W.color >> 8 & 255) * 0.7152 + (W.color & 255) * 0.0722;
  const light = W.rec.light || (['track', 'track-black'].includes(c) ? 'spot'
    : c === 'darkspots' ? 'theater' : c === 'stars' ? 'theater'
    : ['skylight', 'louver', 'sky', 'coffer-sky'].includes(c) ? 'daylight'
    : c === 'strip' ? 'even' : lum < 70 ? 'spot' : 'soft');
  return { ceil: c, floor: W.rec.floor, light };
}

// 예전 색깔 방 이름 → 벽
const LEGACY = {
  white: 'ivory', dark: 'charcoal', burgundy: 'burgundy', red: 'brick', orange: 'terracotta', yellow: 'mustard',
  green: 'forest', blue: 'cobalt', navy: 'navy', purple: 'plum',
  cove: 'charcoal', water: 'charcoal', salon: 'burgundy', conservatory: 'ivory', oakgallery: 'ivory', hall: 'cream', cube: 'gallery', fold: 'paper', lounge: 'ivory',
};

// 방의 실제 스타일 (빈칸은 추천으로 채움)
export function styleOf(room) {
  const s = (room && room.style) || {};
  const wall = WALL_BY[s.wall] ? s.wall : (LEGACY[room && room.theme] || 'ivory');
  const W = WALL_BY[wall];
  return {
    wall,
    ceil: CEIL_BY[s.ceil] ? s.ceil : W.rec.ceil,
    floor: FLOOR_BY[s.floor] ? s.floor : W.rec.floor,
    ceilAuto: !CEIL_BY[s.ceil], floorAuto: !FLOOR_BY[s.floor],
    light: LIGHT_BY[s.light] ? s.light : 'soft', // 예전 방은 지금까지처럼 은은한 빛
  };
}

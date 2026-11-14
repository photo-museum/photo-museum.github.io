// 글씨체. 벽에 적히는 글(전시 소개, 방 안내벽, 사진 설명)과 홈 카드 제목에 쓴다.
// 전시실마다 고를 수 있고, 방은 따로 고르지 않으면 전시실 글씨를 따른다.
// 기본 G(디필레이아)와 C(함렛)는 index.html 에서 Google Fonts 로 미리 부르고,
// 나머지는 고른 것만 그때 내려받는다 (한글 글씨 파일은 1~4MB 라 미리 다 받지 않는다).
// 고르는 칸의 미리보기는 assets/fonts/<id>.png 그림이라 내려받지 않아도 보인다.

export const DEFAULT_FONT = 'G';

const NOONNU = 'https://cdn.jsdelivr.net/gh/';
export const FONT_LIST = [
  { id: 'G', name: '디필레이아', family: 'Diphylleia', google: true },
  { id: 'C', name: '함렛', family: 'Hahmlet', google: true, title: 300, text: 300, strong: 500 },
  { id: 'M', name: '르네상스 비밀', family: 'pm-M', url: NOONNU + 'projectnoonnu/noonfonts_2312-1@1.1/OG_Renaissance_Secret-Rg.woff2' },
  { id: 'N', name: '덕온공주체', family: 'pm-N', url: NOONNU + 'projectnoonnu/noonfonts_2205@1.0/DeogonPrincess.woff2' },
  { id: 'P', name: '마포꽃섬', family: 'pm-P', url: NOONNU + 'projectnoonnu/noonfonts_2001@1.1/MapoFlowerIslandA.woff' },
  { id: 'Q', name: '송암 이형식체', family: 'pm-Q', url: NOONNU + 'projectnoonnu/2604-1@1.0/SongamIhyeongsik-Regular.woff2' },
  { id: 'R', name: '송글손글 흘림체', family: 'pm-R', url: NOONNU + 'Project-Noonnu/2607161334@x-3/x/GriunXHangeul_SongleSongeulHeullim-Rg.woff2' },
  { id: 'S', name: '을유1945', family: 'pm-S', url: NOONNU + 'projectnoonnu/noonfonts_2102-01@1.0/Eulyoo1945-Regular.woff' },
  { id: 'T', name: '스텔라체', family: 'pm-T', url: NOONNU + 'Project-Noonnu/2608201622@stellar-serif/stellar-serif/Stellar_Serif_Bold_Condensed.woff2' },
  { id: 'U', name: '연천 허목체', family: 'pm-U', url: NOONNU + 'Project-Noonnu/2608201852@cts5114-font02/cts5114-font02/cts5114_font02.woff2' },
  { id: 'V', name: '균명조', family: 'pm-V', url: NOONNU + 'Project-Noonnu/2611080026@gyunmyeongjo-regular/gyunmyeongjo-regular/GyunMyeongjo-Regular.woff2' },
];
const BY_ID = Object.fromEntries(FONT_LIST.map(f => [f.id, f]));
const FALLBACK = '"Apple SD Gothic Neo", serif';

export function fontInfo(id) { return BY_ID[id] || BY_ID[DEFAULT_FONT]; }
export function fontFamily(id) { return `"${fontInfo(id).family}", ${FALLBACK}`; }

// 캔버스용 글씨 지정 문자열
export function fontsFor(id) {
  const f = fontInfo(id);
  const fam = fontFamily(id);
  const w = (k) => f[k] || 400;
  return {
    title: px => `${w('title')} ${px}px ${fam}`,   // 전시 이름, 방 이름
    strong: px => `${w('strong')} ${px}px ${fam}`, // 사진 설명 첫 줄
    text: px => `${w('text')} ${px}px ${fam}`,     // 설명 글
    mark: px => `${w('text')} ${px}px ${fam}`,     // photo-museum, ROOM 01
  };
}
export const FONTS = fontsFor(DEFAULT_FONT);

const loading = new Map(); // id -> Promise<boolean>
const ready = new Set();

export function isFontReady(id) { return ready.has(fontInfo(id).id); }

// 글씨 파일을 내려받아 쓸 수 있게 한다. 실패하면 false (기본 글씨로 보인다).
export function ensureFont(id, timeout = 8000) {
  const f = fontInfo(id);
  if (ready.has(f.id)) return Promise.resolve(true);
  if (loading.has(f.id)) return loading.get(f.id);
  let pr;
  if (f.google) {
    const specs = [fontsFor(f.id).title(40), fontsFor(f.id).text(40), fontsFor(f.id).strong(40)];
    pr = Promise.all(specs.map(s => document.fonts.load(s, '가나다 ROOM'))).then(r => r.some(x => x.length));
  } else {
    const face = new FontFace(f.family, `url("${f.url}")`, { display: 'swap' });
    pr = face.load().then(ff => { document.fonts.add(ff); return true; });
  }
  pr = Promise.race([pr, new Promise(r => setTimeout(() => r(false), timeout))])
    .catch(() => false)
    .then(ok => { if (ok) ready.add(f.id); else loading.delete(f.id); return ok; });
  loading.set(f.id, pr);
  return pr;
}

// 처음 열 때: 기본 글씨만 기다린다
export function loadFonts(timeout = 2500) {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  return Promise.race([Promise.all([ensureFont(DEFAULT_FONT), ensureFont('C')]), new Promise(r => setTimeout(r, timeout))]);
}

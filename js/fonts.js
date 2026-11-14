// 글씨체. 벽에 적히는 글(전시 제목, 방 안내, 사진 설명)과 제목에 쓴다.
// 바꾸려면 여기, index.html 의 Google Fonts 링크, css/style.css 의 --display/--latin 만 고치면 된다.
// 지금: 시안 C · 함렛(Hahmlet) 가는 굵기
const FAMILY = '"Hahmlet", "Apple SD Gothic Neo", serif';

export const FONTS = {
  title: px => `300 ${px}px ${FAMILY}`,   // 전시 이름, 방 이름
  strong: px => `500 ${px}px ${FAMILY}`,  // 사진 설명 첫 줄
  text: px => `300 ${px}px ${FAMILY}`,    // 설명 글
  mark: px => `300 ${px}px ${FAMILY}`,    // photo-museum, Room 01 같은 작은 영문
};

// 캔버스에 그리기 전에 글씨체가 다 내려와 있어야 한다. 느리면 기다리지 않고 기본 글씨로.
export function loadFonts(timeout = 2500) {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const want = [FONTS.title(40), FONTS.strong(40), FONTS.text(20)];
  const all = Promise.all(want.map(f => document.fonts.load(f, '가나다 ROOM').catch(() => {})));
  return Promise.race([all, new Promise(r => setTimeout(r, timeout))]);
}

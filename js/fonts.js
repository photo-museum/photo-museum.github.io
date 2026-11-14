// 글씨체. 벽에 적히는 글(전시 제목, 방 안내, 사진 설명)과 제목에 쓴다.
// 고른 시안을 바꾸려면 여기와 index.html 의 Google Fonts 링크만 고치면 된다.
export const FONTS = {
  display: '"Gowun Batang", "Apple SD Gothic Neo", serif',   // 제목
  latin: '"Cormorant Garamond", "Gowun Batang", serif',      // 영문 장식 (ROOM 01 등)
  body: '"Gowun Batang", "Apple SD Gothic Neo", serif',      // 설명 글
};

// 캔버스에 그리기 전에 글씨체가 다 내려와 있어야 한다. 느리면 기다리지 않고 기본 글씨로.
export function loadFonts(timeout = 2500) {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const want = [
    `400 40px ${FONTS.display}`, `700 40px ${FONTS.display}`,
    `400 40px ${FONTS.latin}`, `italic 400 40px ${FONTS.latin}`, `400 20px ${FONTS.body}`,
  ];
  const all = Promise.all(want.map(f => document.fonts.load(f, '가나다 ROOM').catch(() => {})));
  return Promise.race([all, new Promise(r => setTimeout(r, timeout))]);
}

// 사용법 둘러보기의 단계들. 단계마다 안내 글(text)과 직접 해 볼 일(task), 해냈는지 보는 done().
// a: main.js 가 건네는 것들 { isTouch, controls, museumScene, map, editor, stylePanel, gb, stats, sheetOpen(), editMode }
// 글 쓰는 법: 한 단계에 한 가지만. 한 줄에 한 가지만, 짧게 (<br> 로 줄 나눔). 앞 단계에서 알려 준 것은 다시 말하지 않는다.
// 차례: 걷기 → 사진 보기 → 확대 → 편집(사진 고치기 → 세 버튼) → 지도(열기 → 사진 옮기기 → 방 옮기기 → 방 ✎) → 출구
import { viewingSpot } from './layout.js';

function atViewingSpot(a) {
  if (a.controls.auto) return false;
  for (const r of a.museumScene.layout || []) for (const p of r.panels) {
    const v = viewingSpot(p);
    if (Math.hypot(v.x - a.controls.pos.x, v.z - a.controls.pos.z) < 0.4) return true;
  }
  return false;
}

export function tutorialSteps(a) {
  const seen = {};
  const editorOpen = () => a.editor.classList.contains('open');
  const styleOpen = () => a.stylePanel.classList.contains('open');
  const walk = a.isTouch ? '왼쪽 아래 <b>조이스틱</b>' : '<b>W A S D</b>(또는 방향키)';
  const look = a.isTouch ? '화면을 끌면' : '마우스로 끌면';
  return [
    // 1
    { title: '어서 오세요', text: '<b>제주 여행 예시 전시실</b>에서 사용법을 익혀요.<br>정면 벽에 전시 이름과 설명이 적혀 있어요.' },
    // 2 걷기
    { title: '걸어서 들어가기', text: `<b>바닥을 톡</b> 누르면 그 자리로 걸어가요.<br>${walk}로도 걸을 수 있어요.<br>${look} 주위를 둘러봐요.`,
      task: '오른쪽 문을 지나 <b>ROOM 01</b>로 들어가 보세요', done: () => a.museumScene.roomIndexAt(a.controls.pos.z) >= 0 },
    // 3 사진 보기
    { title: '방 소개와 사진', text: '들어서면 <b>왼쪽 벽</b>에 방 이름과 소개가 있어요.<br><b>사진을 톡</b> 누르면 그 앞으로 걸어가요.',
      task: '아무 사진이나 <b>톡</b> 눌러 그 앞에 서 보세요', done: () => atViewingSpot(a) },
    // 4 확대: 두 가지를 모두 해 봐야 넘어간다 (꾹 누르기·오른쪽 버튼 = zoomHold, 벌리기·휠 = 그 밖의 확대)
    { title: '확대해서 보기', text: a.isTouch
        ? '확대하는 방법은 두 가지예요.<br>· 화면을 <b>꾹 누르기</b><br>· 두 손가락 <b>벌리기</b><br>손을 떼면 원래대로 돌아와요.'
        : '확대하는 방법은 두 가지예요.<br>· <b>오른쪽 버튼</b>을 누르고 있기<br>· <b>휠</b> 굴리기',
      task: a.isTouch ? '두 가지 다 해 보세요<br>① <b>꾹 눌러</b> 확대했다 놓기<br>② 두 손가락을 <b>벌려</b> 확대했다 놓기'
        : '두 가지 다 해 보세요<br>① <b>오른쪽 버튼</b>을 눌러 확대했다 놓기<br>② <b>휠</b>로 확대했다 되돌리기',
      done: () => {
        if (a.controls.zoom > 1.6) { if (a.controls.zoomHold) seen.hold = true; else seen.pinch = true; }
        return seen.hold && seen.pinch && a.controls.zoom < 1.05;
      } },
    // 5 편집: 사진 고치기
    { title: '편집 모드', text: '모드는 <b>관람</b>과 <b>편집</b> 두 가지예요.<br>고칠 때는 오른쪽 아래 <b>편집</b>을 켜요.<br>사진을 누르면 메뉴가, 벽의 글을 누르면 글 고치기가 열려요.',
      task: '<b>편집</b>을 켜고 사진을 눌러 메뉴를 훑어본 뒤 <b>닫기</b>를 눌러요',
      done: () => { if (a.sheetOpen()) seen.sheet = true; return seen.sheet && !a.sheetOpen(); }, onEnter: () => { seen.sheet = false; } },
    // 6 편집: 위에 뜨는 세 버튼
    { title: '사진 넣기 · 방 꾸미기 · 방 만들기', text: '편집 중에는 버튼 세 개가 위에 떠 있어요.<br>· <b>사진 넣기</b>: 지금 방에 사진 걸기<br>· <b>방 꾸미기</b>: 흰 방 / 어두운 방<br>· <b>방 만들기</b>: 끝에 새 방',
      task: '<b>방 꾸미기</b>를 열어 보고 <b>✕</b>로 닫은 뒤, <b>관람</b>을 눌러 돌아가요',
      done: () => { if (styleOpen()) seen.style = true; return seen.style && !styleOpen() && !a.editMode; },
      onEnter: () => { seen.style = false; } },
    // 7 지도 열기
    { title: '전시장 지도', text: '오른쪽 위 <b>작은 지도</b>를 누르면 전시장 전체가 보여요.<br>방을 누르면 그 방으로 바로 가요.',
      task: '오른쪽 위 <b>작은 지도</b>를 눌러 보세요', done: () => a.map.isOpen && !a.sheetOpen() },
    // 8 지도: 사진 옮기기
    { title: '사진 자리 바꾸기', text: '지도에서 사진을 <b>꾹 눌러</b> 옮길 수 있어요.<br>· 다른 사진 <b>위</b>에 놓으면 자리 바꾸기<br>· 사진 <b>사이</b>에 놓으면 끼워 넣기',
      task: '사진을 꾹 눌러 다른 사진 위에 놓아 보세요', done: () => a.stats.swaps > seen.swaps0, onEnter: () => { seen.swaps0 = a.stats.swaps; } },
    // 9 지도: 방 옮기기
    { title: '방 순서 바꾸기', text: '지도를 <b>축소</b>하면 방만 보여요.<br>그때 방을 <b>꾹 눌러 끌면</b> 순서가 바뀌어요.',
      task: a.isTouch ? '<b>−</b>(또는 두 손가락 오므리기)로 <b>축소</b>한 뒤, 방을 <b>꾹 눌러</b> 옮겨 보세요' : '<b>−</b>(또는 휠)로 <b>축소</b>한 뒤, 방을 끌어 옮겨 보세요',
      done: () => (a.stats.reorders || 0) > seen.r0, onEnter: () => { seen.r0 = a.stats.reorders || 0; } },
    // 10 지도: 방 ✎
    { title: '방 이름과 글씨체', text: '지도를 다시 <b>확대(+)</b>하면 방 오른쪽 위에 <b>✎</b>가 보여요.<br>✎를 누르면 그 방의 메뉴가 펼쳐져요.<br><b>이름·설명</b>에서 벽에 적힐 글과 글씨체를 고쳐요.',
      task: '<b>+</b>로 확대 → 방의 <b>✎</b> → <b>이름·설명</b> → 글씨체 고르고 <b>저장</b>',
      editorTip: '맨 아래 <b>글씨체</b>를 고르고 <b>저장</b>해 보세요.',
      done: () => { if (editorOpen()) seen.ed = true; return seen.ed && !editorOpen(); }, onEnter: () => { seen.ed = false; } },
    // 11 출구
    { title: '출구와 방명록', text: '마지막 방 다음은 <b>출구</b>예요.<br>방명록 책상을 누르면 한마디를 남길 수 있어요.<br><b>출구 문</b>으로 걸어가면 홈으로 나가요.',
      task: '지도의 <b>출구</b>를 누른 뒤 <b>방명록 책상</b>을 눌러 보세요. 다 보면 <b>닫기</b>',
      done: () => { if (a.gb.classList.contains('open')) seen.gb = true; return seen.gb && !a.gb.classList.contains('open'); },
      onEnter: () => { seen.gb = false; } },
    // 12
    { title: '다 됐어요 ✦', text: '왼쪽 위 <b>‹</b>(홈)에서 내 전시실을 만들어 보세요.<br>이 예시 전시실은 홈에서 지울 수 있어요.<br><b>사용법 둘러보기</b>는 언제든 다시 볼 수 있어요.' },
  ];
}

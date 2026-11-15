// 사용법 둘러보기의 단계들. 단계마다 안내 글(text)과 직접 해 볼 일(task), 해냈는지 보는 done().
// a: main.js 가 건네는 것들 { isTouch, controls, museumScene, map, editor, stylePanel, gb, stats, sheetOpen(), editMode }
// 글 쓰는 법: 한 단계에 한 가지만. 한 줄에 한 가지만, 짧게 (<br> 로 줄 나눔). 앞 단계에서 알려 준 것은 다시 말하지 않는다.
// 두 가지 방법이 있는 것(걷기·확대)은 한 단계에 하나씩 따로 시킨다.
// 차례: 걷기(톡 → 조이스틱) → 사진 보기 → 이전·다음 → 확대(꾹 → 벌리기) → 편집(사진 고치기 → 세 버튼) → 지도(열기 → 사진 옮기기 → 방 옮기기 → 방 ✎) → 출구
import { viewingSpot, R2 } from './layout.js'; // R2 = 정식 구조(벽 따라 한 바퀴 + 세로 지도). 예전 구조(old/)에서는 글이 조금 다르다

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
    // 인사
    { title: '어서 오세요', text: '<b>제주 여행 예시 전시실</b>에서 사용법을 익혀요.<br>정면 벽에 전시 이름과 설명이 적혀 있어요.' },
    // 걷기 ①: 톡 눌러서
    { guest: true, title: '톡 눌러 걷기', text: '<b>바닥을 톡</b> 누르면 그 자리로 걸어가요.',
      task: '<b>바닥을 톡</b> 눌러 걸어가 보세요',
      done: () => { if (a.controls.auto) seen.tap = true; return seen.tap && !a.controls.auto; }, onEnter: () => { seen.tap = false; } },
    // 걷기 ②: 조이스틱(키보드)으로
    { guest: true, title: a.isTouch ? '조이스틱으로 걷기' : '키보드로 걷기', text: `${walk}로도 걸을 수 있어요.<br>${look} 주위를 둘러봐요.`,
      task: `${walk}으로 오른쪽 문을 지나 <b>ROOM 01</b>로 들어가 보세요`,
      done: () => {
        if (Math.hypot(a.controls.joy.x, a.controls.joy.y) > 0.2 || a.controls.keys.size) seen.joy = (seen.joy || 0) + 1;
        return seen.joy > 30 && a.museumScene.roomIndexAt(a.controls.pos.z) >= 0;
      }, onEnter: () => { seen.joy = 0; } },
    // 사진 보기
    { guest: true, title: '방 소개와 사진', text: R2 ? '문 바로 옆 <b>오른쪽 벽</b>에 방 이름과 소개가 있어요.<br>사진은 벽을 따라 <b>한 바퀴</b> 도는 순서로 걸려 있어요.<br><b>사진을 톡</b> 누르면 그 앞으로 걸어가요.'
        : '들어서면 <b>왼쪽 벽</b>에 방 이름과 소개가 있어요.<br><b>사진을 톡</b> 누르면 그 앞으로 걸어가요.',
      task: '아무 사진이나 <b>톡</b> 눌러 그 앞에 서 보세요', done: () => atViewingSpot(a) },
    // 이전 · 다음 버튼
    { guest: true, title: '이전 · 다음', text: '화면 양옆의 <b>‹ 이전</b> / <b>다음 ›</b>을 누르면 다음 사진 앞으로 가요.<br>연달아 눌러 빨리 넘길 수 있어요.',
      task: '<b>다음 ›</b>을 두 번 눌러 보세요', done: () => (a.stats.navs || 0) >= seen.nav0 + 2, onEnter: () => { seen.nav0 = a.stats.navs || 0; } },
    // 확대 ①: 꾹 누르기 (컴퓨터: 오른쪽 버튼). 어느 방법으로 확대했는지는 controls.zoomBy
    { guest: true, title: '확대 ① 꾹 누르기', text: a.isTouch ? '화면을 <b>꾹 누르면</b> 그곳이 커져요.<br>손을 떼면 원래대로 돌아와요.' : '<b>오른쪽 버튼</b>을 누르고 있으면 그곳이 커져요.<br>놓으면 원래대로 돌아와요.',
      task: a.isTouch ? '화면을 <b>꾹 눌러</b> 확대했다가 놓아 보세요' : '<b>오른쪽 버튼</b>을 눌러 확대했다가 놓아 보세요',
      done: () => { if (a.controls.zoom > 1.6 && a.controls.zoomBy === 'hold') seen.hold = true; return seen.hold && a.controls.zoom < 1.05; }, onEnter: () => { seen.hold = false; } },
    // 확대 ②: 벌리기 (컴퓨터: 휠)
    { guest: true, title: a.isTouch ? '확대 ② 두 손가락 벌리기' : '확대 ② 휠', text: a.isTouch ? '두 손가락을 <b>벌려도</b> 확대돼요.' : '<b>휠</b>을 굴려도 확대돼요.',
      task: a.isTouch ? '두 손가락을 <b>벌려</b> 확대했다가 놓아 보세요' : '<b>휠</b>로 확대했다가 되돌려 보세요',
      done: () => { if (a.controls.zoom > 1.6 && a.controls.zoomBy === 'pinch') seen.pinch = true; return seen.pinch && a.controls.zoom < 1.05; }, onEnter: () => { seen.pinch = false; } },
    // 편집 ①: 사진 고치기
    { title: '편집 모드', text: '모드는 <b>관람</b>과 <b>편집</b> 두 가지예요.<br>고칠 때는 오른쪽 아래 <b>편집</b>을 켜요.<br>사진을 누르면 메뉴가, 벽의 글을 누르면 글 고치기가 열려요.',
      task: '<b>편집</b>을 켜고 사진을 눌러 메뉴를 훑어본 뒤 <b>닫기</b>를 눌러요',
      done: () => { if (a.sheetOpen()) seen.sheet = true; return seen.sheet && !a.sheetOpen(); }, onEnter: () => { seen.sheet = false; } },
    // 편집 ②: 위에 뜨는 세 버튼
    { title: '편집 버튼 네 개', text: '편집 중에는 버튼 네 개가 위에 떠 있어요.<br>· <b>사진 넣기</b>: 지금 방에 사진 걸기<br>· <b>방 꾸미기</b>: 흰 방 / 어두운 방<br>· <b>방 만들기</b>: 끝에 새 방<br>· <b>설명 쓰기</b>: 사진 설명을 한꺼번에',
      task: '<b>방 꾸미기</b>를 열어 보고 <b>✕</b>로 닫은 뒤, <b>관람</b>을 눌러 돌아가요',
      done: () => { if (styleOpen()) seen.style = true; return seen.style && !styleOpen() && !a.editMode; },
      onEnter: () => { seen.style = false; } },
    // 지도 ①: 열기
    { title: '전시장 지도', text: R2 ? '오른쪽 위 <b>작은 지도</b>를 누르면 전시장 전체가 보여요.<br>방이 위에서 아래로, 사진은 보는 순서대로 놓여 있어요.<br>방 이름을 누르면 그 방으로 바로 가요.'
        : '오른쪽 위 <b>작은 지도</b>를 누르면 전시장 전체가 보여요.<br>방을 누르면 그 방으로 바로 가요.',
      task: '오른쪽 위 <b>작은 지도</b>를 눌러 보세요', done: () => a.map.isOpen && !a.sheetOpen() },
    // 지도 ②: 사진 자리 바꾸기 (다른 사진 위에 놓기)
    { title: '사진 옮기기 ① 자리 바꾸기', text: '지도에서 사진을 <b>꾹 눌러</b> 끌 수 있어요.<br>다른 사진 <b>위</b>에 놓으면 두 사진의 자리가 바뀌어요.',
      task: '사진을 꾹 눌러 다른 사진 <b>위</b>에 놓아 보세요', done: () => a.stats.swaps > seen.swaps0, onEnter: () => { seen.swaps0 = a.stats.swaps; } },
    // 지도 ②-2: 사진 끼워 넣기 (사진과 사진 사이에 놓기)
    { title: '사진 옮기기 ② 끼워 넣기', text: '사진과 사진 <b>사이</b>에 놓으면 그 자리에 끼워져요.<br>사이에 빨간 줄이 보일 때 놓으세요.',
      task: '사진을 꾹 눌러 다른 사진들 <b>사이</b>에 놓아 보세요', done: () => (a.stats.inserts || 0) > seen.ins0, onEnter: () => { seen.ins0 = a.stats.inserts || 0; } },
    // 지도 ③: 방 옮기기
    { title: '방 순서 바꾸기', text: R2 ? '방 이름 왼쪽의 <b>≡</b>를 잡고 위아래로 끌면 방 순서가 바뀌어요.<br>오른쪽 <b>⌄</b>는 그 방의 사진을 접어 둬요.' : '지도를 <b>축소</b>하면 방만 보여요.<br>그때 방을 <b>꾹 눌러 끌면</b> 순서가 바뀌어요.',
      task: R2 ? '방 이름 왼쪽 <b>≡</b>를 잡고 다른 방 위나 아래로 끌어 보세요' : a.isTouch ? '<b>−</b>(또는 두 손가락 오므리기)로 <b>축소</b>한 뒤, 방을 <b>꾹 눌러</b> 옮겨 보세요' : '<b>−</b>(또는 휠)로 <b>축소</b>한 뒤, 방을 끌어 옮겨 보세요',
      done: () => (a.stats.reorders || 0) > seen.r0, onEnter: () => { seen.r0 = a.stats.reorders || 0; } },
    // 지도 ④: 방 ✎
    { title: '방 이름과 글씨체', text: R2 ? '방 이름 줄 오른쪽 끝의 <b>✎</b>를 누르면 그 방의 메뉴가 펼쳐져요.<br><b>이름·설명</b>에서 벽에 적힐 글과 글씨체를 고쳐요.'
        : '지도를 다시 <b>확대(+)</b>하면 방 오른쪽 위에 <b>✎</b>가 보여요.<br>✎를 누르면 그 방의 메뉴가 펼쳐져요.<br><b>이름·설명</b>에서 벽에 적힐 글과 글씨체를 고쳐요.',
      task: R2 ? '방의 <b>✎</b> → <b>이름·설명</b> → 글씨체 고르고 <b>저장</b>' : '<b>+</b>로 확대 → 방의 <b>✎</b> → <b>이름·설명</b> → 글씨체 고르고 <b>저장</b>',
      editorTip: '맨 아래 <b>글씨체</b>를 고르고 <b>저장</b>해 보세요.',
      done: () => { if (editorOpen()) seen.ed = true; return seen.ed && !editorOpen(); }, onEnter: () => { seen.ed = false; } },
    // 출구 ①: 방명록
    { title: '방명록', text: '마지막 방 다음은 <b>출구</b>예요.<br>방명록 책상을 누르면 한마디를 남길 수 있어요.',
      task: '지도의 <b>출구</b>를 누른 뒤 <b>방명록 책상</b>을 눌러 보세요. 다 보면 <b>닫기</b>',
      done: () => { if (a.gb.classList.contains('open')) seen.gb = true; return seen.gb && !a.gb.classList.contains('open'); },
      onEnter: () => { seen.gb = false; } },
    // 출구 ②: 문으로 걸어 나가기 (홈이 열리면 main.js 가 안내를 끝낸다)
    { title: '다 됐어요 ✦ 출구로 나가기', text: '<b>출구 문</b>으로 걸어가면 홈으로 나갈 수 있어요.<br>홈에서 내 전시실을 만들어 보세요.<br><b>사용법 둘러보기</b>는 홈에서 언제든 다시 볼 수 있어요.',
      task: '초록 <b>출구 문</b>으로 걸어가 <b>홈으로 나가기</b>를 눌러요', done: () => false },
  ];
}

// 초대받은 손님용: 둘러보는 법만 (걷기 · 사진 보기 · 이전/다음 · 확대). 고치는 법은 뺀다.
export function guestSteps(a, title) {
  return [
    { title: '어서 오세요', text: `<b>${title}</b> 전시에 초대받으셨어요.<br>둘러보는 방법을 잠깐 익혀 볼게요.` },
    ...tutorialSteps(a).filter(s => s.guest),
    { title: '이제 둘러보세요 ✦', text: '사진은 벽을 따라 순서대로 걸려 있어요.<br>마지막 방을 지나면 <b>출구</b>에 방명록이 있어요.<br>한마디 남겨 주시면 전시를 연 분이 볼 수 있어요.' },
  ];
}

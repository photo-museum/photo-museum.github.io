// 사용법 둘러보기의 단계들. 단계마다 안내 글(text)과 직접 해 볼 일(task), 해냈는지 보는 done().
// a: main.js 가 건네는 것들 { isTouch, controls, museumScene, map, editor, stylePanel, gb, stats, sheetOpen() }
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
  const walk = a.isTouch ? '왼쪽 아래 <b>조이스틱</b>' : '<b>W A S D</b>(또는 방향키)';
  const look = a.isTouch ? '화면을 손가락으로 끌면' : '마우스로 끌면';
  return [
    { title: '어서 오세요', text: '사용법을 함께 둘러봐요. 이곳은 <b>제주 여행 예시 전시실</b>이에요.<br>입구 정면 벽에 전시 이름과 설명이 적혀 있어요. 미술관처럼 먼저 읽고 들어가요.' },
    { title: '걸어서 들어가기', text: `<b>바닥을 톡</b> 누르면 그 자리로 걸어가요. ${walk}로 걸어도 돼요. ${look} 둘러볼 수 있고요.<br>오른쪽 문을 지나 <b>ROOM 01</b>로 들어가 보세요.`,
      task: '오른쪽 문을 지나 <b>ROOM 01</b>로 들어가 보세요', done: () => a.museumScene.roomIndexAt(a.controls.pos.z) >= 0 },
    { title: '방 소개와 사진', text: '방에 들어서면 <b>왼쪽 벽</b>에 이 방의 이름과 소개가 적혀 있어요.<br><b>사진을 톡</b> 누르면 그 사진 앞으로 걸어가 서요.',
      task: '아무 사진이나 <b>톡</b> 눌러 그 앞에 서 보세요', done: () => atViewingSpot(a) },
    { title: '잠깐 확대해서 보기', text: a.isTouch
        ? '화면을 <b>꾹 누르고 있거나</b> 두 손가락을 <b>벌리면</b> 그 자리가 확대돼요. 누른 채로 움직이면 확대한 곳을 옮길 수 있어요. 사진 옆 설명 글씨도 또렷하게 볼 수 있어요. 손을 떼면 원래대로 돌아와요.'
        : '<b>휠</b>을 굴리거나 <b>오른쪽 버튼</b>을 누르고 있으면 그 자리가 확대돼요. 사진 옆 설명 글씨도 또렷하게 볼 수 있어요.',
      task: a.isTouch ? '화면을 꾹 눌러(또는 두 손가락을 벌려) 확대했다가 놓아 보세요' : '휠이나 오른쪽 버튼으로 확대했다가 놓아 보세요',
      done: () => { if (a.controls.zoom > 1.6) seen.zoom = true; return seen.zoom && a.controls.zoom < 1.05; } },
    { title: '편집 모드', text: '고칠 때는 오른쪽 아래 <b>편집</b>을 켜요. 켜져 있는 동안 사진을 누르면 메뉴(90° 돌리기, 설명 쓰기, 사진 바꾸기, 내리기)가 나오고, 벽의 글을 누르면 고칠 수 있어요. 다 고쳤으면 <b>관람</b>을 눌러 돌아가요.',
      task: '<b>편집</b>을 켜고 사진을 눌러 보세요', done: () => a.sheetOpen() },
    { title: '전시장 지도', text: '메뉴는 바깥을 누르면 닫혀요.<br>오른쪽 위의 <b>작은 지도</b>를 누르면 전시장 전체가 한눈에 보여요.',
      task: '오른쪽 위 <b>작은 지도</b>를 눌러 보세요', done: () => a.map.isOpen && !a.sheetOpen() },
    { title: '사진 자리 바꾸기', text: '지도에서 방을 누르면 그 방으로 바로 가요.<br>사진을 <b>꾹 눌러</b> 다른 사진 위에 놓으면 두 사진의 자리가 바뀌고, 사진과 사진 <b>사이</b>에 놓으면 그 사이에 끼워져요. 다른 방으로도 돼요.',
      task: '사진을 꾹 눌러 다른 사진 위에 놓아 보세요', done: () => a.stats.swaps > seen.swaps0, onEnter: () => { seen.swaps0 = a.stats.swaps; } },
    { title: '방 순서 바꾸기', text: '지도를 <b>축소</b>하면 사진은 숨고 방만 보여요. 그때 방을 <b>꾹 눌러 끌면</b> 다른 방 사이에 끼워 넣을 수 있어요. 다시 <b>확대</b>하면 사진이 보여요.',
      task: a.isTouch ? '지도를 <b>축소</b>해서(두 손가락 오므리기 또는 <b>−</b>) 방만 보이게 한 뒤, 방을 <b>꾹 눌러</b> 다른 자리로 옮겨 보세요' : '<b>−</b>(또는 휠)로 <b>축소</b>해서 방만 보이게 한 뒤, 방을 끌어 다른 자리로 옮겨 보세요',
      done: () => (a.stats.reorders || 0) > seen.r0, onEnter: () => { seen.r0 = a.stats.reorders || 0; } },
    { title: '방 이름과 글씨체', text: '방 오른쪽 위 <b>✎</b>를 누르면 그 방 아이콘들이 펼쳐져요. <b>이름·설명</b>을 누르면 안내벽에 적힐 글을 고칠 수 있어요.<br>창 맨 아래에서 <b>글씨체</b>도 골라 보세요. 저장하면 그 방 글씨가 바뀌어요.',
      task: '방 오른쪽 위 <b>✎</b> → <b>이름·설명</b> → 글씨체 고르고 <b>저장</b>',
      editorTip: '맨 아래 <b>글씨체</b>에서 마음에 드는 글씨를 고르고 <b>저장</b>해 보세요.',
      done: () => { if (editorOpen()) seen.ed = true; return seen.ed && !editorOpen(); } },
    { title: '나만의 전시 꾸미기', text: '지도를 닫으면(✕) 오른쪽 아래에 <b>관람</b>과 <b>편집</b>이 있어요.<br><b>관람</b>은 둘러보는 모드, <b>편집</b>은 고치는 모드예요. 편집을 켜면 사진 넣기 · 방 꾸미기 · 방 만들기가 위로 올라와요.',
      task: '지도를 닫고 <b>편집</b>을 켠 뒤 <b>방 꾸미기</b>를 열어 보세요. 다 보면 <b>✕</b>로 닫아요',
      done: () => { if (a.stylePanel.classList.contains('open')) seen.style = true; return seen.style && !a.stylePanel.classList.contains('open') && !a.map.isOpen; },
      onEnter: () => { seen.style = false; } },
    { title: '출구와 방명록', text: '마지막 방 끝에는 <b>출구</b>가 있어요. 방명록 책상을 누르면 한마디를 남길 수 있고, 남긴 글은 벽에 쪽지로 붙어요. 초록 <b>출구</b> 문을 누르면 홈으로 나가요.',
      task: '지도에서 마지막 방으로 간 뒤, 출구의 <b>방명록 책상</b>을 눌러 보세요. 다 보면 <b>닫기</b>',
      done: () => { if (a.gb.classList.contains('open')) seen.gb = true; return seen.gb && !a.gb.classList.contains('open'); },
      onEnter: () => { seen.gb = false; } },
    { title: '다 됐어요 ✦', text: '이제 왼쪽 위 <b>‹</b> 버튼(홈)에서 나만의 전시실을 만들어 보세요.<br>이 예시 전시실은 홈에서 지울 수 있고, <b>사용법 둘러보기</b>로 언제든 다시 볼 수 있어요.' },
  ];
}


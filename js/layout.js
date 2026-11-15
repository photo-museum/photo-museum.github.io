// 전시 데이터 → 공간 배치 계산 (순수 함수, three.js 몰라도 됨)
// 맨 앞(z=0)에 입구 로비, 그 뒤로 방들이 -Z 방향으로 일렬로 이어진다. 방 사이에는 두께 WALL_T 인 벽과 문.
// 방마다 들어서자마자 왼쪽 옆벽(입구 가까운 쪽)에 방 이름과 설명이 적혀 있다. (홀로 선 안내벽은 없앰: 다음 방이 훤히 보이게)

export const ROOM_W = 7.0;      // 방 폭 (m)
export const ROOM_H = 5.2;      // 천장 높이 (4.2 → 5.2: 덜 답답하게)
export const WALL_T = 0.3;      // 방 사이 벽 두께
export const DOOR_W = 1.6;      // 문 폭
export const DOOR_H = 2.75;     // 문 높이
export const EYE_H = 1.6;       // 시선 높이
export const PANEL_CY = 1.5;    // 사진 판 중심 높이
export const PANEL_D = 0.035;   // 판 두께
export const PANEL_GAP = 0.05;  // 벽에서 떠 있는 거리
export const EDGE_GAP = 3.0;    // 같은 벽 판 사이 여백 (넉넉하게)
export const END_MARGIN = 2.6;  // 방 끝 벽에서 첫 판까지
export const STAGGER = 2.1;     // 오른쪽 벽은 이만큼 늦게 시작 (서로 엇갈리게)
export const MIN_LEN = 14;      // 최소 방 길이
export const LOBBY_L = 6.5;     // 입구 로비 길이
export const LOBBY_DOOR_X = 1.9; // 로비 정면 벽의 문 위치 (오른쪽). 왼쪽엔 전시 설명.
export const EXIT_L = 7.0;      // 출구 방 길이
export const INTRO_S = 2.3;     // 방 시작에서 방 소개 글 가운데까지 (왼쪽 옆벽을 따라)
export const INTRO_W = 3.5, INTRO_H = 2.45, INTRO_CY = 1.8; // 방 소개 글 크기와 가운데 높이
const START_MARGIN = 4.5;       // 방 시작에서 왼쪽 벽 첫 사진까지 (방 소개 글 다음)
const START_R = 2.6;            // 오른쪽 벽은 글이 없으니 일찍 시작

const PANEL_AREA = 1.92;
const MAX_W = 2.6, MAX_H = 1.75;

export function panelSize(aspect) {
  let w = Math.sqrt(PANEL_AREA * aspect);
  let h = Math.sqrt(PANEL_AREA / aspect);
  const k = Math.min(1, MAX_W / w, MAX_H / h);
  return { w: w * k, h: h * k };
}

// 화면에 보이는 비율. rot = 시계 방향 90도 몇 번 (0~3). 홀수면 가로세로가 바뀐다.
export function displayAspect(photo) {
  const r = ((photo.rot || 0) % 4 + 4) % 4;
  return r % 2 ? 1 / photo.aspect : photo.aspect;
}

export function layoutMuseum(museum) {
  const rooms = [];
  const lobby = {
    index: -1, id: 'lobby', lobby: true, theme: (museum.rooms[0] && museum.rooms[0].theme) || 'white', style: museum.lobbyStyle || (museum.rooms[0] && museum.rooms[0].style), /* 입구: 따로 정하지 않았으면 첫 방과 같은 스타일 */ font: museum.font || null, zStart: 0, zEnd: -LOBBY_L, length: LOBBY_L, panels: [],
    doorIn: false, doorOut: museum.rooms.length > 0, doorInX: 0, doorOutX: LOBBY_DOOR_X,
  };
  let z = -LOBBY_L - WALL_T;
  museum.rooms.forEach((room, ri) => {
    const walls = { L: [], R: [] };
    room.photos.forEach((photo, pi) => {
      // 왼쪽 벽 맨 앞은 방 소개 글 자리라, 첫 사진은 맞은편(오른쪽)부터: 글(왼) → 1(오) → 2(왼) → 3(오) …
      walls[pi % 2 === 0 ? 'R' : 'L'].push({ photo, index: pi, ...panelSize(displayAspect(photo)) });
    });
    // 벽마다 차례로 쌓기
    const place = (list, start) => {
      let s = start;
      for (const p of list) { p.s = s + p.w / 2; s += p.w + EDGE_GAP; }
      return list.length ? s - EDGE_GAP : start;
    };
    const endL = place(walls.L, START_MARGIN);
    const endR = place(walls.R, START_R);
    const content = Math.max(walls.L.length ? endL : 0, endR) + END_MARGIN;
    const length = Math.max(MIN_LEN, content);
    const shift = (length - content) / 2; // 방이 남으면 가운데로

    const zStart = z, zEnd = z - length;
    const panels = [];
    for (const side of ['L', 'R']) {
      for (const p of walls[side]) {
        const sx = side === 'L' ? -1 : 1;
        panels.push({
          photo: p.photo, index: p.index, wall: side,
          w: p.w, h: p.h,
          x: sx * (ROOM_W / 2 - PANEL_GAP - PANEL_D / 2),
          y: PANEL_CY,
          z: zStart - (p.s + shift),
          rotY: side === 'L' ? Math.PI / 2 : -Math.PI / 2, // 판이 방 안쪽을 보도록
          sAlong: p.s + shift, // 방 시작에서 거리
        });
      }
    }
    panels.sort((a, b) => a.index - b.index);
    rooms.push({
      index: ri, id: room.id, theme: room.theme || 'white', style: room.style, zStart, zEnd, length, panels,
      name: room.name || '', intro: room.intro || '',
      font: room.font || museum.font || null, // 방 글씨 > 전시실 글씨 > 기본
      doorIn: true,
      doorOut: true, // 마지막 방 뒤에는 출구 방
      doorInX: ri === 0 ? LOBBY_DOOR_X : 0, doorOutX: 0,
      // 방 소개 글: 왼쪽 옆벽, 감상 자리는 그 앞 2.7m
      introSpot: { x: -ROOM_W / 2 + 2.7, z: zStart - INTRO_S, yaw: Math.PI / 2 },
    });
    z = zEnd - WALL_T;
  });
  rooms.lobby = lobby;
  rooms.exit = {
    index: rooms.length, id: 'exit', exit: true, theme: (museum.rooms[museum.rooms.length - 1] || {}).theme || 'white', style: museum.exitStyle || (museum.rooms[museum.rooms.length - 1] || {}).style, /* 출구: 따로 정하지 않았으면 마지막 방과 같은 스타일 */ font: museum.font || null,
    zStart: z, zEnd: z - EXIT_L, length: EXIT_L, panels: [],
    doorIn: true, doorOut: false, doorInX: 0, doorOutX: 0,
  };
  return rooms;
}

// 사진 앞 감상 위치 (판에서 2.4m 떨어진 곳)
export function viewingSpot(panel, dist = 2.4) {
  const nx = panel.wall === 'L' ? 1 : -1;
  return { x: panel.x + nx * dist, z: panel.z, yaw: panel.wall === 'L' ? Math.PI / 2 : -Math.PI / 2 };
}

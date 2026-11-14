// 전시 데이터 → 공간 배치 계산 (순수 함수, three.js 몰라도 됨)
// 방은 -Z 방향으로 일렬로 이어진다. 방 사이에는 두께 WALL_T 인 벽과 문.

export const ROOM_W = 7.0;      // 방 폭 (m)
export const ROOM_H = 4.2;      // 천장 높이
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

const PANEL_AREA = 1.92;
const MAX_W = 2.6, MAX_H = 1.75;

export function panelSize(aspect) {
  let w = Math.sqrt(PANEL_AREA * aspect);
  let h = Math.sqrt(PANEL_AREA / aspect);
  const k = Math.min(1, MAX_W / w, MAX_H / h);
  return { w: w * k, h: h * k };
}

export function layoutMuseum(museum) {
  const rooms = [];
  let z = 0;
  museum.rooms.forEach((room, ri) => {
    const walls = { L: [], R: [] };
    room.photos.forEach((photo, pi) => {
      walls[pi % 2 === 0 ? 'L' : 'R'].push({ photo, index: pi, ...panelSize(photo.aspect) });
    });
    // 벽마다 차례로 쌓기
    const place = (list, start) => {
      let s = start;
      for (const p of list) { p.s = s + p.w / 2; s += p.w + EDGE_GAP; }
      return list.length ? s - EDGE_GAP : start;
    };
    const endL = place(walls.L, END_MARGIN);
    const endR = place(walls.R, END_MARGIN + STAGGER);
    const content = Math.max(endL, walls.R.length ? endR : 0) + END_MARGIN;
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
      index: ri, id: room.id, theme: room.theme || 'dark', zStart, zEnd, length, panels,
      doorIn: ri > 0,
      doorOut: ri < museum.rooms.length - 1,
    });
    z = zEnd - WALL_T;
  });
  return rooms;
}

// 사진 앞 감상 위치 (판에서 2.4m 떨어진 곳)
export function viewingSpot(panel, dist = 2.4) {
  const nx = panel.wall === 'L' ? 1 : -1;
  return { x: panel.x + nx * dist, z: panel.z, yaw: panel.wall === 'L' ? Math.PI / 2 : -Math.PI / 2 };
}

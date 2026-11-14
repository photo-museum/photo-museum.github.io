// 걷기: 키보드+마우스(컴퓨터), 조이스틱+드래그(휴대폰)
// 걷는 느낌을 위해 속도/시선은 바로 바뀌지 않고 부드럽게 따라간다.
import { EYE_H } from './layout.js';

const WALK = 1.9;       // m/s  미술관에서 걷는 속도
const FAST = 3.4;       // 달리기: Shift, 또는 조이스틱을 끝까지 밀 때
const RUN_FROM = 0.8;   // 조이스틱을 이만큼 넘게 밀면 달리기 시작
const ACCEL = 5.0;      // 속도가 목표에 다가가는 빠르기
const LOOK_DAMP = 18;   // 시선이 따라가는 빠르기
const RADIUS = 0.35;    // 몸 반지름 (벽과 거리)
const STEP_LEN = 0.72;  // 한 걸음 (m)
const BOB_Y = 0.014;    // 위아래 흔들림 (m)
const BOB_X = 0.008;    // 좌우 흔들림
const ZOOM_MAX = 5;     // 최대 확대
const ZOOM_BACK = 12;   // 손을 떼면 원래대로 돌아오는 빠르기

export class WalkControls {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.pos = { x: 0, z: -1.5 };
    this.vel = { x: 0, z: 0 };
    this.yaw = 0; this.pitch = -0.02;
    this.yawT = 0; this.pitchT = -0.02;
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.phase = 0; this.bobAmt = 0;
    this.colliders = [];
    this.auto = null;            // 사진 앞으로 걸어가기
    this.onTap = null;           // (clientX, clientY) => void
    this.enabled = true;
    // 잠깐 확대해서 보기: 화면의 한 부분만 크게 (시선 방향은 그대로)
    // focus = 확대할 점 (전체 화면 기준 0~1), at = 그 점이 보일 화면 위치 (0~1)
    this.zoom = 1; this.zoomGoal = 1; this.zoomHold = false;
    this.zoomFocus = { x: 0.5, y: 0.5 }; this.zoomAt = { x: 0.5, y: 0.5 };
    this.toNorm = (sx, sy) => [sx / innerWidth, sy / innerHeight]; // main 이 돌린 화면에 맞춰 바꾼다
    this._bind();
  }

  setPose(x, z, yaw) {
    this.pos.x = x; this.pos.z = z;
    this.yaw = this.yawT = yaw;
    this.vel.x = this.vel.z = 0;
  }

  walkTo(x, z, yaw) {
    // yaw 를 가까운 방향으로
    let d = yaw - this.yawT;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.auto = { x, z, yaw: this.yawT + d };
  }

  _bind() {
    const el = this.dom;
    window.addEventListener('keydown', e => {
      if (e.target.closest && e.target.closest('input, textarea')) return;
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      this.auto = null;
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // 드래그로 둘러보기, 짧게 누르면 탭, 두 손가락 벌리면 확대
    const ptrs = new Map();
    let pinch = null;
    const two = () => { const [a, b] = [...ptrs.values()]; return { a, b }; };
    const startPinch = () => {
      const { a, b } = two();
      const d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const [mx, my] = this.toNorm((a.x + b.x) / 2, (a.y + b.y) / 2);
      a.pinched = b.pinched = true;
      pinch = { d0, z0: this.zoom, P: this._pointAt(mx, my) };
      this.zoomHold = true;
    };
    el.addEventListener('pointerdown', e => {
      if (!this.enabled) return;
      el.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: 0 });
      if (e.pointerType === 'touch' && ptrs.size === 2) startPinch();
      if (e.button === 2) { // 오른쪽 버튼을 누르고 있는 동안 확대
        const [nx, ny] = this.toNorm(e.clientX, e.clientY);
        this._zoomAround(nx, ny, Math.max(this.zoom, 2.5));
        this.zoomHold = true;
        ptrs.get(e.pointerId).right = true;
      }
    });
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('wheel', e => {
      if (!this.enabled) return;
      e.preventDefault();
      // 트랙패드 핀치(ctrlKey)나 마우스 휠: 그쪽으로 확대, 멈추면 잠시 뒤 돌아온다
      const k = e.ctrlKey ? 0.012 : 0.0018;
      const [nx, ny] = this.toNorm(e.clientX, e.clientY);
      this._zoomAround(nx, ny, this.zoom * Math.exp(-e.deltaY * k));
      clearTimeout(this._wheelT);
      this.zoomHold = true;
      this._wheelT = setTimeout(() => { if (![...ptrs.values()].some(p => p.right)) this.zoomHold = false; }, 900);
    }, { passive: false });
    el.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      const rawX = e.clientX, rawY = e.clientY;
      let dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (this.mapDelta) [dx, dy] = this.mapDelta(dx, dy);
      p.x = rawX; p.y = rawY;
      p.moved += Math.abs(dx) + Math.abs(dy);
      if (pinch && ptrs.size >= 2) {
        const { a, b } = two();
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const [mx, my] = this.toNorm((a.x + b.x) / 2, (a.y + b.y) / 2);
        this.zoom = this.zoomGoal = Math.max(1, Math.min(ZOOM_MAX, pinch.z0 * d / pinch.d0));
        this.zoomFocus = { x: pinch.P.x, y: pinch.P.y };
        this.zoomAt = { x: mx, y: my };
        return;
      }
      if (p.pinched) return; // 확대하던 손가락 하나가 남아 있으면 둘러보기 안 함
      if (p.right) { const [nx, ny] = this.toNorm(rawX, rawY); this.zoomAt = { x: nx, y: ny }; return; }
      const touch = e.pointerType === 'touch';
      const k = (touch ? 0.0042 : 0.0032) / this.zoom; // 확대 중엔 천천히 둘러보기
      this.yawT += dx * k;
      this.pitchT = Math.max(-1.1, Math.min(1.1, this.pitchT + dy * k));
      if (p.moved > 6) this.auto = null;
    });
    const end = e => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      ptrs.delete(e.pointerId);
      if (pinch && ptrs.size < 2) { pinch = null; this.zoomHold = false; } // 손을 떼면 원래대로
      if (p.right) { this.zoomHold = false; return; }
      if (p.pinched) return;
      if (e.type === 'pointerup' && p.moved < 8 && performance.now() - p.t0 < 450 && this.onTap) this.onTap(e.clientX, e.clientY);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // 지금 화면의 (nx, ny) 에 보이는 점 (전체 화면 기준 0~1)
  _pointAt(nx, ny) {
    const z = this.zoom;
    return { x: this.zoomFocus.x - this.zoomAt.x / z + nx / z, y: this.zoomFocus.y - this.zoomAt.y / z + ny / z };
  }
  _zoomAround(nx, ny, z) {
    const P = this._pointAt(nx, ny);
    this.zoom = this.zoomGoal = Math.max(1, Math.min(ZOOM_MAX, z));
    this.zoomFocus = P;
    this.zoomAt = { x: nx, y: ny };
  }

  update(dt) {
    dt = Math.min(dt, 0.1);
    if (!this.zoomHold && this.zoom !== 1) {
      this.zoom += (1 - this.zoom) * (1 - Math.exp(-ZOOM_BACK * dt));
      if (this.zoom < 1.002) this.zoom = 1;
    }
    const k = this.enabled ? this.keys : new Set();
    let f = 0, s = 0, turn = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD')) s += 1;
    if (k.has('KeyA')) s -= 1;
    if (k.has('ArrowRight') || k.has('KeyE')) turn -= 1;
    if (k.has('ArrowLeft') || k.has('KeyQ')) turn += 1;
    f += -this.joy.y; s += this.joy.x;
    const mag = Math.hypot(f, s);
    if (mag > 1) { f /= mag; s /= mag; }
    if (mag > 0.05) this.auto = null;
    this.yawT += turn * 1.6 * dt;

    // 걷다가 손을 떼면 onStop (가까운 사진 앞에 서게 돕기)
    if (mag > 0.05) { this._bout = this._bout || { dist: 0 }; this._idle = 0; }
    else if (this._bout) {
      this._idle = (this._idle || 0) + dt;
      if (this._idle > 0.12) {
        const b = this._bout; this._bout = null;
        if (b.dist > 0.4 && this.onStop && this.enabled) this.onStop();
      }
    }

    let speed = (k.has('ShiftLeft') || k.has('ShiftRight')) ? FAST : WALK;
    // 조이스틱: 조금 밀면 천천히, 끝까지 밀면 달리기
    const jm = Math.min(1, Math.hypot(this.joy.x, this.joy.y));
    if (jm > RUN_FROM) {
      const t = (jm - RUN_FROM) / (1 - RUN_FROM);
      speed = Math.max(speed, WALK + (FAST - WALK) * t * t * (3 - 2 * t));
    }
    // 바라보는 방향 기준 → 월드 방향 (yaw 0 = -z)
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let tx = (-sy * f + cy * s) * speed;
    let tz = (-cy * f - sy * s) * speed;

    if (this.auto) {
      const a = this.auto;
      const dx = a.x - this.pos.x, dz = a.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const v = Math.min(WALK, d * 1.6);
      if (d > 0.02) { tx = dx / d * v; tz = dz / d * v; }
      let dy = a.yaw - this.yawT;
      this.yawT += dy * Math.min(1, dt * 3);
      this.pitchT += (-0.02 - this.pitchT) * Math.min(1, dt * 3);
      if (d < 0.03 && Math.abs(dy) < 0.01) this.auto = null;
    }

    const a = 1 - Math.exp(-ACCEL * dt);
    this.vel.x += (tx - this.vel.x) * a;
    this.vel.z += (tz - this.vel.z) * a;

    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    const res = this._collide(nx, nz);
    const moved = Math.hypot(res.x - this.pos.x, res.z - this.pos.z);
    this.pos.x = res.x; this.pos.z = res.z;
    if (this._bout) this._bout.dist += moved;

    // 머리 흔들림: 걸은 거리에 맞춰 (멈추면 서서히 가라앉음)
    const sp = moved / Math.max(dt, 1e-4);
    this.phase += moved / STEP_LEN * Math.PI;
    const target = Math.min(1, sp / WALK);
    this.bobAmt += (target - this.bobAmt) * (1 - Math.exp(-6 * dt));

    const la = 1 - Math.exp(-LOOK_DAMP * dt);
    this.yaw += (this.yawT - this.yaw) * la;
    this.pitch += (this.pitchT - this.pitch) * la;

    const cam = this.camera;
    const bobY = Math.abs(Math.sin(this.phase)) * BOB_Y * this.bobAmt - BOB_Y * 0.5 * this.bobAmt;
    const bobX = Math.sin(this.phase) * BOB_X * this.bobAmt;
    cam.position.set(this.pos.x + cy * bobX, EYE_H + bobY, this.pos.z - sy * bobX);
    cam.rotation.set(this.pitch, this.yaw, Math.sin(this.phase) * 0.0025 * this.bobAmt, 'YXZ');
  }

  // 원(몸) vs 선분(벽) 밀어내기
  _collide(x, z) {
    for (let it = 0; it < 3; it++) {
      for (const [x1, z1, x2, z2] of this.colliders) {
        const vx = x2 - x1, vz = z2 - z1;
        const len2 = vx * vx + vz * vz || 1e-9;
        let t = ((x - x1) * vx + (z - z1) * vz) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = x1 + vx * t, pz = z1 + vz * t;
        const dx = x - px, dz = z - pz;
        const d = Math.hypot(dx, dz);
        if (d < RADIUS && d > 1e-6) {
          const push = (RADIUS - d) / d;
          x += dx * push; z += dz * push;
        }
      }
    }
    return { x, z };
  }
}

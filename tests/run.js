// 자동 시험: 앱을 진짜 브라우저(Playwright)로 열어 주요 기능이 되는지 본다.
//   node tests/run.js            전부
//   node tests/run.js map tour   이름에 그 낱말이 든 것만
// 서버 없이 저장소 파일을 그대로 돌려준다. (Playwright 가 전역에 깔려 있으면 NODE_PATH=$(npm root -g) 를 앞에 붙인다)
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const BASE = 'http://pm.test/';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json', '.md': 'text/plain' };
async function serve(ctx) {
  await ctx.route(BASE + '**', route => {
    let u = new URL(route.request().url()).pathname;
    if (u.endsWith('/')) u += 'index.html';
    const f = path.join(ROOT, decodeURIComponent(u));
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    route.fulfill({ status: 200, body: fs.readFileSync(f), headers: { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' } });
  });
}
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

async function open(browser, phone) {
  const ctx = await browser.newContext(phone ? { ...devices['iPhone 13'] } : { viewport: { width: 1100, height: 560 }, acceptDownloads: true });
  await serve(ctx);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
  await p.goto(BASE);
  await p.waitForFunction(() => document.body.classList.contains('home-open') && window.__pm && window.__pm.library && window.__pm.library.bigTest, null, { timeout: 300000 });
  await p.waitForTimeout(600);
  return { ctx, p, errs };
}
// 자주 쓰는 것
const H = p => ({
  enter: async (i = 0) => { await p.evaluate(i => window.__pm.enterExhibition(window.__pm.library.exhibitions[i], true), i); await p.waitForTimeout(1800); },
  home: async () => { await p.evaluate(() => window.__pm.openHome()); await p.waitForTimeout(500); },
  pos: () => p.evaluate(() => { const c = window.__pm.controls; return { x: c.pos.x, z: c.pos.z, yaw: c.yaw, zoom: c.zoom, room: document.querySelector('#room').textContent }; }),
  idle: () => p.waitForFunction(() => !window.__pm.controls.auto, null, { timeout: 30000 }),
  pose: (x, z, yaw = 0) => p.evaluate(([x, z, yaw]) => window.__pm.controls.setPose(x, z, yaw), [x, z, yaw]),
  roomZ: (i, back) => p.evaluate(([i, back]) => window.__pm.museumScene.layout[i].zStart - back, [i, back]),
  names: () => p.evaluate(() => window.__pm.museum.rooms.map(r => r.name).join(',')),
  photos: () => p.evaluate(() => window.__pm.museum.rooms.map(r => r.photos.map(ph => ph.id.slice(-3)).join(',')).join(' | ')),
});

// ---------- 컴퓨터 화면 시험 ----------
const desktop = {
  '홈: 처음부터 보기만 → 다녀오면 이어보기': async (p, h) => {
    const btns = () => p.evaluate(() => [...document.querySelectorAll('#home .fcap .acts button')].filter(b => !b.hidden).map(b => b.textContent.trim()).filter(Boolean).join('|'));
    assert((await btns()) === '처음부터 보기', '처음: ' + await btns());
    await p.click('#home .fcap .go'); await p.waitForTimeout(1800);
    await h.pose(0, await h.roomZ(1, 4)); await p.waitForTimeout(300);
    await h.home();
    assert((await btns()) === '이어보기|처음부터 보기', '다녀온 뒤: ' + await btns());
    await p.click('#home .fcap .go'); await p.waitForTimeout(1800);
    assert(/ROOM 02/.test((await h.pos()).room), '이어보기 자리');
    await h.home();
    await p.click('#home .fcap .go2'); await p.waitForTimeout(1800);
    assert((await h.pos()).room === '입구', '처음부터 = 입구');
    await h.home();
  },
  '홈: 표지 띠 4칸 · 아이콘 이름표 · 메뉴 바깥 누르면 닫힘': async (p, h) => {
    const s = await p.evaluate(() => { const e = document.querySelector('#home .hstrip'); return [e.clientWidth, e.scrollWidth]; });
    assert(s[1] > s[0], '띠가 넘쳐야 함 ' + s);
    await p.click('#h-backup'); await p.waitForTimeout(300);
    assert(await p.evaluate(() => document.querySelector('#sheet').classList.contains('open')), '보관 메뉴');
    await p.click('#h-tour'); await p.waitForTimeout(400);
    assert(!(await p.evaluate(() => document.querySelector('#sheet').classList.contains('open'))), '다른 아이콘 누르면 메뉴 닫힘');
    assert(await p.evaluate(() => document.querySelector('#home-pop').classList.contains('show')), '이름표');
    await p.mouse.click(300, 300); await p.waitForTimeout(300);
    assert(!(await p.evaluate(() => document.querySelector('#home-pop').classList.contains('show'))), '이름표 닫힘');
  },
  '걷기: 바닥 클릭 · 다음 › · 놓으면 사진 앞으로': async (p, h) => {
    await h.enter(0);
    await p.evaluate(() => { const c = window.__pm.controls; c.setPose(0, -2, -0.35); c.pitch = c.pitchT = -0.15; });
    await p.waitForTimeout(600);
    const a = await h.pos();
    await p.mouse.click(760, 470); await p.waitForTimeout(300); await h.idle();
    const b = await h.pos();
    assert(Math.hypot(b.x - a.x, b.z - a.z) > 0.8, '바닥 클릭으로 이동');
    await h.pose(0, -1); await p.waitForTimeout(900);
    for (let k = 0; k < 2; k++) { await p.click('#nav-next'); await p.waitForTimeout(300); await h.idle(); await p.waitForTimeout(500); }
    assert(/ROOM 01/.test((await h.pos()).room), '다음 › 두 번이면 첫 방: ' + (await h.pos()).room);
    // 사진 감상 자리 1.6m 뒤에서 앞으로 밀다 놓기
    const sp = await p.evaluate(() => { const st = window.__pm.museumStops().find(s => s.kind === '사진').spot; const c = window.__pm.controls;
      c.setPose(st.x + Math.sin(st.yaw) * 1.6 + 0.3, st.z + Math.cos(st.yaw) * 1.6, st.yaw + 0.2); return st; });
    await p.evaluate(() => { window.__pm.controls.joy.y = -0.6; }); await p.waitForTimeout(450);
    await p.evaluate(() => { window.__pm.controls.joy.y = 0; }); await p.waitForTimeout(3200);
    const c = await h.pos();
    assert(Math.hypot(c.x - sp.x, c.z - sp.z) < 0.2, '놓으면 사진 앞에 섬');
  },
  '관람 중엔 눌러도 안 고쳐짐 · 편집을 켜면 사진 메뉴 (그 터치로 눌리지 않음)': async (p, h) => {
    await h.enter(0);
    await p.evaluate(() => { const s = window.__pm.museumStops().find(s => s.kind === '사진'); const c = window.__pm.controls; c.setPose(s.spot.x, s.spot.z, s.spot.yaw); c.pitch = c.pitchT = -0.02; });
    await p.waitForTimeout(800);
    const open = sel => p.evaluate(sel => document.querySelector(sel).classList.contains('open'), sel);
    await p.mouse.click(550, 250); await p.waitForTimeout(500);
    assert(!(await open('#sheet')) && !(await open('#editor')), '관람 중엔 메뉴가 안 떠야');
    await p.click('#tools [data-act=edit]'); await p.waitForTimeout(400);
    assert((await p.evaluate(() => window.__pm.editMode)) && (await open('#edit-menu')), '편집 모드');
    const n = await p.evaluate(() => window.__pm.museum.rooms[0].photos.filter(x => x.imageId).length);
    await p.mouse.click(550, 250); await p.waitForTimeout(150);
    assert(await open('#sheet'), '편집 중엔 사진 메뉴');
    await p.waitForTimeout(700);
    assert(await open('#sheet'), '메뉴가 그 터치로 닫히지 않아야');
    assert((await p.evaluate(() => window.__pm.museum.rooms[0].photos.filter(x => x.imageId).length)) === n, '사진 그대로');
    await p.mouse.click(40, 300); await p.waitForTimeout(300);
    await p.click('#tools [data-act=tour]'); await p.waitForTimeout(300);
    assert(!(await p.evaluate(() => window.__pm.editMode)), '관람으로');
  },
  '방 소개 글: 왼쪽 벽 · 안내벽 없음': async (p, h) => {
    await h.enter(0);
    const r = await p.evaluate(() => { const L = window.__pm.museumScene.layout[0]; const st = window.__pm.museumStops(); return { spot: L.introSpot, kinds: st.slice(0, 3).map(s => s.kind), z0: L.zStart, route: window.__pm.route(0, L.zStart - 1, 0, L.zStart - 9).length }; });
    assert(r.spot.x < 0 && r.kinds[1] === '방 소개', JSON.stringify(r.kinds));
    assert(r.route === 1, '방 안에서는 곧장: ' + r.route);
    await h.pose(0, r.z0 - 1); await p.evaluate(() => { window.__pm.controls.joy.y = -1; }); await p.waitForTimeout(2800);
    await p.evaluate(() => { window.__pm.controls.joy.y = 0; });
    assert((await h.pos()).z < r.z0 - 6, '가운데로 곧장 지나감');
  },
  '모드는 관람 / 편집 둘뿐: 켜진 쪽이 하얗고, 관람에도 조이스틱·이전/다음': async (p, h) => {
    await h.enter(0);
    const on = () => p.evaluate(() => [document.querySelector('#tools [data-act=tour]').classList.contains('on'), document.querySelector('#tools [data-act=edit]').classList.contains('on'), window.__pm.editMode, document.body.classList.contains('touring')]);
    assert(JSON.stringify(await on()) === '[true,false,false,false]', '처음은 관람: ' + JSON.stringify(await on()));
    await p.click('#tools [data-act=edit]'); await p.waitForTimeout(300);
    assert(JSON.stringify(await on()) === '[false,true,true,false]', '편집: ' + JSON.stringify(await on()));
    await p.click('#tools [data-act=edit]'); await p.waitForTimeout(200);
    assert((await on())[2] === true, '편집을 또 눌러도 편집 그대로');
    await p.click('#tools [data-act=tour]'); await p.waitForTimeout(300);
    assert(JSON.stringify(await on()) === '[true,false,false,false]', '관람으로');
    assert(!(await p.$('#tour-stop')), '관람 멈추기 버튼 없음');
    await h.pose(0, -1); await p.waitForTimeout(900);
    const a0 = await h.pos();
    for (let k = 0; k < 2; k++) { await p.click('#nav-next'); await p.waitForTimeout(300); await h.idle(); await p.waitForTimeout(500); }
    const a1 = await h.pos();
    assert(Math.hypot(a1.x - a0.x, a1.z - a0.z) > 1, '다음 › 로 이동');
  },
  '방 꾸미기: 밝은 방 / 어두운 방 두 가지 · 되돌리기': async (p, h) => {
    await h.enter(0);
    const st = () => p.evaluate(() => JSON.stringify(window.__pm.museum.rooms[0].style || null));
    const st0 = await st();
    await p.evaluate(() => window.__pm.openStylePanel(0)); await p.waitForTimeout(400);
    assert((await p.$$('#style-panel .preset')).length === 2, '카드 두 장');
    await p.click('#style-panel .preset[data-preset=dark]'); await p.waitForTimeout(600);
    assert(JSON.parse(await st()).wall === 'charcoal' && JSON.parse(await st()).floor === 'concrete-dark', '어두운 방: ' + await st());
    assert(await p.evaluate(() => document.querySelector('#style-panel .preset[data-preset=dark]').classList.contains('on')), '고른 카드 표시');
    await p.click('#style-panel .preset[data-preset=light]'); await p.waitForTimeout(600);
    assert(JSON.parse(await st()).wall === 'gallery', '밝은 방');
    await p.click('#undo'); await p.waitForTimeout(500);
    assert(JSON.parse(await st()).wall === 'charcoal', '되돌리기');
    await p.keyboard.press('Control+z'); await p.waitForTimeout(600);
    assert((await st()) === st0, '처음으로: ' + await st());
    await p.click('#style-panel .close');
  },
  '입구·출구: 따로 꾸미기': async (p, h) => {
    await h.enter(0);
    await p.evaluate(() => window.__pm.openStylePanel(-1, 'wall')); await p.waitForTimeout(300);
    await p.evaluate(() => window.__pm.applyStyle('wall', 'navy')); await p.waitForTimeout(500);
    const r = await p.evaluate(() => [window.__pm.museum.lobbyStyle && window.__pm.museum.lobbyStyle.wall, window.__pm.museum.rooms[0].style || null]);
    assert(r[0] === 'navy' && r[1].wall !== 'navy', JSON.stringify(r));
    await p.click('#style-panel .follow'); await p.waitForTimeout(400);
    assert(!(await p.evaluate(() => window.__pm.museum.lobbyStyle)), '첫 방과 같게');
    await p.click('#style-panel .close');
  },
  '지도: ✎ 아이콘 · 입구/출구 버튼': async (p, h) => {
    await h.enter(2);
    await p.evaluate(() => window.__pm.map.open()); await p.waitForTimeout(700);
    await p.click('#map .mroom .redit'); await p.waitForTimeout(300);
    await p.click('#map .mroom.acts-open .acts [data-act=rename]'); await p.waitForTimeout(400);
    assert(await p.evaluate(() => document.querySelector('#editor').classList.contains('open')), '이름·설명 창');
    await p.click('#editor-cancel'); await p.waitForTimeout(300);
    await p.evaluate(() => window.__pm.map.open()); await p.waitForTimeout(500);
    await p.click('#map .door.exit'); await p.waitForTimeout(500);
    assert((await h.pos()).room === '출구', '출구로');
    await p.evaluate(() => window.__pm.map.open()); await p.waitForTimeout(500);
    await p.click('#map .door.lobby'); await p.waitForTimeout(500);
    assert((await h.pos()).room === '입구', '입구로');
  },
  '지도: 축소하면 방 모드 → 방 끌어 순서 바꾸기': async (p, h) => {
    await h.enter(5);
    await p.evaluate(() => window.__pm.map.open()); await p.waitForTimeout(700);
    const rb = await (await p.$('#map .rooms')).boundingBox();
    await p.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
    for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(80); }
    await p.waitForTimeout(400);
    assert(await p.evaluate(() => document.querySelector('#map').classList.contains('rooms-mode')), '방 모드');
    const before = await h.names();
    const cards = await p.$$('#map .mroom .plan');
    const b1 = await cards[1].boundingBox(), b2 = await cards[2].boundingBox();
    await p.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2); await p.mouse.down();
    await p.mouse.move(b2.x + b2.width + 30, b1.y + b1.height / 2, { steps: 24 });
    await p.mouse.up(); await p.waitForTimeout(700);
    assert((await h.names()) !== before, '순서가 바뀌어야: ' + await h.names());
    await p.evaluate(() => window.__pm.map.close());
  },
  '지도: 사진을 사진 사이에 끼워 넣기 · 가운데에 놓으면 자리 바꾸기': async (p, h) => {
    await h.enter(2);
    await p.evaluate(() => { window.__pm.map.zoom = 1; window.__pm.map.open(); }); await p.waitForTimeout(900);
    const before = await h.photos();
    let plans = await p.$$('#map .mroom .plan');
    const t2 = await (await plans[1].$$('.thumb'))[0].boundingBox();
    const gap = await plans[0].evaluate(pl => { const ts = [...pl.querySelectorAll('.thumb')].map(t => t.getBoundingClientRect()).sort((a, b) => a.x - b.x); const r = pl.getBoundingClientRect(); return { x: (ts[0].x + ts[0].width + ts[1].x) / 2, y: r.y + r.height / 2 }; });
    await p.mouse.move(t2.x + t2.width / 2, t2.y + t2.height / 2); await p.mouse.down();
    await p.mouse.move(gap.x, gap.y, { steps: 20 }); await p.waitForTimeout(200);
    assert(await p.evaluate(() => !!document.querySelector('#map .ins-line')), '빨간 줄');
    await p.mouse.up(); await p.waitForTimeout(900);
    const mid = await h.photos();
    assert(mid.split(' | ')[0].split(',').length === before.split(' | ')[0].split(',').length + 1, '끼워 넣기: ' + mid);
    plans = await p.$$('#map .mroom .plan');
    const ts = await plans[0].$$('.thumb');
    const A = await ts[0].boundingBox(), B = await ts[1].boundingBox();
    await p.mouse.move(A.x + A.width / 2, A.y + A.height / 2); await p.mouse.down();
    await p.mouse.move(B.x + B.width / 2, B.y + B.height / 2, { steps: 16 }); await p.mouse.up(); await p.waitForTimeout(900);
    assert((await h.photos()) !== mid, '자리 바꾸기');
    await p.evaluate(() => window.__pm.map.close());
  },
  '지도: 여러 장 골라 다른 방으로 한꺼번에 옮기기 · 빈 곳 누르면 취소': async (p, h) => {
    await h.enter(2);
    await p.evaluate(() => { window.__pm.map.zoom = 1; window.__pm.map.open(); }); await p.waitForTimeout(900);
    const n = () => p.evaluate(() => window.__pm.museum.rooms.map(r => r.photos.length));
    const n0 = await n();
    let plans = await p.$$('#map .mroom .plan');
    let ts = await plans[0].$$('.thumb');
    const c = async el => { const b = await el.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
    const [ax, ay] = await c(ts[0]), [bx, by] = await c(ts[1]);
    await p.keyboard.down('Control'); await p.mouse.click(ax, ay); await p.keyboard.up('Control'); await p.waitForTimeout(200);
    await p.mouse.click(bx, by); await p.waitForTimeout(200); // 고르는 중에는 그냥 눌러도 더 골라진다
    assert((await p.$$('#map .thumb.sel')).length === 2, '두 장 고름');
    assert(/2장/.test(await p.textContent('#map .tip')), '안내 글');
    const r1 = await plans[1].boundingBox();
    await p.mouse.move(ax, ay); await p.mouse.down();
    await p.mouse.move(r1.x + r1.width - 12, r1.y + r1.height / 2, { steps: 20 }); await p.waitForTimeout(200);
    assert(await p.evaluate(() => document.querySelector('#map .thumb.ghost').dataset.n === '2'), '묶음 2');
    await p.mouse.up(); await p.waitForTimeout(900);
    const n1 = await n();
    assert(n1[0] === n0[0] - 2 && n1[1] === n0[1] + 2, '두 장이 옆방으로: ' + n0 + ' → ' + n1);
    assert((await p.$$('#map .thumb.sel')).length === 0, '옮긴 뒤 고르기 끝');
    await p.click('#undo'); await p.waitForTimeout(700);
    assert(String(await n()) === String(n0), '되돌리기');
    plans = await p.$$('#map .mroom .plan'); ts = await plans[0].$$('.thumb');
    const [cx, cy] = await c(ts[0]);
    await p.keyboard.down('Control'); await p.mouse.click(cx, cy); await p.keyboard.up('Control'); await p.waitForTimeout(200);
    const cap = await (await p.$('#map .mroom .cap')).boundingBox();
    await p.mouse.click(cap.x + 4, cap.y + cap.height + 14); await p.waitForTimeout(300);
    assert((await p.$$('#map .thumb.sel')).length === 0 && (await p.evaluate(() => window.__pm.map.isOpen)), '빈 곳 → 취소, 지도는 그대로');
    await p.evaluate(() => window.__pm.map.close());
  },
  '출구: 벽 글 고치기 · 방명록 쓰기 버튼': async (p, h) => {
    await h.enter(0);
    await p.evaluate(() => { const L = window.__pm.museumScene.layout; const c = window.__pm.controls; c.setPose(-0.6, L.exit.zStart - 1.0, 0); c.pitch = c.pitchT = 0.25; });
    await p.waitForTimeout(1500);
    assert(await p.evaluate(() => document.querySelector('#gb-cta').classList.contains('show')), '방명록 쓰기 버튼');
    const pt = await p.evaluate(() => { let v = null; window.__pm.museumScene.pickables.forEach(o => { if (o.userData.wallText === 'exit') { v = o.getWorldPosition(o.position.clone()); v.project(window.__pm.camera); } });
      return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; });
    await p.evaluate(() => window.__pm.setEditMode(true, true));
    await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(500);
    assert((await p.textContent('#ed-head')) === '출구 벽 글', '출구 글 창');
    await p.evaluate(() => window.__pm.setEditMode(false));
    await p.fill('#ed-title', '와 주셔서 고마워요'); await p.click('#editor-save'); await p.waitForTimeout(700);
    assert((await p.evaluate(() => window.__pm.museum.exitTitle)) === '와 주셔서 고마워요', '저장');
    await p.click('#gb-cta'); await p.waitForTimeout(400);
    assert(await p.evaluate(() => document.querySelector('#guestbook').classList.contains('open')), '방명록 창');
    await p.click('#gb-close');
  },
  '출구 문: 걸어가면 (안 눌러도) 홈으로 갈지 묻기 · 물러나야 또 묻기': async (p, h) => {
    await h.enter(0);
    const open = () => p.evaluate(() => document.querySelector('#sheet').classList.contains('open'));
    await p.evaluate(() => { const L = window.__pm.museumScene.layout; const c = window.__pm.controls; c.setPose(2.35, L.exit.zEnd + 2.4, 0); });
    await p.waitForTimeout(500);
    assert(!(await open()), '멀리서는 안 물음');
    await p.evaluate(() => { window.__pm.controls.joy.y = -0.8; });
    await p.waitForFunction(() => document.querySelector('#sheet').classList.contains('open'), null, { timeout: 5000 });
    assert(/홈으로/.test(await p.textContent('#sheet')), '홈으로 갈지 묻기');
    await p.mouse.click(40, 300); await p.waitForTimeout(900);
    assert(!(await open()), '닫은 뒤 그 자리에서는 다시 안 물음');
  },
  '지도: 방 만들기(번갈아) · ✎ 방 꾸미기 · 편집 메뉴 숨김 · 빈 곳 눌러도 안 닫힘': async (p, h) => {
    await h.enter(0);
    await p.evaluate(() => window.__pm.setEditMode(true, true));
    await p.evaluate(() => window.__pm.map.open()); await p.waitForTimeout(700);
    assert(await p.evaluate(() => getComputedStyle(document.querySelector('#edit-menu')).display === 'none'), '지도에서는 편집 메뉴 숨김');
    const walls = () => p.evaluate(() => window.__pm.museum.rooms.map(r => r.style.wall));
    const w0 = await walls();
    await p.evaluate(() => document.querySelector('#map .door.add').click()); await p.waitForTimeout(700);
    const w1 = await walls();
    assert(w1.length === w0.length + 1 && w1[w1.length - 1] !== w1[w1.length - 2], '새 방은 앞 방과 다른 색: ' + w1);
    assert(await p.evaluate(() => window.__pm.map.isOpen), '지도는 그대로 열려 있음');
    await p.evaluate(() => { const c = document.querySelectorAll('#map .mroom')[0]; c.querySelector('.redit').click(); c.querySelector('.acts [data-act=style]').click(); });
    await p.waitForTimeout(400);
    const want = w1[0] === 'gallery' ? '어두운 방' : '흰 방';
    await p.evaluate(want => [...document.querySelectorAll('#sheet button')].find(b => b.textContent.trim() === want).click(), want);
    await p.waitForTimeout(700);
    assert((await walls())[0] !== w1[0], '지도에서 방 꾸미기');
    const r = await p.evaluate(() => { const e = document.querySelector('#map .rooms').getBoundingClientRect(); return [e.left + 6, e.bottom - 4]; });
    await p.mouse.click(r[0], r[1]); await p.waitForTimeout(700);
    assert(await p.evaluate(() => window.__pm.map.isOpen), '빈 곳을 눌러도 안 닫힘');
    await p.click('#map [data-act=close]'); await p.waitForTimeout(400);
    await p.evaluate(() => window.__pm.setEditMode(false, true));
  },
  '음악: 들어가면 켜짐 · ♪ 끄기 · 홈에서 멈춤': async (p, h) => {
    await h.home();
    await p.click('#home .fcap .go'); await p.waitForTimeout(1500);
    const m = () => p.evaluate(() => ({ playing: window.__pm.music.playing, enabled: window.__pm.music.enabled }));
    assert((await m()).playing, '재생');
    await p.click('#music-btn'); await p.waitForTimeout(300);
    assert(!(await m()).enabled && !(await m()).playing, '끔');
    await p.click('#music-btn'); await p.waitForTimeout(300);
    assert((await m()).playing, '다시 켬');
    await h.home();
    assert(!(await m()).playing, '홈에서 멈춤');
  },
  '백업: 파일로 저장 → 지우고 불러오기': async (p, h) => {
    await h.home();
    const n0 = await p.evaluate(() => window.__pm.library.exhibitions.length);
    await p.click('#h-backup'); await p.waitForTimeout(300);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), p.click('#sheet button:nth-of-type(1)')]);
    const fp = path.join(require('os').tmpdir(), 'pm-test-backup.pmbk'); await dl.saveAs(fp);
    assert(fs.statSync(fp).size > 1e6, '백업 크기');
    await p.evaluate(() => { const L = window.__pm.library; L.exhibitions = L.exhibitions.slice(0, 1); });
    await p.click('#h-backup'); await p.waitForTimeout(300);
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#sheet button:nth-of-type(2)')]);
    await fc.setFiles(fp);
    await p.waitForFunction(n => window.__pm.library.exhibitions.length >= n, n0, { timeout: 60000 });
    fs.unlinkSync(fp);
  },
  '사용법: 해 봐야 넘어감 (방 꾸미기 열고 닫기) · 걷기·확대는 방법마다 따로': async (p, h) => {
    await h.home();
    await p.evaluate(() => window.__pm.startTutorial());
    await p.waitForFunction(() => !document.body.classList.contains('home-open') && window.__pm.guide.steps, null, { timeout: 120000 });
    await p.waitForTimeout(1500);
    const g = () => p.evaluate(() => window.__pm.guide.i);
    await p.evaluate(() => { const G = window.__pm.guide; G.i = 6; G.next(); }); await p.waitForTimeout(300);
    await p.evaluate(() => document.querySelector('#guide-modal [data-g=go]').click()); await p.waitForTimeout(1500);
    assert((await g()) === 7, '기다려도 그대로');
    assert((await p.evaluate(() => window.__pm.guide.steps.length)) === 15, '15단계');
    await p.evaluate(() => window.__pm.openStylePanel(0)); await p.waitForTimeout(500);
    await p.evaluate(() => document.querySelector('#style-panel .close').click()); await p.waitForTimeout(1300);
    assert((await g()) === 8, '방 꾸미기 열고 닫으면 다음');
    await p.evaluate(() => window.__pm.guide.stop());
    await h.home();
  },
};

// ---------- 휴대폰(돌린 화면 · 터치) 시험 ----------
const phone = {
  '휴대폰: 꾹 누르면 확대 · 떼면 돌아옴': async (p, h, ctx) => {
    await h.enter(0);
    const cdp = await ctx.newCDPSession(p);
    const t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    await t('touchStart', [{ x: 200, y: 400 }]); await p.waitForTimeout(1200);
    assert((await h.pos()).zoom > 2, '확대');
    await t('touchEnd', []);
    await p.waitForFunction(() => window.__pm.controls.zoom < 1.1, null, { timeout: 6000 }).catch(() => {});
    assert((await h.pos()).zoom < 1.1, '돌아옴');
  },
  '휴대폰: 걸으면서 둘러보기는 확대가 아님': async (p, h, ctx) => {
    await h.enter(0);
    const cdp = await ctx.newCDPSession(p);
    const t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    const jb = await (await p.$('#joy')).boundingBox();
    const J = { x: jb.x + jb.width / 2, y: jb.y + jb.height / 2 }, C = { x: 200, y: 560 };
    const a = await h.pos();
    await t('touchStart', [{ x: J.x, y: J.y, id: 1 }, { x: C.x, y: C.y, id: 2 }]);
    for (let i = 1; i <= 20; i++) { await t('touchMove', [{ x: J.x + Math.min(40, i * 4), y: J.y, id: 1 }, { x: C.x, y: C.y - i * 6, id: 2 }]); await p.waitForTimeout(30); }
    const b = await h.pos();
    await t('touchEnd', []);
    assert(b.zoom < 1.05, '확대 안 됨 ' + b.zoom);
    assert(Math.hypot(b.x - a.x, b.z - a.z) > 0.5 && Math.abs(b.yaw - a.yaw) > 0.3, '걷고 돌았어야');
  },
  '휴대폰: 지도 오므려 방 모드 → 방 꾹 눌러 옮기기': async (p, h, ctx) => {
    await h.enter(5);
    await p.evaluate(() => { window.__pm.map.zoom = 1; window.__pm.map.open(); }); await p.waitForTimeout(900);
    const cdp = await ctx.newCDPSession(p);
    const t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    const rb = await (await p.$('#map .rooms')).boundingBox();
    const cx = rb.x + rb.width / 2, cy = rb.y + rb.height / 2;
    await t('touchStart', [{ x: cx, y: cy - 150, id: 1 }, { x: cx, y: cy + 150, id: 2 }]);
    for (let i = 1; i <= 10; i++) { await t('touchMove', [{ x: cx, y: cy - 150 + i * 11, id: 1 }, { x: cx, y: cy + 150 - i * 11, id: 2 }]); await p.waitForTimeout(40); }
    await t('touchEnd', []); await p.waitForTimeout(500);
    assert(await p.evaluate(() => document.querySelector('#map').classList.contains('rooms-mode')), '방 모드');
    const before = await h.names();
    const b1 = await (await p.$$('#map .mroom .plan'))[1].boundingBox();
    const x = b1.x + b1.width / 2, y = b1.y + b1.height / 2;
    await t('touchStart', [{ x, y, id: 3 }]); await p.waitForTimeout(600);
    for (let i = 1; i <= 12; i++) { await t('touchMove', [{ x, y: y + i * 18, id: 3 }]); await p.waitForTimeout(30); }
    await t('touchEnd', []); await p.waitForTimeout(700);
    assert((await h.names()) !== before, '순서 바뀜');
    await p.evaluate(() => window.__pm.map.close());
  },
  '휴대폰: 편집 메뉴 3개 · 방 꾸미기 열림': async (p, h) => {
    await h.enter(0);
    await p.tap('#tools [data-act=edit]'); await p.waitForTimeout(500);
    assert((await p.$$('#edit-menu button')).length === 3, '메뉴 3개');
    await p.tap('#edit-menu [data-act=theme]'); await p.waitForTimeout(500);
    assert(await p.evaluate(() => document.querySelector('#style-panel').classList.contains('open')), '방 꾸미기');
    await p.tap('#style-panel .close');
  },
};

(async () => {
  const only = process.argv.slice(2);
  const want = name => !only.length || only.some(w => name.includes(w));
  const browser = await chromium.launch({ args: GL });
  let pass = 0, fail = 0;
  for (const [label, suite, isPhone] of [['컴퓨터', desktop, false], ['휴대폰', phone, true]]) {
    const names = Object.keys(suite).filter(want);
    if (!names.length) continue;
    const { ctx, p, errs } = await open(browser, isPhone);
    const h = H(p);
    for (const name of names) {
      errs.length = 0;
      const t0 = Date.now();
      try {
        await suite[name](p, h, ctx);
        assert(!errs.length, '콘솔 오류: ' + errs.join(' / '));
        pass++; console.log(`  ✓ ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      } catch (e) {
        fail++; console.log(`  ✗ ${name}\n      ${String(e.message).split('\n')[0]}`);
        // 다음 시험이 엉키지 않게 열린 창을 닫아 둔다
        await p.evaluate(() => { try { window.__pm.map.close(); document.querySelector('#editor').classList.remove('open'); document.querySelector('#guestbook').classList.remove('open'); if (window.__pm.guide.active) window.__pm.guide.stop(); } catch (e) {} }).catch(() => {});
        await p.mouse.up().catch(() => {});
      }
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${pass} 통과, ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();

// 같이 관람 시험 (진짜 Supabase 서버를 쓴다: Realtime 은 흉내 낼 수 없다. 끝나면 올린 것을 지운다)
//   node tests/together.js
// 주인과 손님을 서로 다른 브라우저(저장소가 따로)로 열어: 이름 묻기 → 서로 보임 → 위치가 따라옴 → 사람 수 → 나가면 줄어듦
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const BASE = 'http://pm.test/';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const SHOTS = process.env.SHOTS || '';

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];
  const open = async (who, name) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: SHOTS ? 2 : 1 });
    await ctx.route(BASE + '**', route => {
      let u = new URL(route.request().url()).pathname;
      if (u.endsWith('/')) u += 'index.html';
      const f = path.join(ROOT, decodeURIComponent(u));
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      route.fulfill({ status: 200, body: fs.readFileSync(f), headers: { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' } });
    });
    if (name) await ctx.addInitScript(n => { try { localStorage.setItem('pm-name', n); } catch (e) {} }, name);
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(who + ': ' + e.message));
    return p;
  };
  const owner = await open('주인', '주인장');
  const guest = await open('손님', null); // 이름을 아직 적은 적 없는 손님
  let failed = null, shared = false;
  const step = async (name, fn) => { const t = Date.now(); await fn(); console.log(`  ✓ ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`); };
  const T = pg => pg.evaluate(() => ({ live: window.__pm.together.live, count: window.__pm.together.count, peers: window.__pm.together.peers, badge: document.querySelector('#people').hidden ? null : document.querySelector('#people b').textContent }));
  try {
    await owner.goto(BASE);
    await owner.waitForFunction(() => document.body.classList.contains('home-open') && window.__pm && window.__pm.library && window.__pm.library.bigTest, null, { timeout: 300000 });
    let link;
    await step('혼자 볼 때(공유 안 한 전시실): 같이 관람은 꺼져 있고 사람 수 표시도 없음', async () => {
      await owner.evaluate(() => window.__pm.enterExhibition(window.__pm.library.exhibitions[1], true));
      await owner.waitForTimeout(1500);
      const t = await T(owner);
      assert(!t.live && t.count === 0 && t.badge === null, JSON.stringify(t));
      await owner.evaluate(() => window.__pm.openHome());
    });
    await step('주인: 공유한 전시실에 들어가면 혼자서도 사람 수 1', async () => {
      link = await owner.evaluate(() => window.__pm.share.share(window.__pm.library.exhibitions[0]));
      shared = true;
      await owner.evaluate(() => window.__pm.enterExhibition(window.__pm.library.exhibitions[0], true));
      await owner.waitForFunction(() => window.__pm.together.live && window.__pm.together.count === 1, null, { timeout: 30000 });
      assert((await T(owner)).badge === '1', '표시 1');
    });
    await step('손님: 들어올 때 이름을 묻고, 적으면 기억', async () => {
      await guest.goto(link);
      await guest.waitForFunction(() => document.querySelector('#namebox').classList.contains('open'), null, { timeout: 120000 });
      await guest.fill('#nb-name', '친구');
      await guest.click('#namebox button');
      await guest.waitForFunction(() => /사용법 따라 하기/.test(document.querySelector('#sheet').textContent), null, { timeout: 30000 });
      await guest.evaluate(() => [...document.querySelectorAll('#sheet button')].find(b => /건너뛰고/.test(b.textContent)).click());
      assert((await guest.evaluate(() => localStorage.getItem('pm-name'))) === '친구', '이름 기억');
    });
    await step('서로 보임: 둘 다 사람 수 2, 이름표와 주인 표시', async () => {
      await guest.waitForFunction(() => window.__pm.together.count === 2 && window.__pm.together.peers.some(p => p.visible), null, { timeout: 30000 });
      await owner.waitForFunction(() => window.__pm.together.count === 2 && window.__pm.together.peers.some(p => p.visible), null, { timeout: 30000 });
      const g = await T(guest), o = await T(owner);
      assert(g.badge === '2' && o.badge === '2', '표시: ' + g.badge + ' / ' + o.badge);
      assert(g.peers.length === 1 && g.peers[0].name === '주인장' && g.peers[0].owner === true, '손님이 보는 주인: ' + JSON.stringify(g.peers));
      assert(o.peers.length === 1 && o.peers[0].name === '친구' && o.peers[0].owner === false, '주인이 보는 손님: ' + JSON.stringify(o.peers));
    });
    await step('사람 수를 누르면 이름 목록: 맨 위는 나(이름 바꾸기), 그 아래 다른 사람', async () => {
      await guest.click('#people'); await guest.waitForTimeout(400);
      const items = await guest.evaluate(() => [...document.querySelectorAll('#sheet button')].map(b => b.textContent.trim()));
      assert(/2명/.test(await guest.textContent('#sheet .title')) && /^친구 \(나\)/.test(items[0]) && /이름 바꾸기/.test(items[0]) && /^주인장 · 전시 주인$/.test(items[1]), JSON.stringify(items));
      await guest.evaluate(() => document.querySelectorAll('#sheet button')[0].click());
      await guest.waitForFunction(() => document.querySelector('#namebox').classList.contains('open'), null, { timeout: 5000 });
      await guest.fill('#nb-name', '친구'); await guest.click('#namebox button'); await guest.waitForTimeout(300);
    });
    await step('위치와 바라보는 방향이 따라옴 (부드럽게 이어서)', async () => {
      await owner.evaluate(() => window.__pm.controls.setPose(1.5, -3.2, 0.6));
      // 가는 동안의 중간 자리가 찍혀야 한다 (순간 이동이 아니라 이어서 움직임)
      const path = await guest.evaluate(async () => { const out = []; const t0 = performance.now(); while (performance.now() - t0 < 2500) { const p = window.__pm.together.peers[0]; out.push([+p.x.toFixed(2), +p.z.toFixed(2)]); await new Promise(r => setTimeout(r, 60)); } return out; });
      const last = path[path.length - 1], uniq = new Set(path.map(String)).size;
      assert(Math.hypot(last[0] - 1.5, last[1] + 3.2) < 0.1, '도착: ' + last);
      assert(uniq >= 4, '중간 자리 수: ' + uniq);
      const yaw = (await T(guest)).peers[0].yaw;
      assert(Math.abs(yaw - 0.6) < 0.08, '방향: ' + yaw);
      await guest.evaluate(() => window.__pm.controls.setPose(-1.2, -2.0, 0));
      await owner.waitForFunction(() => { const p = window.__pm.together.peers[0]; return p && Math.hypot(p.x + 1.2, p.z + 2.0) < 0.1; }, null, { timeout: 10000 });
    });
    await step('대화: 손님이 말하면 주인 화면에 (머리 위 말풍선 · 왼쪽 위 한 줄 · 대화창), 주인이 답하면 손님에게', async () => {
      assert(!(await owner.evaluate(() => document.querySelector('#chat-btn').hidden)), '대화 버튼');
      await guest.click('#chat-btn');
      await guest.fill('#chat-input', '이 사진 어디서 찍었어?');
      await guest.click('#chatbox .row button');
      await owner.waitForFunction(() => window.__pm.together.peers[0] && window.__pm.together.peers[0].said === '이 사진 어디서 찍었어?', null, { timeout: 10000 });
      const o = await owner.evaluate(() => ({ live: document.querySelector('#chat-live').textContent, log: document.querySelector('#chatbox .log').textContent, dot: document.querySelector('#chat-btn').classList.contains('new') }));
      assert(/친구/.test(o.live) && /어디서 찍었어/.test(o.live) && /어디서 찍었어/.test(o.log) && o.dot, JSON.stringify(o));
      assert((await guest.evaluate(() => document.querySelector('#chatbox .log p.mine').textContent)).includes('어디서 찍었어'), '내가 한 말은 대화창에');
      await owner.evaluate(() => window.__pm.openChat()); await owner.fill('#chat-input', '교토!'); await owner.keyboard.press('Enter');
      await guest.waitForFunction(() => window.__pm.together.peers[0] && window.__pm.together.peers[0].said === '교토!' && /교토!/.test(document.querySelector('#chatbox .log').textContent), null, { timeout: 10000 });
      assert(await guest.evaluate(() => document.querySelector('#chatbox .log p.owner') !== null), '주인 표시');
      await owner.evaluate(() => document.querySelector('#chatbox .close').click());
      await guest.evaluate(() => document.querySelector('#chatbox .close').click());
      assert(await owner.evaluate(() => window.__pm.controls.enabled), '창을 닫으면 다시 걸을 수 있음');
    });
    if (SHOTS) { // 화면 찍기 (SHOTS=<폴더>)
      const say = (pg, t) => pg.evaluate(t => { window.__pm.openChat(); document.querySelector('#chat-input').value = t; document.querySelector('#chatbox form').requestSubmit(); document.querySelector('#chatbox .close').click(); }, t);
      await owner.evaluate(() => window.__pm.controls.setPose(0.4, -4.4, Math.PI * 0.85));
      await guest.evaluate(() => { const c = window.__pm.controls; c.setPose(0, -1.2, 0); c.pitch = c.pitchT = 0; });
      await guest.waitForTimeout(2200);
      await say(owner, '여기 단풍 진짜 예뻤어. 다음에 같이 가자');
      await guest.waitForTimeout(1300);
      await guest.screenshot({ path: path.join(SHOTS, 'together-guest.jpg'), type: 'jpeg', quality: 88 });
      await guest.evaluate(() => { window.__pm.openChat(); document.querySelector('#chat-input').value = '좋아! 가을에 가자'; document.querySelector('#chatbox form').requestSubmit(); });
      await guest.waitForTimeout(700);
      await guest.screenshot({ path: path.join(SHOTS, 'together-chat.jpg'), type: 'jpeg', quality: 88 });
      await guest.evaluate(() => document.querySelector('#chatbox .close').click());
      await guest.evaluate(() => window.__pm.controls.setPose(-0.6, -3.6, -Math.PI / 2));
      await owner.evaluate(() => { const c = window.__pm.controls; c.setPose(2.6, -3.6, Math.PI / 2); c.pitch = c.pitchT = 0; });
      await owner.waitForTimeout(1200);
      await say(guest, '나 여기 있어');
      await owner.waitForTimeout(1300);
      await owner.screenshot({ path: path.join(SHOTS, 'together-owner.jpg'), type: 'jpeg', quality: 88 });
    }
    await step('가만히 있어도 사라지지 않음 (10초 뒤에도 보임)', async () => {
      await guest.waitForTimeout(10000);
      assert((await T(guest)).peers[0].visible && (await T(owner)).peers[0].visible, '계속 보여야');
    });
    await step('손님이 나가면 주인 쪽 사람 수가 1 로', async () => {
      await guest.close();
      await owner.waitForFunction(() => window.__pm.together.count === 1 && window.__pm.together.peers.length === 0, null, { timeout: 45000 });
      assert((await T(owner)).badge === '1', '표시 1');
    });
    await step('주인이 홈으로 나가면 꺼짐', async () => {
      await owner.evaluate(() => window.__pm.openHome());
      await owner.waitForTimeout(800);
      const t = await T(owner);
      assert(!t.live && t.count === 0, JSON.stringify(t));
    });
  } catch (e) { failed = e; }
  if (shared) await owner.evaluate(() => { const ex = window.__pm.library.exhibitions[0]; return ex.share ? window.__pm.share.unshare(ex).catch(() => {}) : null; }).catch(() => {});
  if (failed) console.log('  ✗ ' + failed.message.split('\n')[0]);
  if (errs.length) console.log('  ⚠ ' + errs.join('\n  ⚠ '));
  console.log(failed || errs.length ? '\n실패' : '\n같이 관람 시험 통과 (진짜 서버)');
  await browser.close();
  process.exit(failed || errs.length ? 1 : 0);
})();

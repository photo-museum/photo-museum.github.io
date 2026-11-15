// 공유 시험: 주인이 공유 → 손님이 초대 링크로 들어옴 → 손님 방명록 → 주인이 고치면 저절로 반영 → 공유 끊기
//   node tests/share.js          가짜 서버 (인터넷 없이. 서버 규칙을 흉내 낸 것)
//   REAL=1 node tests/share.js   진짜 Supabase 서버 (끝나면 올린 것을 지운다)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const BASE = 'http://pm.test/';
const HOST = 'https://nrrhykbbgxvqziatkhsm.supabase.co';
const REAL = !!process.env.REAL;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, x-mm-secret', 'access-control-allow-methods': 'GET, POST, OPTIONS' };

// 가짜 서버: supabase/mm-share/index.ts 와 같은 규칙
const DB = new Map(); // id → { secret, data, guest: [], photos: Map(name → { body, type }) }
async function fake(route) {
  const req = route.request(), url = new URL(req.url());
  const json = (body, status = 200) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const m = url.pathname.match(/^\/storage\/v1\/object\/public\/my-museum\/([^/]+)\/(.+)$/);
  if (m) { const ph = DB.get(m[1]) && DB.get(m[1]).photos.get(decodeURIComponent(m[2])); return ph ? route.fulfill({ status: 200, headers: { ...CORS, 'content-type': ph.type }, body: ph.body }) : route.fulfill({ status: 404, headers: CORS, body: 'nf' }); }
  if (url.pathname !== '/functions/v1/mm-share') return route.fulfill({ status: 404, body: 'nf' });
  if (req.method() === 'GET') {
    const e = DB.get(url.searchParams.get('id'));
    return e ? json({ data: e.data, guestbook: e.guest, photos: `${HOST}/storage/v1/object/public/my-museum/${url.searchParams.get('id')}/` }) : json({ error: 'not found' }, 404);
  }
  if (url.searchParams.get('op') === 'photo') {
    const e = DB.get(url.searchParams.get('id'));
    if (!e || e.secret !== req.headers()['x-mm-secret']) return json({ error: 'forbidden' }, 403);
    e.photos.set(url.searchParams.get('name'), { body: req.postDataBuffer(), type: req.headers()['content-type'] });
    return json({ ok: true });
  }
  const b = req.postDataJSON(), e = DB.get(b.id);
  if (b.op === 'guest') { if (!e) return json({ error: 'not found' }, 404); e.guest.push({ id: 'g' + e.guest.length, name: b.name || '', text: b.text, at: Date.now() }); return json({ ok: true, guestbook: e.guest }); }
  if (b.op === 'put') {
    if (e && e.secret !== b.secret) return json({ error: 'forbidden' }, 403);
    if (!e) DB.set(b.id, { secret: b.secret, data: b.data, guest: (b.guestbook || []).map((g, i) => ({ id: 's' + i, name: g.name || '', text: g.text, at: g.at })), photos: new Map() });
    else e.data = b.data;
    const x = DB.get(b.id);
    return json({ ok: true, created: !e, have: [...x.photos.keys()], guestbook: x.guest });
  }
  if (!e || e.secret !== b.secret) return json({ error: 'forbidden' }, 403);
  if (b.op === 'prune') { let n = 0; for (const k of [...e.photos.keys()]) if (!b.keep.includes(k)) { e.photos.delete(k); n++; } return json({ ok: true, removed: n }); }
  if (b.op === 'guestDelete') { e.guest = e.guest.filter(g => g.id !== b.gid); return json({ ok: true, guestbook: e.guest }); }
  if (b.op === 'unshare') { DB.delete(b.id); return json({ ok: true }); }
  return json({ error: 'unknown op' }, 400);
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 560 } });
  await ctx.route(BASE + '**', route => {
    let u = new URL(route.request().url()).pathname;
    if (u.endsWith('/')) u += 'index.html';
    const f = path.join(ROOT, decodeURIComponent(u));
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    route.fulfill({ status: 200, body: fs.readFileSync(f), headers: { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' } });
  });
  if (!REAL) await ctx.route(HOST + '/**', fake);
  // 같이 관람의 이름 묻기는 여기서 보지 않는다 (tests/together.js 에서 본다): 이미 이름을 적어 둔 기기로 시작
  await ctx.addInitScript(() => { try { localStorage.setItem('pm-name', '시험'); } catch (e) {} });
  const errs = [];
  const watch = (pg, who) => { pg.on('pageerror', e => errs.push(who + ': ' + e.message)); };
  const owner = await ctx.newPage(); watch(owner, '주인');
  let link = null, failed = null;
  const step = async (name, fn) => { const t = Date.now(); await fn(); console.log(`  ✓ ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`); };
  try {
    await owner.goto(BASE);
    await owner.waitForFunction(() => document.body.classList.contains('home-open') && window.__pm && window.__pm.library && window.__pm.library.bigTest, null, { timeout: 300000 });
    const info = await owner.evaluate(() => { const ex = window.__pm.library.exhibitions[0]; return { title: ex.title, rooms: ex.rooms.length, photos: ex.rooms.flatMap(r => r.photos).filter(p => p.imageId).length }; });

    await step(`주인: 공유하기 → 초대 링크 (사진 ${info.photos}장 올림)`, async () => {
      link = await owner.evaluate(() => window.__pm.share.share(window.__pm.library.exhibitions[0]));
      assert(/\?v=[a-z0-9]{16}$/.test(link) && link.startsWith(BASE), '링크: ' + link);
      const st = await owner.evaluate(() => { const s = window.__pm.library.exhibitions[0].share; return { on: s.on, have: s.have.length, secret: s.secret.length }; });
      assert(st.on && st.have === info.photos && st.secret === 40, JSON.stringify(st));
    });

    const guest = await ctx.newPage(); watch(guest, '손님');
    await step('손님: 링크로 들어옴 → 같은 전시 · 사용법 묻기 · 사진이 보임', async () => {
      await guest.goto(link);
      await guest.waitForFunction(() => document.body.classList.contains('guest') && window.__pm && window.__pm.museum && !document.querySelector('#loading:not(.done)'), null, { timeout: 120000 });
      const g = await guest.evaluate(() => ({ title: window.__pm.museum.title, rooms: window.__pm.museum.rooms.length, sheet: document.querySelector('#sheet').textContent, share: 'share' in window.__pm.museum }));
      assert(g.title === info.title && g.rooms === info.rooms, JSON.stringify(g));
      assert(/환영/.test(g.sheet) && /사용법 따라 하기/.test(g.sheet) && /건너뛰고/.test(g.sheet), '사용법 묻기: ' + g.sheet);
      assert(!g.share, '주인 열쇠는 손님에게 가지 않는다');
      await guest.evaluate(() => [...document.querySelectorAll('#sheet button')].find(b => /건너뛰고/.test(b.textContent)).click());
      await guest.waitForFunction(() => window.__pm.museumScene.texReady.size >= 2, null, { timeout: 60000 });
    });
    await step('손님: 편집·지도는 안 됨 · 홈 버튼은 나가기 물음', async () => {
      await guest.click('#tools [data-act=edit]'); await guest.waitForTimeout(400);
      assert(!(await guest.evaluate(() => window.__pm.editMode)), '편집 모드가 켜지면 안 됨');
      assert(/고칠 수 없어요/.test(await guest.textContent('#toast')), '안내: ' + await guest.textContent('#toast'));
      await guest.evaluate(() => window.__pm.map.open()); await guest.waitForTimeout(300);
      assert(!(await guest.evaluate(() => window.__pm.map.isOpen)), '지도가 열리면 안 됨');
      await guest.evaluate(() => document.querySelector('#home-btn').click()); await guest.waitForTimeout(400);
      assert(/고맙습니다/.test(await guest.textContent('#sheet')) && !(await guest.evaluate(() => document.body.classList.contains('home-open'))), '나가기 물음');
      await guest.evaluate(() => [...document.querySelectorAll('#sheet button')].find(b => /더 둘러보기/.test(b.textContent)).click());
    });
    await step('손님: 방명록 쓰기 → 서버에 남음', async () => {
      await guest.evaluate(() => { const P = window.__pm, st = P.museumStops(), s = st[st.length - 1]; P.controls.setPose(s.spot.x, s.spot.z, s.spot.yaw); });
      await guest.waitForFunction(() => document.querySelector('#gb-cta').classList.contains('show'), null, { timeout: 8000 });
      await guest.click('#gb-cta'); await guest.waitForTimeout(400);
      await guest.fill('#gb-text', '손님이 남긴 글'); await guest.fill('#gb-name', '손님');
      await guest.click('#gb-save');
      await guest.waitForFunction(() => (window.__pm.museum.guestbook || []).some(g => g.text === '손님이 남긴 글'), null, { timeout: 20000 });
      await guest.click('#gb-close');
    });
    await step('주인: 전시실에 들어가면 손님 방명록이 보임', async () => {
      await owner.evaluate(() => window.__pm.enterExhibition(window.__pm.library.exhibitions[0], true));
      await owner.waitForFunction(() => (window.__pm.museum.guestbook || []).some(g => g.text === '손님이 남긴 글'), null, { timeout: 20000 });
    });
    await step('주인: 이름을 고치고 사진 한 장을 내리면 저절로 반영 (다시 올리기 없이)', async () => {
      await owner.evaluate(() => { const P = window.__pm, ex = P.museum; ex.title = '고친 이름'; const p = ex.rooms[0].photos.find(x => x.imageId); p.imageId = null; P.persist(); });
      const t0 = Date.now(); let ok = false;
      while (Date.now() - t0 < 40000 && !ok) {
        await owner.waitForTimeout(1500);
        ok = await owner.evaluate(async link => { const id = new URL(link).searchParams.get('v'); const r = await fetch(`https://nrrhykbbgxvqziatkhsm.supabase.co/functions/v1/mm-share?id=${id}`).then(r => r.json()); return r.data && r.data.title === '고친 이름' && r.data.rooms[0].photos.filter(x => x.imageId).length === window.__pm.museum.rooms[0].photos.filter(x => x.imageId).length; }, link);
      }
      assert(ok, '서버에 반영되지 않음');
      await guest.reload();
      await guest.waitForFunction(() => window.__pm && window.__pm.museum, null, { timeout: 120000 });
      assert((await guest.evaluate(() => window.__pm.museum.title)) === '고친 이름', '손님 화면에 반영');
      assert(!(await guest.evaluate(() => document.querySelector('#sheet').classList.contains('open'))), '다시 온 손님에게는 사용법을 또 묻지 않는다');
    });
    await step('주인: 공유 끊기 → 링크가 더는 열리지 않음', async () => {
      await owner.evaluate(() => window.__pm.share.unshare(window.__pm.library.exhibitions[0]));
      assert(!(await owner.evaluate(() => 'share' in window.__pm.library.exhibitions[0])), '공유 정보 지움');
      await guest.reload();
      await guest.waitForFunction(() => /찾을 수 없어요/.test((document.querySelector('#loading') || {}).textContent || ''), null, { timeout: 60000 });
    });
  } catch (e) { failed = e; }
  // 진짜 서버로 돌리다 실패했으면 올린 것을 치운다
  if (REAL && failed && link) await owner.evaluate(() => { const ex = window.__pm.library.exhibitions[0]; return ex.share ? window.__pm.share.unshare(ex).catch(() => {}) : null; }).catch(() => {});
  if (failed) console.log('  ✗ ' + failed.message.split('\n')[0]);
  if (errs.length) console.log('  ⚠ ' + errs.join('\n  ⚠ '));
  console.log(failed || errs.length ? '\n실패' : `\n공유 시험 통과 (${REAL ? '진짜 서버' : '가짜 서버'})`);
  await browser.close();
  process.exit(failed || errs.length ? 1 : 0);
})();

// 공유: 전시실을 인터넷에 올려 초대 링크(…/?v=<id>)로 보여 준다.
//  · 서버: Supabase Edge Function mm-share (supabase/mm-share/index.ts). 읽기와 방명록 쓰기는 누구나, 나머지는 주인만.
//  · 주인 = 공유를 만든 기기. 전시실마다 ex.share = { id, secret, on, have[], hash } 를 이 기기(와 백업 파일)에만 둔다. secret 은 서버에 올리지 않는다(서버에는 그 지문만).
//  · 고치면 저절로 반영: main.js 의 persist() 뒤에 syncSoon() → 몇 초 뒤 달라진 전시실만 올린다.
// a: main.js 가 건네는 것들 { library(getter), getImage, saveLibrary(), toast }
export const SHARE_API = 'https://nrrhykbbgxvqziatkhsm.supabase.co/functions/v1/mm-share';

// 주소에 ?v=<id> 가 있으면 초대받은 손님
export const GUEST_ID = (() => {
  try { const v = new URLSearchParams(location.search).get('v'); return v && /^[a-z0-9]{10,32}$/.test(v) ? v : null; } catch (e) { return null; }
})();

const rand = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join(''); };
async function post(body) {
  const r = await fetch(SHARE_API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('서버 오류 ' + r.status));
  return j;
}
// 손님·주인 모두: 올려 둔 전시실 읽기 → { data, guestbook, photos(사진 주소 앞부분) }
export async function fetchShared(id) {
  const r = await fetch(`${SHARE_API}?id=${id}`, { cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('서버 오류 ' + r.status);
  return r.json();
}
export const postGuest = (id, name, text) => post({ op: 'guest', id, name, text }).then(j => j.guestbook);

// 올릴 내용: 전시실에서 이 기기만 알아야 하는 것(share)과 방명록(서버가 따로 가짐)을 뺀 것
function shareData(ex) {
  const d = JSON.parse(JSON.stringify(ex));
  delete d.share; delete d.guestbook;
  return d;
}
const usedImages = ex => [...new Set(ex.rooms.flatMap(r => r.photos.map(p => p.imageId)).filter(Boolean))];
function hashOf(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h) + ':' + s.length; }

export function initShare(a) {
  const linkOf = ex => `${location.origin}${location.pathname.replace(/(old|r2)\/$/, '').replace(/index\.html$/, '')}?v=${ex.share.id}`;
  const isShared = ex => !!(ex.share && ex.share.on);

  // 전시실 하나를 서버와 맞춘다. say(글): 진행 알림
  async function sync(ex, say = () => {}) {
    const sh = ex.share, data = shareData(ex), used = usedImages(ex);
    const up = async ids => {
      let k = 0, next = 0;
      const one = async id => {
        const blob = await a.getImage(id);
        if (blob) {
          const r = await fetch(`${SHARE_API}?op=photo&id=${sh.id}&name=${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': /^image\/(jpeg|png|webp)$/.test(blob.type) ? blob.type : 'image/jpeg', 'x-mm-secret': sh.secret }, body: blob });
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || ('사진을 올리지 못했어요 ' + r.status));
        }
        say(`사진 올리는 중… ${++k} / ${ids.length}`);
      };
      // 세 장씩 한꺼번에 (한 장씩보다 훨씬 빠르고, 휴대폰 인터넷에도 무리가 없다)
      const worker = async () => { while (next < ids.length) await one(ids[next++]); };
      if (ids.length) say(`사진 올리는 중… 0 / ${ids.length}`);
      await Promise.all([worker(), worker(), worker()]);
    };
    let res;
    if (!sh.created) { // 처음: 자리를 만들고(이 기기의 방명록도 옮겨 심는다) 사진을 올린다
      res = await post({ op: 'put', id: sh.id, secret: sh.secret, data, guestbook: ex.guestbook || [] });
      sh.created = true; sh.have = res.have || [];
    }
    await up(used.filter(id => !(sh.have || []).includes(id))); // 새 사진을 먼저 올리고
    res = await post({ op: 'put', id: sh.id, secret: sh.secret, data }); // 그다음 내용을 바꾼다 (손님이 빈 액자를 보지 않게)
    const miss = used.filter(id => !(res.have || []).includes(id));
    if (miss.length) await up(miss);
    await post({ op: 'prune', id: sh.id, secret: sh.secret, keep: used }); // 이제 안 쓰는 사진은 서버에서 지운다
    sh.have = used; sh.hash = hashOf(JSON.stringify(data)); sh.syncedAt = Date.now();
    if (Array.isArray(res.guestbook)) ex.guestbook = res.guestbook;
  }

  // 공유 시작 → 초대 링크
  async function share(ex, say) {
    if (!ex.share) ex.share = { id: rand(16), secret: rand(40) };
    ex.share.on = true;
    try { await sync(ex, say); }
    catch (e) { if (!ex.share.created) delete ex.share; else ex.share.on = !!ex.share.syncedAt; await a.saveLibrary(); throw e; }
    await a.saveLibrary();
    return linkOf(ex);
  }
  async function unshare(ex) {
    const sh = ex.share;
    if (!sh) return;
    if (sh.created) await post({ op: 'unshare', id: sh.id, secret: sh.secret });
    delete ex.share;
    await a.saveLibrary();
  }

  // 고친 것 저절로 올리기: 저장할 때마다 불리고, 잠잠해진 뒤 달라진 전시실만 올린다
  let timer = 0, busy = false, again = false;
  function syncSoon(ms = 3500) {
    if (GUEST_ID) return;
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  }
  async function run() {
    if (busy) { again = true; return; }
    const lib = a.library;
    if (!lib) return;
    const todo = lib.exhibitions.filter(ex => isShared(ex) && hashOf(JSON.stringify(shareData(ex))) !== ex.share.hash);
    if (!todo.length) return;
    busy = true;
    try {
      for (const ex of todo) await sync(ex);
      await a.saveLibrary();
      status = 'ok';
    } catch (e) { console.warn('공유 올리기 실패', e); status = 'fail'; syncSoon(30000); } // 인터넷이 끊겼으면 조금 뒤 다시
    finally { busy = false; if (again) { again = false; syncSoon(1500); } }
  }
  let status = 'ok';
  window.addEventListener('online', () => syncSoon(1000));

  // 주인이 전시실에 들어갈 때: 손님들이 남긴 방명록을 받아 온다. 바뀌었으면 true
  async function pullGuestbook(ex) {
    if (!isShared(ex)) return false;
    const r = await fetchShared(ex.share.id).catch(() => null);
    if (!r || !Array.isArray(r.guestbook)) return false;
    const changed = JSON.stringify(r.guestbook.map(g => g.id)) !== JSON.stringify((ex.guestbook || []).map(g => g.id));
    ex.guestbook = r.guestbook;
    return changed;
  }
  const addGuest = async (ex, name, text) => { ex.guestbook = await postGuest(ex.share.id, name, text); };
  const deleteGuest = async (ex, gid) => { ex.guestbook = (await post({ op: 'guestDelete', id: ex.share.id, secret: ex.share.secret, gid })).guestbook; };

  return { share, unshare, linkOf, isShared, syncSoon, pullGuestbook, addGuest, deleteGuest, get status() { return status; } };
}

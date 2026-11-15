// My Museum 공유 서버 (Supabase Edge Function: mm-share)
// 손님은 읽기와 방명록 쓰기만, 주인(공유를 만든 기기)은 비밀 열쇠(secret)로 올리기·고치기·끊기를 한다.
// 표: mm_exhibitions(id, owner_hash, data, updated_at) · mm_guestbook(id, exhibition_id, name, text, created_at)
// 사진: 공개 보관함 my-museum 의 <전시 id>/<사진 id>. 읽기는 공개 주소로 바로, 쓰기는 이 함수로만.
// 올리는 법: SESSION_LOG.md 의 '공유' 항목 (Management API functions/deploy). 이 파일에 비밀 값은 없다 (서비스 열쇠는 Supabase 가 넣어 준다).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const BUCKET = 'my-museum';
const MAX_DATA = 400_000, MAX_PHOTO = 8_000_000, MAX_PHOTOS = 600, MAX_GUEST = 500;
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, x-mm-secret, authorization, apikey',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const bad = (msg: string, status = 400) => json({ error: msg }, status);
const okId = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9]{10,32}$/.test(s);
const okName = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{3,80}$/.test(s);
async function sha(s: string) {
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}
// 주인인가: 전시가 있고 열쇠가 맞으면 'owner', 전시가 없으면 'none', 틀리면 'no'
async function who(id: string, secret: unknown) {
  if (typeof secret !== 'string' || secret.length < 20 || secret.length > 200) return 'no';
  const { data } = await db.from('mm_exhibitions').select('owner_hash').eq('id', id).maybeSingle();
  if (!data) return 'none';
  return data.owner_hash === await sha(secret) ? 'owner' : 'no';
}
async function guestbook(id: string) {
  const { data } = await db.from('mm_guestbook').select('id, name, text, created_at').eq('exhibition_id', id).order('created_at', { ascending: true }).limit(MAX_GUEST);
  return (data || []).map(g => ({ id: g.id, name: g.name || '', text: g.text, at: Date.parse(g.created_at) }));
}
async function listPhotos(id: string) {
  const out: string[] = [];
  for (let offset = 0; offset < 5000; offset += 1000) {
    const { data } = await db.storage.from(BUCKET).list(id, { limit: 1000, offset });
    if (!data || !data.length) break;
    out.push(...data.map(o => o.name));
    if (data.length < 1000) break;
  }
  return out;
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);

    // 읽기 (누구나)
    if (req.method === 'GET') {
      const id = url.searchParams.get('id');
      if (!okId(id)) return bad('bad id');
      const { data } = await db.from('mm_exhibitions').select('data, updated_at').eq('id', id).maybeSingle();
      if (!data) return bad('not found', 404);
      return json({ data: data.data, updated_at: data.updated_at, guestbook: await guestbook(id), photos: `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/${BUCKET}/${id}/` });
    }
    if (req.method !== 'POST') return bad('method', 405);

    // 사진 올리기 (주인): 몸통이 사진 그대로
    if (url.searchParams.get('op') === 'photo') {
      const id = url.searchParams.get('id'), name = url.searchParams.get('name');
      if (!okId(id) || !okName(name)) return bad('bad id');
      if (await who(id, req.headers.get('x-mm-secret')) !== 'owner') return bad('forbidden', 403);
      const buf = new Uint8Array(await req.arrayBuffer());
      if (!buf.length || buf.length > MAX_PHOTO) return bad('too big', 413);
      const type = req.headers.get('content-type') || 'image/jpeg';
      if (!/^image\/(jpeg|png|webp)$/.test(type)) return bad('bad type');
      if ((await listPhotos(id)).length >= MAX_PHOTOS) return bad('too many photos', 413);
      const { error } = await db.storage.from(BUCKET).upload(`${id}/${name}`, buf, { contentType: type, upsert: true, cacheControl: '31536000' });
      if (error) return bad('upload: ' + error.message, 500);
      return json({ ok: true });
    }

    const body = await req.json().catch(() => null);
    if (!body || !okId(body.id)) return bad('bad request');
    const id: string = body.id;

    // 방명록 쓰기 (누구나)
    if (body.op === 'guest') {
      const text = typeof body.text === 'string' ? body.text.trim().slice(0, 200) : '';
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 20) : '';
      if (!text) return bad('empty');
      const { data: ex } = await db.from('mm_exhibitions').select('id').eq('id', id).maybeSingle();
      if (!ex) return bad('not found', 404);
      const { count } = await db.from('mm_guestbook').select('id', { count: 'exact', head: true }).eq('exhibition_id', id);
      if ((count || 0) >= MAX_GUEST) return bad('guestbook full', 413);
      const { error } = await db.from('mm_guestbook').insert({ exhibition_id: id, name, text });
      if (error) return bad('insert: ' + error.message, 500);
      return json({ ok: true, guestbook: await guestbook(id) });
    }

    // 아래는 모두 주인만
    const w = await who(id, body.secret);
    if (body.op === 'put') {
      if (w === 'no') return bad('forbidden', 403);
      const text = JSON.stringify(body.data ?? null);
      if (!body.data || typeof body.data !== 'object' || text.length > MAX_DATA) return bad('bad data');
      if (w === 'none') {
        const { error } = await db.from('mm_exhibitions').insert({ id, owner_hash: await sha(body.secret), data: body.data });
        if (error) return bad('insert: ' + error.message, 500);
        // 공유하기 전에 이 기기에서 받아 둔 방명록을 처음 한 번 옮겨 심는다
        const seed = Array.isArray(body.guestbook) ? body.guestbook.slice(0, MAX_GUEST) : [];
        const rows = seed.filter((g: any) => g && typeof g.text === 'string' && g.text.trim()).map((g: any) => ({
          exhibition_id: id, name: String(g.name || '').slice(0, 20), text: g.text.trim().slice(0, 200),
          created_at: new Date(Number.isFinite(g.at) ? g.at : Date.now()).toISOString(),
        }));
        if (rows.length) await db.from('mm_guestbook').insert(rows);
      } else {
        const { error } = await db.from('mm_exhibitions').update({ data: body.data, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) return bad('update: ' + error.message, 500);
      }
      return json({ ok: true, created: w === 'none', have: await listPhotos(id), guestbook: await guestbook(id) });
    }
    if (w !== 'owner') return bad(w === 'none' ? 'not found' : 'forbidden', w === 'none' ? 404 : 403);

    if (body.op === 'prune') { // keep 에 없는 사진을 보관함에서 지운다
      const keep = new Set((Array.isArray(body.keep) ? body.keep : []).filter(okName));
      const gone = (await listPhotos(id)).filter(n => !keep.has(n)).map(n => `${id}/${n}`);
      for (let i = 0; i < gone.length; i += 100) await db.storage.from(BUCKET).remove(gone.slice(i, i + 100));
      return json({ ok: true, removed: gone.length });
    }
    if (body.op === 'guestDelete') {
      if (typeof body.gid !== 'string') return bad('bad gid');
      await db.from('mm_guestbook').delete().eq('exhibition_id', id).eq('id', body.gid);
      return json({ ok: true, guestbook: await guestbook(id) });
    }
    if (body.op === 'unshare') { // 공유 끊기: 사진·방명록·전시를 모두 지운다
      const all = (await listPhotos(id)).map(n => `${id}/${n}`);
      for (let i = 0; i < all.length; i += 100) await db.storage.from(BUCKET).remove(all.slice(i, i + 100));
      await db.from('mm_exhibitions').delete().eq('id', id); // 방명록은 같이 지워진다 (on delete cascade)
      return json({ ok: true });
    }
    return bad('unknown op');
  } catch (e) {
    return bad('server: ' + (e instanceof Error ? e.message : String(e)), 500);
  }
});

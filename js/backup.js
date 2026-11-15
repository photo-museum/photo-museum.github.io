// 백업 파일: 전시실 목록 + 사진 원본을 파일 하나로 묶는다 (다른 기기·홈 화면 앱으로 옮기기, 친구에게 보내기)
// 모양: "PMBK1\n" + 머리 길이(4바이트) + 머리(JSON) + 사진 바이트들
import { getImage, putImage, HD } from './store.js';

const MAGIC = 'PMBK1\n';

export async function makeBackup(exhibitions, onProgress = () => {}) {
  const ids = [];
  for (const ex of exhibitions) for (const r of ex.rooms) for (const p of r.photos) if (p.imageId && !ids.includes(p.imageId)) ids.push(p.imageId);
  const parts = [], files = [];
  let offset = 0, n = 0;
  for (const id of ids) {
    for (const key of [id, id + HD]) {
      const blob = await getImage(key).catch(() => null);
      if (!blob) continue;
      const buf = await blob.arrayBuffer();
      files.push({ key, type: blob.type || 'image/jpeg', offset, length: buf.byteLength });
      parts.push(buf);
      offset += buf.byteLength;
    }
    onProgress(++n, ids.length);
  }
  const head = new TextEncoder().encode(JSON.stringify({ app: 'photo-museum', at: Date.now(), exhibitions, files }));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, head.byteLength);
  return new Blob([MAGIC, len, head, ...parts], { type: 'application/octet-stream' });
}

// 파일을 읽어 사진은 저장소에 넣고, 전시실 목록을 돌려준다
export async function readBackup(file, onProgress = () => {}) {
  const buf = await file.arrayBuffer();
  const magic = new TextDecoder().decode(new Uint8Array(buf, 0, MAGIC.length));
  if (magic !== MAGIC) throw new Error('My Museum 백업 파일이 아니에요');
  const hl = new DataView(buf, MAGIC.length, 4).getUint32(0);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, MAGIC.length + 4, hl)));
  if (!head || !Array.isArray(head.exhibitions)) throw new Error('백업 파일이 망가졌어요');
  const base = MAGIC.length + 4 + hl;
  let n = 0;
  for (const f of head.files || []) {
    const bytes = buf.slice(base + f.offset, base + f.offset + f.length);
    await putImage(f.key, new Blob([bytes], { type: f.type }));
    onProgress(++n, head.files.length);
  }
  return head;
}

// 파일 내보내기: 휴대폰은 공유 시트(파일에 저장·에어드롭·메시지), 아니면 내려받기
export async function saveFile(blob, name) {
  const file = new File([blob], name, { type: 'application/octet-stream' });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'downloaded';
}

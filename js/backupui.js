// 보관 메뉴: 백업 파일 저장·불러오기, 홈 화면 앱 설치 안내, 전시실 하나 파일로 보내기, 백업 알림.
// main.js 가 initBackup(a) 로 한 번 부른다. a.library / a.homeOpen 은 읽을 때마다 최신.
import { makeBackup, readBackup, saveFile } from './backup.js';

export function initBackup(a) {
  const { toast, persist, pushUndo, openSheet, renderHome } = a;

  // ---------- 백업 · 불러오기 · 공유 ----------
  // 사진은 이 기기 브라우저 안에만 저장된다. 아이폰 Safari 는 오래 안 쓰면 지울 수도 있어서
  // (1) 홈 화면 앱으로 설치하면 더 안전하고 (2) 백업 파일로 저장해 두면 언제든 되살릴 수 있다.
  const APP_VERSION = '11.19-d'; // 배포할 때마다 바꾼다 (휴대폰에 새 버전이 들어왔는지 보관 메뉴에서 확인)
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ownExhibitions = () => a.library.exhibitions.filter(e => !e.showcase && !e.tutorial);
  function dateTag() { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; }
  function backupAge() {
    if (!a.library.lastBackup) return '아직 백업한 적이 없어요';
    const days = Math.floor((Date.now() - a.library.lastBackup) / 86400000);
    return days < 1 ? '오늘 백업했어요' : `마지막 백업 ${days}일 전`;
  }
  function openBackupMenu() {
    openSheet([
      { title: true, label: `보관 · ${backupAge()} · 버전 ${APP_VERSION}${globalThis.PM_R2 ? ' · 시험판 저장 공간' : globalThis.PM_CLASSIC ? ' · 예전 구조' : ''}` },
      { label: '⤓ 모든 전시실을 백업 파일로 저장', fn: () => exportExhibitions(ownExhibitions(), `MyMuseum-백업-${dateTag()}.pmbk`, true) },
      { label: '⤒ 백업 파일에서 불러오기', fn: () => importPick() },
      { label: isStandalone() ? '✓ 홈 화면 앱으로 쓰고 있어요' : '홈 화면에 앱으로 추가하는 법', fn: () => installHelp() },
      { label: '닫기', quiet: true },
    ]);
  }
  async function exportExhibitions(list, name, full) {
    if (!list.length) { toast('저장할 전시실이 없어요'); return; }
    try {
      const blob = await makeBackup(JSON.parse(JSON.stringify(list)), (i, n) => toast(`사진 묶는 중… ${i} / ${n}`, 4000));
      const r = await saveFile(blob, name);
      if (r === 'cancel') { toast('저장을 취소했어요'); return; }
      if (full) { a.library.lastBackup = Date.now(); persist(); }
      toast(r === 'shared' ? '파일을 보냈어요\n"파일에 저장"을 고르면 아이폰에 남아요' : `백업 파일을 저장했어요 (${(blob.size / 1048576).toFixed(1)}MB)`, 4200);
    } catch (e) { console.error(e); toast('백업 파일을 만들지 못했어요: ' + e.message, 4000); }
  }
  const importInput = document.createElement('input');
  importInput.type = 'file'; importInput.hidden = true;
  document.body.appendChild(importInput);
  function importPick() { importInput.value = ''; importInput.click(); }
  importInput.addEventListener('change', async () => {
    const f = importInput.files && importInput.files[0];
    if (!f) return;
    try {
      const head = await readBackup(f, (i, n) => toast(`사진 넣는 중… ${i} / ${n}`, 4000));
      pushUndo('백업 불러오기');
      let added = 0, replaced = 0;
      for (const ex of head.exhibitions) {
        const i = a.library.exhibitions.findIndex(e => e.id === ex.id);
        if (i >= 0) { a.library.exhibitions[i] = ex; replaced++; } else { a.library.exhibitions.push(ex); added++; }
      }
      await persist();
      if (a.homeOpen) renderHome();
      toast(`전시실 ${added}개를 불러왔어요${replaced ? ` · ${replaced}개는 백업 내용으로 바꿨어요` : ''}`, 4000);
    } catch (e) { console.error(e); toast(e.message || '불러오지 못했어요', 4000); }
  });
  function installHelp() {
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    openSheet([
      { title: true, label: ios
        ? '1. 먼저 아래에서 백업 파일을 저장해요\n2. Safari 공유 버튼(□↑) → "홈 화면에 추가"\n3. 새 앱을 열고 보관에서 백업 파일을 불러와요\n(앱과 Safari 는 저장 공간이 따로예요)'
        : '브라우저 메뉴 → "앱 설치" 또는 "홈 화면에 추가"\n설치한 앱은 사진을 더 오래 보관해요' },
      ...(deferredInstall ? [{ label: '지금 설치하기', fn: () => { deferredInstall.prompt(); deferredInstall = null; } }] : []),
      { label: '먼저 백업 파일 저장', fn: () => exportExhibitions(ownExhibitions(), `MyMuseum-백업-${dateTag()}.pmbk`, true) },
      { label: '닫기', quiet: true },
    ]);
  }
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });
  // 바꾼 것이 있는데 일주일 넘게 백업하지 않았으면 홈에서 한 번 알려 준다
  let backupNudged = false;
  function nudgeBackup() {
    if (backupNudged || !a.library.changedAt) return;
    if (a.library.lastBackup && a.library.lastBackup > a.library.changedAt) return;
    if (a.library.lastBackup && Date.now() - a.library.lastBackup < 7 * 86400000) return;
    backupNudged = true;
    setTimeout(() => toast('사진을 잃지 않게 백업해 두세요\n홈 오른쪽 위 ⤓ 보관', 4500), 1200);
  }

  return { openBackupMenu, exportExhibitions, nudgeBackup };
}

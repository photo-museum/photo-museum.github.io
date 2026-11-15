# 자동 시험

앱을 진짜 브라우저(Playwright + Chromium)로 열어 주요 기능이 되는지 확인해요.

```bash
NODE_PATH=$(npm root -g) node tests/run.js
```

이름에 낱말이 든 시험만 돌리려면 뒤에 적어요.

```bash
NODE_PATH=$(npm root -g) node tests/run.js 지도 관람
```

- 서버는 필요 없어요 (저장소 파일을 그대로 읽어요).
- 컴퓨터 화면 14가지 + 휴대폰(돌린 화면·터치) 4가지. 전부 도는 데 5~6분.
- 기능을 고치거나 더하면 `tests/run.js` 에 시험도 하나 더해 주세요.
- 버전 표시(보관 메뉴)는 `js/backupui.js` 의 `APP_VERSION`.

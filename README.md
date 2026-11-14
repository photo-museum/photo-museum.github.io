# photo-museum

어두운 3D 미술관을 걸어 다니며 내 사진을 보는 웹앱. three.js, 빌드 과정 없음.

- 열기: https://photo-museum.github.io
- 로컬: `python3 -m http.server` 후 http://localhost:8000

## 구조

| 파일 | 하는 일 |
| --- | --- |
| `js/store.js` | 전시 데이터(방 목록 → 사진 목록)와 IndexedDB 저장 |
| `js/layout.js` | 데이터 → 방 길이·사진 위치 계산 (순수 함수) |
| `js/builder.js` | 배치 → three.js 장면, 빛 무늬, 충돌 벽 |
| `js/materials.js` | 빛 무늬를 곱하는 가벼운 셰이더 |
| `js/textures.js` | 콘크리트·나무 살·석고 무늬 (캔버스로 생성) |
| `js/controls.js` | 걷기, 시선, 충돌 |
| `js/main.js` | 시작, 화면 조작, 사진 넣기 |
| `vendor/` | three.js 0.170.0, nipplejs 0.10.2 |

조명은 실제 광원을 쓰지 않는다. 사진 위치에 맞춰 벽·바닥용 빛 무늬를 캔버스에 미리 그리고,
셰이더가 무늬를 곱한다. 바닥 반사는 방을 위아래로 뒤집은 복사본을 반투명 바닥 아래에 둔 것.

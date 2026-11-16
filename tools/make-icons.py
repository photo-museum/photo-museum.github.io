# 앱 아이콘과 홈 화면 로고 글꼴을 만든다:  python3 tools/make-icons.py   (pip: fonttools brotli · node: playwright)
#  · 모양(사용자가 고른 시안 P3): 완전한 검정 바탕 + 흰 글씨 "MY / MUSEUM", 프리텐다드 Bold, 자간 넓게, 조명·그림 없음
#  · assets/fonts/pretendard-logo.woff2 : 로고에 쓰는 글자(M Y U S E 와 빈칸)만 남긴 아주 작은 프리텐다드 Bold. 홈 화면 로고(css .brand)와 아이콘이 함께 쓴다
#  · assets/icons/icon-192.png · icon-512.png · apple-touch-icon.png(180) : 모서리를 깎지 않은 꽉 찬 정사각형 (둥근 모서리는 기기가 깎는다)
# 프리텐다드 원본은 npm 의 pretendard 꾸러미에서 가져온다:  npm pack pretendard && tar xzf pretendard-*.tgz  → 그 안의 Pretendard-Bold.woff2 경로를 첫 인자로
import base64, io, os, subprocess, sys, tempfile
from fontTools import subset
from fontTools.ttLib import TTFont

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = sys.argv[1] if len(sys.argv) > 1 else '/tmp/pt/package/dist/web/static/woff2/Pretendard-Bold.woff2'
f = TTFont(src)
s = subset.Subsetter(subset.Options(flavor='woff2', layout_features=['kern']))
s.populate(text='MYUSE ')
s.subset(f)
buf = io.BytesIO(); f.flavor = 'woff2'; f.save(buf)
os.makedirs(os.path.join(root, 'assets', 'fonts'), exist_ok=True)
open(os.path.join(root, 'assets', 'fonts', 'pretendard-logo.woff2'), 'wb').write(buf.getvalue())
print('assets/fonts/pretendard-logo.woff2', len(buf.getvalue()), 'bytes')

b64 = base64.b64encode(buf.getvalue()).decode()
# 시안 P3 와 같은 수치 (120 칸 기준)
html = f'''<!doctype html><meta charset="utf-8"><style>
@font-face{{font-family:'PMLogo';font-weight:700;src:url(data:font/woff2;base64,{b64}) format('woff2');}}
html,body{{margin:0;background:#000}} svg{{display:block}}</style>
<svg id="i" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#000"/>
<text text-anchor="middle" x="60.8" y="54" font-family="PMLogo" font-weight="700" font-size="18.5" letter-spacing="1.6" fill="#fff">MY</text>
<text text-anchor="middle" x="60.8" y="78" font-family="PMLogo" font-weight="700" font-size="18.5" letter-spacing="1.6" fill="#fff">MUSEUM</text></svg>'''
tmp = tempfile.mkdtemp()
open(os.path.join(tmp, 'icon.html'), 'w', encoding='utf-8').write(html)
js = '''
const { chromium } = require('playwright');
(async () => {
  const [html, out] = process.argv.slice(2);
  const b = await chromium.launch();
  for (const [name, px] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
    const p = await (await b.newContext({ viewport: { width: 120, height: 120 }, deviceScaleFactor: px / 120 })).newPage();
    await p.goto('file://' + html);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    await p.screenshot({ path: out + '/' + name, clip: { x: 0, y: 0, width: 120, height: 120 } });
    console.log('assets/icons/' + name, px);
  }
  await b.close();
})();
'''
open(os.path.join(tmp, 'shot.js'), 'w').write(js)
env = dict(os.environ)
env['NODE_PATH'] = subprocess.run(['npm', 'root', '-g'], capture_output=True, text=True).stdout.strip()
subprocess.run(['node', os.path.join(tmp, 'shot.js'), os.path.join(tmp, 'icon.html'), os.path.join(root, 'assets', 'icons')], check=True, env=env)

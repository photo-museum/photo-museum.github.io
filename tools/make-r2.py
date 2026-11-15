# 시험판(R2: 벽 따라 한 바퀴 도는 방) 페이지를 만든다: r2/index.html
# index.html 을 그대로 가져와 (1) 주소 기준을 한 단계 위로 (2) PM_R2 를 켜고 (3) 홈 화면 앱 설정은 뺀다.
# index.html 을 고친 뒤에는 다시 돌린다:  python3 tools/make-r2.py
import os, re
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s = open(os.path.join(root, 'index.html'), encoding='utf-8').read()
s = s.replace('<head>', '<head>\n  <base href="../">\n  <script>globalThis.PM_R2 = true;</script>', 1)
s = re.sub(r'\n\s*<link rel="manifest"[^>]*>', '', s)
s = s.replace('<title>My Museum</title>', '<title>My Museum · 시험판</title>')
assert 'PM_R2' in s and '<base' in s
os.makedirs(os.path.join(root, 'r2'), exist_ok=True)
open(os.path.join(root, 'r2', 'index.html'), 'w', encoding='utf-8').write(s)
print('r2/index.html')

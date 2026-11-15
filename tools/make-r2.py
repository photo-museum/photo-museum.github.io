# index.html 에서 곁가지 페이지 두 개를 만든다. index.html 을 고친 뒤에는 다시 돌린다:  python3 tools/make-r2.py
#  · old/index.html : 예전 구조 (긴 방, 사진이 양쪽 벽에 지그재그 + 가로 지도). PM_CLASSIC 을 켠다. 저장 공간은 본 앱과 같다.
#  · r2/index.html  : 시험판 때 쓰던 주소. 구조는 본 앱과 같고, 시험판 때의 저장 공간(따로)을 그대로 연다 (PM_R2).
# 두 페이지 모두 주소 기준을 한 단계 위로 두고(<base>), 홈 화면 앱 설정(manifest)은 뺀다.
import os, re
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(root, 'index.html'), encoding='utf-8').read()

def make(folder, flag, title):
    s = src.replace('<head>', '<head>\n  <base href="../">\n  <script>globalThis.%s = true;</script>' % flag, 1)
    s = re.sub(r'\n\s*<link rel="manifest"[^>]*>', '', s)
    s = s.replace('<title>My Museum</title>', '<title>My Museum · %s</title>' % title)
    assert flag in s and '<base' in s
    os.makedirs(os.path.join(root, folder), exist_ok=True)
    open(os.path.join(root, folder, 'index.html'), 'w', encoding='utf-8').write(s)
    print(folder + '/index.html')

make('old', 'PM_CLASSIC', '예전 구조')
make('r2', 'PM_R2', '시험판')

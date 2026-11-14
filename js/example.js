// 튜토리얼용 예시 전시실: 제주 여행.
// 사진은 위키미디어 공용(Wikimedia Commons)의 자유 이용 사진이고, 설명 둘째 줄에 찍은 사람과 라이선스를 적었다.
// 자세한 출처: assets/tutorial/CREDITS.md
const T = 'assets/tutorial/';

export const EXAMPLE = {
  title: '제주, 바람이 머문 자리',
  intro: '사흘 동안 제주의 바닷가와 들판을 걸으며 만난 풍경들이에요.\n'
    + '첫 방은 검은 바위와 바다, 두 번째 방은 노란 유채와 초록 들판.\n'
    + '(사용법을 보여 드리는 예시 전시예요. 사진은 위키미디어 공용의 자유 이용 사진이에요.)',
  rooms: [
    {
      theme: 'dark',
      name: '바다와 빛',
      intro: '현무암 바위에 부딪히는 파도, 해 질 녘 푸른빛에 잠긴 성산일출봉. 섬의 가장자리에서 본 바다예요.',
      photos: [
        { file: T + '1-seongsan.jpg', caption: '성산일출봉, 푸른 시간\n해가 진 뒤 수국 너머로 본 일출봉\n사진: Basile Morin · CC BY-SA 4.0' },
        { file: T + '2-hyeopjae.jpg', caption: '협재 바다\n에메랄드빛 물 건너 비양도\n사진: Lcarrion88 · CC BY-SA 4.0' },
        { file: T + '3-jusangjeolli.jpg', caption: '대포 주상절리\n용암이 식으며 만든 기둥 바위\n사진: Bernard Gagnon · CC0' },
        { file: T + '4-waves.jpg', caption: '부서지는 파도\n주상절리에 부딪히는 겨울 바다\n사진: Yoo Chung · CC BY-SA 3.0' },
      ],
    },
    {
      theme: 'white',
      name: '들과 꽃',
      intro: '봄이면 섬 곳곳이 노랗게 물들어요. 유채꽃밭과 귤밭, 끝없이 이어지는 녹차 이랑.',
      photos: [
        { file: T + '5-canola.jpg', caption: '유채꽃\n봄바람에 흔들리는 노란 들판\n사진: Joycekim77 · CC BY-SA 3.0' },
        { file: T + '6-sanbangsan.jpg', caption: '산방산\n유채꽃 너머 우뚝 선 산\n사진: 제주올레 · CC BY-SA 4.0' },
        { file: T + '7-tangerine.jpg', caption: '귤밭\n올레 7코스 길가의 귤나무\n사진: 제주올레 · CC BY-SA 4.0' },
        { file: T + '8-tea.jpg', caption: '녹차밭\n오설록 녹차 이랑\n사진: lumoplank · CC0' },
      ],
    },
  ],
};

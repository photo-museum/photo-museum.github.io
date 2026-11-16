// 전시를 보는 동안 잔잔한 클래식 (저작권 없는 연주: assets/music/CREDITS.md)
// - 전시실에 들어가면 작은 소리로 스르륵 켜지고, 홈으로 나오거나 다른 앱으로 가면 멈춘다.
// - ♪ 버튼으로 끄고 켜며, 끈 것은 기억한다.
// - 소리 크기: 아이폰·아이패드는 audio.volume 을 바꿀 수 없어서 Web Audio 의 gain 을 쓴다 (넉넉한 버퍼로).
//   그 밖(안드로이드·컴퓨터)은 Web Audio 를 거치지 않고 audio.volume 만 쓴다.
//   (Web Audio 로 돌리면 3D 화면을 그리느라 바쁠 때 소리 버퍼가 비어 '지직' 하는 일이 있어서. 음악 파일 자체는 검사해 보니 깨끗했다)

export const TRACKS = [
  { file: 'assets/music/gymnopedie1.mp3', title: '짐노페디 1번', who: '에릭 사티' },
  { file: 'assets/music/clair-de-lune.mp3', title: '달빛', who: '클로드 드뷔시' },
  { file: 'assets/music/nocturne-op9-2.mp3', title: '녹턴 2번 (Op. 9-2)', who: '프레데리크 쇼팽' },
  { file: 'assets/music/bach-prelude-c.mp3', title: '전주곡 1번 C장조', who: 'J. S. 바흐' },
  { file: 'assets/music/traumerei.mp3', title: '트로이메라이', who: '로베르트 슈만' },
];

const VOLUME = 0.32;   // 전시장 배경으로 작게
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const FADE = 1.6;      // 초

export class Music {
  constructor({ onChange } = {}) {
    this.onChange = onChange || (() => {});
    this.audio = new Audio();
    this.audio.preload = 'none';
    if (!IOS) this.audio.volume = 0;
    this.audio.crossOrigin = 'anonymous';
    this.audio.addEventListener('ended', () => this.next());
    this.audio.addEventListener('error', () => { if (this.playing && (this._skips = (this._skips || 0) + 1) < TRACKS.length) setTimeout(() => this.next(), 400); });
    this.ctx = null; this.gain = null;
    this.i = Math.floor(Math.random() * TRACKS.length);
    this.playing = false;   // 지금 소리가 나야 하는지
    let saved = null;
    try { saved = localStorage.getItem('pm-music'); } catch (e) {}
    this.enabled = saved !== 'off';
  }
  get track() { return TRACKS[this.i]; }
  // 첫 소리는 사용자가 누른 순간에 시작해야 한다 (휴대폰 자동 재생 막힘)
  _graph() {
    if (this.ctx || !IOS) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC({ latencyHint: 'playback' }); // 반응이 조금 늦어도 끊기지 않게 버퍼를 넉넉히
      const src = this.ctx.createMediaElementSource(this.audio);
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      src.connect(this.gain).connect(this.ctx.destination);
    } catch (e) { this.ctx = null; this.gain = null; }
  }
  _fade(to, sec = FADE) {
    if (this.gain && this.ctx) {
      const g = this.gain.gain, t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(to, t + sec);
      return;
    }
    // audio.volume 을 조금씩 바꿔 스르륵 (1초에 30번)
    clearInterval(this._ft);
    const from = this.audio.volume, t0 = performance.now(), ms = sec * 1000;
    if (ms <= 0) { this.audio.volume = to; return; }
    this._ft = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      try { this.audio.volume = from + (to - from) * k; } catch (e) {}
      if (k >= 1) clearInterval(this._ft);
    }, 33);
  }
  _load() {
    const want = new URL(this.track.file, document.baseURI).href;
    if (this.audio.src !== want) this.audio.src = want;
  }
  // 전시실에 들어갈 때 (누른 순간 안에서 부른다)
  start() {
    if (!this.enabled) { this.onChange(); return; }
    this._graph();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this._load();
    this.playing = true;
    this._play();
    this._fade(VOLUME);
    this.onChange(true);
  }
  // 자동 재생이 막혔으면 멈춤 표시, 파일이 안 열리면 다음 곡
  _play() {
    const p = this.audio.play();
    if (p && p.catch) p.catch(err => {
      if (!this.playing) return;
      if (err && err.name === 'NotAllowedError') { this.playing = false; this.onChange(); }
      else if ((this._skips = (this._skips || 0) + 1) < TRACKS.length) this.next();
    });
    if (p && p.then) p.then(() => { this._skips = 0; }, () => {}); // 실패는 위에서 다룬다 (여기서 또 터지지 않게)
  }
  // 홈으로 나올 때·다른 앱으로 갈 때
  stop() {
    if (!this.playing) return;
    this.playing = false;
    this._fade(0, 0.8);
    clearTimeout(this._pt);
    this._pt = setTimeout(() => { if (!this.playing) this.audio.pause(); }, 850);
    this.onChange();
  }
  next() {
    this.i = (this.i + 1) % TRACKS.length;
    this._load();
    if (this.playing) { this._play(); this.onChange(true); }
  }
  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem('pm-music', this.enabled ? 'on' : 'off'); } catch (e) {}
    if (this.enabled) this.start(); else this.stop();
    this.onChange();
    return this.enabled;
  }
}

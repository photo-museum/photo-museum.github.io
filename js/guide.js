// 튜토리얼 안내: 화면 위쪽 작은 카드가 한 단계씩 알려 주고,
// 사용자가 그 동작을 하면 (done 이 참이 되면) 저절로 다음 단계로 넘어간다.
// step = { text, done?(): boolean, manual?: true(다음 버튼), editorTip?: string, onEnter?() }
export class Guide {
  constructor(el, { onEnd } = {}) {
    this.el = el;
    this.onEnd = onEnd;
    this.steps = [];
    this.i = -1;
    this.textEl = el.querySelector('.text');
    this.countEl = el.querySelector('.count');
    this.nextBtn = el.querySelector('[data-g="next"]');
    el.querySelector('[data-g="skip"]').addEventListener('click', () => this.stop());
    this.nextBtn.addEventListener('click', () => this.next());
  }
  get active() { return this.i >= 0; }
  get step() { return this.steps[this.i]; }

  start(steps) {
    this.steps = steps;
    this.i = -1;
    this.el.classList.add('on');
    this.next();
  }
  stop() {
    this.i = -1;
    this.el.classList.remove('on');
    if (this.onEnd) this.onEnd();
  }
  next() {
    this.i++;
    if (this.i >= this.steps.length) { this.stop(); return; }
    const s = this.step;
    this._entered = performance.now();
    if (s.onEnter) s.onEnter();
    this.textEl.innerHTML = s.text;
    this.countEl.textContent = `${this.i + 1} / ${this.steps.length}`;
    const last = this.i === this.steps.length - 1;
    this.nextBtn.textContent = last ? '마치기' : '다음';
    this.nextBtn.hidden = !(s.manual || last);
    this.el.classList.remove('pop'); void this.el.offsetWidth; this.el.classList.add('pop');
  }
  // 매 프레임: 지금 단계를 해냈는지 본다 (넘어간 직후 0.6초는 기다림)
  tick() {
    if (!this.active) return;
    const s = this.step;
    if (s.done && performance.now() - this._entered > 600 && s.done()) this.next();
  }
}

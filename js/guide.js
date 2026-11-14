// 튜토리얼 안내.
// 1) 화면 전체가 살짝 어두워지며 안내 글이 뜬다 → '해 볼게요'
// 2) 어둠이 걷히고, 위쪽에 '지금 할 일' 작은 띠만 남는다 → 사용자가 직접 해 본다
// 3) 해내면(done 이 참) 다시 어두워지며 다음 안내 글
// step = { title, text, task?(짧은 할 일), done?(): boolean, editorTip?: string }
export class Guide {
  constructor({ modal, pill, onEnd, onModal }) {
    this.modal = modal;
    this.pill = pill;
    this.onEnd = onEnd;
    this.onModal = onModal;
    this.steps = [];
    this.i = -1;
    this.doing = false;
    modal.querySelector('[data-g="skip"]').addEventListener('click', () => this.stop());
    modal.querySelector('[data-g="go"]').addEventListener('click', () => this._go());
    pill.querySelector('[data-g="pass"]').addEventListener('click', () => this.next());
  }
  get active() { return this.i >= 0; }
  get step() { return this.steps[this.i]; }

  start(steps) {
    this.steps = steps;
    this.i = -1;
    this.next();
  }
  stop() {
    this.i = -1;
    this.doing = false;
    this._modal(false);
    this.pill.classList.remove('on');
    if (this.onEnd) this.onEnd();
  }
  next() {
    this.i++;
    this.doing = false;
    this.pill.classList.remove('on');
    if (this.i >= this.steps.length) { this.stop(); return; }
    const s = this.step;
    if (s.onEnter) s.onEnter();
    const m = this.modal;
    m.querySelector('.count').textContent = `${this.i + 1} / ${this.steps.length}`;
    m.querySelector('.title').textContent = s.title || '';
    m.querySelector('.text').innerHTML = s.text;
    const last = this.i === this.steps.length - 1;
    m.querySelector('[data-g="go"]').textContent = s.done ? '해 볼게요' : last ? '마치기' : '다음';
    m.querySelector('[data-g="skip"]').textContent = last ? '' : '그만 보기';
    m.querySelector('[data-g="skip"]').hidden = last;
    // 진행 점
    const dots = m.querySelector('.dots');
    dots.innerHTML = this.steps.map((_, k) => `<i class="${k < this.i ? 'past' : k === this.i ? 'now' : ''}"></i>`).join('');
    this._modal(true);
  }
  _go() {
    const s = this.step;
    if (!s) return;
    if (!s.done) { this.next(); return; }
    this._modal(false);
    this.doing = true;
    this._since = performance.now();
    this.pill.querySelector('.task').innerHTML = s.task || s.text;
    this.pill.classList.add('on');
  }
  _modal(on) {
    this.modal.classList.toggle('on', on);
    if (this.onModal) this.onModal(on);
  }
  // 매 프레임: 할 일을 해냈는지 본다
  tick() {
    if (!this.doing) return;
    const s = this.step;
    if (s && s.done && performance.now() - this._since > 400 && s.done()) {
      this.doing = false;
      const i = this.i;
      this.pill.classList.add('done');
      setTimeout(() => { this.pill.classList.remove('done'); if (this.i === i) this.next(); }, 450); // 해낸 걸 잠깐 보여 주고
    }
  }
}

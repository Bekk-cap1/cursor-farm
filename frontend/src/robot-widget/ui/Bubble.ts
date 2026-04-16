const PHRASES_RU = [
  'Привет! Я помогу по ферме.',
  'Проверь влажность полей сегодня.',
  'Есть просроченные задачи?',
  'Загляни в AI-аналитик — там сводка.',
  'Хорошего дня на хозяйстве!',
]

const PHRASES_EN = [
  'Hi! I can help with the farm.',
  'Check field moisture today.',
  'Any overdue tasks?',
  'Open AI analytics for the summary.',
  'Have a good day on the farm!',
]

export class SpeechBubble {
  readonly el: HTMLDivElement
  private hideTimer: ReturnType<typeof setTimeout> | null = null
  private autoTimer: ReturnType<typeof setInterval> | null = null

  constructor(zIndex: number) {
    this.el = document.createElement('div')
    this.el.setAttribute('role', 'status')
    this.el.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      'max-width:min(260px,72vw)',
      'padding:12px 16px',
      'border-radius:16px',
      'background:linear-gradient(165deg,#ffffff 0%,#ecfdf5 42%,#f0fdfa 100%)',
      'border:1px solid rgba(16,185,129,0.32)',
      'box-shadow:0 10px 28px rgba(6,78,59,0.08),0 2px 8px rgba(16,185,129,0.12)',
      'font:600 13px/1.4 system-ui,Segoe UI,sans-serif',
      'color:#134e4a',
      'pointer-events:none',
      'opacity:0',
      'transform:scale(0.94)',
      'transition:opacity 0.22s ease,transform 0.22s ease',
      `z-index:${zIndex + 1}`,
      'white-space:pre-wrap',
    ].join(';')
    document.body.appendChild(this.el)
  }

  setPosition(x: number, y: number) {
    const pad = 8
    const w = this.el.offsetWidth || 180
    const h = this.el.offsetHeight || 48
    const nx = Math.min(window.innerWidth - w - pad, Math.max(pad, x - w / 2))
    const ny = Math.min(window.innerHeight - h - pad, Math.max(pad, y - h - 12))
    this.el.style.left = `${nx}px`
    this.el.style.top = `${ny}px`
  }

  say(text: string, ms = 3200) {
    this.el.textContent = text
    this.el.style.opacity = '1'
    this.el.style.transform = 'scale(1)'
    if (this.hideTimer) clearTimeout(this.hideTimer)
    this.hideTimer = setTimeout(() => {
      this.el.style.opacity = '0'
      this.hideTimer = null
    }, ms)
  }

  startAutoPhrases(lang: 'ru' | 'en', everyMs = 4500) {
    this.stopAuto()
    const list = lang === 'ru' ? PHRASES_RU : PHRASES_EN
    this.autoTimer = setInterval(() => {
      const t = list[Math.floor(Math.random() * list.length)]
      if (t) this.say(t, 2800)
    }, everyMs)
  }

  stopAuto() {
    if (this.autoTimer) {
      clearInterval(this.autoTimer)
      this.autoTimer = null
    }
  }

  destroy() {
    this.stopAuto()
    if (this.hideTimer) clearTimeout(this.hideTimer)
    this.el.remove()
  }
}

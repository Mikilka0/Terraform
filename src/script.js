// ==========================================
// НАЛАШТУВАННЯ PIXEL CARD (Originkit адаптація)
// ==========================================
const CONFIG = {
  colors: ["#c4c4c4", "#a0a0a0", "#1a4d33"], // Сірі та акцентний зелений
  gap: 12, // Відстань між пікселями (як було в CSS)
  pixelSize: 3, // Розмір пікселя
  speed: 36, // Швидкість мерехтіння
  appearFrom: "middle", // Анімація появи: 'middle', 'top', 'bottom', 'left', 'right'
  durationMs: 1000, // Тривалість анімації (0.8s)
};

// ==========================================
// ЛОГІКА КУРСОРУ ТА РАДАРУ
// ==========================================
const container = document.getElementById("reveal-container");
const revealLayer = document.getElementById("reveal-layer");
const pixelGrid = document.querySelector(".pixel-grid-overlay");

// 1. Глобальний радар: оновлюємо CSS-змінні для маски
document.addEventListener("mousemove", (e) => {
  if (pixelGrid) {
    const rect = pixelGrid.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    pixelGrid.style.setProperty("--mouse-x", `${x}px`);
    pixelGrid.style.setProperty("--mouse-y", `${y}px`);
  }
});

// 2. Локальне розкриття каменя
container.addEventListener("mousemove", (e) => {
  const rect = container.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  revealLayer.style.setProperty("--x", `${x}px`);
  revealLayer.style.setProperty("--y", `${y}px`);
});

// ==========================================
// ORIGINKIT PIXEL CANVAS LOGIC (Vanilla JS)
// ==========================================
function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1,
    bx = 3 * (x2 - x1) - cx,
    ax = 1 - cx - bx;
  const cy = 3 * y1,
    by = 3 * (y2 - y1) - cy,
    ay = 1 - cy - by;
  const fx = (t) => ((ax * t + bx) * t + cx) * t;
  const dfx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = fx(t) - x,
        d = dfx(t);
      if (Math.abs(e) < 1e-5 || d === 0) break;
      t -= e / d;
    }
    return ((ay * t + by) * t + cy) * t;
  };
}
const easeOut = cubicBezier(0, 0, 0.58, 1);

class Pixel {
  constructor(canvas, context, x, y, color, speed, delay, maxPx) {
    this.width = canvas.width;
    this.height = canvas.height;
    this.ctx = context;
    this.x = x;
    this.y = y;
    this.color = color;
    this.speed = (Math.random() * (0.9 - 0.1) + 0.1) * speed;
    this.size = 0;
    const factor = maxPx / 2;
    this.minSize = 0.5 * factor;
    this.maxSizeInteger = maxPx;
    this.maxSize = Math.random() * (maxPx - this.minSize) + this.minSize;
    this.delay = delay;
    this.counter = 0;
    this.counterStep = Math.random() * 4 + (this.width + this.height) * 0.01;
    this.isIdle = false;
    this.isReverse = false;
    this.isShimmer = false;
    this.growStart = null;
    this.shrinkStart = null;
    this.shrinkFrom = 0;
  }

  draw() {
    const centerOffset = this.maxSizeInteger * 0.5 - this.size * 0.5;
    this.ctx.fillStyle = this.color;
    this.ctx.fillRect(
      this.x + centerOffset,
      this.y + centerOffset,
      this.size,
      this.size,
    );
  }

  appear(now, durationMs, easeFn) {
    this.isIdle = false;
    this.shrinkStart = null;
    if (this.counter <= this.delay) {
      this.counter += this.counterStep;
      return;
    }
    if (!this.isShimmer) {
      if (this.growStart === null) this.growStart = now;
      const p =
        durationMs > 0 ? Math.min(1, (now - this.growStart) / durationMs) : 1;
      this.size = easeFn(p) * this.maxSize;
      if (p >= 1) this.isShimmer = true;
    }
    if (this.isShimmer) this.shimmer();
    this.draw();
  }

  disappear(now, durationMs, easeFn) {
    this.isShimmer = false;
    this.counter = 0;
    this.growStart = null;
    if (this.size <= 0) {
      this.isIdle = true;
      this.shrinkStart = null;
      return;
    }
    if (this.shrinkStart === null) {
      this.shrinkStart = now;
      this.shrinkFrom = this.size;
    }
    const p =
      durationMs > 0 ? Math.min(1, (now - this.shrinkStart) / durationMs) : 1;
    this.size = this.shrinkFrom * (1 - easeFn(p));
    if (p >= 1) this.size = 0;
    this.draw();
  }

  shimmer() {
    if (this.size >= this.maxSize) this.isReverse = true;
    else if (this.size <= this.minSize) this.isReverse = false;
    this.size += this.isReverse ? -this.speed : this.speed;
  }
}

class PixelGridController {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.pixels = [];
    this.animationRef = null;
    this.timePrevious = performance.now();

    this.initPixels();

    // Перемальовуємо при зміні розміру вікна
    window.addEventListener("resize", () => {
      this.initPixels();
      this.handleAnimation("appear");
    });

    // Запускаємо анімацію появи, коли курсор заходить у вікно
    document.body.addEventListener("mouseenter", () =>
      this.handleAnimation("appear"),
    );
    document.body.addEventListener("mouseleave", () =>
      this.handleAnimation("disappear"),
    );

    // Запуск одразу при завантаженні (можеш закоментувати, якщо хочеш щоб чекало на мишу)
    this.handleAnimation("appear");
  }

  initPixels() {
    const container = this.canvas.parentElement;
    const width = container.clientWidth;
    const height = container.clientHeight;

    this.canvas.width = width;
    this.canvas.height = height;

    this.pixels = [];
    let idx = 0;

    const effectiveSpeed = CONFIG.speed > 0 ? CONFIG.speed * 0.002 : 0;
    const step = Math.max(1, parseInt(CONFIG.gap));

    for (let x = 0; x < width; x += step) {
      for (let y = 0; y < height; y += step) {
        const c = CONFIG.colors[idx % CONFIG.colors.length];
        idx++;

        let delay = 0;
        if (CONFIG.appearFrom === "top") delay = y;
        else if (CONFIG.appearFrom === "bottom") delay = height - y;
        else if (CONFIG.appearFrom === "left") delay = x;
        else if (CONFIG.appearFrom === "right") delay = width - x;
        else {
          const dx = x - width / 2;
          const dy = y - height / 2;
          delay = Math.sqrt(dx * dx + dy * dy);
        }

        this.pixels.push(
          new Pixel(
            this.canvas,
            this.ctx,
            x,
            y,
            c,
            effectiveSpeed,
            delay,
            Math.max(0.1, CONFIG.pixelSize),
          ),
        );
      }
    }
  }

  doAnimate(fnName) {
    this.animationRef = requestAnimationFrame(() => this.doAnimate(fnName));
    const timeNow = performance.now();
    const timePassed = timeNow - this.timePrevious;
    const timeInterval = 1000 / 60; // 60 FPS

    if (timePassed < timeInterval) return;
    this.timePrevious = timeNow - (timePassed % timeInterval);

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    let allIdle = true;
    for (let i = 0; i < this.pixels.length; i++) {
      const pixel = this.pixels[i];
      pixel[fnName](timeNow, CONFIG.durationMs, easeOut);
      if (!pixel.isIdle) allIdle = false;
    }

    if (allIdle && fnName === "disappear") {
      cancelAnimationFrame(this.animationRef);
    }
  }

  handleAnimation(name) {
    if (this.animationRef !== null) cancelAnimationFrame(this.animationRef);
    this.animationRef = requestAnimationFrame(() => this.doAnimate(name));
  }
}

// Ініціалізація Canvas
document.addEventListener("DOMContentLoaded", () => {
  new PixelGridController("pixel-canvas");
});

// 1. Конфігурація
const CONFIG = {
  colors: ["#c4c4c4", "#a0a0a0", "#1a4d33"], // Сірі та акцентний зелений
  gap: 12, // Відстань між пікселями
  pixelSize: 3, // Розмір пікселя
  speed: 36, // Швидкість мерехтіння
  appearFrom: "middle", // Анімація появи
  durationMs: 1000, // Тривалість анімації
};

// 2. DOM Елементи & Глобальні EVENT LISTENERS
const container = document.getElementById("reveal-container");
const revealLayer = document.getElementById("reveal-layer");
const pixelGrid = document.querySelector(".pixel-grid-overlay");

// Глобальний радар: оновлюємо CSS-змінні для маски Canvas
document.addEventListener("mousemove", (e) => {
  if (pixelGrid) {
    const rect = pixelGrid.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    pixelGrid.style.setProperty("--mouse-x", `${x}px`);
    pixelGrid.style.setProperty("--mouse-y", `${y}px`);
  }
});

// Перевірка на Локальне розкриття каменя
if (container && revealLayer) {
  container.addEventListener("mousemove", (e) => {
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    revealLayer.style.setProperty("--x", `${x}px`);
    revealLayer.style.setProperty("--y", `${y}px`);
  });
}

// 3. Анімаційні Утиліти (Cubic Bezier)
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

// 4. Логіка Піксельного класу
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

// 5. Клас Grid Controller
class PixelGridController {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");
    this.pixels = [];
    this.animationRef = null;
    this.timePrevious = performance.now();

    this.initPixels();

    window.addEventListener("resize", () => {
      this.initPixels();
      this.handleAnimation("appear");
    });

    document.body.addEventListener("mouseenter", () =>
      this.handleAnimation("appear"),
    );
    document.body.addEventListener("mouseleave", () =>
      this.handleAnimation("disappear"),
    );

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

// 7. Мобільна логіка Авто-Сканування
let scanProgress = 0;
let scanDirection = 1;
let lastTime = performance.now();

function mobileAutoScan(timeNow) {
  if (window.innerWidth <= 768) {
    const deltaTime = timeNow - lastTime;
    scanProgress += 0.03 * scanDirection * deltaTime;

    if (scanProgress >= 100) {
      scanProgress = 100;
      scanDirection = -1;
    } else if (scanProgress <= 0) {
      scanProgress = 0;
      scanDirection = 1;
    }

    // Розраховуємо глобальні координати для вікна
    const currentX = (scanProgress / 100) * window.innerWidth;
    const currentY = window.innerHeight / 2;

    // 7.1. Анімуємо розкриття каменя (тільки якщо він є на сторінці)
    if (container && revealLayer) {
      const rect = container.getBoundingClientRect();
      const rockX = (scanProgress / 100) * rect.width;
      const rockY = rect.height / 2;
      revealLayer.style.setProperty("--x", `${rockX}px`);
      revealLayer.style.setProperty("--y", `${rockY}px`);
    }

    // 7.2. Анімуємо радар піксельної сітки (якщо вона є на сторінці)
    if (pixelGrid) {
      pixelGrid.style.setProperty("--mouse-x", `${currentX}px`);
      pixelGrid.style.setProperty("--mouse-y", `${currentY}px`);
    }
  }

  lastTime = timeNow;
  requestAnimationFrame(mobileAutoScan);
}

requestAnimationFrame(mobileAutoScan);

// 8. Розширена Логіка Землі (Originkit Адаптація: Three.js + D3)
class TerraformGlobe {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container || typeof THREE === "undefined") return;

    this.container.innerHTML = ""; // Очищаємо контейнер

    // Налаштування кольорів під дизайн Terraform
    this.config = {
      dotColor: "#1a4d33", // Акцентний зелений
      oceanColor: "#f4f4f4", // Колір фону
      gridColor: "#020202", // Колір ліній сітки
      gridOpacity: 0.3, // Прозорість сітки
      dotSize: 0.008, // Розмір пікселів-точок
      density: 12, // Щільність точок
      speed: 0.002, // Швидкість обертання
    };

    this.initScene();
    this.loadWorldData();
    this.setupInteractions();

    // Запуск циклу
    this.animate();
  }

  initScene() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    this.camera.position.z = 2.5; // Віддалення камери

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.globeGroup = new THREE.Group();
    this.scene.add(this.globeGroup);

    // Додаємо напівпрозорий "океан" (основа сфери)
    const oceanGeo = new THREE.SphereGeometry(1, 64, 64);
    const oceanMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.config.oceanColor),
      transparent: true,
      opacity: 0.1,
    });
    this.globeGroup.add(new THREE.Mesh(oceanGeo, oceanMat));

    // Сітка Координат
    this.drawGrid();

    // Адаптивність при ресайзі
    window.addEventListener("resize", () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
  }

  drawGrid() {
    const gridMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(this.config.gridColor),
      transparent: true,
      opacity: this.config.gridOpacity,
    });

    const gridGroup = new THREE.Group();
    // Радіус трохи більший за 1, щоб лінії не ховалися всередині океану
    const radius = 1.001;
    const segments = 64;

    // 8.1. Паралелі (Горизонтальні лінії) кожні 15 градусів
    for (let lat = -75; lat <= 75; lat += 15) {
      const points = [];
      const latRad = lat * (Math.PI / 180);
      const y = Math.sin(latRad) * radius;
      const r = Math.cos(latRad) * radius;

      for (let i = 0; i <= segments; i++) {
        const lng = (i / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(lng) * r, y, Math.sin(lng) * r));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      gridGroup.add(new THREE.Line(geometry, gridMaterial));
    }

    // 8.2. Меридіани (Вертикальні лінії) кожні 15 градусів
    for (let lng = -180; lng < 180; lng += 15) {
      const points = [];
      const lngRad = lng * (Math.PI / 180);

      for (let i = 0; i <= segments; i++) {
        const lat = (i / segments) * Math.PI - Math.PI / 2;
        const r = Math.cos(lat) * radius;
        const y = Math.sin(lat) * radius;
        points.push(
          new THREE.Vector3(Math.cos(lngRad) * r, y, Math.sin(lngRad) * r),
        );
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      gridGroup.add(new THREE.Line(geometry, gridMaterial));
    }

    this.globeGroup.add(gridGroup);
  }

  async loadWorldData() {
    try {
      // Завантажуємо GeoJSON (як в Originkit)
      const response = await fetch(
        "https://cdn.jsdelivr.net/gh/martynafford/natural-earth-geojson@master/50m/physical/ne_50m_land.json",
      );
      const landFeatures = await response.json();

      // Створюємо прихований Canvas для D3 проекції
      const bitmapWidth = 2048;
      const bitmapHeight = 1024;
      const offscreenCanvas = document.createElement("canvas");
      offscreenCanvas.width = bitmapWidth;
      offscreenCanvas.height = bitmapHeight;
      const ctx = offscreenCanvas.getContext("2d", {
        willReadFrequently: true,
      });

      // Налаштовуємо D3 проекцію
      const projection = d3
        .geoEquirectangular()
        .fitSize([bitmapWidth, bitmapHeight], { type: "Sphere" });
      const pathGenerator = d3.geoPath().projection(projection).context(ctx);

      // Малюємо карту (Чорний фон, білі материки)
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, bitmapWidth, bitmapHeight);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      landFeatures.features.forEach((feature) => pathGenerator(feature));
      ctx.fill();

      const imageData = ctx.getImageData(0, 0, bitmapWidth, bitmapHeight);
      const pixels = imageData.data;

      // Функція перевірки: чи знаходяться координати на суші?
      const isOnLand = (lng, lat) => {
        const x = Math.round(((lng + 180) / 360) * bitmapWidth) % bitmapWidth;
        const y = Math.round(((90 - lat) / 180) * bitmapHeight);
        const clampedY = Math.max(0, Math.min(bitmapHeight - 1, y));
        const idx = (clampedY * bitmapWidth + x) * 4;
        return pixels[idx] > 128; // Якщо білий колір
      };

      this.generateDots(isOnLand);
    } catch (error) {
      console.error("Failed to load map data:", error);
    }
  }

  generateDots(isOnLand) {
    const dotCoordinates = [];
    const baseStep = this.config.density * 0.08;

    // Скануємо сітку координат і додаємо точки тільки там, де є суша
    for (let lat = -90; lat <= 90; lat += baseStep) {
      const latRad = (Math.abs(lat) * Math.PI) / 180;
      const cosLat = Math.cos(latRad);
      // Збільшуємо крок по довготі ближче до полюсів, щоб точки не злипалися
      const lngStep = cosLat > 0.01 ? baseStep / Math.max(0.3, cosLat) : 360;

      for (let lng = -180; lng < 180; lng += lngStep) {
        if (isOnLand(lng, lat)) {
          dotCoordinates.push([lng, lat]);
        }
      }
    }

    // Використовуємо InstancedMesh для максимальної продуктивності (як в Originkit)
    const dotGeometry = new THREE.SphereGeometry(this.config.dotSize, 5, 5);
    const dotMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.config.dotColor),
    });
    const instancedMesh = new THREE.InstancedMesh(
      dotGeometry,
      dotMaterial,
      dotCoordinates.length,
    );

    const dummy = new THREE.Object3D();

    dotCoordinates.forEach((coord, i) => {
      const [lng, lat] = coord;
      const latRad = lat * (Math.PI / 180);
      const lngRad = lng * (Math.PI / 180);

      // Сферичні координати в 3D (X, Y, Z)
      dummy.position.set(
        Math.cos(latRad) * Math.sin(lngRad),
        Math.sin(latRad),
        Math.cos(latRad) * Math.cos(lngRad),
      );
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    });

    instancedMesh.instanceMatrix.needsUpdate = true;
    this.globeGroup.add(instancedMesh);
  }

  setupInteractions() {
    this.isDragging = false;
    this.targetRotation = { x: 0, y: 0 };
    let lastMouseX = 0;
    let lastMouseY = 0;

    // Плавний Drag'n'Drop для обертання Землі
    this.container.addEventListener("mousedown", (e) => {
      this.isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    });

    document.addEventListener("mousemove", (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;

      this.targetRotation.x += dx * 0.005;
      this.targetRotation.y += dy * 0.005;

      // Обмежуємо нахил по вертикалі
      this.targetRotation.y = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, this.targetRotation.y),
      );

      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    });

    document.addEventListener("mouseup", () => {
      this.isDragging = false;
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    // Автоматичне обертання, коли користувач не тягне мишею
    if (!this.isDragging) {
      this.targetRotation.x -= this.config.speed;
    }

    // Плавна інтерполяція (Lerp) для м'якого руху
    this.globeGroup.rotation.y +=
      (this.targetRotation.x - this.globeGroup.rotation.y) * 0.1;
    this.globeGroup.rotation.x +=
      (this.targetRotation.y - this.globeGroup.rotation.x) * 0.1;

    this.renderer.render(this.scene, this.camera);
  }
}

// 9. Розумна Ініцалізація
document.addEventListener("DOMContentLoaded", () => {
  // 9.1. Перевіряємо, чи ми на Головній (шукаємо pixel-canvas)
  const pixelCanvasEl = document.getElementById("pixel-canvas");
  if (pixelCanvasEl) {
    new PixelGridController("pixel-canvas");
  }

  // 9.2. Перевіряємо, чи ми на СТОРІНЦІ IMPACT (шукаємо earth-wrapper)
  const earthWrapperEl = document.getElementById("earth-wrapper");
  if (earthWrapperEl) {
    // Важливо: перевіряємо, чи завантажився Three.js
    if (typeof THREE !== "undefined") {
      new TerraformGlobe("earth-wrapper");
    } else {
      console.warn("Three.js is not loaded!");
    }
  }

  // 9.3. Логіка мобільного меню (Dropdown)
  const menuBtn = document.getElementById("mobile-menu-btn");
  const navLinks = document.getElementById("nav-links");

  if (menuBtn && navLinks) {
    menuBtn.addEventListener("click", () => {
      navLinks.classList.toggle("active");
      // Змінюємо текст кнопки при кліку
      menuBtn.textContent = navLinks.classList.contains("active")
        ? "CLOSE"
        : "MENU";
    });
  }

  // --- 9.4. Логіка сторінки Technology (Перемикання Секцій) ---
  const techTabs = document.querySelectorAll(".tech-tab");
  const techSections = document.querySelectorAll(".tech-section");

  if (techTabs.length > 0 && techSections.length > 0) {
    techTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        if (tab.classList.contains("active")) return;

        // 1. Знімаємо active з усіх вкладок
        techTabs.forEach((t) => t.classList.remove("active"));
        // 2. Додаємо active на натиснуту вкладку
        tab.classList.add("active");

        // 3. Знімаємо active з усіх секцій контенту
        techSections.forEach((section) => section.classList.remove("active"));

        // 4. Знаходимо потрібну секцію по ID і показуємо її
        const targetId = tab.getAttribute("data-target");
        const targetSection = document.getElementById(targetId);
        if (targetSection) {
          targetSection.classList.add("active");
        }
      });
    });
  }
});

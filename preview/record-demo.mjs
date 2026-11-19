/**
 * Graba un recorrido del sitio (vista previa local) como video MP4, para
 * presentaciones al cliente.
 *
 *   npm run preview                      # en otra terminal: http://localhost:4321
 *   node record-demo.mjs iphone [salida.mp4]
 *   node record-demo.mjs mac [salida.mp4]
 *
 * Recorre Home (scroll completo, con el banner que gira y la línea de
 * tiempo), Joyería personalizada (gira la medalla, escribe, cambia tipografía
 * y metal, agrega al carrito) y Contacto. Captura en tiempo real con el
 * screencast de Chrome (CDP) y arma el MP4 con ffmpeg respetando los tiempos
 * reales de cada cuadro.
 *
 * Necesita: playwright-core (devDependency), un Chromium de Playwright o
 * Chrome (CHROME_PATH) y ffmpeg en el PATH.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.env.PREVIEW_URL ?? 'http://localhost:4321';
const target = process.argv[2] ?? 'mac';
const output = path.resolve(process.argv[3] ?? `mila-ibarra-${target}.mp4`);

const DEVICES = {
  iphone: {
    context: {
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    },
    capture: { width: 786, height: 1704 },
    bar: 60,
    speed: 520, // px/s for normal scrolling
    slowSpeed: 330, // px/s through the pinned sections
  },
  mac: {
    context: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 4 / 3 },
    capture: { width: 1920, height: 1200 },
    bar: 88,
    speed: 720,
    slowSpeed: 380,
  },
};

const device = DEVICES[target];
if (!device) {
  console.error(`Dispositivo desconocido: ${target} (usa iphone o mac)`);
  process.exit(1);
}
const mobile = target === 'iphone';

function findChromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).filter((name) => name.startsWith('chromium-')).sort().reverse()) {
      const app = path.join(cache, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
      if (existsSync(app)) return app;
    }
  }
  return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
}

// Visible pointer for the video: an arrow on Mac, a touch dot on iPhone.
// Also hides scrollbars and smooth-scroll so scripted scrolling is exact.
const OVERLAY = (isMobile) => `
  (() => {
    const install = () => {
      if (document.getElementById('__demo_pointer')) return;
      const style = document.createElement('style');
      style.textContent = \`
        html { scroll-behavior: auto !important; scrollbar-width: none; }
        ::-webkit-scrollbar { display: none; }
        #__demo_pointer { position: fixed; z-index: 2147483647; pointer-events: none; left: 0; top: 0;
          transition: opacity .25s ease, transform .12s ease; }
        #__demo_pointer.touch { width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
          background: rgba(17,17,17,.18); border: 2px solid rgba(255,255,255,.85); box-shadow: 0 2px 10px rgba(0,0,0,.25); opacity: 0; }
        #__demo_pointer.touch.down { opacity: 1; transform: scale(.85); }
        #__demo_pointer.arrow { width: 22px; height: 22px; }
        #__demo_pointer.arrow.down { transform: scale(.88); }
      \`;
      document.documentElement.append(style);
      const pointer = document.createElement('div');
      pointer.id = '__demo_pointer';
      pointer.className = ${isMobile} ? 'touch' : 'arrow';
      if (!${isMobile}) {
        pointer.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 13.8 L10.6 20.4 L13.4 19.1 L10.4 12.6 L16.4 12.6 Z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
        pointer.style.opacity = '0';
      }
      document.documentElement.append(pointer);
      const move = (x, y) => { pointer.style.left = x + 'px'; pointer.style.top = y + 'px'; if (!${isMobile}) pointer.style.opacity = '1'; };
      addEventListener('mousemove', (e) => move(e.clientX, e.clientY), true);
      addEventListener('mousedown', (e) => { move(e.clientX, e.clientY); pointer.classList.add('down'); }, true);
      addEventListener('mouseup', () => pointer.classList.remove('down'), true);
      addEventListener('pointerdown', (e) => { move(e.clientX, e.clientY); pointer.classList.add('down'); }, true);
      addEventListener('pointerup', () => pointer.classList.remove('down'), true);
    };
    if (document.documentElement) install();
    document.addEventListener('DOMContentLoaded', install);
    // In a video, lazy photos popping in mid-scroll look like a bug: load them all up front.
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('img[loading="lazy"]').forEach((image) => { image.loading = 'eager'; });
    });
  })();
`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Smooth in-page scroll to `y` (eased), resolves when done. */
async function scrollTo(page, y, speed) {
  await page.evaluate(
    ({ y, speed }) =>
      new Promise((resolve) => {
        const start = window.scrollY;
        const end = Math.max(0, Math.min(y, document.documentElement.scrollHeight - innerHeight));
        const distance = end - start;
        const duration = Math.max(500, (Math.abs(distance) / speed) * 1000);
        const t0 = performance.now();
        const ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
        const step = (now) => {
          const t = Math.min(1, (now - t0) / duration);
          window.scrollTo(0, start + distance * ease(t));
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      }),
    { y, speed }
  );
}

/** Document Y of an element's top, minus the sticky header bar. */
async function topOf(page, selector, offset = 0) {
  return page.evaluate(
    ({ selector, offset }) => {
      const element = document.querySelector(selector);
      return element ? element.getBoundingClientRect().top + window.scrollY - offset : null;
    },
    { selector, offset }
  );
}

async function scrollToElement(page, selector, { offset = device.bar + 16, speed = device.speed, pause = 700 } = {}) {
  const y = await topOf(page, selector, offset);
  if (y === null) return;
  await scrollTo(page, y, speed);
  await wait(pause);
}

/** Moves the visible pointer to an element, then clicks it. */
async function press(page, locator, { pause = 500 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) return;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (!mobile) await page.mouse.move(x, y, { steps: 18 });
  await wait(mobile ? 150 : 250);
  await page.mouse.click(x, y, { delay: 90 });
  await wait(pause);
}

async function drag(page, selector, dx, { duration = 1300 } = {}) {
  const box = await page.locator(selector).boundingBox();
  if (!box) return;
  const x = box.x + box.width / 2 - dx / 2;
  const y = box.y + box.height * 0.55;
  if (!mobile) await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.move(x, y);
  await page.mouse.down();
  const steps = 45;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const eased = -(Math.cos(Math.PI * t) - 1) / 2;
    await page.mouse.move(x + dx * eased, y + Math.sin(t * Math.PI) * 12);
    await wait(duration / steps);
  }
  await page.mouse.up();
}

// ---------------------------------------------------------------- the tour

async function home(page) {
  await page.goto(`${BASE}/?cart=empty`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await wait(2200);

  const sections = ['#shopify-section-triptico', '#shopify-section-declaracion', '#shopify-section-productos'];
  for (const selector of sections) await scrollToElement(page, selector, { pause: 900 });

  // Editorial: quote, portrait, second quote
  await scrollToElement(page, '#shopify-section-editorial', { pause: 700 });
  const editorial = await page.evaluate(() => document.querySelector('#shopify-section-editorial').offsetHeight);
  const editorialTop = await topOf(page, '#shopify-section-editorial', device.bar);
  await scrollTo(page, editorialTop + editorial - page.viewportSize().height * 0.85, device.speed * 0.8);
  await wait(900);

  await scrollToElement(page, '#shopify-section-dos_formas', { pause: 900 });
  const twoWays = await page.evaluate(() => document.querySelector('#shopify-section-dos_formas').offsetHeight);
  const twoWaysTop = await topOf(page, '#shopify-section-dos_formas', device.bar);
  await scrollTo(page, twoWaysTop + twoWays - page.viewportSize().height + 40, device.speed * 0.8);
  await wait(700);

  // Pinned banner: the medal turns as we scroll through it.
  for (const [selector, inner] of [
    ['#shopify-section-banner', 'mi-spin'],
    ['#shopify-section-linea_de_tiempo', 'mi-timeline'],
  ]) {
    const start = await topOf(page, inner, device.bar);
    const length = await page.evaluate((inner) => {
      const element = document.querySelector(inner);
      const stage = element.firstElementChild?.offsetHeight ?? 0;
      return Math.max(0, element.offsetHeight - Math.min(stage, innerHeight));
    }, inner);
    await scrollTo(page, start, device.speed);
    await wait(500);
    await scrollTo(page, start + length, device.slowSpeed);
    await wait(1400);
  }

  await scrollToElement(page, '#shopify-section-contacto', { pause: 1200 });
  await scrollTo(page, 1e6, device.speed);
  await wait(1600);
}

async function openPage(page, label) {
  if (mobile) {
    await scrollTo(page, 0, device.speed * 2);
    await press(page, page.locator('[data-mi-menu-open]'), { pause: 900 });
    await press(page, page.locator('.mi-header__panel a', { hasText: label }), { pause: 300 });
  } else {
    await scrollTo(page, 0, device.speed * 2.5);
    await press(page, page.locator('.mi-header__links a', { hasText: label }), { pause: 300 });
  }
  await page.waitForLoadState('networkidle');
}

async function configurator(page) {
  await openPage(page, 'Joyería personalizada');
  await page.waitForSelector('mi-configurator.is-3d-ready', { timeout: 30000 });
  await wait(2200); // intro turn

  await drag(page, '[data-mi-configurator-stage]', mobile ? 220 : 380);
  await wait(900);
  await drag(page, '[data-mi-configurator-stage]', mobile ? -220 : -380);
  await wait(900);

  if (mobile) await scrollToElement(page, '.mi-configurator__head', { pause: 500 });

  const text = page.locator('[data-mi-text]');
  await press(page, text, { pause: 200 });
  await text.press('ControlOrMeta+a');
  await text.press('Backspace');
  await wait(400);
  await text.pressSequentially('Ana', { delay: 260 });
  await wait(900);

  if (mobile) {
    // On the phone the viewer is above the form: glance up to see the change.
    await scrollTo(page, 0, device.speed);
    await wait(1200);
    await scrollToElement(page, '.mi-configurator__form fieldset', { pause: 400 });
  }

  await press(page, page.locator('label:has([data-mi-font="cursiva"])'), { pause: 1100 });
  await press(page, page.locator('label:has([data-mi-material="plata"])'), { pause: 1100 });
  await press(page, page.locator('label:has([data-mi-material="oro-rosa"])'), { pause: 1300 });

  if (mobile) {
    await scrollTo(page, 0, device.speed);
    await wait(1600);
  }

  await scrollToElement(page, '[data-mi-step="imagen"]', { pause: 900, offset: device.bar + (mobile ? 40 : 160) });
  await press(page, page.locator('.mi-accordion__summary').first(), { pause: 1200 });

  await scrollToElement(page, '#shopify-section-mi_steps', { pause: 1100 });
  await scrollToElement(page, '#shopify-section-mi_other_metals', { pause: 1400 });

  await scrollTo(page, 0, device.speed * 1.6);
  await wait(600);
  await press(page, page.locator('.mi-configurator__form [type="submit"]'), { pause: 2800 });
  await page.keyboard.press('Escape');
  await wait(900);
}

async function contact(page) {
  await openPage(page, 'Contacto');
  await page.evaluate(() => document.fonts.ready);
  await wait(1400);
  const name = page.locator('input[name="contact[name]"]');
  await press(page, name, { pause: 200 });
  await name.pressSequentially('Ana López', { delay: 90 });
  await wait(500);
  const message = page.locator('textarea[name="contact[body]"]');
  if (await message.count()) {
    await press(page, message, { pause: 200 });
    await message.pressSequentially('Quiero grabar una fecha en una medalla de plata.', { delay: 45 });
  }
  await wait(900);
  await scrollTo(page, 1e6, device.speed * 0.8);
  await wait(1800);
}

// ---------------------------------------------------------------- capture

async function main() {
  const workdir = path.join(os.tmpdir(), `mi-demo-${target}-${Date.now()}`);
  mkdirSync(workdir, { recursive: true });

  const browser = await chromium.launch({ executablePath: findChromium(), headless: true });
  const context = await browser.newContext(device.context);
  await context.addInitScript(OVERLAY(mobile));
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  const frames = [];
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = path.join(workdir, `f${String(frames.length).padStart(6, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, time: metadata.timestamp });
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId });
    } catch {
      /* page navigating */
    }
  });
  await page.goto('about:blank');
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: device.capture.width,
    maxHeight: device.capture.height,
    everyNthFrame: 1,
  });

  const started = Date.now();
  await home(page);
  await configurator(page);
  await contact(page);
  const endTime = frames.at(-1)?.time + 0.5;

  await cdp.send('Page.stopScreencast');
  await browser.close();

  // Drop the blank first frames (about:blank) and build a timed concat list.
  const first = frames.findIndex((frame, index) => index > 0 && frame.time - frames[0].time > 0.3);
  const usable = frames.slice(Math.max(0, first - 1));
  // Smoothness report: share of gaps between frames that exceed two 60 Hz frames.
  const gaps = usable.slice(1).map((frame, index) => frame.time - usable[index].time).filter((gap) => gap < 0.25);
  const slow = gaps.filter((gap) => gap > 0.034).length;
  console.log(`${target}: ${((slow / Math.max(1, gaps.length)) * 100).toFixed(1)}% de cuadros con más de 34 ms (mientras hay movimiento)`);
  const lines = [];
  usable.forEach((frame, index) => {
    const next = usable[index + 1]?.time ?? endTime;
    lines.push(`file '${frame.file}'`, `duration ${Math.max(0.001, next - frame.time).toFixed(4)}`);
  });
  lines.push(`file '${usable.at(-1).file}'`);
  const list = path.join(workdir, 'frames.txt');
  writeFileSync(list, lines.join('\n'));

  const { width, height } = device.capture;
  execFileSync(
    'ffmpeg',
    [
      '-y', '-loglevel', 'error',
      '-f', 'concat', '-safe', '0', '-i', list,
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:white,fps=30,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart',
      output,
    ],
    { stdio: 'inherit' }
  );
  rmSync(workdir, { recursive: true, force: true });
  console.log(`${target}: ${usable.length} cuadros en ${((Date.now() - started) / 1000).toFixed(0)} s → ${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

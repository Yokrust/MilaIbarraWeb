/**
 * <mi-spin> — scroll-scrubbed image sequence (sections/mi-spin-banner.liquid).
 *
 * The track is taller than the viewport; its stage is sticky. While the stage
 * is pinned, the scroll position picks a frame of the medal turning and draws
 * it on a canvas (cover-fit, ≤ 2× pixel ratio), cross-fading between the two
 * nearest frames so the turn stays smooth between renders.
 *
 * Frames load progressively once the banner is within two screens: first the
 * first and last frames, then every 12th, 6th, 3rd and finally all — so the
 * animation is usable almost immediately and sharpens as the rest arrive.
 *
 * Reduced motion: does nothing; the section stays a static banner.
 */
const LOAD_PASSES = [12, 6, 3, 1];
const CONCURRENCY = 6;
const MAX_PIXEL_RATIO = 2;

class MiSpin extends HTMLElement {
  connectedCallback() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    try {
      this.sets = JSON.parse(this.querySelector('[data-mi-spin-frames]')?.textContent ?? '{}');
    } catch {
      return;
    }
    this.stage = this.querySelector('.mi-spin__stage');
    this.canvas = this.querySelector('.mi-spin__canvas');
    this.ctx = this.canvas?.getContext('2d', { alpha: false });
    if (!this.stage || !this.ctx) return;

    this.desktopQuery = window.matchMedia('(min-width: 750px)');
    this.frame = -1;
    this.raf = 0;
    this.started = false;

    this.classList.add('is-animated');
    this.useSet();

    this.onScroll = () => this.schedule();
    this.onSetChange = () => {
      this.useSet();
      if (this.started) this.load();
    };
    window.addEventListener('scroll', this.onScroll, { passive: true });
    this.desktopQuery.addEventListener('change', this.onSetChange);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.stage);

    this.loadObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        this.loadObserver.disconnect();
        this.started = true;
        this.load();
      },
      { rootMargin: '200% 0px' }
    );
    this.loadObserver.observe(this);
  }

  disconnectedCallback() {
    window.removeEventListener('scroll', this.onScroll);
    this.desktopQuery?.removeEventListener('change', this.onSetChange);
    this.resizeObserver?.disconnect();
    this.loadObserver?.disconnect();
    cancelAnimationFrame(this.raf);
  }

  useSet() {
    this.urls = (this.desktopQuery.matches ? this.sets.desktop : this.sets.mobile) ?? [];
    this.images = new Array(this.urls.length);
    this.generation = (this.generation ?? 0) + 1;
    this.frame = -1;
    this.classList.remove('is-ready');
  }

  /** Progressive loading: endpoints, then coarse-to-fine passes. */
  async load() {
    const generation = this.generation;
    const count = this.urls.length;
    const order = [0, count - 1];
    for (const step of LOAD_PASSES) {
      for (let index = 0; index < count; index += step) if (!order.includes(index)) order.push(index);
    }

    let next = 0;
    const worker = async () => {
      while (next < order.length && generation === this.generation) {
        const index = order[next++];
        const image = new Image();
        image.decoding = 'async';
        image.src = this.urls[index];
        try {
          await image.decode();
        } catch {
          continue;
        }
        if (generation !== this.generation) return;
        this.images[index] = image;
        if (!this.classList.contains('is-ready')) this.classList.add('is-ready');
        this.frame = -1; // a sharper frame may now be available
        this.schedule();
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }

  resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const width = Math.round(this.stage.clientWidth * ratio);
    const height = Math.round(this.stage.clientHeight * ratio);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.frame = -1;
    }
    this.schedule();
  }

  schedule() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.update();
    });
  }

  /** 0 when the stage starts sticking, 1 when it's about to scroll away. */
  progress() {
    const rect = this.getBoundingClientRect();
    const stageTop = parseFloat(getComputedStyle(this.stage).top) || 0;
    const distance = rect.height - this.stage.offsetHeight;
    if (distance <= 0) return 0;
    return Math.min(1, Math.max(0, (stageTop - rect.top) / distance));
  }

  update() {
    const rect = this.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;

    const progress = this.progress();
    // Text arrives as the medal settles facing front.
    const text = Math.min(1, Math.max(0, (progress - 0.62) / 0.28));
    this.style.setProperty('--mi-spin-text', text.toFixed(3));
    this.style.setProperty('--mi-spin-click', text > 0.5 ? 'auto' : 'none');

    const count = this.urls.length;
    if (!count) return;
    const frame = progress * (count - 1);
    if (Math.abs(frame - this.frame) < 0.01) return;
    this.frame = frame;
    this.draw(frame);
  }

  draw(frame) {
    const lower = Math.floor(frame);
    const upper = Math.min(lower + 1, this.urls.length - 1);
    const mix = frame - lower;

    const base = this.images[lower] ?? this.nearest(lower);
    if (!base) return;
    this.cover(base, 1);
    // Cross-fade only between two real neighbours.
    if (mix > 0.02 && this.images[lower] && this.images[upper]) this.cover(this.images[upper], mix);
  }

  nearest(index) {
    for (let offset = 1; offset < this.images.length; offset += 1) {
      const image = this.images[index - offset] ?? this.images[index + offset];
      if (image) return image;
    }
    return null;
  }

  cover(image, alpha) {
    const { width, height } = this.canvas;
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    this.ctx.globalAlpha = 1;
  }
}

if (!customElements.get('mi-spin')) {
  customElements.define('mi-spin', MiSpin);
}

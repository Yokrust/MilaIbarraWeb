/**
 * <mi-configurator> — the viewer half of the configurator page (no Three.js
 * in this file). It:
 *   1. feature-detects WebGL and prefers-reduced-motion;
 *   2. when supported, lazy-imports assets/configurator.js (the Three.js
 *      bundle built from /configurator) once the viewer scrolls near the
 *      viewport, and calls its mount(this);
 *   3. otherwise keeps the static photo, swapping it to the chosen metal —
 *      this is the no-WebGL / reduced-motion experience, with the same form;
 *   4. handles the thumbnails under the viewer (first = live 3D, the rest
 *      are photos shown on top of it).
 *
 * The bundle contract is documented in configurator/src/main.js.
 */
class MiConfigurator extends HTMLElement {
  connectedCallback() {
    this.root = this.closest('[data-mi-configurator-root]') ?? document;
    this.fallback = this.querySelector('[data-mi-configurator-fallback]');
    this.photo = this.querySelector('[data-mi-configurator-photo]');

    this.setupThumbnails();

    this.onChange = (event) => this.syncFallback(event.detail);
    this.root.addEventListener('mi:configurator:change', this.onChange);
    if (this.root.miConfiguratorState) this.syncFallback(this.root.miConfiguratorState);

    if (!this.supports3D()) {
      this.classList.add('is-static');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        this.loadScene();
      },
      { rootMargin: '200px' }
    );
    observer.observe(this);
  }

  disconnectedCallback() {
    this.root?.removeEventListener('mi:configurator:change', this.onChange);
  }

  supports3D() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    try {
      const canvas = document.createElement('canvas');
      return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
    } catch {
      return false;
    }
  }

  async loadScene() {
    if (!this.dataset.src || !this.dataset.model) return;
    this.classList.add('is-loading');
    try {
      const bundle = await import(this.dataset.src);
      const scene = await bundle.mount(this);
      if (!scene) this.classList.add('is-static');
    } catch (error) {
      console.warn('[configurador] Sin 3D, se queda la foto.', error);
      this.classList.add('is-static');
    } finally {
      this.classList.remove('is-loading');
    }
  }

  /** Without 3D, the still photo follows the chosen metal. */
  syncFallback(state) {
    if (!this.fallback || !state?.material) return;
    const source = this.fallback.dataset[`src${camel(state.material)}`];
    if (source && this.fallback.getAttribute('src') !== source) {
      this.fallback.removeAttribute('srcset');
      this.fallback.src = source;
    }
  }

  setupThumbnails() {
    const thumbnails = [...this.querySelectorAll('[data-mi-thumb]')];
    for (const thumbnail of thumbnails) {
      thumbnail.addEventListener('click', () => {
        for (const other of thumbnails) other.setAttribute('aria-pressed', String(other === thumbnail));
        const src = thumbnail.dataset.miThumb;
        if (!this.photo) return;
        if (src === 'live') {
          this.photo.hidden = true;
          this.classList.remove('is-showing-photo');
        } else {
          this.photo.src = src;
          this.photo.alt = thumbnail.querySelector('img')?.alt ?? '';
          this.photo.hidden = false;
          this.classList.add('is-showing-photo');
        }
      });
    }
  }
}

function camel(value) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

if (!customElements.get('mi-configurator')) {
  customElements.define('mi-configurator', MiConfigurator);
}

/**
 * <mi-timeline> — pinned horizontal timeline (Home "Cómo nace tu pieza").
 *
 * While the section scrolls through the viewport, its stage sticks to the
 * top and the vertical scroll distance is mapped to a horizontal translate
 * of the track; the progress bar fills from the first dot to the last.
 *
 * The scroller is made exactly as tall as the extra horizontal distance, so
 * one pixel of vertical scroll moves the track one pixel sideways.
 *
 * Without JS, or with prefers-reduced-motion, nothing is pinned: the track
 * stays a native horizontally scrollable row (the CSS default).
 */
class MiTimeline extends HTMLElement {
  connectedCallback() {
    this.scroller = this.querySelector('[data-mi-timeline-scroller]');
    this.sticky = this.querySelector('[data-mi-timeline-sticky]');
    this.track = this.querySelector('[data-mi-timeline-track]');
    this.progress = this.querySelector('[data-mi-timeline-progress]');
    this.dots = [...this.querySelectorAll('.mi-timeline__dot')];
    if (!this.scroller || !this.track) return;

    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.onMotionChange = () => this.setup();
    this.motionQuery.addEventListener('change', this.onMotionChange);

    this.onScroll = () => this.requestUpdate();
    this.onResize = () => this.setup();
    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(this.track);
    window.addEventListener('resize', this.onResize);

    this.setup();
  }

  disconnectedCallback() {
    this.motionQuery?.removeEventListener('change', this.onMotionChange);
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onResize);
    this.resizeObserver?.disconnect();
  }

  setup() {
    const pinned = !this.motionQuery.matches;
    this.classList.toggle('is-pinned', pinned);
    window.removeEventListener('scroll', this.onScroll);

    if (!pinned) {
      this.scroller.style.height = '';
      this.track.style.transform = '';
      this.setProgress(1);
      return;
    }

    const viewportWidth = this.sticky.clientWidth;
    this.distance = Math.max(0, this.track.scrollWidth - viewportWidth);
    this.scroller.style.height = `${window.innerHeight + this.distance}px`;

    // Keep the pinned stage clear of the sticky header bar.
    const headerBar = document.querySelector('.mi-header__bar');
    const headerHeight = headerBar ? headerBar.getBoundingClientRect().height : 0;
    const stageHeight = this.track.getBoundingClientRect().height;
    const centered = (window.innerHeight - stageHeight) / 2;
    this.style.setProperty('--mi-tl-offset', `${Math.max(0, headerHeight - centered + 24)}px`);

    window.addEventListener('scroll', this.onScroll, { passive: true });
    this.update();
  }

  requestUpdate() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.update();
    });
  }

  update() {
    const rect = this.scroller.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    const progress = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
    this.track.style.transform = `translate3d(${-progress * this.distance}px, 0, 0)`;
    this.setProgress(progress);
  }

  setProgress(progress) {
    if (!this.progress || this.dots.length === 0) return;
    const first = this.dots[0].offsetLeft + this.dots[0].offsetParent.offsetLeft + 12;
    const lastDot = this.dots[this.dots.length - 1];
    const last = lastDot.offsetLeft + lastDot.offsetParent.offsetLeft + 12;
    this.progress.style.width = `${first + (last - first) * progress}px`;
  }
}

if (!customElements.get('mi-timeline')) {
  customElements.define('mi-timeline', MiTimeline);
}

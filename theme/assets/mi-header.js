/**
 * <mi-header> — mobile menu panel (native <dialog>) and the live "Bolsa (n)"
 * count. The count listens for `mi:cart:updated`, dispatched by
 * <mi-cart-drawer> after every cart change, so the header never fetches the
 * cart on its own.
 */
class MiHeader extends HTMLElement {
  connectedCallback() {
    this.panel = this.querySelector('dialog');
    this.toggle = this.querySelector('[data-mi-menu-open]');

    this.toggle?.addEventListener('click', () => this.openMenu());
    this.querySelector('[data-mi-menu-close]')?.addEventListener('click', () => this.closeMenu());
    this.panel?.addEventListener('close', () => this.toggle?.setAttribute('aria-expanded', 'false'));
    this.panel?.addEventListener('click', (event) => {
      if (event.target === this.panel) this.closeMenu();
    });

    this.onCartUpdated = (event) => {
      const count = event.detail?.item_count;
      if (typeof count !== 'number') return;
      this.querySelectorAll('[data-mi-cart-count]').forEach((element) => {
        element.textContent = String(count);
      });
    };
    document.addEventListener('mi:cart:updated', this.onCartUpdated);
  }

  disconnectedCallback() {
    document.removeEventListener('mi:cart:updated', this.onCartUpdated);
  }

  openMenu() {
    if (!this.panel) return;
    this.panel.showModal();
    this.toggle?.setAttribute('aria-expanded', 'true');
  }

  closeMenu() {
    this.panel?.close();
  }
}

if (!customElements.get('mi-header')) {
  customElements.define('mi-header', MiHeader);
}

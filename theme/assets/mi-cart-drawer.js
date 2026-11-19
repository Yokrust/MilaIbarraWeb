/**
 * <mi-cart-drawer> — the "Tu bolsa" side panel (sections/mi-cart-drawer.liquid).
 *
 * Contract other components rely on (all events on `document`):
 *   - `mi:cart:open`     → open the drawer as it is.
 *   - `mi:cart:refresh`  → re-render from the server, then open (dispatch this
 *                          after your own fetch('/cart/add.js')).
 *   - `mi:cart:updated`  ← dispatched here after every change, detail {item_count}
 *                          (the header's "Bolsa (n)" listens for it).
 *   - Any click on `[data-mi-cart-open]` opens the drawer instead of going to /cart.
 *
 * Quantity changes go through the Ajax Cart API (/cart/change.js) and ask for
 * this section's fresh HTML in the same request (Section Rendering API), so
 * the markup always comes from Liquid — no client-side templates.
 */
const SECTION_ID = 'mi-cart-drawer';

class MiCartDrawer extends HTMLElement {
  connectedCallback() {
    this.onDocumentClick = this.onDocumentClick.bind(this);
    this.onOpen = () => this.open();
    this.onRefresh = () => this.refresh().then(() => this.open());

    document.addEventListener('click', this.onDocumentClick);
    document.addEventListener('mi:cart:open', this.onOpen);
    document.addEventListener('mi:cart:refresh', this.onRefresh);
    this.bindDialog();
  }

  disconnectedCallback() {
    document.removeEventListener('click', this.onDocumentClick);
    document.removeEventListener('mi:cart:open', this.onOpen);
    document.removeEventListener('mi:cart:refresh', this.onRefresh);
  }

  get dialog() {
    return this.querySelector('[data-mi-cart-dialog]');
  }

  bindDialog() {
    const dialog = this.dialog;
    if (!dialog || dialog.dataset.bound) return;
    dialog.dataset.bound = 'true';

    // Clicking the backdrop (the dialog element itself, outside the panel) closes it.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) this.close();
    });
    dialog.addEventListener('close', () => {
      document.documentElement.style.removeProperty('overflow');
      this.opener?.focus?.();
    });
  }

  onDocumentClick(event) {
    const opener = event.target.closest('[data-mi-cart-open]');
    if (opener) {
      event.preventDefault();
      this.opener = opener;
      this.open();
      return;
    }

    if (!this.contains(event.target)) return;

    if (event.target.closest('[data-mi-cart-close]')) {
      event.preventDefault();
      this.close();
      return;
    }

    const qtyButton = event.target.closest('[data-mi-cart-qty]');
    if (qtyButton) {
      const line = qtyButton.closest('[data-mi-cart-line]');
      if (!line) return;
      this.changeQuantity(line, Number(qtyButton.dataset.miCartQty));
    }
  }

  open() {
    const dialog = this.dialog;
    if (!dialog || dialog.open) return;
    dialog.showModal(); // native focus trap + Esc + aria-modal
    document.documentElement.style.overflow = 'hidden';
    dialog.querySelector('[data-mi-cart-close]')?.focus();
  }

  close() {
    this.dialog?.close();
  }

  async changeQuantity(line, quantity) {
    line.classList.add('is-updating');
    try {
      const response = await fetch(`${window.Shopify?.routes?.root || '/'}cart/change.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          line: Number(line.dataset.miCartLine),
          quantity: Math.max(0, quantity),
          sections: [SECTION_ID],
          sections_url: window.location.pathname,
        }),
      });
      const cart = await response.json();
      if (!response.ok) throw new Error(cart.description || cart.message || 'cart/change failed');

      this.render(cart.sections?.[SECTION_ID]);
      this.announce(cart.item_count);
      this.emitUpdated(cart.item_count);
    } catch (error) {
      line.classList.remove('is-updating');
      this.setStatus('No pudimos actualizar tu bolsa. Intenta de nuevo.');
      console.error(error);
    }
  }

  async refresh() {
    try {
      const root = window.Shopify?.routes?.root || '/';
      const [sectionsResponse, cartResponse] = await Promise.all([
        fetch(`${window.location.pathname}?sections=${SECTION_ID}`),
        fetch(`${root}cart.js`, { headers: { Accept: 'application/json' } }),
      ]);
      const sections = await sectionsResponse.json();
      const cart = await cartResponse.json();
      this.render(sections[SECTION_ID]);
      this.emitUpdated(cart.item_count);
    } catch (error) {
      console.error(error);
    }
  }

  /** Swap the panel contents with the freshly rendered section HTML. */
  render(html) {
    if (!html) return;
    const fresh = new DOMParser().parseFromString(html, 'text/html').querySelector('[data-mi-cart-content]');
    const current = this.querySelector('[data-mi-cart-content]');
    if (!fresh || !current) return;
    current.replaceWith(fresh);
  }

  emitUpdated(itemCount) {
    document.dispatchEvent(new CustomEvent('mi:cart:updated', { detail: { item_count: itemCount } }));
  }

  announce(itemCount) {
    this.setStatus(itemCount === 1 ? '1 pieza en tu bolsa' : `${itemCount} piezas en tu bolsa`);
  }

  setStatus(message) {
    const status = this.querySelector('[data-mi-cart-status]');
    if (status) status.textContent = message;
  }
}

if (!customElements.get('mi-cart-drawer')) {
  customElements.define('mi-cart-drawer', MiCartDrawer);
}

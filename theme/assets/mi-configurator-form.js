/**
 * <mi-configurator-form> — the configurator's state machine and form.
 *
 * State: { text, font: 'romana' | 'cursiva', material: 'oro' | 'plata' | 'oro-rosa' }
 * Every change is kept on the section root (`root.miConfiguratorState`) and
 * announced with `mi:configurator:change`, which the 3D viewer and the static
 * fallback both listen to. The HTML inputs themselves are the
 * `properties[...]` line item properties, so whatever the customer sees is
 * exactly what reaches the order.
 *
 * Deep links from the Home cards preset the state:
 *   ?material=plata&tipografia=cursiva&texto=A·B&imagen=1
 *
 * Add to cart goes through /cart/add.js and then asks <mi-cart-drawer> to
 * refresh and open (`mi:cart:refresh`). Without JS the form posts normally.
 */
class MiConfiguratorForm extends HTMLElement {
  connectedCallback() {
    this.root = this.closest('[data-mi-configurator-root]') ?? this;
    this.form = this.querySelector('form');
    this.textInput = this.querySelector('[data-mi-text]');
    this.counter = this.querySelector('[data-mi-text-count]');
    this.summary = this.querySelector('[data-mi-summary]');
    this.error = this.querySelector('[data-mi-error]');
    this.submit = this.querySelector('[type="submit"]');
    this.productTitle = this.dataset.productTitle ?? '';

    this.applyQueryParams();

    this.form?.addEventListener('input', () => this.update());
    this.form?.addEventListener('change', () => this.update());
    this.form?.addEventListener('submit', (event) => this.addToCart(event));

    this.update();
  }

  get state() {
    const font = this.form?.querySelector('[data-mi-font]:checked');
    const material = this.form?.querySelector('[data-mi-material]:checked');
    return {
      text: this.textInput?.value ?? '',
      font: font?.dataset.miFont ?? 'romana',
      fontLabel: font?.value ?? 'Romana',
      material: material?.dataset.miMaterial ?? 'oro',
      materialLabel: material?.value ?? 'Oro',
    };
  }

  update() {
    const state = this.state;

    if (this.counter && this.textInput) {
      this.counter.textContent = `${this.textInput.value.length} / ${this.textInput.maxLength}`;
    }
    this.querySelectorAll('[data-mi-current="font"]').forEach((element) => (element.textContent = state.fontLabel));
    this.querySelectorAll('[data-mi-current="material"]').forEach((element) => (element.textContent = state.materialLabel));
    this.textInput?.classList.toggle('is-cursiva', state.font === 'cursiva');

    if (this.summary) {
      const text = state.text.trim() ? `“${state.text.trim()}”` : 'sin texto';
      this.summary.textContent = `Tu pieza: ${this.productTitle} · ${text} · ${state.fontLabel} · ${state.materialLabel}`;
    }

    const previous = this.root.miConfiguratorState;
    const changed =
      !previous ||
      previous.text !== state.text ||
      previous.font !== state.font ||
      previous.material !== state.material;
    if (!changed) return;

    this.root.miConfiguratorState = state;
    this.root.dispatchEvent(new CustomEvent('mi:configurator:change', { detail: state }));
  }

  applyQueryParams() {
    const params = new URLSearchParams(window.location.search);
    const material = params.get('material');
    const font = params.get('tipografia');
    const text = params.get('texto');

    if (material) this.check(`[data-mi-material="${CSS.escape(material)}"]`);
    if (font) this.check(`[data-mi-font="${CSS.escape(font)}"]`);
    if (text && this.textInput) this.textInput.value = text.slice(0, this.textInput.maxLength);
    if (params.get('imagen') === '1') {
      // Customer image is phase 2: bring the "Próximamente" step into view.
      requestAnimationFrame(() => this.querySelector('[data-mi-step="imagen"]')?.scrollIntoView({ block: 'center' }));
    }
  }

  check(selector) {
    const input = this.form?.querySelector(selector);
    if (input) input.checked = true;
  }

  async addToCart(event) {
    if (!this.form || !window.fetch) return;
    event.preventDefault();

    if (!this.textInput?.value.trim()) {
      this.showError('Escribe el texto que quieres grabar.');
      this.textInput?.focus();
      return;
    }

    this.showError('');
    this.submit?.setAttribute('aria-busy', 'true');
    this.submit?.setAttribute('disabled', '');

    try {
      const response = await fetch(`${window.Shopify?.routes?.root ?? '/'}cart/add.js`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(this.form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.description || data.message || 'No se pudo agregar.');
      document.dispatchEvent(new CustomEvent('mi:cart:refresh'));
    } catch (error) {
      this.showError(error.message || 'No se pudo agregar al carrito. Intenta de nuevo.');
    } finally {
      this.submit?.removeAttribute('aria-busy');
      this.submit?.removeAttribute('disabled');
    }
  }

  showError(message) {
    if (!this.error) return;
    this.error.textContent = message;
    this.error.hidden = !message;
  }
}

if (!customElements.get('mi-configurator-form')) {
  customElements.define('mi-configurator-form', MiConfiguratorForm);
}

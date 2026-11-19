/**
 * Standard product page (sections/mi-product.liquid):
 *  - variant picker: maps the checked option radios to a variant from the
 *    inline JSON, updates the hidden id, price, button and ?variant= URL;
 *  - add to cart via /cart/add.js, then `mi:cart:refresh` opens the drawer
 *    (falls back to the native form post if fetch fails);
 *  - mobile gallery "1 / 4" counter;
 *  - lazy product recommendations (Section Rendering via the recommendations endpoint).
 */
const section = document.querySelector('.mi-product');

if (section) {
  const form = section.querySelector('[data-mi-product-form]');
  const variants = JSON.parse(section.querySelector('[data-mi-variants]')?.textContent || '[]');
  const idInput = section.querySelector('[data-mi-variant-id]');
  const addButton = section.querySelector('[data-mi-add]');
  const priceEl = section.querySelector('[data-mi-price]');
  const errorEl = section.querySelector('[data-mi-error]');
  const money = (cents) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: window.Shopify?.currency?.active || 'MXN' }).format(
      cents / 100
    ) + ` ${window.Shopify?.currency?.active || 'MXN'}`;

  form?.addEventListener('change', (event) => {
    if (!event.target.matches('input[type="radio"]')) return;
    const fieldset = event.target.closest('[data-mi-option]');
    const label = fieldset?.querySelector('[data-mi-option-value]');
    if (label) label.textContent = event.target.value;

    const selected = [...form.querySelectorAll('[data-mi-option]')].map(
      (set) => set.querySelector('input:checked')?.value
    );
    const variant = variants.find((v) => v.options.every((value, i) => value === selected[i]));
    updateVariant(variant);
  });

  function updateVariant(variant) {
    if (!variant) {
      addButton.disabled = true;
      addButton.textContent = 'No disponible';
      return;
    }
    idInput.value = variant.id;
    if (priceEl) priceEl.textContent = money(variant.price);
    addButton.disabled = !variant.available;
    addButton.textContent = variant.available ? `Agregar al carrito — ${money(variant.price)}` : 'Agotado';

    const url = new URL(window.location.href);
    url.searchParams.set('variant', variant.id);
    window.history.replaceState({}, '', url);
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    addButton.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(`${window.Shopify?.routes?.root || '/'}cart/add.js`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.description || result.message);
      document.dispatchEvent(new CustomEvent('mi:cart:refresh'));
    } catch (error) {
      errorEl.textContent = error.message || 'No pudimos agregar la pieza. Intenta de nuevo.';
      errorEl.hidden = false;
    } finally {
      addButton.removeAttribute('aria-busy');
    }
  });

  // Mobile gallery counter
  const gallery = section.querySelector('[data-mi-gallery]');
  const indexEl = section.querySelector('[data-mi-gallery-index]');
  if (gallery && indexEl) {
    gallery.addEventListener(
      'scroll',
      () => {
        const index = Math.round(gallery.scrollLeft / gallery.clientWidth) + 1;
        indexEl.textContent = String(index);
      },
      { passive: true }
    );
  }

  // Recommendations
  const recs = section.querySelector('[data-mi-recommendations]');
  if (recs?.dataset.url && !recs.children.length) {
    const load = async () => {
      try {
        const response = await fetch(recs.dataset.url);
        const html = new DOMParser().parseFromString(await response.text(), 'text/html');
        const fresh = html.querySelector('[data-mi-recommendations]');
        if (fresh?.innerHTML.trim()) recs.innerHTML = fresh.innerHTML;
      } catch (error) {
        /* recommendations are optional */
      }
    };
    new IntersectionObserver((entries, observer) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      load();
    }, { rootMargin: '400px' }).observe(recs);
  }
}

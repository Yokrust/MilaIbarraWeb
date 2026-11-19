/**
 * Collection page enhancements (sections/mi-collection.liquid):
 *  - the filter/sort form submits itself on change (Shopify storefront
 *    filters work with a plain GET, so without JS the <noscript> button does it);
 *  - on mobile, "Filtrar" toggles the filter list;
 *  - "Ver más piezas" fetches the next page and appends its cards in place,
 *    falling back to a normal link if anything fails.
 */
const form = document.querySelector('[data-mi-filters]');

if (form) {
  form.addEventListener('change', (event) => {
    if (event.target.matches('input[type="number"]')) return; // price: wait for blur/enter
    submitFilters();
  });

  form.querySelectorAll('input[type="number"]').forEach((input) => {
    input.addEventListener('blur', submitFilters);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitFilters();
  });

  const toggle = form.querySelector('[data-mi-filter-toggle]');
  toggle?.addEventListener('toggle', () => {
    form.classList.toggle('is-filters-open', toggle.open);
  });

  // Desktop: only one dropdown open at a time; close on outside click.
  const dropdowns = [...form.querySelectorAll('.mi-collection__filter')];
  dropdowns.forEach((details) => {
    details.addEventListener('toggle', () => {
      if (!details.open || !window.matchMedia('(min-width: 750px)').matches) return;
      dropdowns.forEach((other) => {
        if (other !== details) other.open = false;
      });
    });
  });
  document.addEventListener('click', (event) => {
    if (!window.matchMedia('(min-width: 750px)').matches) return;
    if (event.target.closest('.mi-collection__filter')) return;
    dropdowns.forEach((details) => (details.open = false));
  });
}

function submitFilters() {
  const params = new URLSearchParams();
  for (const [key, value] of new FormData(form)) {
    if (value !== '') params.append(key, value);
  }
  window.location.assign(`${form.action}?${params.toString()}`);
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-mi-load-more]');
  if (!button) return;
  event.preventDefault();

  const grid = document.querySelector('[data-mi-collection-grid]');
  button.setAttribute('aria-disabled', 'true');

  try {
    const response = await fetch(button.href);
    const html = new DOMParser().parseFromString(await response.text(), 'text/html');
    const nextGrid = html.querySelector('[data-mi-collection-grid]');
    const nextButton = html.querySelector('[data-mi-load-more]');

    grid.append(...nextGrid.children);
    window.history.replaceState({}, '', button.href);

    if (nextButton) {
      button.href = nextButton.href;
      button.removeAttribute('aria-disabled');
    } else {
      button.closest('.mi-collection__more')?.remove();
    }
  } catch (error) {
    window.location.assign(button.href);
  }
});

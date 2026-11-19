// Vista previa local del tema (sin tienda Shopify). Ver README.md.
// Renderiza theme/layout/theme.liquid + plantillas JSON con liquidjs y
// objetos falsos (shop, product, cart, collection...). Relee los archivos en
// cada petición, así que no hace falta reiniciar mientras se edita el tema.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Liquid, Drop } from 'liquidjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THEME = path.resolve(__dirname, '..', 'theme');
const PORT = Number(process.env.PORT || 4321);

// Horizon snippets que el layout renderiza pero que no aportan nada en la
// vista previa (o dependen de objetos que no simulamos).
const STUBBED_SNIPPETS = new Set([
  'chat-drawer',
  'theme-drawer',
  'search-modal',
  'quick-add-modal',
  'theme-editor',
  'cart-drawer',
]);

// ---------------------------------------------------------------------------
// Utilidades de lectura
// ---------------------------------------------------------------------------

const read = (file) => fs.readFileSync(file, 'utf8');
const exists = (file) => fs.existsSync(file);

function stripJsonComment(text) {
  return text.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '');
}

function readJson(file) {
  return JSON.parse(stripJsonComment(read(file)));
}

const BLOCK_RE = (name) =>
  new RegExp(`\\{%-?\\s*${name}\\s*-?%\\}([\\s\\S]*?)\\{%-?\\s*end${name}\\s*-?%\\}`, 'g');

/** Quita {% schema %}, {% doc %}, {% stylesheet %} y {% javascript %} del fuente. */
function preprocess(src) {
  return src
    .replace(BLOCK_RE('schema'), '')
    .replace(BLOCK_RE('doc'), '')
    .replace(BLOCK_RE('stylesheet'), '')
    .replace(BLOCK_RE('javascript'), '');
}

function extractSchema(src) {
  const match = BLOCK_RE('schema').exec(src);
  if (!match) return {};
  try {
    return JSON.parse(match[1]);
  } catch {
    return {};
  }
}

/** CSS / JS de todos los {% stylesheet %} / {% javascript %} del tema, como hace Shopify. */
function collectBlocks(name) {
  let out = '';
  for (const dir of ['sections', 'snippets', 'blocks']) {
    const full = path.join(THEME, dir);
    if (!exists(full)) continue;
    for (const file of fs.readdirSync(full).sort()) {
      if (!file.endsWith('.liquid')) continue;
      const src = read(path.join(full, file));
      for (const m of src.matchAll(BLOCK_RE(name))) {
        out += `\n/* ${dir}/${file} */\n${m[1]}\n`;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Datos falsos
// ---------------------------------------------------------------------------

function img(file, alt = '', width = 1024, height = 1024) {
  return {
    src: `/assets/${file}`,
    url: `/assets/${file}`,
    alt,
    width,
    height,
    aspect_ratio: width / height,
    presentation: { focal_point: '50% 50%' },
  };
}

function makeProduct({ handle, title, price, image, tags = [], type = '', description = '', options }) {
  const variants = (options || [['Oro'], ['Plata'], ['Oro rosa']]).map((opt, i) => ({
    id: 1000 + i + handle.length * 10,
    title: opt.join(' / '),
    price,
    available: true,
    options: opt,
    option1: opt[0],
    option2: opt[1] || null,
    featured_image: image,
    image,
    url: `/products/${handle}?variant=${1000 + i}`,
  }));
  return {
    id: handle.length * 1000,
    handle,
    title,
    price,
    price_min: price,
    price_max: price,
    compare_at_price: null,
    available: true,
    url: `/products/${handle}`,
    featured_image: image,
    featured_media: image ? { ...image, preview_image: image, media_type: 'image' } : null,
    images: image ? [image] : [],
    media: image ? [{ ...image, preview_image: image, media_type: 'image', id: 1 }] : [],
    tags,
    type,
    vendor: 'Mila Ibarra',
    description: description || `<p>${title}.</p>`,
    content: description || `<p>${title}.</p>`,
    variants,
    selected_or_first_available_variant: variants[0],
    first_available_variant: variants[0],
    selected_variant: null,
    has_only_default_variant: false,
    options: ['Material'],
    options_with_values: [{ name: 'Material', position: 1, values: variants.map((v) => v.option1), selected_value: variants[0].option1 }],
    metafields: {},
    template_suffix: '',
  };
}

const PRICE = 240000; // placeholder hasta tener precios reales

function makeCatalog() {
  const medalla = makeProduct({
    handle: 'medalla-firma',
    title: 'Medalla Firma',
    price: PRICE,
    image: img('mi-prod-oro.jpg', 'Medalla Firma de oro con iniciales grabadas'),
    tags: ['a-la-medida'],
    type: 'Medallas',
    description:
      '<p>Una medalla lisa para lo que tú quieras decir. Escríbela, elige el metal y mírala girar antes de pedirla.</p>',
  });
  medalla.template_suffix = 'joyeria-personalizada';
  // The configurable piece has a single default variant in Shopify: the metal,
  // text and typeface travel as line item properties, not as variant options.
  medalla.has_only_default_variant = true;
  medalla.options = ['Title'];
  medalla.options_with_values = [{ name: 'Title', position: 1, values: ['Default Title'], selected_value: 'Default Title' }];
  for (const variant of medalla.variants) {
    variant.title = 'Default Title';
    variant.option1 = 'Default Title';
  }

  const anillo = makeProduct({
    handle: 'anillo-sello',
    title: 'Anillo Sello',
    price: PRICE,
    image: img('mi-col-anillo.jpg', 'Anillo Sello de oro'),
    tags: ['a-la-medida', 'mujer', 'anillos'],
    type: 'Anillos',
    description: '<p>Un sello clásico de cara ovalada. Puede llevar tus iniciales grabadas.</p>',
    options: ['5', '6', '7', '8', '9', '10'].map((t) => ['Oro', t]),
  });
  anillo.options = ['Material', 'Talla'];
  anillo.images = [
    img('mi-col-anillo.jpg'),
    img('mi-editorial.jpg', '', 1024, 1280),
    img('mi-par-texto.jpg', '', 1024, 1280),
    img('mi-tl-5.jpg', '', 1024, 1280),
  ];
  anillo.media = anillo.images.map((i, n) => ({ ...i, preview_image: i, media_type: 'image', id: n + 1 }));

  const simple = (handle, title, file, tags) =>
    makeProduct({ handle, title, price: PRICE, image: img(file, title), tags });

  const products = [
    anillo,
    simple('medalla-firma-oro', 'Medalla Firma, oro, iniciales grabadas', 'mi-prod-oro.jpg', ['a-la-medida']),
    simple('esclava-lisa', 'Esclava Lisa, plata', 'mi-col-esclava.jpg', ['nuevo']),
    simple('arracadas-clasicas', 'Arracadas Clásicas, oro', 'mi-col-aretes.jpg', ['nuevo']),
    simple('pulsera-placa', 'Pulsera Placa, oro, texto grabado', 'mi-col-pulsera.jpg', ['a-la-medida']),
    simple('medalla-firma-plata', 'Medalla Firma, plata, iniciales grabadas', 'mi-prod-plata.jpg', ['a-la-medida']),
    simple('medalla-firma-rosa', 'Medalla Firma, oro rosa, iniciales grabadas', 'mi-prod-rosa.jpg', ['a-la-medida']),
    simple('medalla-firma-dibujo', 'Medalla Firma, oro, con tu dibujo', 'mi-prod-dibujo.jpg', ['a-la-medida']),
  ];

  const mujer = {
    id: 1,
    handle: 'mujer',
    title: 'Mujer',
    url: '/collections/mujer',
    description: 'Piezas para llevar todos los días. Las que llevan el sello “A la medida” pueden grabarse.',
    products,
    products_count: products.length,
    all_products_count: products.length,
    image: null,
    featured_image: null,
    filters: [],
    sort_options: [
      { value: 'manual', name: 'Destacados' },
      { value: 'price-ascending', name: 'Precio, menor a mayor' },
      { value: 'price-descending', name: 'Precio, mayor a menor' },
      { value: 'created-descending', name: 'Más nuevos' },
    ],
    sort_by: 'manual',
    default_sort_by: 'manual',
    template_suffix: 'mujer',
  };
  const hombre = { ...mujer, id: 2, handle: 'hombre', title: 'Hombre', url: '/collections/hombre', template_suffix: 'hombre' };

  const all = [medalla, ...products];
  const byHandle = Object.fromEntries(all.map((p) => [p.handle, p]));
  return { medalla, anillo, products: all, byHandle, collections: { mujer, hombre, all: { ...mujer, handle: 'all', title: 'Todo' } } };
}

const CONTACT_PAGE = {
  id: 1,
  handle: 'contacto',
  title: 'Contacto',
  url: '/pages/contacto',
  content: '',
  template_suffix: 'contacto',
};

// ---------------------------------------------------------------------------
// Carrito en memoria
// ---------------------------------------------------------------------------

function defaultCartItems(catalog) {
  return [
    {
      variant_id: catalog.medalla.variants[0].id,
      quantity: 1,
      properties: { Texto: 'M·I', Tipografía: 'Romana', Material: 'Oro' },
    },
  ];
}

const state = { items: null };

function findVariant(catalog, id) {
  for (const product of catalog.products) {
    const variant = product.variants.find((v) => String(v.id) === String(id));
    if (variant) return { product, variant };
  }
  return { product: catalog.medalla, variant: catalog.medalla.variants[0] };
}

function buildCart(catalog) {
  if (!state.items) state.items = defaultCartItems(catalog);
  const items = state.items.map((line, index) => {
    const { product, variant } = findVariant(catalog, line.variant_id);
    const key = `${variant.id}:${index}`;
    return {
      id: variant.id,
      key,
      index: index + 1,
      quantity: line.quantity,
      title: product.title,
      product_title: product.title,
      variant_title: variant.title,
      price: variant.price,
      final_price: variant.price,
      original_price: variant.price,
      line_price: variant.price * line.quantity,
      final_line_price: variant.price * line.quantity,
      original_line_price: variant.price * line.quantity,
      url: product.url,
      image: product.featured_image,
      featured_image: product.featured_image,
      product,
      variant,
      variant_id: variant.id,
      product_id: product.id,
      handle: product.handle,
      properties: line.properties || {},
      options_with_values: [{ name: 'Material', value: variant.option1 }],
      discounts: [],
      line_level_discount_allocations: [],
      requires_shipping: true,
    };
  });
  const total = items.reduce((sum, item) => sum + item.final_line_price, 0);
  return {
    token: 'preview-cart',
    note: '',
    attributes: {},
    item_count: items.reduce((sum, item) => sum + item.quantity, 0),
    items,
    items_subtotal_price: total,
    total_price: total,
    original_total_price: total,
    total_discount: 0,
    cart_level_discount_applications: [],
    currency: { iso_code: 'MXN' },
    requires_shipping: items.length > 0,
    empty: items.length === 0,
  };
}

function cartJson(cart) {
  return {
    ...cart,
    items: cart.items.map((item) => ({
      ...item,
      product: undefined,
      variant: undefined,
      image: item.image?.src,
      featured_image: item.image ? { url: item.image.src, alt: item.image.alt } : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Liquid
// ---------------------------------------------------------------------------

class TemplateDrop extends Drop {
  constructor(name, suffix) {
    super();
    this.name = name;
    this.suffix = suffix || null;
    this.directory = null;
  }
  valueOf() {
    return this.suffix ? `${this.name}.${this.suffix}` : this.name;
  }
  toString() {
    return this.valueOf();
  }
}

function formatMoney(cents, withCurrency) {
  const value = Number(cents || 0) / 100;
  const formatted = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return withCurrency ? `$${formatted} MXN` : `$${formatted}`;
}

/** Los argumentos con nombre llegan como [clave, valor]. */
function kwargs(args) {
  const out = {};
  for (const arg of args) if (Array.isArray(arg) && arg.length === 2) out[arg[0]] = arg[1];
  return out;
}

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function errorBox(title, error) {
  const message = escapeAttr(error?.message || String(error));
  return `<div style="margin:16px;padding:16px;border:2px solid #d00;background:#fff4f4;color:#900;font:13px/1.5 ui-monospace,monospace;white-space:pre-wrap;position:relative;z-index:5"><strong>[preview] ${escapeAttr(title)}</strong>\n${message}</div>`;
}

function createEngine(globals, ctxData) {
  const customFs = {
    existsSync: (file) => exists(file),
    exists: async (file) => exists(file),
    readFileSync: (file) => {
      const name = path.basename(file, '.liquid');
      if (file.includes(`${path.sep}snippets${path.sep}`) && STUBBED_SNIPPETS.has(name)) return '';
      return preprocess(read(file));
    },
    readFile: async (file) => customFs.readFileSync(file),
    resolve: (dir, file, ext) => path.resolve(dir, file.endsWith(ext) ? file : file + ext),
    contains: () => true,
    dirname: (file) => path.dirname(file),
    sep: path.sep,
  };

  const engine = new Liquid({
    root: [path.join(THEME, 'snippets')],
    partials: [path.join(THEME, 'snippets')],
    layouts: [path.join(THEME, 'layout')],
    extname: '.liquid',
    fs: customFs,
    cache: false,
    globals,
    strictFilters: false,
    strictVariables: false,
    lenientIf: true,
    jsTruthy: false,
    dynamicPartials: true,
    relativeReference: false,
  });

  // --- Filtros Shopify -----------------------------------------------------
  const f = (name, fn) => engine.registerFilter(name, fn);
  f('asset_url', (v) => `/assets/${v}`);
  f('asset_img_url', (v) => `/assets/${v}`);
  f('file_url', (v) => `/assets/${v}`);
  f('shopify_asset_url', (v) => `/assets/${v}`);
  f('global_asset_url', (v) => `/assets/${v}`);
  f('inline_asset_content', (v) => {
    const file = path.join(THEME, 'assets', String(v));
    return exists(file) ? read(file) : `<!-- missing asset ${v} -->`;
  });
  f('stylesheet_tag', (v) => `<link rel="stylesheet" href="${v}">`);
  f('script_tag', (v) => `<script src="${v}"></script>`);
  f('preload_tag', (v, ...args) => {
    const as = kwargs(args).as || 'style';
    return `<link rel="preload" href="${v}" as="${as}">`;
  });
  f('image_url', (v) => {
    if (!v) return '';
    if (typeof v === 'string') return v;
    return v.src || v.url || v.preview_image?.src || '';
  });
  f('img_url', (v) => (typeof v === 'string' ? v : v?.src || ''));
  f('image_tag', (src, ...args) => {
    const opts = kwargs(args);
    const attrs = [`src="${escapeAttr(src)}"`];
    for (const key of ['alt', 'class', 'sizes', 'loading', 'fetchpriority', 'width', 'height', 'id', 'style']) {
      if (opts[key] !== undefined && opts[key] !== null && opts[key] !== '') attrs.push(`${key}="${escapeAttr(opts[key])}"`);
    }
    if (!('alt' in opts)) attrs.push('alt=""');
    return `<img ${attrs.join(' ')}>`;
  });
  f('placeholder_svg_tag', (v, cls) => `<svg class="${cls || ''}" viewBox="0 0 100 100" style="background:#f5f4f1"></svg>`);
  f('money', (v) => formatMoney(v, true));
  f('money_with_currency', (v) => formatMoney(v, true));
  f('money_without_currency', (v) => formatMoney(v, false).slice(1));
  f('money_without_trailing_zeros', (v) => formatMoney(v, true).replace('.00', ''));
  f('t', (key, ...args) => {
    const opts = kwargs(args);
    const k = String(key || '');
    if (k.endsWith('sold_out')) return 'Agotado';
    if (k.endsWith('add_to_cart')) return 'Agregar al carrito';
    if (opts.count !== undefined) return `${k} (${opts.count})`;
    return k.split('.').pop().replace(/_/g, ' ');
  });
  const handleize = (v) =>
    String(v ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  f('handleize', handleize);
  f('handle', handleize);
  f('json', (v) => JSON.stringify(v ?? null));
  f('font_face', () => '');
  f('font_url', () => '');
  f('font_modify', (v) => v);
  f('color_brightness', () => 128);
  f('color_to_rgb', (v) => v);
  f('color_modify', (v) => v);
  f('color_mix', (v) => v);
  f('color_lighten', (v) => v);
  f('color_darken', (v) => v);
  f('color_extract', () => 0);
  f('link_to', (text, url) => `<a href="${url}">${text}</a>`);
  f('within', (url) => url);
  f('pluralize', (n, one, many) => (Number(n) === 1 ? one : many));
  f('structured_data', () => '');
  f('payment_type_svg_tag', () => '');
  f('default_errors', () => '');
  f('highlight', (v) => v);
  f('format_address', (v) => v);
  f('weight_with_unit', (v) => v);
  f('time_tag', (v) => v);
  f('metafield_tag', (v) => v);
  f('find_index', (arr, prop, val) => (Array.isArray(arr) ? arr.findIndex((x) => x?.[prop] === val) : -1));

  // --- Tags Shopify --------------------------------------------------------
  const blockTag = (name, renderFn) => {
    engine.registerTag(name, {
      parse(token, remainTokens) {
        this.args = token.args;
        this.tpls = [];
        const stream = engine.parser
          .parseStream(remainTokens)
          .on(`tag:end${name}`, () => stream.stop())
          .on('template', (tpl) => this.tpls.push(tpl))
          .on('end', () => {
            throw new Error(`tag ${name} not closed`);
          });
        stream.start();
      },
      *render(ctx, emitter) {
        yield* renderFn.call(this, ctx, emitter);
      },
    });
  };

  const evalArg = (expr, ctx) => engine.evalValue(expr.trim(), ctx);

  // {% style %} ... {% endstyle %}
  blockTag('style', function* (ctx, emitter) {
    const html = yield engine.renderer.renderTemplates(this.tpls, ctx);
    emitter.write(`<style>${html}</style>`);
  });

  // {% form 'tipo', objeto, attr: valor %} ... {% endform %}
  blockTag('form', function* (ctx, emitter) {
    const parts = splitArgs(this.args);
    const type = String(yield evalArg(parts.shift() || "''", ctx));
    const attrs = {};
    for (const part of parts) {
      const m = /^\s*([\w-]+)\s*:\s*([\s\S]+)$/.exec(part);
      if (m) attrs[m[1]] = yield evalArg(m[2], ctx);
    }
    const actions = {
      product: '/cart/add',
      contact: '/contact',
      cart: '/cart',
      customer: '/contact#contact_form',
      localization: '/localization',
    };
    const htmlAttrs = Object.entries(attrs)
      .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
      .join(' ');
    ctx.push({ form: { errors: false, posted_successfully: false, 'posted_successfully?': false, id: attrs.id || `${type}_form` } });
    const body = yield engine.renderer.renderTemplates(this.tpls, ctx);
    ctx.pop();
    emitter.write(
      `<form method="post" action="${actions[type] || '#'}" accept-charset="UTF-8" ${htmlAttrs}>` +
        `<input type="hidden" name="form_type" value="${escapeAttr(type)}"><input type="hidden" name="utf8" value="✓">` +
        body +
        '</form>'
    );
  });

  // {% paginate coleccion by N %}
  blockTag('paginate', function* (ctx, emitter) {
    ctx.push({
      paginate: { current_page: 1, pages: 1, items: 8, page_size: 12, previous: null, next: null, parts: [] },
    });
    const body = yield engine.renderer.renderTemplates(this.tpls, ctx);
    ctx.pop();
    emitter.write(body);
  });

  // {% section 'nombre' %}
  engine.registerTag('section', {
    parse(token) {
      this.name = token.args.trim().replace(/^['"]|['"]$/g, '');
    },
    *render(ctx, emitter) {
      emitter.write(yield renderSection(engine, this.name, this.name, {}, ctxData));
    },
  });

  // {% sections 'header-group' %}
  engine.registerTag('sections', {
    parse(token) {
      this.name = token.args.trim().replace(/^['"]|['"]$/g, '');
    },
    *render(ctx, emitter) {
      emitter.write(yield renderGroup(engine, this.name, ctxData));
    },
  });

  // {% content_for 'blocks' %} / {% content_for 'block', type: ... %} — no se simula.
  engine.registerTag('content_for', {
    parse() {},
    render() {
      return '';
    },
  });

  return engine;
}

/** Separa "a, b: 'x, y', c" por comas que no estén entre comillas. */
function splitArgs(text) {
  const out = [];
  let buf = '';
  let quote = null;
  for (const ch of text) {
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
    } else if (ch === ',') {
      out.push(buf);
      buf = '';
    } else buf += ch;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

// ---------------------------------------------------------------------------
// Secciones
// ---------------------------------------------------------------------------

function resolveSetting(type, value, ctxData) {
  const { catalog } = ctxData;
  if (value === undefined || value === null) return value;
  switch (type) {
    case 'product':
      if (!value) return null;
      return catalog.byHandle[value] || catalog.medalla;
    case 'collection':
      if (!value) return null;
      return catalog.collections[value] || catalog.collections.mujer;
    case 'page':
      if (!value) return null;
      return value === 'contacto' ? CONTACT_PAGE : { ...CONTACT_PAGE, handle: value, url: `/pages/${value}`, title: value };
    case 'link_list':
      if (!value) return null;
      return ctxData.linklists[value] || null;
    case 'image_picker': {
      if (!value) return null;
      const file = String(value).split('/').pop();
      return img(file);
    }
    case 'product_list':
      return Array.isArray(value) ? value.map((h) => catalog.byHandle[h]).filter(Boolean) : [];
    case 'collection_list':
      return Array.isArray(value) ? value.map((h) => catalog.collections[h]).filter(Boolean) : [];
    case 'url':
      return value || null;
    default:
      return value;
  }
}

function buildSettings(schemaSettings = [], provided = {}, ctxData) {
  const out = {};
  for (const setting of schemaSettings) {
    if (!setting.id) continue;
    const raw = provided[setting.id] !== undefined ? provided[setting.id] : setting.default;
    out[setting.id] = resolveSetting(setting.type, raw, ctxData);
  }
  for (const [key, value] of Object.entries(provided)) if (!(key in out)) out[key] = value;
  return out;
}

async function renderSection(engine, type, id, data, ctxData) {
  const file = path.join(THEME, 'sections', `${type}.liquid`);
  if (!exists(file)) return errorBox(`Falta la sección sections/${type}.liquid`, `id: ${id}`);
  try {
    const src = read(file);
    const schema = extractSchema(src);
    const blockSchemas = Object.fromEntries((schema.blocks || []).map((b) => [b.type, b]));
    const blockData = data.blocks || {};
    const order = data.block_order || Object.keys(blockData);
    const blocks = order
      .filter((key) => blockData[key] && !blockData[key].disabled)
      .map((key) => {
        const b = blockData[key];
        return {
          id: key,
          type: b.type,
          settings: buildSettings(blockSchemas[b.type]?.settings, b.settings || {}, ctxData),
          shopify_attributes: `data-block-id="${key}"`,
        };
      });
    const section = {
      id,
      settings: buildSettings(schema.settings, data.settings || {}, ctxData),
      blocks,
      index: ctxData.sectionIndex++,
      location: 'template',
    };
    const tpls = engine.parse(preprocess(src), file);
    const html = await engine.render(tpls, { section });
    const tag = schema.tag || 'div';
    const cls = ['shopify-section', schema.class].filter(Boolean).join(' ');
    return `<${tag} id="shopify-section-${id}" class="${cls}">${html}</${tag}>`;
  } catch (error) {
    return errorBox(`Error en sections/${type}.liquid (id ${id})`, error);
  }
}

async function renderGroup(engine, name, ctxData) {
  const file = path.join(THEME, 'sections', `${name}.json`);
  if (!exists(file)) return errorBox(`Falta sections/${name}.json`, '');
  try {
    const group = readJson(file);
    let html = '';
    for (const id of group.order || Object.keys(group.sections)) {
      const data = group.sections[id];
      if (!data || data.disabled) continue;
      html += await renderSection(engine, data.type, id, data, ctxData);
    }
    return html;
  } catch (error) {
    return errorBox(`Error en sections/${name}.json`, error);
  }
}

async function renderTemplate(engine, templateName, ctxData) {
  const file = path.join(THEME, 'templates', `${templateName}.json`);
  if (!exists(file)) return errorBox(`Falta la plantilla templates/${templateName}.json`, 'Otra parte del equipo la está construyendo.');
  try {
    const template = readJson(file);
    let html = '';
    for (const id of template.order || Object.keys(template.sections)) {
      const data = template.sections[id];
      if (!data || data.disabled) continue;
      html += await renderSection(engine, data.type, id, data, ctxData);
    }
    return html;
  } catch (error) {
    return errorBox(`Error en templates/${templateName}.json`, error);
  }
}

// ---------------------------------------------------------------------------
// Ajustes globales
// ---------------------------------------------------------------------------

function loadSettings() {
  const schema = JSON.parse(read(path.join(THEME, 'config', 'settings_schema.json')));
  const data = readJson(path.join(THEME, 'config', 'settings_data.json'));
  const out = {};
  for (const group of schema) for (const s of group.settings || []) if (s.id && s.default !== undefined) out[s.id] = s.default;
  Object.assign(out, data.current || {});
  // Los valores tipo "{{ settings.color_palette.color2 }}" no se resuelven en la vista previa.
  for (const [key, value] of Object.entries(out)) {
    if (typeof value === 'string' && value.includes('{{')) out[key] = '';
  }
  if (typeof out.type_body_font === 'string') {
    const font = { family: 'Host Grotesk', fallback_families: 'sans-serif', style: 'normal', weight: 400 };
    for (const k of ['type_body_font', 'type_subheading_font', 'type_heading_font', 'type_accent_font']) out[k] = font;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

const ROUTES = [
  { re: /^\/$/, template: 'index', page_type: 'index', name: 'index' },
  { re: /^\/products\/medalla-firma$/, template: 'product.joyeria-personalizada', page_type: 'product', name: 'product', suffix: 'joyeria-personalizada', product: 'medalla-firma' },
  { re: /^\/products\/([\w-]+)$/, template: 'product', page_type: 'product', name: 'product', product: 'anillo-sello' },
  { re: /^\/collections\/(mujer|hombre)$/, template: (m) => `collection.${m[1]}`, page_type: 'collection', name: 'collection', suffix: (m) => m[1], collection: (m) => m[1] },
  { re: /^\/collections\/([\w-]+)$/, template: 'collection', page_type: 'collection', name: 'collection', collection: () => 'mujer' },
  { re: /^\/pages\/contacto$/, template: 'page.contacto', page_type: 'page', name: 'page', suffix: 'contacto', page: true },
  { re: /^\/cart$/, template: 'cart', page_type: 'cart', name: 'cart' },
  { re: /^\/search$/, template: 'search', page_type: 'search', name: 'search' },
];

function matchRoute(pathname) {
  for (const route of ROUTES) {
    const m = route.re.exec(pathname);
    if (m) {
      const val = (x) => (typeof x === 'function' ? x(m) : x);
      return { ...route, template: val(route.template), suffix: val(route.suffix), collection: val(route.collection) };
    }
  }
  return null;
}

function buildContext(url, route) {
  const catalog = makeCatalog();
  if (url.searchParams.get('cart') === 'empty') state.items = [];
  if (url.searchParams.get('cart') === 'reset') state.items = defaultCartItems(catalog);
  const cart = buildCart(catalog);
  const settings = loadSettings();
  if (url.searchParams.get('store') === 'on') settings.show_full_store = true;

  const linklists = {
    'main-menu': { handle: 'main-menu', title: 'Menú principal', links: [] },
    footer: { handle: 'footer', title: 'Footer', links: [] },
  };

  const ctxData = { catalog, linklists, sectionIndex: 1 };
  const product = route?.product ? catalog.byHandle[route.product] : null;
  const collection = route?.collection ? catalog.collections[route.collection] : null;

  const globals = {
    shop: {
      name: 'Mila Ibarra',
      url: `http://localhost:${PORT}`,
      secure_url: `http://localhost:${PORT}`,
      domain: `localhost:${PORT}`,
      currency: 'MXN',
      money_format: '${{amount}}',
      description: 'Joyería personalizada, hecha a la medida.',
      privacy_policy: null,
      terms_of_service: null,
      shipping_policy: null,
      locale: 'es',
      brand: { logo: null },
    },
    settings,
    routes: {
      root_url: '/',
      cart_url: '/cart',
      cart_add_url: '/cart/add',
      cart_change_url: '/cart/change',
      cart_update_url: '/cart/update',
      cart_clear_url: '/cart/clear',
      search_url: '/search',
      predictive_search_url: '/search/suggest',
      collections_url: '/collections',
      all_products_collection_url: '/collections/all',
      account_url: '/account',
      account_login_url: '/account/login',
    },
    request: {
      page_type: route?.page_type || '404',
      path: url.pathname,
      host: `localhost:${PORT}`,
      origin: `http://localhost:${PORT}`,
      design_mode: false,
      visual_preview_mode: false,
      locale: { iso_code: 'es', direction: 'ltr', primary: true, root_url: '/' },
    },
    template: new TemplateDrop(route?.name || '404', route?.suffix),
    cart,
    product,
    collection,
    page: route?.page ? CONTACT_PAGE : null,
    collections: catalog.collections,
    all_products: catalog.byHandle,
    linklists,
    localization: { available_countries: [], available_languages: [], country: { iso_code: 'MX', currency: { iso_code: 'MXN', symbol: '$' } }, language: { iso_code: 'es' } },
    customer: null,
    canonical_url: `http://localhost:${PORT}${url.pathname}`,
    page_title: product?.title || collection?.title || (route?.page ? CONTACT_PAGE.title : 'Mila Ibarra'),
    page_description: '',
    content_for_header: '',
    content_for_index: '',
    powered_by_link: '',
    search: { performed: false, results: [], results_count: 0, terms: '' },
    recommendations: { performed: true, products: catalog.products.slice(1, 5), products_count: 4 },
  };
  return { globals, ctxData };
}

async function renderPage(url) {
  const route = matchRoute(url.pathname);
  const { globals, ctxData } = buildContext(url, route);
  const engine = createEngine(globals, ctxData);

  const content = route
    ? await renderTemplate(engine, route.template, ctxData)
    : errorBox('404', `No hay ruta de vista previa para ${url.pathname}`);

  let html;
  try {
    const layoutFile = path.join(THEME, 'layout', 'theme.liquid');
    const tpls = engine.parse(preprocess(read(layoutFile)), layoutFile);
    html = await engine.render(tpls, { content_for_layout: content });
  } catch (error) {
    html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/__preview/styles.css"></head><body>${errorBox('Error en layout/theme.liquid', error)}${content}</body></html>`;
  }

  const injection =
    '<link rel="stylesheet" href="/__preview/styles.css">\n<script src="/__preview/scripts.js" defer></script>\n';
  html = html.includes('</head>') ? html.replace('</head>', `${injection}</head>`) : injection + html;
  return html;
}

async function renderSectionsJson(url, names) {
  const route = matchRoute(url.pathname) || ROUTES[0];
  const { globals, ctxData } = buildContext(url, route);
  const engine = createEngine(globals, ctxData);
  const out = {};
  for (const name of names) {
    const id = name.trim();
    if (!id) continue;
    out[id] = await renderSection(engine, id, id, {}, ctxData);
  }
  return out;
}

// ---------------------------------------------------------------------------
// API del carrito (/cart/*.js)
// ---------------------------------------------------------------------------

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  const type = req.headers['content-type'] || '';
  if (!raw) return {};
  if (type.includes('application/json')) return JSON.parse(raw);
  if (type.includes('multipart/form-data')) {
    const boundary = /boundary=(.+)$/.exec(type)?.[1];
    const fields = {};
    if (boundary) {
      for (const part of raw.split(`--${boundary}`)) {
        const m = /name="([^"]+)"[^\r\n]*\r\n(?:[^\r\n]+\r\n)*\r\n([\s\S]*?)\r\n$/.exec(part);
        if (m && !/filename="/.test(part)) fields[m[1]] = m[2];
      }
    }
    return nestFields(fields);
  }
  return nestFields(Object.fromEntries(new URLSearchParams(raw)));
}

/** properties[Texto]=x → { properties: { Texto: x } } */
function nestFields(flat) {
  const out = {};
  for (const [key, value] of Object.entries(flat)) {
    const m = /^(\w+)\[(.+)\]$/.exec(key);
    if (m) {
      out[m[1]] = out[m[1]] || {};
      out[m[1]][m[2]] = value;
    } else out[key] = value;
  }
  return out;
}

async function handleCartApi(req, res, url) {
  const catalog = makeCatalog();
  if (!state.items) state.items = defaultCartItems(catalog);
  const send = async (payload, body = {}) => {
    const sections = body.sections || url.searchParams.get('sections');
    if (sections) {
      const list = Array.isArray(sections) ? sections : String(sections).split(',');
      payload.sections = await renderSectionsJson(new URL('/', url), list);
    }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
  };

  if (req.method === 'GET' && url.pathname === '/cart.js') {
    return send(cartJson(buildCart(catalog)));
  }

  const body = req.method === 'POST' ? await readBody(req) : {};

  if (url.pathname === '/cart/add.js' || url.pathname === '/cart/add') {
    const items = body.items || [{ id: body.id, quantity: body.quantity, properties: body.properties }];
    const added = [];
    for (const item of items) {
      const properties = Object.fromEntries(Object.entries(item.properties || {}).filter(([, v]) => v !== ''));
      state.items.push({ variant_id: item.id || catalog.medalla.variants[0].id, quantity: Number(item.quantity || 1), properties });
      added.push(item);
    }
    const cart = cartJson(buildCart(catalog));
    if (url.pathname === '/cart/add') {
      res.writeHead(302, { location: '/cart' });
      return res.end();
    }
    return send({ ...cart.items[cart.items.length - 1], items: cart.items.slice(-added.length) }, body);
  }

  if (url.pathname === '/cart/change.js' || url.pathname === '/cart/update.js') {
    const cart = buildCart(catalog);
    let index = -1;
    if (body.line) index = Number(body.line) - 1;
    else if (body.id) index = cart.items.findIndex((item) => item.key === String(body.id) || String(item.id) === String(body.id));
    if (index >= 0 && state.items[index]) {
      const qty = Number(body.quantity ?? state.items[index].quantity);
      if (qty <= 0) state.items.splice(index, 1);
      else state.items[index].quantity = qty;
    }
    return send(cartJson(buildCart(catalog)), body);
  }

  if (url.pathname === '/cart/clear.js') {
    state.items = [];
    return send(cartJson(buildCart(catalog)), body);
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end('{"status":404}');
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.hdr': 'application/octet-stream',
  '.ktx2': 'image/ktx2',
  '.wasm': 'application/wasm',
};

async function serveAsset(res, url) {
  const name = decodeURIComponent(url.pathname.replace(/^\/assets\//, ''));
  const file = path.join(THEME, 'assets', name);
  if (!file.startsWith(path.join(THEME, 'assets'))) {
    res.writeHead(403);
    return res.end();
  }
  if (exists(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    return fs.createReadStream(file).pipe(res);
  }
  if (exists(`${file}.liquid`)) {
    const { globals, ctxData } = buildContext(url, null);
    const engine = createEngine(globals, ctxData);
    const out = await engine.parseAndRender(preprocess(read(`${file}.liquid`)));
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'text/plain', 'cache-control': 'no-store' });
    return res.end(out);
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end(`Asset no encontrado: ${name}`);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith('/assets/')) return await serveAsset(res, url);
    if (url.pathname === '/__preview/styles.css') {
      res.writeHead(200, { 'content-type': MIME['.css'], 'cache-control': 'no-store' });
      return res.end(collectBlocks('stylesheet'));
    }
    if (url.pathname === '/__preview/scripts.js') {
      res.writeHead(200, { 'content-type': MIME['.js'], 'cache-control': 'no-store' });
      return res.end(collectBlocks('javascript'));
    }
    if (url.pathname === '/cart.js' || url.pathname.startsWith('/cart/')) return await handleCartApi(req, res, url);
    if (url.pathname === '/contact' && req.method === 'POST') {
      res.writeHead(302, { location: '/pages/contacto?contact_posted=true' });
      return res.end();
    }
    if (url.pathname === '/favicon.ico') {
      res.writeHead(204);
      return res.end();
    }
    if (url.searchParams.get('sections')) {
      const json = await renderSectionsJson(url, url.searchParams.get('sections').split(','));
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(json));
    }
    if (url.searchParams.get('section_id')) {
      const json = await renderSectionsJson(url, [url.searchParams.get('section_id')]);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(Object.values(json)[0]);
    }
    const html = await renderPage(url);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
    res.end(errorBox('Error del servidor de vista previa', error));
  }
});

server.listen(PORT, () => {
  console.log(`Vista previa del tema en http://localhost:${PORT}`);
});

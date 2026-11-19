# Mila Ibarra — Joyería personalizada 3D

Tienda Shopify con aspecto de sitio de campaña y un configurador 3D como
pieza central. Ver [docs/Joyería personalizada 3D — Idea de la página y
stack.pdf](docs/Joyería%20personalizada%203D%20—%20Idea%20de%20la%20página%20y%20stack.pdf)
para el detalle completo (idea, alcance, stack, fases, riesgos).

## Estructura

- `theme/` — tema Liquid, clonado de [Shopify/horizon](https://github.com/Shopify/horizon)
  como base (Online Store 2.0). Aquí vive todo el front: layout, sections,
  blocks, snippets, templates JSON.
- `configurator/` — fuente del configurador 3D (Three.js + Vite). Se compila
  a un solo archivo (`npm run build:theme`) que se copia a
  `theme/assets/configurator.js`. Solo se carga en la plantilla del
  configurador.
- `3d-assets/` — archivos `.blend` fuente y los `.glb` exportados
  (comprimidos con Draco/Meshopt, texturas KTX2) que consume el configurador.
- `design/` — exportes de Figma (tokens de color/tipografía/espacio,
  capturas de referencia).
- `docs/` — el PDF de alcance y cualquier nota adicional.

## Principios (del documento de alcance)

1. El aspecto sale de dirección de arte (fotografía, tipografía, ritmo), no
   de tecnología pesada.
2. La única parte 3D es el configurador, y solo carga en su propia página.
3. Shopify hace todo lo comercial (catálogo, carrito, pago, pedidos).
4. El código nace listo para sumar hombre, mujer y catálogo sin rehacer nada.

## Alcance de lanzamiento (fase 1)

Tres páginas públicas: **home**, **joyería personalizada** (el configurador)
y **contacto**. Carrito y pago son los nativos de Shopify. Hombre, mujer y
catálogo quedan construidos en el código pero sin enlazar ni publicar.

## Stack

Shopify (tema Liquid propio sobre Horizon) + JavaScript puro con web
components + Three.js solo en el configurador. Ver el PDF para la tabla
completa de herramientas por capa (diseño, 3D, plataforma, front,
configurador, pedido, ventas, analítica, desarrollo, calidad, SEO).

## Estado del tema (diseño v2 de Figma)

Todo el front sigue el Figma v2 (`IksrwTTHwcnyoSoOTqlLm0`: Tipografía,
Sistema, Laptop 1440, Móvil 390). Tipografía Host Grotesk (interfaz) + Ibarra
Real Nova (logotipo y citas), auto-hospedadas en `theme/assets/*.woff2`.
Tokens en `assets/mi-tokens.css`; fuentes, `noindex` de la tienda oculta y
revelado al hacer scroll en `snippets/mi-head.liquid`.

| Página | Plantilla | Secciones |
|---|---|---|
| Home | `templates/index.json` | `mi-hero` (también el banner), `mi-triptych`, `mi-statement`, `mi-product-row`, `mi-editorial`, `mi-two-ways`, `mi-timeline` (scroll horizontal fijo), `mi-cta-contact` |
| Joyería personalizada | `templates/product.joyeria-personalizada.json` | `mi-configurator`, `mi-steps`, `mi-product-row` |
| Contacto | `templates/page.contacto.json` | `mi-contact` (`{% form 'contact' %}` + WhatsApp) |
| Carrito | en todas las páginas | `mi-cart-drawer` (Ajax Cart API + Section Rendering API) |
| Mujer / Hombre (oculta) | `templates/collection.mujer.json`, `collection.hombre.json` | `mi-collection` |
| Producto estándar (oculta) | `templates/product.json` | `mi-product` |

Header y footer: `sections/mi-header.liquid` y `mi-footer.liquid`. Mujer,
Hombre y el buscador aparecen con **Ajustes del tema → Mila Ibarra — Tienda →
Mostrar tienda**; mientras está apagado, colección/producto estándar llevan
`noindex`.

**Fotos:** las imágenes generadas con IA en Figma están en
`theme/assets/mi-*.jpg` y cada sección las usa como foto de muestra mientras
no se elija una en el editor (snippet `mi-image`).

**Pendiente del cliente** (en Ajustes del tema → Mila Ibarra — Tienda →
Contacto): número de WhatsApp, correo, tiempo de entrega y de respuesta; y
precios reales en las tarjetas del Home.

### Configurador 3D

- Modelo: `3d-assets/medalla-firma/build_medalla.py` genera en Blender (sin
  abrir la interfaz) la medalla, la argolla y la cadena →
  `medalla-firma.blend` + `medalla-firma.raw.glb`. `npm run build:model`
  lo comprime con meshopt (gltfpack) → `theme/assets/medalla-firma.glb` (~200 KB).
- Código: `configurator/src/` (Three.js) → `npm run build:theme` →
  `theme/assets/configurator.js` (un módulo ES, ~160 KB gzip).
  - `scene.js`: render solo cuando algo cambia, pixel ratio ≤ 2, OrbitControls
    con límites, entorno de estudio, giro automático, pantalla completa.
  - `engraving.js`: el texto se dibuja en un canvas y se convierte en normal
    map + rugosidad + oscurecido del corte (fase 2: la imagen del cliente usa
    el mismo canal).
  - `materials.js`: presets de oro, plata y oro rosa.
- Tema: `assets/mi-configurator-form.js` es la máquina de estados (texto,
  tipografía, material) y el agregar al carrito; `mi-configurator-loader.js`
  carga Three.js solo con WebGL, sin `prefers-reduced-motion` y cuando el
  visor está a la vista. Sin 3D se queda la foto, que cambia según el metal.
- Al pedido llegan `properties[Texto]`, `properties[Tipografía]` y
  `properties[Material]`. La imagen propia está como **Próximamente** (fase 2).
- Las tarjetas del Home enlazan con el material ya elegido:
  `/products/medalla-firma?material=plata` (también `tipografia`, `texto`).

## Desarrollo

```bash
cd preview && npm install && npm run preview   # vista previa local en http://localhost:4321 (sin tienda)
```

```bash
cd theme && shopify theme check   # valida Liquid/JSON sin necesitar tienda
cd theme && shopify theme dev     # previsualización real — necesita la tienda de desarrollo
```

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python 3d-assets/medalla-firma/build_medalla.py
cd configurator && npm run build:all   # comprime el modelo y compila el configurador
cd configurator && npm run dev         # configurador aislado con Vite
```

**Al conectar Shopify:** crear el producto "Medalla Firma" (handle
`medalla-firma`) y asignarle la plantilla `joyeria-personalizada`; crear la
página `contacto`; elegir ese producto y página en el header; llenar los datos
de contacto; revisar que Shopify acepte `medalla-firma.glb` en assets (si no,
subirlo a Contenido → Archivos y pegar la URL en la sección del configurador).

## Preguntas abiertas para el cliente

Ver la última sección del PDF: pieza inicial del configurador (anillo, dije,
pulsera...), qué se personaliza en fase 1, método de fabricación (mano o
láser) y si ya existe fotografía/identidad de marca.

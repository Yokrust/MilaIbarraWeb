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

## Desarrollo

```bash
cd theme && shopify theme dev
```

```bash
cd configurator && npm run dev        # desarrollo del configurador aislado
cd configurator && npm run build:theme # compila y copia a theme/assets
```

## Preguntas abiertas para el cliente

Ver la última sección del PDF: pieza inicial del configurador (anillo, dije,
pulsera...), qué se personaliza en fase 1, método de fabricación (mano o
láser) y si ya existe fotografía/identidad de marca.

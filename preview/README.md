# Vista previa local del tema

Servidor pequeño (Node + [liquidjs](https://liquidjs.com)) para ver las páginas
del tema **sin tienda Shopify**. Es solo una aproximación para revisar el
diseño contra Figma mientras se construye; la prueba real es
`shopify theme dev` cuando la tienda de desarrollo esté conectada.

```bash
npm --prefix preview install
npm --prefix preview run preview   # http://localhost:4321
```

En Claude Code también se puede abrir con la configuración `theme-preview`
de `.claude/launch.json`.

## Rutas

| URL | Plantilla |
| --- | --- |
| `/` | `templates/index.json` |
| `/products/medalla-firma` | `templates/product.joyeria-personalizada.json` (configurador) |
| `/products/anillo-sello` | `templates/product.json` (producto estándar) |
| `/collections/mujer`, `/collections/hombre` | `templates/collection.mujer.json` / `collection.hombre.json` |
| `/pages/contacto` | `templates/page.contacto.json` |
| `/cart` | `templates/cart.json` |

Parámetros útiles: `?cart=empty` vacía la bolsa, `?cart=reset` la regresa a
una Medalla Firma de ejemplo, `?store=on` simula el ajuste "Mostrar tienda".

## Qué hace

- Relee los archivos del tema en cada petición: no hay que reiniciar.
- Renderiza `layout/theme.liquid`, los grupos `header-group` / `footer-group`
  y las plantillas JSON, con los valores por defecto de cada `{% schema %}`.
- Junta todos los `{% stylesheet %}` y `{% javascript %}` del tema en
  `/__preview/styles.css` y `/__preview/scripts.js`, como hace Shopify.
- Simula `/cart.js`, `/cart/add.js`, `/cart/change.js` y la Section Rendering
  API (`?sections=...`) con un carrito en memoria.
- Si falta una sección o plantilla, o una falla, muestra un recuadro rojo en
  la página en lugar de romper el servidor.

## Lo que no simula

- Datos reales: producto, colección, precios y página de contacto son falsos.
- Filtros de color/fuente de Shopify (`color_*`, `font_face`…), traducciones
  (`t` devuelve la clave) y `{% content_for 'blocks' %}` de Horizon (vacío).
- `chat-drawer`, `theme-drawer`, `search-modal`, `quick-add-modal` y
  `cart-drawer` de Horizon se dejan vacíos.
- Envío real de formularios, pago, cuentas y apps.

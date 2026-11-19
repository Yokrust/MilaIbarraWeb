/**
 * Configurador 3D — entry point.
 *
 * Built by Vite into ONE ES module (theme/assets/configurator.js). It is never
 * loaded by a <script> tag: assets/mi-configurator-loader.js imports it only
 * after checking WebGL + reduced motion and only when the viewer scrolls into
 * view, then calls mount(element).
 *
 * Contract with sections/mi-configurator.liquid:
 *   <mi-configurator data-model="…glb">            ← element passed to mount()
 *     [data-mi-configurator-stage]                 ← canvas goes here
 *     [data-mi-configurator-fallback]              ← static image, hidden once 3D renders
 *     [data-mi-configurator-rotate]                ← toggles auto-rotate
 *     [data-mi-configurator-expand]                ← fullscreen
 *   The state (text / font / material) lives in <mi-configurator-form>
 *   (assets/mi-configurator-form.js), which keeps it on the section root as
 *   `root.miConfiguratorState` and dispatches `mi:configurator:change`.
 */
import { MedalScene } from './scene.js';

export async function mount(element) {
  if (element.miScene) return element.miScene;

  const root = element.closest('[data-mi-configurator-root]') ?? document;
  const stage = element.querySelector('[data-mi-configurator-stage]') ?? element;
  const scene = new MedalScene(stage);
  element.miScene = scene;

  const initial = root.miConfiguratorState;
  if (initial) scene.state = { ...scene.state, ...initial };

  root.addEventListener('mi:configurator:change', (event) => {
    scene.setState(event.detail);
  });

  stage.prepend(scene.renderer.domElement);

  try {
    await scene.load(element.dataset.model);
  } catch (error) {
    console.error('[configurador] No se pudo cargar el modelo 3D', error);
    scene.renderer.domElement.remove();
    scene.dispose();
    element.miScene = null;
    return null;
  }

  element.classList.add('is-3d-ready');
  element.dispatchEvent(new CustomEvent('mi:configurator:ready', { bubbles: true }));

  element.querySelector('[data-mi-configurator-rotate]')?.addEventListener('click', (event) => {
    const on = scene.toggleAutoRotate();
    event.currentTarget.setAttribute('aria-pressed', String(on));
  });

  element.querySelector('[data-mi-configurator-expand]')?.addEventListener('click', () => {
    const target = element.querySelector('[data-mi-configurator-viewer]') ?? element;
    if (document.fullscreenElement) document.exitFullscreen();
    else target.requestFullscreen?.();
  });

  // Hide the "Arrastra para girar" hint after the first drag.
  element.addEventListener(
    'mi:configurator:interact',
    () => element.querySelector('[data-mi-configurator-hint]')?.classList.add('is-hidden'),
    { once: true }
  );

  // Expose for phase 2 (snapshot to the order) and for debugging.
  element.miSnapshot = () => scene.snapshot();
  return scene;
}

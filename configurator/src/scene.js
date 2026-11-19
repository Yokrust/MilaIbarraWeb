import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import { Engraving } from './engraving.js';
import { applyMetal, createMetal, DEFAULT_METAL } from './materials.js';

const MAX_PIXEL_RATIO = 2; // battery: never render above 2× (scope doc)
// Depth of the engraving. The medal is ~18 mm in world units, so the bump
// derivatives are large; this keeps the cut walls crisp but not exaggerated.
const BUMP_SCALE = 2.5;

/**
 * The 3D preview. Renders only when something changes (state, resize,
 * orbit, intro tween, auto-rotate) — never in an idle loop.
 */
export class MedalScene {
  constructor(container) {
    this.container = container;
    this.frame = 0;
    this.tweens = new Set();
    this.state = { text: '', font: 'romana', material: DEFAULT_METAL };

    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.className = 'mi-configurator__canvas';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');

    this.scene = new Scene();
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(studioEnvironment(), 0.035).texture;
    pmrem.dispose();

    this.camera = new PerspectiveCamera(28, 1, 0.001, 1);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.7;
    this.controls.minPolarAngle = MathUtils.degToRad(62);
    this.controls.maxPolarAngle = MathUtils.degToRad(112);
    this.controls.autoRotateSpeed = 2.4;
    this.controls.addEventListener('change', () => this.requestRender());
    this.controls.addEventListener('start', () => container.dispatchEvent(new CustomEvent('mi:configurator:interact', { bubbles: true })));

    this.metal = createMetal();
    this.engraving = new Engraving();
    this.face = createMetal();
    this.face.roughness = 1;
    this.face.map = this.engraving.map;
    this.face.bumpMap = this.engraving.bumpMap;
    this.face.bumpScale = BUMP_SCALE;
    this.face.roughnessMap = this.engraving.roughnessMap;
    this.pendingEngraving = 0;
    this.back = createMetal();

    this.pivot = new Group();
    this.scene.add(this.pivot);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
  }

  async load(url) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;

    // gltfpack keeps node names (-kn) but renames the meshes, so match on the
    // mesh's own name or its parent node's (names from build_medalla.py).
    const nameOf = (node) => `${node.name} ${node.parent?.name ?? ''}`;
    model.traverse((node) => {
      if (!node.isMesh) return;
      const name = nameOf(node);
      if (name.includes('Medalla_Cara')) node.material = this.face;
      else if (name.includes('Medalla_Reverso')) node.material = this.back;
      else node.material = this.metal;
    });

    // Center on the disc (not the chain) so orbiting pivots around the medal.
    const disc = model.getObjectByName('Medalla_Cuerpo') ?? model;
    const box = new Box3().setFromObject(disc);
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    model.position.sub(center);
    this.pivot.add(model);

    this.discSize = Math.max(size.x, size.y);
    // Frame the disc plus the bail, slightly above center, like the Figma visor.
    this.controls.target.set(0, this.discSize * 0.24, 0);
    this.baseDistance = this.discSize * 5.4;
    this.camera.position.set(0, this.discSize * 0.24, this.baseDistance);
    this.controls.minDistance = this.baseDistance * 0.7;
    this.controls.maxDistance = this.baseDistance * 1.35;
    this.controls.update();

    this.resize();
    await this.setState(this.state, { force: true });
    this.intro();
  }

  /** Applies a (partial) configurator state; redraws the engraving only if text or font changed. */
  async setState(next, { force = false } = {}) {
    const previous = this.state;
    this.state = { ...previous, ...next };

    if (force || previous.material !== this.state.material) {
      for (const material of [this.metal, this.face, this.back]) applyMetal(material, this.state.material);
    }
    if (force || previous.text !== this.state.text || previous.font !== this.state.font) {
      // Font files load once; after that each redraw is synchronous.
      await this.engraving.ready(this.state.font);
      this.queueEngraving();
      // Turn the engraving toward the viewer when the text changes and it's facing away.
      if (!force) this.faceFront();
    }
    this.requestRender();
  }

  /** Coalesces fast typing: at most one engraving redraw per frame, with the latest state. */
  queueEngraving() {
    if (this.pendingEngraving) return;
    this.pendingEngraving = requestAnimationFrame(() => {
      this.pendingEngraving = 0;
      if (this.engraving.drawText(this.state.text, this.state.font)) this.requestRender();
    });
  }

  /** Soft entrance: a quarter turn that settles facing the camera. */
  intro() {
    this.pivot.rotation.y = -0.9;
    this.tween(1400, (t) => {
      this.pivot.rotation.y = -0.9 * (1 - easeOutCubic(t));
    });
  }

  faceFront() {
    const azimuth = this.controls.getAzimuthalAngle();
    if (Math.abs(azimuth) < Math.PI / 2) return;
    this.resetView(700);
  }

  resetView(duration = 900) {
    const from = this.camera.position.clone();
    const to = new Vector3(0, this.controls.target.y, this.baseDistance);
    this.controls.autoRotate = false;
    this.tween(duration, (t) => {
      // Arc around the target rather than cutting through the medal.
      const k = easeInOutCubic(t);
      const a0 = Math.atan2(from.x, from.z);
      const a1 = 0;
      let delta = a1 - a0;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      const angle = a0 + delta * k;
      const radius = MathUtils.lerp(Math.hypot(from.x, from.z), to.z, k);
      this.camera.position.set(Math.sin(angle) * radius, MathUtils.lerp(from.y, to.y, k), Math.cos(angle) * radius);
      this.camera.lookAt(this.controls.target);
    });
  }

  toggleAutoRotate() {
    this.controls.autoRotate = !this.controls.autoRotate;
    this.requestRender();
    return this.controls.autoRotate;
  }

  tween(duration, step) {
    const start = performance.now();
    const tween = { duration, step, start };
    this.tweens.add(tween);
    this.requestRender();
  }

  resize() {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  requestRender() {
    if (this.frame) return;
    this.frame = requestAnimationFrame((now) => {
      this.frame = 0;
      let keepGoing = false;

      for (const tween of this.tweens) {
        const t = Math.min(1, (now - tween.start) / tween.duration);
        tween.step(t);
        if (t >= 1) this.tweens.delete(tween);
        else keepGoing = true;
      }

      // update() returns true while damping or auto-rotate moves the camera.
      if (this.controls.update()) keepGoing = true;
      if (this.controls.autoRotate) keepGoing = true;

      this.renderer.render(this.scene, this.camera);
      if (keepGoing) this.requestRender();
    });
  }

  /** Snapshot of the current view — phase 2 attaches it to the order. */
  snapshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.pendingEngraving);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.engraving.dispose();
    this.renderer.dispose();
  }
}

/**
 * Three's RoomEnvironment plus a large softbox in front of the piece (behind
 * the camera): a flat polished face mirrors whatever is in front of it, so
 * without this it reflects a grey wall and the medal reads dark.
 */
function studioEnvironment() {
  const room = new RoomEnvironment();
  const softbox = new Mesh(new PlaneGeometry(14, 7), new MeshBasicMaterial({ color: new Color(3.2, 3.1, 2.9) }));
  softbox.position.set(0, 2.5, 9);
  softbox.lookAt(0, 0, 0);
  room.add(softbox);
  return room;
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

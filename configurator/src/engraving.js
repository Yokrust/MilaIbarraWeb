import { CanvasTexture, LinearSRGBColorSpace, NoColorSpace, SRGBColorSpace } from 'three';

/**
 * Turns the customer's text into the textures that make it look engraved on
 * the medal face. Everything is drawn with Canvas 2D primitives (fills +
 * blurred shadows, GPU-accelerated in every browser) — no per-pixel JS — so
 * a keystroke costs a few milliseconds even on mid-range phones:
 *
 *   height  (1024²) → bumpMap: white = polished surface, black = the cut.
 *                     The GPU derives the lighting of the cut walls from it.
 *   albedo  (512²)  → map: slight darkening inside the cut (occlusion).
 *   rough   (512²)  → roughnessMap: polished surface vs. satin cut bottom.
 *
 * Phase 2 (customer image) draws a greyscale image into the same canvases —
 * see drawImage().
 */

const HEIGHT_SIZE = 1024;
const DETAIL_SIZE = 512;
const SURFACE_ROUGHNESS = 0.16;
const CUT_ROUGHNESS = 0.5;

export const FONTS = {
  romana: { family: 'Ibarra Real Nova', style: 'normal' },
  cursiva: { family: 'Ibarra Real Nova', style: 'italic' },
};

// Grey levels (0–255) for each canvas: [surface, cut]
const LEVELS = {
  height: [255, 0],
  albedo: [255, 150],
  rough: [Math.round(SURFACE_ROUGHNESS * 255), Math.round(CUT_ROUGHNESS * 255)],
};

const grey = (value) => `rgb(${value}, ${value}, ${value})`;

function makeLayer(size, colorSpace) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.anisotropy = 8;
  // glTF UVs have their origin at the top-left (GLTFLoader textures use
  // flipY = false); canvas rows also start at the top, so no flip.
  texture.flipY = false;
  return { canvas, ctx: canvas.getContext('2d'), texture, size };
}

export class Engraving {
  constructor() {
    this.layers = {
      height: makeLayer(HEIGHT_SIZE, NoColorSpace),
      albedo: makeLayer(DETAIL_SIZE, SRGBColorSpace),
      rough: makeLayer(DETAIL_SIZE, LinearSRGBColorSpace),
    };
    this.bumpMap = this.layers.height.texture;
    this.map = this.layers.albedo.texture;
    this.roughnessMap = this.layers.rough.texture;
    this.fontsReady = new Map();
    this.last = null;
  }

  /** Loads each web font once; later calls resolve immediately. */
  ready(fontKey) {
    const font = FONTS[fontKey] ?? FONTS.romana;
    const key = `${font.style} ${font.family}`;
    if (!this.fontsReady.has(key)) {
      const promise = document.fonts?.load
        ? document.fonts.load(`${font.style} 400 100px "${font.family}"`, 'M·I').catch(() => {})
        : Promise.resolve();
      this.fontsReady.set(key, promise);
    }
    return this.fontsReady.get(key);
  }

  /** Synchronous redraw; call ready(fontKey) once before the first draw. */
  drawText(text, fontKey) {
    const value = (text ?? '').trim();
    const signature = `${fontKey}|${value}`;
    if (signature === this.last) return false;
    this.last = signature;

    const font = FONTS[fontKey] ?? FONTS.romana;
    for (const [name, layer] of Object.entries(this.layers)) {
      const [surface, cut] = LEVELS[name];
      const { ctx, size } = layer;
      ctx.save();
      ctx.fillStyle = grey(surface);
      ctx.fillRect(0, 0, size, size);

      if (value) {
        // Fit one line inside the flat area of the disc (max ~64% wide).
        let fontSize = size * 0.3;
        ctx.font = `${font.style} 400 ${fontSize}px "${font.family}", Georgia, serif`;
        const measured = ctx.measureText(value).width;
        if (measured > size * 0.64) fontSize *= (size * 0.64) / measured;
        ctx.font = `${font.style} 400 ${fontSize}px "${font.family}", Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        const metrics = ctx.measureText(value);
        const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.7;
        const descent = metrics.actualBoundingBoxDescent || 0;
        const baseline = size / 2 + (ascent - descent) / 2;

        // Soft V-shaped cut walls: draw only the blurred shadow of the text
        // (the glyphs themselves sit off-canvas). Works in every browser,
        // unlike ctx.filter, and runs on the GPU.
        const offset = size * 2;
        ctx.shadowColor = grey(cut);
        ctx.shadowBlur = (size / HEIGHT_SIZE) * 5;
        ctx.shadowOffsetX = offset;
        ctx.fillStyle = grey(cut);
        ctx.fillText(value, size / 2 - offset, baseline);
      }
      ctx.restore();
      layer.texture.needsUpdate = true;
    }
    return true;
  }

  /** Phase 2: a customer image, already greyscale, becomes the engraving. */
  drawImage(image) {
    this.last = null;
    for (const [name, layer] of Object.entries(this.layers)) {
      const [surface] = LEVELS[name];
      const { ctx, size } = layer;
      ctx.save();
      ctx.fillStyle = grey(surface);
      ctx.fillRect(0, 0, size, size);
      const scale = Math.min((size * 0.62) / image.width, (size * 0.62) / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      ctx.restore();
      layer.texture.needsUpdate = true;
    }
  }

  /** PNG of the engraving alone — phase 2 can attach it to the order. */
  toDataURL() {
    return this.layers.height.canvas.toDataURL('image/png');
  }

  dispose() {
    for (const layer of Object.values(this.layers)) layer.texture.dispose();
  }
}

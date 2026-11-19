import { CanvasTexture, LinearSRGBColorSpace, NoColorSpace, SRGBColorSpace } from 'three';

/**
 * Turns the customer's text into the maps that make it look engraved on the
 * medal face: a height field drawn on a canvas (white = polished surface,
 * black = cut), from which we derive
 *   - normalMap   : Sobel of the height, so the cut walls catch the light
 *   - map         : slight darkening inside the cut (dirt / occlusion)
 *   - roughnessMap: polished surface vs. satin bottom of the cut
 *
 * Phase 2 (customer image) feeds a greyscale image into the same height
 * canvas instead of text — see drawHeightFromImage().
 */

const SIZE = 1024;
const SURFACE_ROUGHNESS = 0.16;
const CUT_ROUGHNESS = 0.5;

export const FONTS = {
  romana: { family: 'Ibarra Real Nova', style: 'normal' },
  cursiva: { family: 'Ibarra Real Nova', style: 'italic' },
};

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  return canvas;
}

export class Engraving {
  constructor() {
    this.height = makeCanvas();
    this.normal = makeCanvas();
    this.albedo = makeCanvas();
    this.rough = makeCanvas();

    this.normalMap = new CanvasTexture(this.normal);
    this.normalMap.colorSpace = NoColorSpace;
    this.map = new CanvasTexture(this.albedo);
    this.map.colorSpace = SRGBColorSpace;
    this.roughnessMap = new CanvasTexture(this.rough);
    this.roughnessMap.colorSpace = LinearSRGBColorSpace;

    for (const texture of [this.normalMap, this.map, this.roughnessMap]) {
      texture.anisotropy = 8;
      // glTF UVs have their origin at the top-left (GLTFLoader textures use
      // flipY = false); canvas rows also start at the top, so no flip.
      texture.flipY = false;
    }
  }

  /** Waits for the web font so the first engraving isn't drawn in a fallback face. */
  async ready(fontKey) {
    const font = FONTS[fontKey] ?? FONTS.romana;
    if (!document.fonts?.load) return;
    try {
      await document.fonts.load(`${font.style} 400 100px "${font.family}"`, 'M·I');
    } catch {
      /* Falls back to the serif stack; still readable. */
    }
  }

  async drawText(text, fontKey) {
    await this.ready(fontKey);
    const font = FONTS[fontKey] ?? FONTS.romana;
    const ctx = this.height.getContext('2d', { willReadFrequently: true });
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, SIZE, SIZE);

    const value = (text ?? '').trim();
    if (value) {
      // Fit inside the flat area of the disc: one line, max ~64% of the width.
      let fontSize = SIZE * 0.3;
      const maxWidth = SIZE * 0.64;
      ctx.font = `${font.style} 400 ${fontSize}px "${font.family}", Georgia, serif`;
      const measured = ctx.measureText(value).width;
      if (measured > maxWidth) fontSize *= maxWidth / measured;

      ctx.font = `${font.style} 400 ${fontSize}px "${font.family}", Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const metrics = ctx.measureText(value);
      const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.7;
      const descent = metrics.actualBoundingBoxDescent || 0;
      const baseline = SIZE / 2 + (ascent - descent) / 2;

      // A 2px blur gives the cut a soft V-shaped wall instead of a cliff.
      ctx.filter = 'blur(2px)';
      ctx.fillStyle = '#000';
      ctx.fillText(value, SIZE / 2, baseline);
      ctx.filter = 'none';
    }
    ctx.restore();
    this.derive();
  }

  /** Phase 2: a customer image, already greyscale, becomes the height field. */
  drawHeightFromImage(image) {
    const ctx = this.height.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const scale = Math.min((SIZE * 0.62) / image.width, (SIZE * 0.62) / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    ctx.filter = 'grayscale(1) blur(1px)';
    ctx.drawImage(image, (SIZE - width) / 2, (SIZE - height) / 2, width, height);
    ctx.filter = 'none';
    this.derive();
  }

  derive() {
    const source = this.height.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, SIZE, SIZE).data;
    const heights = new Float32Array(SIZE * SIZE);
    for (let i = 0; i < heights.length; i += 1) heights[i] = source[i * 4] / 255;

    const normal = new ImageData(SIZE, SIZE);
    const albedo = new ImageData(SIZE, SIZE);
    const rough = new ImageData(SIZE, SIZE);
    const strength = 6;
    const at = (x, y) => heights[Math.min(SIZE - 1, Math.max(0, y)) * SIZE + Math.min(SIZE - 1, Math.max(0, x))];

    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const i = (y * SIZE + x) * 4;
        const h = heights[y * SIZE + x];

        // Sobel. Canvas y grows downward while UV v grows upward → flip dy.
        const dx =
          at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
        const dy =
          at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) - at(x - 1, y + 1) - 2 * at(x, y + 1) - at(x + 1, y + 1);
        let nx = -dx * strength;
        let ny = -dy * strength;
        let nz = 1;
        const length = Math.hypot(nx, ny, nz);
        nx /= length;
        ny /= length;
        nz /= length;
        normal.data[i] = (nx * 0.5 + 0.5) * 255;
        normal.data[i + 1] = (ny * 0.5 + 0.5) * 255;
        normal.data[i + 2] = (nz * 0.5 + 0.5) * 255;
        normal.data[i + 3] = 255;

        const cut = 1 - h;
        const shade = 255 - cut * 95;
        albedo.data[i] = shade;
        albedo.data[i + 1] = shade;
        albedo.data[i + 2] = shade;
        albedo.data[i + 3] = 255;

        const r = (SURFACE_ROUGHNESS + (CUT_ROUGHNESS - SURFACE_ROUGHNESS) * cut) * 255;
        rough.data[i] = r;
        rough.data[i + 1] = r; // roughnessMap reads the green channel
        rough.data[i + 2] = r;
        rough.data[i + 3] = 255;
      }
    }

    this.normal.getContext('2d').putImageData(normal, 0, 0);
    this.albedo.getContext('2d').putImageData(albedo, 0, 0);
    this.rough.getContext('2d').putImageData(rough, 0, 0);
    this.normalMap.needsUpdate = true;
    this.map.needsUpdate = true;
    this.roughnessMap.needsUpdate = true;
  }

  /** PNG of the engraving alone — phase 2 can attach it to the order. */
  toDataURL() {
    return this.height.toDataURL('image/png');
  }

  dispose() {
    this.normalMap.dispose();
    this.map.dispose();
    this.roughnessMap.dispose();
  }
}

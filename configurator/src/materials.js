import { Color, MeshPhysicalMaterial } from 'three';

/**
 * Metal presets (MeshPhysicalMaterial). Keys match the values of the
 * Material radios in sections/mi-configurator.liquid, handleized:
 * "Oro" → oro, "Plata" → plata, "Oro rosa" → oro-rosa.
 */
export const METALS = {
  oro: { color: '#e2b867', roughness: 0.17, specular: '#fff1cf' },
  plata: { color: '#dcdcd8', roughness: 0.15, specular: '#ffffff' },
  'oro-rosa': { color: '#e8b4a0', roughness: 0.17, specular: '#ffe4da' },
};

export const DEFAULT_METAL = 'oro';

export function createMetal() {
  return new MeshPhysicalMaterial({
    metalness: 1,
    roughness: METALS[DEFAULT_METAL].roughness,
    color: new Color(METALS[DEFAULT_METAL].color),
    envMapIntensity: 1.15,
    clearcoat: 0.25,
    clearcoatRoughness: 0.12,
  });
}

/** Applies a preset to a material in place (body, bail, chain and faces share presets). */
export function applyMetal(material, key) {
  const preset = METALS[key] ?? METALS[DEFAULT_METAL];
  material.color.set(preset.color);
  material.specularColor.set(preset.specular);
  // Engraved faces drive roughness through a roughnessMap whose grey levels
  // already encode the final value, so their scalar stays at 1.
  if (!material.roughnessMap) material.roughness = preset.roughness;
  material.needsUpdate = true;
}

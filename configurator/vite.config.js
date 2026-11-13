import { defineConfig } from "vite";

// Se compila a un solo archivo (sin hash, sin code-splitting) para poder
// copiarlo directo a theme/assets y cargarlo desde Liquid con {{ 'configurator.js' | asset_url }}.
export default defineConfig({
  build: {
    lib: {
      entry: "src/main.js",
      name: "Configurador3D",
      fileName: () => "configurator.js",
      formats: ["iife"],
    },
    outDir: "dist",
    emptyOutDir: true,
  },
});

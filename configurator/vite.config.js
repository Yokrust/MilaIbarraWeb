import { defineConfig } from 'vite';

// Builds ONE minified ES module (no hash, no code-splitting) that is copied to
// theme/assets and imported lazily by assets/mi-configurator-loader.js, which
// calls its exported mount(). (Plain app build instead of library mode: Vite's
// library mode leaves ES output un-minified.)
//
// `npm run dev` serves index.html with theme/assets as the public folder, so
// the dev page uses the same model and fonts as the theme.
export default defineConfig(({ command }) => ({
  publicDir: command === 'serve' ? '../theme/assets' : false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    modulePreload: false,
    rollupOptions: {
      input: 'src/main.js',
      preserveEntrySignatures: 'exports-only',
      output: {
        format: 'es',
        entryFileNames: 'configurator.js',
        inlineDynamicImports: true,
      },
    },
  },
}));

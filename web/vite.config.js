import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/RaidSim-Online/' : './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
}));

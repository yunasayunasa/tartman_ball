import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: {
    // Rapier compatはWASMを内包する。分割後の物理チャンク上限を明示。
    chunkSizeWarningLimit: 2400,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'physics', test: /rapier3d/ },
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
          ],
        },
      },
    },
  },
});

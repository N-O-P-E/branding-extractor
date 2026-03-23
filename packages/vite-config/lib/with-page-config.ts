import env, { IS_DEV, IS_PROD } from '@extension/env';
import { watchRebuildPlugin } from '@extension/hmr';
import react from '@vitejs/plugin-react-swc';
import deepmerge from 'deepmerge';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import type { UserConfig } from 'vite';

export const watchOption = IS_DEV
  ? {
      chokidar: {
        awaitWriteFinish: true,
      },
    }
  : undefined;

export const withPageConfig = (config: UserConfig) => {
  // Only expose known env vars to the bundle — prevents accidental secret leakage
  const safeEnv = {
    CEB_EXAMPLE: env.CEB_EXAMPLE,
    CEB_DEV_LOCALE: env.CEB_DEV_LOCALE,
    CLI_CEB_DEV: env.CLI_CEB_DEV,
    CLI_CEB_FIREFOX: env.CLI_CEB_FIREFOX,
    CEB_NODE_ENV: env.CEB_NODE_ENV,
  };

  return defineConfig(
    deepmerge(
      {
        define: {
          'process.env': safeEnv,
        },
        base: '',
        plugins: [
          react(),
          IS_DEV && watchRebuildPlugin({ refresh: true }),
          nodePolyfills({ include: ['buffer', 'process'] }),
        ],
        build: {
          sourcemap: IS_DEV,
          minify: IS_PROD,
          reportCompressedSize: IS_PROD,
          emptyOutDir: IS_PROD,
          watch: watchOption,
          rollupOptions: {
            external: ['chrome'],
          },
        },
      },
      config,
    ),
  );
};

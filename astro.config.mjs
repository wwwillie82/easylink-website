import { defineConfig } from 'astro/config';

const publishOutDir = process.env.SITE_PUBLISH_OUT_DIR || process.env.OUT_DIR;

export default defineConfig({
  output: 'static',
  site: 'https://site-dev.easylink.hu',
  ...(publishOutDir ? { outDir: publishOutDir } : {}),
});

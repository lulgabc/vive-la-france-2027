import cloudflare from '@astrojs/cloudflare';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://vlf-web.ainet-netbook.workers.dev',
  output: 'server',
  adapter: cloudflare({
    persistState: { path: '../../.wrangler/state' },
  }),
  integrations: [svelte()],
  vite: {
    plugins: [tailwindcss()],
  },
  i18n: {
    defaultLocale: 'fr',
    locales: ['fr', 'en', 'zh'],
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },
});

// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  site: 'http://10.10.10.8:3000',
  base: '/',
  output: 'server',
  build: {
    inlineStylesheets: 'always',
    assets: 'assets'
  },



  adapter: node({
    mode: 'middleware'
  }),

  server: {
    host: '0.0.0.0',
    port: 4321
  },



  integrations: [tailwind()]
});
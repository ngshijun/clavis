import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import { webUpdateNotice } from '@plugin-web-update-notification/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
    webUpdateNotice({
      logVersion: true,
      checkInterval: 10 * 60 * 1000,
      hiddenDefaultNotification: true,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/vue/') ||
            id.includes('node_modules/vue-router/') ||
            id.includes('node_modules/pinia/') ||
            id.includes('node_modules/@vue/')
          ) {
            return 'vue-vendor'
          }
          if (id.includes('node_modules/@supabase/')) {
            return 'supabase'
          }
          if (id.includes('node_modules/reka-ui/')) {
            return 'ui-primitives'
          }
          if (id.includes('node_modules/@tanstack/')) {
            return 'tanstack'
          }
          if (id.includes('node_modules/driver.js/')) {
            return 'driver'
          }
          if (id.includes('node_modules/vee-validate/') || id.includes('node_modules/@vee-validate/')) {
            return 'vee-validate'
          }
          if (id.includes('node_modules/zod/')) {
            return 'zod'
          }
        },
      },
    },
  },
})

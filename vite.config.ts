import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	},

	server: {
    host: '0.0.0.0',
    port: 5173,
		proxy: {
      '/api/v2': {
        target: 'http://app:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

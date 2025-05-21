import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	
	test: {
		globals: true,
		environment: 'jsdom', // or 'happy-dom'
		setupFiles: ['./src/vitest.setup.ts'], // Add this line
		include: ['src/**/*.{test,spec}.{js,ts}']
	},

	server: {
    host: '0.0.0.0',
    port: 5173
  },
});

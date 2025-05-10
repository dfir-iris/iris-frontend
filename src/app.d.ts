// See https://svelte.dev/docs/kit/types#app.d.ts

import type { UserInfo } from "$lib/stores/auth.store";

// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user?: import('$lib/stores/auth.store').UserInfo;
		}
		// interface PageData {}
		// interface Platform {}
	}
}

// Add environment variable types
declare namespace NodeJS {
  interface ProcessEnv {
    PUBLIC_API_BASE_URL: string;
  }
}

export { };

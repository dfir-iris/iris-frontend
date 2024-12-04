// See https://svelte.dev/docs/kit/types#app.d.ts

import type { UserInfo } from "$lib/stores/auth.store";

// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: UserInfo
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export { };

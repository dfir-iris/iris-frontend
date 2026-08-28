import { writable } from 'svelte/store';
import { ApiService } from '$lib/services/api.service';
import { ENDPOINTS } from '$lib/constants/endpoints';
import type { Tlp } from '$lib/types/resources/ioc';

function createTlpStore() {
	const { subscribe, set } = writable<Tlp[]>([]);
	let initialized = false;
	let fetchPromise: Promise<void> | null = null;

	async function fetchTlp() {
		// If already fetching or initialized, don't fetch again
		if (fetchPromise || initialized) {
			return fetchPromise;
		}

		fetchPromise = new Promise((resolve) => {
			(async () => {
				try {
					const response = await ApiService.get(ENDPOINTS.manage.tlp.list);
					if (response && response.data) {
						set(response.data as Tlp[]);
					}
					initialized = true;
				} catch (error) {
					console.error('Error fetching tlp types:', error);
				} finally {
					fetchPromise = null;
					resolve();
				}
			})();
		});

		return fetchPromise;
	}

	return {
		subscribe,
		fetch: fetchTlp,
		isInitialized: () => initialized
	};
}

export const tlpList = createTlpStore();

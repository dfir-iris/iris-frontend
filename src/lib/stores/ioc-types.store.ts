import { writable } from 'svelte/store';
import { ApiService } from '$lib/services/api.service';
import { ENDPOINTS } from '$lib/constants/endpoints';

export interface IocType {
	type_id: number;
	type_name: string;
	type_description: string;
	type_taxonomy: string;
	type_validation_regex: string;
	type_validation_expect: string;
}

function createIocTypesStore() {
	const { subscribe, set } = writable<IocType[]>([]);
	let initialized = false;
	let fetchPromise: Promise<void> | null = null;

	async function fetchIocTypes() {
		// If already fetching or initialized, don't fetch again
		if (fetchPromise || initialized) {
			return fetchPromise;
		}

		fetchPromise = new Promise((resolve) => {
			(async () => {
				try {
					const response = await ApiService.get(ENDPOINTS.manage.ioc_types.list);
					console.log('Fetched IOC types:', response.data);

					if (response && response.data) {
						set(response.data as IocType[]);
					}
					initialized = true;
				} catch (error) {
					console.error('Error fetching asset types:', error);
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
		fetch: fetchIocTypes,
		isInitialized: () => initialized
	};
}

export const iocTypes = createIocTypesStore();

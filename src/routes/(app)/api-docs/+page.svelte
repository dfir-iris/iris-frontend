<!--
  API reference (Redoc) rendered inside the SPA.

  The backend's `/api/v2/docs` + `/api/v2/openapi.yaml` endpoints are
  gated by `ac_api_requires()`, and the SPA authenticates with a
  Bearer token in memory — not a session cookie. Opening those routes
  directly in a new tab therefore lands on a bare 401 ("Authentication
  Error"). This page fetches the spec through `ApiService` (which
  attaches the Bearer header + refreshes if needed), converts the YAML
  response to a same-origin blob URL, and hands it to Redoc's
  standalone bundle. Redoc parses YAML itself.
-->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { ApiService } from '$lib/services/api.service';
	import { Skeleton } from '$lib/components/ui/skeleton';

	const REDOC_CDN = 'https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js';

	let loading = $state(true);
	let error = $state<string | null>(null);
	let specBlobUrl = $state<string | null>(null);

	const loadSpec = async () => {
		loading = true;
		error = null;
		try {
			// `useApiPrefix: false` because the spec lives at /api/v2/openapi.yaml
			// and ApiService's default prefix would double it. `absoluteUrl` is
			// off — we want the request to go through the SvelteKit proxy so
			// the Bearer header and CORS story match every other call.
			const res = await ApiService.get<string>('/api/v2/openapi.yaml', {
				useApiPrefix: false,
				headers: { Accept: 'application/yaml, text/yaml, */*' }
			});
			if (!res.ok || typeof res.data !== 'string') {
				error = res.error?.message ?? 'Failed to load the API specification.';
				return;
			}
			const blob = new Blob([res.data], { type: 'application/yaml' });
			specBlobUrl = URL.createObjectURL(blob);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	};

	onMount(async () => {
		await loadSpec();
		if (specBlobUrl && !document.querySelector('script[data-redoc-cdn="1"]')) {
			const s = document.createElement('script');
			s.src = REDOC_CDN;
			s.async = true;
			s.dataset.redocCdn = '1';
			document.head.appendChild(s);
		}
	});

	onDestroy(() => {
		if (specBlobUrl) URL.revokeObjectURL(specBlobUrl);
	});
</script>

<svelte:head>
	<title>IRIS API reference</title>
</svelte:head>

<div class="h-full w-full overflow-auto bg-white">
	{#if loading}
		<div class="p-8 space-y-4">
			<Skeleton class="h-8 w-64" />
			<Skeleton class="h-4 w-full" />
			<Skeleton class="h-4 w-5/6" />
			<Skeleton class="h-4 w-4/6" />
		</div>
	{:else if error}
		<div class="p-8 text-red-600">
			<p class="font-semibold">Unable to load API documentation</p>
			<p class="mt-2 text-sm">{error}</p>
		</div>
	{:else if specBlobUrl}
		<!-- Redoc's custom element auto-upgrades once the CDN script loads. -->
		<redoc spec-url={specBlobUrl}></redoc>
	{/if}
</div>

<!--
  API reference (Redoc) rendered inside the SPA.

  The backend's `/api/v2/docs` + `/api/v2/openapi.yaml` endpoints are
  gated by `ac_api_requires()`, and the SPA authenticates with a
  Bearer token in memory — not a session cookie. Opening those routes
  directly in a new tab therefore lands on a bare 401 ("Authentication
  Error"). This page fetches the spec through `ApiService` (which
  attaches the Bearer header + refreshes if needed), parses the YAML
  into a JS object, and hands it to Redoc via `element.spec = obj`.

  Historically this page passed a `blob:` URL to Redoc's `spec-url`
  attribute. That triggered a Redoc 2.5.3 bug: when the served spec
  had any `$ref` (even `#/components/...`), its resolver walked a
  code path that ended in `fs.lstatSync` — Node-only, throws
  `n.lstatSync is not a function` in the browser. Handing Redoc the
  parsed object short-circuits the URL resolver entirely.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import yaml from 'js-yaml';
	import { ApiService } from '$lib/services/api.service';
	import { Skeleton } from '$lib/components/ui/skeleton';

	const REDOC_CDN = 'https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js';

	let loading = $state(true);
	let error = $state<string | null>(null);
	let specObject = $state<unknown>(null);
	let redocEl: HTMLElement | null = $state(null);

	const loadSpec = async () => {
		loading = true;
		error = null;
		try {
			const res = await ApiService.get<string>('/api/v2/openapi.yaml', {
				useApiPrefix: false,
				headers: { Accept: 'application/yaml, text/yaml, */*' }
			});
			if (!res.ok || typeof res.data !== 'string') {
				error = res.error?.message ?? 'Failed to load the API specification.';
				return;
			}
			// Parse client-side so Redoc gets a JS object, never a URL.
			// `js-yaml` throws on malformed input; the catch below turns
			// that into a rendered error state.
			specObject = yaml.load(res.data);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	};

	// Wait for the Redoc CDN script to define the <redoc> custom
	// element (or return immediately if it already did). Resolves so
	// the caller can safely set `.spec` on the element.
	const waitForRedoc = (): Promise<void> =>
		new Promise((resolve) => {
			if (customElements.get('redoc')) return resolve();
			void customElements.whenDefined('redoc').then(() => resolve());
		});

	onMount(async () => {
		await loadSpec();
		if (specObject == null) return;

		if (!document.querySelector('script[data-redoc-cdn="1"]')) {
			const s = document.createElement('script');
			s.src = REDOC_CDN;
			s.async = true;
			s.dataset.redocCdn = '1';
			document.head.appendChild(s);
		}
		await waitForRedoc();
		if (redocEl) {
			// Redoc reads `element.spec` (a JS object) when `spec-url`
			// is absent. Setting the property triggers initial render.
			(redocEl as unknown as { spec: unknown }).spec = specObject;
		}
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
	{:else if specObject}
		<redoc bind:this={redocEl}></redoc>
	{/if}
</div>

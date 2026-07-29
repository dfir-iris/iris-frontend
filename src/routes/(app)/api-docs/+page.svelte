<!--
  API reference (Redoc) rendered inside the SPA.

  The backend's `/api/v2/docs` + `/api/v2/openapi.yaml` endpoints are
  gated by `ac_api_requires()`, and the SPA authenticates with a
  Bearer token in memory — not a session cookie. Opening those routes
  directly in a new tab therefore lands on a bare 401 ("Authentication
  Error"). This page fetches the spec through `ApiService` (which
  attaches the Bearer header + refreshes if needed), parses the YAML
  into a JS object, and hands it to `Redoc.init()`.

  Two Redoc traps we sidestep here:
  1. Historic bug: `spec-url` pointing at a `blob:` URL made the
     resolver walk into `fs.lstatSync` (Node-only, throws in the
     browser) as soon as the spec had a `$ref`. Parsing YAML client-
     side and passing the object short-circuits that entire code path.
  2. `<redoc>` is NOT a real custom element — Redoc's bundle mounts
     React inside a plain tag but never calls `customElements.define`.
     So `customElements.whenDefined('redoc')` throws
     `'redoc' is not a valid custom element name` (spec requires a
     hyphen). Use `Redoc.init(spec, options, element)` instead — the
     documented programmatic entry point that doesn't rely on custom
     elements at all.
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
	let mountEl: HTMLDivElement | null = $state(null);

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

	// Wait until the CDN script has attached `window.Redoc.init`.
	// Polling because the script `load` event fires before the global
	// is fully populated in some browsers.
	const waitForRedocGlobal = (): Promise<{ init: (spec: unknown, options: unknown, element: HTMLElement) => void }> =>
		new Promise((resolve, reject) => {
			const start = performance.now();
			const tick = () => {
				const g = (window as unknown as { Redoc?: { init?: (s: unknown, o: unknown, e: HTMLElement) => void } }).Redoc;
				if (g && typeof g.init === 'function') return resolve(g as { init: (s: unknown, o: unknown, e: HTMLElement) => void });
				if (performance.now() - start > 15000) return reject(new Error('Redoc failed to load within 15s.'));
				setTimeout(tick, 60);
			};
			tick();
		});

	onMount(async () => {
		await loadSpec();
		if (specObject == null || !mountEl) return;

		if (!document.querySelector('script[data-redoc-cdn="1"]')) {
			const s = document.createElement('script');
			s.src = REDOC_CDN;
			s.async = true;
			s.dataset.redocCdn = '1';
			document.head.appendChild(s);
		}
		try {
			const Redoc = await waitForRedocGlobal();
			Redoc.init(specObject, {}, mountEl);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
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
		<div bind:this={mountEl}></div>
	{/if}
</div>

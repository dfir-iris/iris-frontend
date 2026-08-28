<script lang="ts">
	import { API_BASE_URL } from '$lib/config/api.config';
	import { browser } from '$app/environment';

	// Extract the API origin for the CSP
	let apiOrigin = $state('');

	$effect(() => {
		if (browser) {
			try {
				const url = new URL(API_BASE_URL);
				apiOrigin = url.origin;
			} catch (e) {
				console.error('Failed to parse API URL:', e);
				// Fallback to self
				apiOrigin = window.location.origin;
			}
		}
	});
</script>

{#if browser}
	<meta
		http-equiv="content-security-policy"
		content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' {apiOrigin} http://app:8000; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
	/>
{/if}

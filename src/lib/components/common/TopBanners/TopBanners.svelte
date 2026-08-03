<!--
  Top-of-app banner strip. Fetches the currently-active banners from
  `/manage/banners/active` on mount and every 60s afterwards, filters
  out any banners the current user has dismissed locally, and renders
  the survivors as a stack of <TopBanner> rows.

  Polling is best-effort — a request failure keeps the previous list so
  a transient blip doesn't blank out an in-flight maintenance notice.
-->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { BannersService, type Banner } from '$lib/services/banners.service';
	import { dismissedBanners } from '$lib/stores/dismissed-banners.store.svelte';
	import TopBanner from './TopBanner.svelte';

	const POLL_INTERVAL_MS = 60_000;

	let banners = $state<Banner[]>([]);
	let timer: ReturnType<typeof setInterval> | null = null;

	async function refresh() {
		const res = await BannersService.listActive({ skipAuthRedirect: true });
		if (res.ok && Array.isArray(res.data)) {
			banners = res.data as Banner[];
		}
	}

	onMount(() => {
		void refresh();
		timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
	});

	onDestroy(() => {
		if (timer) clearInterval(timer);
	});

	const visible = $derived(
		banners.filter((b) => !(b.dismissable && dismissedBanners.isDismissed(b)))
	);
</script>

{#if visible.length > 0}
	<div class="shrink-0" data-testid="top-banners">
		{#each visible as banner (banner.id)}
			<TopBanner {banner} />
		{/each}
	</div>
{/if}

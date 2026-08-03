<!--
  Single top-of-app banner. Renders inside <TopBanners> for each
  currently-active banner the SPA has fetched. Palette + icon are keyed
  off the banner's `purpose` so info / warning / error each read as a
  distinct alert level. Modeled on
  routes/(app)/case/[case_id]/components/ReadOnlyBanner.svelte.
-->
<script lang="ts">
	import { AlertTriangleIcon, InfoIcon, XCircleIcon, XIcon } from 'lucide-svelte';
	import type { Banner } from '$lib/services/banners.service';
	import { dismissedBanners } from '$lib/stores/dismissed-banners.store.svelte';

	let { banner }: { banner: Banner } = $props();

	const PALETTES = {
		info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-700/40 dark:bg-blue-700/10 dark:text-blue-200',
		warning:
			'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-700/40 dark:bg-yellow-700/10 dark:text-yellow-200',
		error:
			'border-red-200 bg-red-50 text-red-800 dark:border-red-700/40 dark:bg-red-700/10 dark:text-red-200'
	} as const;

	const ICONS = {
		info: InfoIcon,
		warning: AlertTriangleIcon,
		error: XCircleIcon
	} as const;

	const palette = $derived(PALETTES[banner.purpose]);
	const Icon = $derived(ICONS[banner.purpose]);

	const onDismiss = () => dismissedBanners.dismiss(banner);
</script>

<div
	class="flex items-start gap-2 border-b px-4 py-2 text-sm {palette}"
	role={banner.purpose === 'error' ? 'alert' : 'status'}
>
	<Icon class="mt-0.5 size-4 shrink-0" />
	<span class="min-w-0 grow whitespace-pre-wrap break-words">{banner.text}</span>
	{#if banner.dismissable}
		<button
			type="button"
			aria-label="Dismiss banner"
			class="ml-2 shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-current"
			onclick={onDismiss}
		>
			<XIcon class="size-4" />
		</button>
	{/if}
</div>

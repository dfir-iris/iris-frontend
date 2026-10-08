<!--
  Compact pill for one asset flag.
-->
<script lang="ts">
	import { assetFlagChipClass } from '$lib/services/asset-flags.service';
	import type { AssetFlag } from '$lib/services/asset-flags.service';
	import { getAssetFlagIcon } from './asset-flag-icon';

	type Props = {
		flag: Pick<AssetFlag, 'name' | 'color' | 'icon'>;
		size?: 'xs' | 'sm';
		showIcon?: boolean;
		title?: string;
	};

	let { flag, size = 'xs', showIcon = true, title }: Props = $props();

	const Icon = $derived(getAssetFlagIcon(flag.icon));
</script>

<span
	class={[
		'inline-flex max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-md border font-medium',
		size === 'xs' ? 'h-5 px-1.5 text-[11px]' : 'h-6 px-2 text-xs',
		assetFlagChipClass(flag.color)
	]}
	{title}
	data-testid="asset-flag-chip"
>
	{#if showIcon}
		<Icon class={size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden="true" />
	{/if}
	<span class="truncate">{flag.name}</span>
</span>

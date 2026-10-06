<!--
  Compact pill for an asset stage. Renders a muted "No stage" pill when the
  asset has none so tables keep a stable column width.
-->
<script lang="ts">
	import { assetStageChipClass } from '$lib/services/asset-stages.service';
	import type { AssetStage } from '$lib/services/asset-stages.service';
	import { getAssetStageIcon } from './asset-stage-icon';

	type Props = {
		stage: Pick<AssetStage, 'name' | 'color' | 'icon'> | null | undefined;
		size?: 'xs' | 'sm';
		showIcon?: boolean;
		emptyLabel?: string;
	};

	let { stage, size = 'xs', showIcon = true, emptyLabel = 'No stage' }: Props = $props();

	const Icon = $derived(getAssetStageIcon(stage?.icon));
</script>

<span
	class={[
		'inline-flex max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-md border font-medium',
		size === 'xs' ? 'h-5 px-1.5 text-[11px]' : 'h-6 px-2 text-xs',
		stage
			? assetStageChipClass(stage.color)
			: 'border-dashed border-border bg-transparent text-muted-foreground'
	]}
	data-testid="asset-stage-chip"
>
	{#if stage && showIcon}
		<Icon class={size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden="true" />
	{/if}
	<span class="truncate">{stage ? stage.name : emptyLabel}</span>
</span>

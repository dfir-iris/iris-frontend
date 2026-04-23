<script lang="ts">
	import {
		Server,
		Globe,
		Laptop,
		Network,
		Shield,
		Database,
		HardDrive,
		Smartphone,
		Printer,
		Router,
		Cpu,
		Cloud,
		Users,
		Mail,
		FileText,
		Lock,
		Cog,
		HelpCircle,
		BiohazardIcon
	} from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import type { Asset } from '$lib/types/resources/asset';
	import type { CaseStatus } from '$lib/components/ui/badge/types';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import CompromiseStatusBadge from '$lib/components/ui/badge/compromise-status-badge.svelte';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';
	import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';
	import { MarkDownPreview } from '$lib/components/common/MarkDown';
	import TagDisplay from '../tag/TagDisplay.svelte';

	type Props = {
		asset: Asset;
		isSelected?: boolean;
	};

	let { asset, isSelected = false }: Props = $props();

	const assetTypeIcons = {
		server: Server,
		domain: Globe,
		website: Globe,
		workstation: Laptop,
		network: Network,
		firewall: Shield,
		database: Database,
		storage: HardDrive,
		mobile: Smartphone,
		printer: Printer,
		router: Router,
		switch: Router,
		iot: Cpu,
		cloud: Cloud,
		account: Users,
		email: Mail,
		document: FileText,
		application: Cog,
		security: Lock
	} as const;

	const getAssetTypeIcon = (typeName: string) => {
		const normalized = typeName.trim().toLowerCase();

		if (!normalized) return HelpCircle;

		if (normalized in assetTypeIcons) {
			return assetTypeIcons[normalized as keyof typeof assetTypeIcons];
		}

		for (const [key, icon] of Object.entries(assetTypeIcons)) {
			if (normalized.includes(key)) {
				return icon;
			}
		}

		return HelpCircle;
	};

	const assetTypeName = $derived(asset.asset_type?.asset_name ?? '');
	const AssetTypeIcon = $derived(getAssetTypeIcon(assetTypeName));
	const hasIocs = $derived((asset.iocs ?? []).length > 0);
	const hasTags = $derived(Boolean(asset.asset_tags?.trim()));
	const assetIp = $derived(asset.asset_ip ?? '');
	const assetDomain = $derived(asset.asset_domain ?? '');
	const isCompromised = $derived(asset.asset_compromise_status_id === 1);
	const assetDescription = $derived(asset.asset_description ?? '');

	let isDescriptionExpanded = $state(false);

	const toggleDescription = (event: MouseEvent) => {
		event.stopPropagation();
		isDescriptionExpanded = !isDescriptionExpanded;
	};
</script>

<div
	id={`asset-card-${asset.asset_id}`}
	class={cn(
		'group w-full rounded-xl border p-3 text-sm transition-all duration-200 ease-in-out',
		isSelected ? 'border-primary/30 bg-accent text-accent-foreground' : 'bg-background'
	)}
>
	<div class="flex items-center justify-between gap-3">
		<div class="flex min-w-0 flex-1 items-center gap-2">
			<div
				class={cn(
					'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
					isSelected ? 'bg-primary/20' : 'bg-muted'
				)}
			>
				<AssetTypeIcon
					size={16}
					class={cn(
						isCompromised ? 'text-red-500' : isSelected ? 'text-primary' : 'text-muted-foreground'
					)}
				/>
			</div>

			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-1">
					<span class="truncate text-base font-semibold">{asset.asset_name}</span>

					<ClipboardCopy
						value={asset.asset_name}
						tooltipText="Copy asset name"
						className="ml-1 opacity-0 group-hover:opacity-100"
					/>
				</div>

				<div class="truncate text-xs text-muted-foreground">
					{assetTypeName || asset.asset_type_id || 'Unknown type'}
				</div>
			</div>
		</div>

		<div class="ml-2 flex shrink-0 items-center gap-1">
			{#if isCompromised}
				<Badge variant="compromised">Compromised</Badge>
			{:else if asset.asset_compromise_status_id === 2 || asset.asset_compromise_status_id === 3}
				<CompromiseStatusBadge
					status_id={asset.asset_compromise_status_id}
					icon_only={true}
					prefix="Compromise"
				/>
			{/if}

			{#if asset.analysis_status}
				<StatusBadge
					status={asset.analysis_status.name as CaseStatus}
					icon_only={true}
					prefix="Analysis"
				/>
			{/if}

			{#if hasIocs}
				<Badge
					tooltip="Contains IOCs"
					icon={BiohazardIcon}
					variant="outline"
					class="border-0 bg-transparent p-1 hover:bg-muted/50"
				>
					{asset.iocs?.length}
				</Badge>
			{/if}
		</div>
	</div>

	{#if assetDescription}
		<div class="relative mb-2 mt-3 rounded-lg bg-muted/30 p-2">
			<div class="absolute right-1 top-1">
				<ClipboardCopy
					value={assetDescription}
					tooltipText="Copy"
					className="text-xs text-muted-foreground hover:text-primary"
				/>
			</div>

			<div
				class={cn(isDescriptionExpanded ? 'max-h-64 overflow-y-auto' : 'max-h-16 overflow-hidden')}
			>
				<MarkDownPreview markdown={assetDescription} />
			</div>

			{#if assetDescription.length > 100}
				<div class="mt-1">
					<Button
						variant="link"
						type="button"
						class="h-auto p-0 text-xs text-primary hover:underline"
						onclick={toggleDescription}
					>
						{isDescriptionExpanded ? 'Show less' : 'Show more'}
					</Button>
				</div>
			{/if}
		</div>
	{/if}

	<div class="mt-4">
		<div class="flex flex-wrap items-center gap-2">
			{#if assetIp}
				<div
					class="group inline-flex rounded-md border border-dashed px-2 py-1 font-mono text-xs transition-colors hover:bg-muted/70"
				>
					<Network class="mr-1 h-3 w-3 shrink-0 text-muted-foreground" />
					<span class="max-w-[120px] truncate">{assetIp}</span>
					<ClipboardCopy
						value={assetIp}
						className="ml-1 hidden shrink-0 group-hover:inline-block"
					/>
				</div>
			{/if}

			{#if assetDomain}
				<div
					class="group inline-flex rounded-md border border-dashed px-2 py-1 font-mono text-xs transition-colors hover:bg-muted/70"
				>
					<Globe class="mr-1 h-3 w-3 shrink-0 text-muted-foreground" />
					<span class="max-w-[120px] truncate">{assetDomain}</span>
					<ClipboardCopy
						value={assetDomain}
						className="ml-1 hidden shrink-0 group-hover:inline-block"
					/>
				</div>
			{/if}

			{#if hasTags}
				<TagDisplay tags={asset.asset_tags} size="default" />
			{/if}
		</div>
	</div>
</div>

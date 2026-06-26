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
	import SeenElsewhereBadge from '$lib/components/common/SeenElsewhereBadge.svelte';
	import { CaseAssetsService } from '$lib/services/case-assets.service';
	import { page } from '$app/state';

	type Props = {
		asset: Asset;
		isSelected?: boolean;
	};

	let { asset, isSelected = false }: Props = $props();

	// Used by the "seen elsewhere" badge to scope the cross-case lookup.
	const caseId = $derived(Number(page.params.case_id));

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
		'group relative w-full overflow-hidden rounded-lg border p-2.5 text-sm transition-colors duration-150',
		isSelected
			? 'border-l-4 border-l-primary border-primary/40 bg-primary/10 text-foreground shadow-sm'
			: 'border-border/60 bg-card hover:border-border hover:bg-muted/40'
	)}
>
	<div class="flex items-center justify-between gap-2">
		<div class="flex min-w-0 flex-1 items-center gap-2">
			<div
				class={cn(
					'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
					isSelected ? 'bg-primary/20' : 'bg-muted'
				)}
			>
				<AssetTypeIcon
					size={14}
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

				<div class="flex items-center gap-2">
					<span class="truncate text-xs text-muted-foreground">
						{assetTypeName || asset.asset_type_id || 'Unknown type'}
					</span>
					<!--
					  "Seen elsewhere" pivot. Inline variant — non-interactive
					  visual badge. The popover-rich variant lives in the
					  asset detail view; the badge here exists to flag rows
					  the analyst should prioritise.
					-->
					{#if Number.isFinite(caseId)}
						<SeenElsewhereBadge
							variant="inline"
							objectLabel="asset"
							objectId={asset.asset_id}
							load={async () => {
								const res = await CaseAssetsService.listOtherCaseLinks(caseId, asset.asset_id);
								return res.ok && Array.isArray(res.data) ? res.data : null;
							}}
						/>
					{/if}
				</div>
			</div>
		</div>

		<div class="ml-1 flex shrink-0 items-center gap-0.5">
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
		<div class="relative mb-1 mt-2 rounded-md bg-muted/30 p-1.5">
			<div class="absolute right-1 top-1">
				<ClipboardCopy
					value={assetDescription}
					tooltipText="Copy"
					className="text-xs text-muted-foreground hover:text-primary"
				/>
			</div>

			<div
				class={cn(isDescriptionExpanded ? 'max-h-48 overflow-y-auto' : 'max-h-12 overflow-hidden')}
			>
				<MarkDownPreview markdown={assetDescription} />
			</div>

			{#if assetDescription.length > 100}
				<div class="mt-0.5">
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

	{#if assetIp || assetDomain || hasTags}
		<div class="mt-2 flex flex-wrap items-center gap-1">
			{#if assetIp}
				<div
					class="group inline-flex items-center rounded border border-dashed px-1.5 py-0.5 font-mono text-xs transition-colors hover:bg-muted/70"
				>
					<Network class="mr-1 h-2.5 w-2.5 shrink-0 text-muted-foreground" />
					<span class="max-w-[100px] truncate">{assetIp}</span>
					<ClipboardCopy
						value={assetIp}
						className="ml-1 hidden shrink-0 group-hover:inline-block"
					/>
				</div>
			{/if}

			{#if assetDomain}
				<div
					class="group inline-flex items-center rounded border border-dashed px-1.5 py-0.5 font-mono text-xs transition-colors hover:bg-muted/70"
				>
					<Globe class="mr-1 h-2.5 w-2.5 shrink-0 text-muted-foreground" />
					<span class="max-w-[100px] truncate">{assetDomain}</span>
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
	{/if}
</div>

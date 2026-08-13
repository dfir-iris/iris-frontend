<!--
  The registry table.

  Sortable columns are exactly the stored ones. Sighting-derived columns
  (cases / alerts / last seen / compromise) are shown but NOT sortable:
  ordering by "last seen" would rank assets by the timing of cases the
  viewer may not be able to open, which is an ordering oracle over the
  same information the scope filter exists to hide. The backend rejects
  those sort keys too — this just keeps the UI from offering them.
-->
<script lang="ts">
	import {
		ArrowUpDownIcon,
		ArrowUpIcon,
		ArrowDownIcon,
		MoreHorizontalIcon,
		PencilIcon,
		Trash2Icon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import CompromiseStatusBadge from '$lib/components/ui/badge/compromise-status-badge.svelte';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import type { AssetCriticality, ManagedAsset } from '$lib/types/resources/managed-asset';

	type SortDir = 'asc' | 'desc';

	type Props = {
		assets: ManagedAsset[];
		orderBy: string | null;
		sortDir: SortDir;
		canWrite?: boolean;
		onToggleSort: (key: string) => void;
		onOpen: (asset: ManagedAsset) => void;
		onEdit: (asset: ManagedAsset) => void;
		onDelete: (asset: ManagedAsset) => void;
	};

	let {
		assets,
		orderBy,
		sortDir,
		canWrite = false,
		onToggleSort,
		onOpen,
		onEdit,
		onDelete
	}: Props = $props();

	// Sort keys match `MANAGED_ASSET_SORTABLE_FIELDS` in
	// app/models/managed_assets.py. `sortable: false` columns are
	// derived from sightings and are deliberately not orderable.
	const COLUMNS = [
		{ key: 'name', label: 'Name', sortable: true, cls: 'w-64' },
		{ key: 'client', label: 'Customer', sortable: false, cls: 'w-40' },
		{ key: 'asset_type', label: 'Type', sortable: false, cls: 'w-36' },
		{ key: 'criticality', label: 'Criticality', sortable: true, cls: 'w-28' },
		{ key: 'environment', label: 'Environment', sortable: true, cls: 'w-32' },
		{ key: 'owner', label: 'Owner', sortable: true, cls: 'w-32' },
		{ key: 'sightings', label: 'Sightings', sortable: false, cls: 'w-28' },
		{ key: 'compromise', label: 'Compromise', sortable: false, cls: 'w-40' },
		{ key: 'updated_at', label: 'Updated', sortable: true, cls: 'w-44' }
	];

	const CRITICALITY_STYLE: Record<AssetCriticality, string> = {
		critical: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
		high: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
		medium: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
		low: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
		unknown: 'border-border bg-muted text-muted-foreground'
	};

	const criticalityStyle = (value: string) =>
		CRITICALITY_STYLE[value as AssetCriticality] ?? CRITICALITY_STYLE.unknown;

	const sortIcon = (key: string) => {
		if (orderBy !== key) return ArrowUpDownIcon;
		return sortDir === 'asc' ? ArrowUpIcon : ArrowDownIcon;
	};

	const formatDate = (iso: string | null | undefined) => {
		if (!iso) return '—';
		const parsed = new Date(iso);
		return Number.isNaN(parsed.getTime()) ? iso : mediumDateTimeFormatter(parsed);
	};

	// The compromise column is narrow, so the "since" line is date-only;
	// the full timestamp stays in the tooltip.
	const dayFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
	const formatDay = (iso: string) => {
		const parsed = new Date(iso);
		return Number.isNaN(parsed.getTime()) ? iso : dayFormat.format(parsed);
	};
</script>

<div class="rounded-md border">
	<table class="w-full text-sm">
		<thead
			class="sticky top-[3.75rem] z-10 border-b bg-muted text-left text-xs text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-muted/90"
		>
			<tr>
				{#each COLUMNS as col (col.key)}
					{@const SortIco = sortIcon(col.key)}
					{@const active = orderBy === col.key}
					<th
						aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
						class="px-3 py-2 font-medium {col.cls}"
					>
						{#if col.sortable}
							<button
								type="button"
								onclick={() => onToggleSort(col.key)}
								class="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted {active
									? 'text-foreground'
									: ''}"
							>
								<span>{col.label}</span>
								<SortIco size={12} class={active ? 'opacity-100' : 'opacity-40'} />
							</button>
						{:else}
							<span>{col.label}</span>
						{/if}
					</th>
				{/each}
				<th class="w-10 px-3 py-2 text-right font-medium"></th>
			</tr>
		</thead>
		<tbody>
			{#each assets as asset (asset.managed_asset_id)}
				<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
					<td class="max-w-0 px-3 py-2 text-xs">
						<!--
						  `max-w-0` on the cell is load-bearing, not cosmetic. Names come
						  from whatever the cases and alerts carried, and real ones run to
						  hundreds of characters with no break opportunity (encoded URLs,
						  Exchange "on behalf of" strings). The table lays out
						  automatically, so one such row otherwise sizes the whole column:
						  the table grows past the card and pushes every other column off
						  screen. Capping the cell caps its min-content contribution to
						  nothing, which leaves the column free to sit at the `w-64` the
						  header asks for and to give ground below it on a narrow window —
						  the name ellipsises instead of overflowing.
						-->
						<div class="flex items-center gap-2">
							<button
								type="button"
								class="min-w-0 truncate text-left text-primary hover:underline"
								onclick={() => onOpen(asset)}
								title={asset.name}
							>
								{asset.name}
							</button>
							{#if !asset.is_active}
								<span
									class="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-2xs uppercase tracking-wide text-muted-foreground"
								>
									retired
								</span>
							{/if}
						</div>
						{#if asset.ip || asset.domain}
							{@const network = [asset.ip, asset.domain].filter(Boolean).join(' · ')}
							<div class="truncate text-2xs text-muted-foreground" title={network}>
								{network}
							</div>
						{/if}
					</td>
					<td class="px-3 py-2 text-xs">
						<div class="max-w-[9rem]">{asset.client?.customer_name ?? '—'}</div>
					</td>
					<td class="px-3 py-2 text-xs">
						<div class="max-w-[8rem]">{asset.asset_type?.asset_name ?? '—'}</div>
					</td>
					<td class="px-3 py-2">
						<span
							class="inline-flex items-center rounded-md border px-2 py-0.5 text-2xs font-medium uppercase tracking-wide {criticalityStyle(
								asset.criticality
							)}"
						>
							{asset.criticality}
						</span>
					</td>
					<td class="px-3 py-2 text-xs capitalize">{asset.environment ?? '—'}</td>
					<td class="px-3 py-2 text-xs">
						<div class="max-w-[8rem]">{asset.owner ?? '—'}</div>
					</td>
					<td class="px-3 py-2 text-xs tabular-nums text-muted-foreground">
						<span title="Cases you can access">{asset.case_sighting_count} case(s)</span>
						<div class="text-2xs" title="Alerts you can access">
							{asset.alert_sighting_count} alert(s)
						</div>
					</td>
					<td class="px-3 py-2">
						{#if asset.case_sighting_count + asset.alert_sighting_count > 0}
							<CompromiseStatusBadge status_id={asset.compromise_status_id ?? 3} />
							{#if asset.compromised_at}
								<div
									class="mt-1 text-2xs tabular-nums text-muted-foreground"
									title={`Earliest sighting you can see that is marked compromised — ${formatDate(
										asset.compromised_at
									)}`}
								>
									since {formatDay(asset.compromised_at)}
								</div>
							{/if}
						{:else}
							<span class="text-xs text-muted-foreground">—</span>
						{/if}
					</td>
					<!--
					  Sized wide enough (w-44) that the timestamp sits on one line
					  whenever there is room. Deliberately not `whitespace-nowrap`:
					  that would floor the column at the full timestamp width and,
					  on a narrow window, push the table past the card.
					-->
					<td class="px-3 py-2 text-xs tabular-nums text-muted-foreground">
						{formatDate(asset.updated_at)}
					</td>
					<td class="px-3 py-2 text-right">
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								<Button
									variant="ghost"
									size="sm"
									class="h-7 w-7 p-0"
									aria-label={`Actions for ${asset.name}`}
								>
									<MoreHorizontalIcon size={14} />
								</Button>
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end" class="w-44">
								<DropdownMenu.Item onSelect={() => onOpen(asset)}>Details</DropdownMenu.Item>
								{#if canWrite}
									<DropdownMenu.Separator />
									<DropdownMenu.Item onSelect={() => onEdit(asset)}>
										<PencilIcon size={14} class="mr-2" /> Edit
									</DropdownMenu.Item>
									<DropdownMenu.Item
										onSelect={() => onDelete(asset)}
										class="text-destructive focus:bg-destructive/10 focus:text-destructive"
									>
										<Trash2Icon size={14} class="mr-2" /> Delete
									</DropdownMenu.Item>
								{/if}
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

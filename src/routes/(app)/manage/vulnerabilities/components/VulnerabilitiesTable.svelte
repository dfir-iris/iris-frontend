<!--
  The catalogue table. Sortable columns are exactly the backend's
  `vulnerabilities_db_sortable_fields`; the counts are computed over the
  cases (and registry assets) the viewer can see, so they are shown but
  not orderable.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		ArrowDownIcon,
		ArrowUpDownIcon,
		ArrowUpIcon,
		DownloadCloudIcon,
		LockIcon,
		MoreHorizontalIcon,
		PencilIcon,
		Trash2Icon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import SeverityBadge from '$lib/components/vulnerabilities/SeverityBadge.svelte';
	import KevBadge from '$lib/components/vulnerabilities/KevBadge.svelte';
	import {
		EXPLOIT_MATURITY_LABELS,
		KIND_LABELS,
		PATCH_AVAILABILITY_LABELS,
		formatCvss,
		formatEpss,
		labelOf
	} from '$lib/components/vulnerabilities/labels';
	import { canSyncFromCveOrg } from '$lib/components/vulnerabilities/cve-sync';
	import type { Vulnerability } from '$lib/services/vulnerabilities.service';

	type SortDir = 'asc' | 'desc';

	type Props = {
		vulnerabilities: Vulnerability[];
		orderBy: string | null;
		sortDir: SortDir;
		canEdit: (vulnerability: Vulnerability) => boolean;
		canDelete?: boolean;
		onToggleSort: (key: string) => void;
		onEdit: (vulnerability: Vulnerability) => void;
		onDelete: (vulnerability: Vulnerability) => void;
		/** Offered on public CVE rows when set (the page gates on the runtime flag). */
		onSync?: (vulnerability: Vulnerability) => void;
		/** Row currently syncing, to disable its action. */
		syncingId?: number | null;
	};

	let {
		vulnerabilities,
		orderBy,
		sortDir,
		canEdit,
		canDelete = false,
		onToggleSort,
		onEdit,
		onDelete,
		onSync,
		syncingId = null
	}: Props = $props();

	const COLUMNS = [
		{ key: 'identifier', label: 'Identifier', sortable: true, cls: 'w-48' },
		{ key: 'title', label: 'Title', sortable: true, cls: '' },
		{ key: 'kind', label: 'Kind', sortable: false, cls: 'w-28' },
		{ key: 'severity', label: 'Severity', sortable: true, cls: 'w-24' },
		{ key: 'cvss_score', label: 'CVSS', sortable: true, cls: 'w-16' },
		{ key: 'epss_score', label: 'EPSS', sortable: true, cls: 'w-16' },
		{ key: 'kev', label: 'KEV', sortable: false, cls: 'w-14' },
		{ key: 'exploit_maturity', label: 'Exploit', sortable: false, cls: 'w-28' },
		{ key: 'patch_availability', label: 'Patch', sortable: false, cls: 'w-28' },
		{ key: 'counts', label: 'Exposure', sortable: false, cls: 'w-28' }
	];

	const sortIcon = (key: string) => {
		if (orderBy !== key) return ArrowUpDownIcon;
		return sortDir === 'asc' ? ArrowUpIcon : ArrowDownIcon;
	};

	const href = (v: Vulnerability) => `/manage/vulnerabilities/${v.vulnerability_id}`;
</script>

<!-- No overflow on the wrapper: it would become the sticky container and
     push the header down over the first rows. -->
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
			{#each vulnerabilities as v (v.vulnerability_id)}
				{@const editable = canEdit(v)}
				{@const syncable = !!onSync && canSyncFromCveOrg(v)}
				<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
					<td class="px-3 py-2 text-xs">
						<div class="flex items-center gap-1.5">
							<a
								href={href(v)}
								class="whitespace-nowrap font-mono text-primary hover:underline"
								title={v.aliases?.length ? `Aliases: ${v.aliases.join(', ')}` : undefined}
							>
								{v.identifier}
							</a>
							{#if v.is_private}
								<span
									class="inline-flex shrink-0 items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-2xs uppercase tracking-wide text-muted-foreground"
									title="Private entry — never leaves this instance"
								>
									<LockIcon size={10} /> private
								</span>
							{/if}
						</div>
					</td>
					<td class="max-w-0 px-3 py-2 text-xs">
						<div class="truncate" title={v.title}>{v.title}</div>
					</td>
					<td class="px-3 py-2 text-xs">{labelOf(KIND_LABELS, v.kind)}</td>
					<td class="px-3 py-2"><SeverityBadge severity={v.severity} /></td>
					<td class="px-3 py-2 font-mono text-xs tabular-nums">{formatCvss(v.cvss_score)}</td>
					<td class="px-3 py-2 text-xs tabular-nums">{formatEpss(v.epss_score)}</td>
					<td class="px-3 py-2">
						{#if v.kev}
							<KevBadge kev ransomware={v.kev_ransomware} dueDate={v.kev_due_date} />
						{:else}
							<span class="text-xs text-muted-foreground">—</span>
						{/if}
					</td>
					<td class="px-3 py-2 text-xs">{labelOf(EXPLOIT_MATURITY_LABELS, v.exploit_maturity)}</td>
					<td class="px-3 py-2 text-xs">
						{labelOf(PATCH_AVAILABILITY_LABELS, v.patch_availability)}
					</td>
					<td class="px-3 py-2 text-xs tabular-nums text-muted-foreground">
						{#if v.counts}
							<span title="Open findings you can see">{v.counts.open} open</span>
							{#if v.counts.exploited > 0}
								· <span class="text-red-600 dark:text-red-400" title="Exploited findings">
									{v.counts.exploited} exploited
								</span>
							{/if}
							<div class="text-2xs" title="Cases you can access with a finding">
								{v.counts.cases} case(s)
							</div>
						{:else}
							—
						{/if}
					</td>
					<td class="px-3 py-2 text-right">
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								<Button
									variant="ghost"
									size="sm"
									class="h-7 w-7 p-0"
									aria-label={`Actions for ${v.identifier}`}
								>
									<MoreHorizontalIcon size={14} />
								</Button>
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end" class="w-44">
								<DropdownMenu.Item onSelect={() => goto(href(v))}>Details</DropdownMenu.Item>
								{#if syncable}
									<DropdownMenu.Item
										onSelect={() => onSync?.(v)}
										disabled={syncingId === v.vulnerability_id}
									>
										<DownloadCloudIcon size={14} class="mr-2" />
										{syncingId === v.vulnerability_id ? 'Syncing…' : 'Sync from cve.org'}
									</DropdownMenu.Item>
								{/if}
								{#if editable || canDelete}
									<DropdownMenu.Separator />
								{/if}
								{#if editable}
									<DropdownMenu.Item onSelect={() => onEdit(v)}>
										<PencilIcon size={14} class="mr-2" /> Edit
									</DropdownMenu.Item>
								{/if}
								{#if canDelete}
									<DropdownMenu.Item
										onSelect={() => onDelete(v)}
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

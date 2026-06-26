<!--
  Read-only case detail modal opened from the cases overview table.
  Shows the metadata strip the old jQuery UI had (state, severity,
  customer, owner, opened / closed dates, classification, reviewer,
  tags, SOC ID, UUID) plus the formatted markdown summary. A footer
  CTA jumps to the full case page so the modal stays a quick-peek and
  doesn't try to replace the case workspace.

  The modal fetches the full row through the cases context every time
  it's opened against a different id — the overview table only carries
  the list-projection fields, so we need a `cases.get(id)` round-trip
  to render fields that aren't projected (e.g. `case_description`).
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		ArrowRightIcon,
		CalendarIcon,
		CheckCircle2Icon,
		ClockIcon,
		FlagIcon,
		HashIcon,
		LayersIcon,
		ShieldAlertIcon,
		TagIcon,
		UserIcon
	} from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import SeverityBadge from '$lib/components/ui/badge/severity-badge.svelte';
	import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { MarkDownPreview } from '$lib/components/common/MarkDown';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import type { Case } from '$lib/types/resources/case';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';

	type Props = {
		open: boolean;
		caseId: number | null;
		/** Optional seed value while the full row is fetching. */
		seed?: Case | null;
		onOpenChange?: (next: boolean) => void;
	};

	let { open = $bindable(), caseId, seed = null, onOpenChange }: Props = $props();

	const cases = getContext<CasesContext>(CASES_CTX);

	let loading = $state(false);
	let row = $state<Case | null>(null);
	let lastFetchedId = $state<number | null>(null);

	const formatDate = (value: string | null | undefined): string => {
		if (!value) return '—';
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return value;
		return mediumDateTimeFormatter(d);
	};

	const statusName = (state: string | null | undefined) =>
		(state || 'Unspecified') as
			| 'Pending'
			| 'In progress'
			| 'Completed'
			| 'Unspecified'
			| 'To do'
			| 'Closed'
			| 'Merged'
			| 'Assigned'
			| 'New';

	const severityName = (sev: string | null | undefined) =>
		(sev || 'Unspecified') as 'Unspecified' | 'Low' | 'Medium' | 'High' | 'Critical';

	// Fetch the full row each time the modal opens against a new id. We
	// keep `seed` visible as a placeholder during loading so the metadata
	// strip doesn't flicker between "empty modal" and "filled modal".
	$effect(() => {
		if (!open || caseId == null) return;

		if (lastFetchedId === caseId && row && row.case_id === caseId) return;

		row = seed && seed.case_id === caseId ? seed : null;
		lastFetchedId = caseId;
		loading = true;

		void (async () => {
			const fetched = await cases.get(caseId);
			if (fetched && fetched.case_id === caseId) {
				row = fetched;
			}
			loading = false;
		})();
	});

	$effect(() => {
		if (!open) {
			// Drop the cached row when the dialog closes so the next open
			// always shows the latest server state (and so a stale row
			// from a previous case can't flash in for one frame).
			row = null;
			lastFetchedId = null;
		}
	});

	const openFullCase = () => {
		if (caseId == null) return;
		void goto(`/case/${caseId}`);
		open = false;
		onOpenChange?.(false);
	};
</script>

<Dialog.Root
	bind:open
	onOpenChange={(next) => {
		open = next;
		onOpenChange?.(next);
	}}
>
	<Dialog.Content class="flex max-h-[85vh] w-[min(900px,95vw)] max-w-none flex-col gap-0 p-0">
		<Dialog.Header class="border-b border-border/60 px-6 py-4">
			<div class="flex flex-col gap-1">
				<div class="flex items-center gap-2 text-2xs uppercase tracking-wider text-muted-foreground">
					<HashIcon class="size-3" />
					<span>Case #{caseId ?? '—'}</span>
					{#if row?.case_soc_id}
						<span class="text-border">·</span>
						<span>SOC {row.case_soc_id}</span>
					{/if}
				</div>
				<Dialog.Title class="text-lg font-semibold">
					{#if loading && !row}
						<Skeleton class="h-6 w-2/3" />
					{:else}
						{row?.case_name ?? seed?.case_name ?? 'Untitled case'}
					{/if}
				</Dialog.Title>
			</div>
		</Dialog.Header>

		<div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
			<!--
			  Metadata grid: chip pairs ordered roughly by triage
			  relevance (state / severity first, then who owns it,
			  then when, then how it's categorised).
			-->
			<section class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				<div class="flex flex-col gap-1 rounded border border-border/50 bg-muted/30 p-3">
					<div class="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-muted-foreground">
						<FlagIcon class="size-3" /><span>State</span>
					</div>
					<div class="text-sm font-medium">
						<StatusBadge status={statusName(row?.state?.state_name)} />
					</div>
				</div>

				<div class="flex flex-col gap-1 rounded border border-border/50 bg-muted/30 p-3">
					<div class="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-muted-foreground">
						<ShieldAlertIcon class="size-3" /><span>Severity</span>
					</div>
					<div class="text-sm font-medium">
						<SeverityBadge severity={severityName(row?.severity?.severity_name)} />
					</div>
				</div>

				<div class="flex flex-col gap-1 rounded border border-border/50 bg-muted/30 p-3">
					<div class="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-muted-foreground">
						<LayersIcon class="size-3" /><span>Customer</span>
					</div>
					<div class="text-sm font-medium">
						{row?.case_customer?.customer_name ?? '—'}
					</div>
				</div>

				<div class="flex flex-col gap-1 rounded border border-border/50 bg-muted/30 p-3">
					<div class="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-muted-foreground">
						<UserIcon class="size-3" /><span>Owner</span>
					</div>
					<div class="text-sm font-medium">
						{row?.owner?.user_name ?? row?.owner?.user_login ?? '—'}
					</div>
				</div>

				<div class="flex flex-col gap-1 rounded border border-border/50 bg-muted/30 p-3">
					<div class="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-muted-foreground">
						<CalendarIcon class="size-3" /><span>Opened</span>
					</div>
					<div class="text-sm font-medium">{formatDate(row?.open_date)}</div>
				</div>

				<div class="flex flex-col gap-1 rounded border border-border/50 bg-muted/30 p-3">
					<div class="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-muted-foreground">
						<ClockIcon class="size-3" /><span>Closed</span>
					</div>
					<div class="text-sm font-medium">
						{row?.close_date ? formatDate(row.close_date) : 'Still open'}
					</div>
				</div>

				<div class="flex flex-col gap-1 rounded border border-border/50 bg-muted/30 p-3">
					<div class="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-muted-foreground">
						<CheckCircle2Icon class="size-3" /><span>Reviewer</span>
					</div>
					<div class="text-sm font-medium">
						{row?.reviewer?.user_name ?? row?.reviewer?.user_login ?? 'Unassigned'}
						{#if row?.review_status?.status_name}
							<span class="ml-1 text-2xs text-muted-foreground">({row.review_status.status_name})</span>
						{/if}
					</div>
				</div>

				<div class="flex flex-col gap-1 rounded border border-border/50 bg-muted/30 p-3 sm:col-span-2">
					<div class="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-muted-foreground">
						<TagIcon class="size-3" /><span>Tags</span>
					</div>
					<div class="text-sm font-medium">
						{#if row?.tags && row.tags.length > 0}
							<div class="flex flex-wrap gap-1">
								<!--
								  Key by index — the list endpoint sometimes
								  returns tags without a `tag_id`, see
								  CaseTagsCell.
								-->
								{#each row.tags as tag, i (i)}
									<Badge variant="secondary" class="text-2xs">{tag.tag_title}</Badge>
								{/each}
							</div>
						{:else}
							<span class="text-muted-foreground">—</span>
						{/if}
					</div>
				</div>
			</section>

			{#if row?.closing_note}
				<section class="flex flex-col gap-2 rounded border border-amber-500/40 bg-amber-500/5 p-3">
					<div class="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-amber-600 dark:text-amber-400">
						<CheckCircle2Icon class="size-3" />
						<span>Closing note</span>
					</div>
					<p class="text-sm">{row.closing_note}</p>
				</section>
			{/if}

			<section class="flex flex-col gap-2">
				<div class="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-muted-foreground">
					<span>Summary</span>
				</div>
				<div class="rounded border border-border/50 bg-muted/20 p-4">
					{#if loading && !row}
						<div class="flex flex-col gap-2">
							<Skeleton class="h-4 w-full" />
							<Skeleton class="h-4 w-5/6" />
							<Skeleton class="h-4 w-3/4" />
						</div>
					{:else if row?.case_description?.trim()}
						<MarkDownPreview markdown={row.case_description} />
					{:else}
						<p class="text-sm italic text-muted-foreground">No summary provided.</p>
					{/if}
				</div>
			</section>

			{#if row?.case_uuid}
				<p class="text-2xs text-muted-foreground">UUID {row.case_uuid}</p>
			{/if}
		</div>

		<Dialog.Footer class="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 px-6 py-3">
			<span class="text-2xs text-muted-foreground">
				Click outside or press <kbd class="rounded border px-1">Esc</kbd> to close.
			</span>
			<Button onclick={openFullCase} disabled={caseId == null}>
				Open case
				<ArrowRightIcon class="ml-1 size-4" />
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

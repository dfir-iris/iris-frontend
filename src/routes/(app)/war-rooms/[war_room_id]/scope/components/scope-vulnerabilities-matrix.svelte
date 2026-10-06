<!--
  Vulnerability x case matrix: one row per catalogue entry found in a
  readable attached case, one column per case. Cells carry the open /
  fixed / exploited finding counts, heat-coloured by open findings, and
  link to that case's assets (the counts span
  several assets). Rows come worst first.
  Past CASE_COLUMNS_MAX cases the per-case columns collapse into a
  "Cases" column whose popover breaks the row down per case, the footer
  becomes a list of the cases with most open findings. Rows are paged
  server-side and the per-case totals come with the page (they span all
  the matching rows, not just the page), so the DOM no longer grows as
  rows x cases.
  Entries the war room tracks are listed even without any finding
  ("not observed yet"), with their note; with the rights, a row can be
  tracked / untracked, its note edited, and recorded on scope assets.
-->
<script lang="ts">
	import { Check, Flame, Pin, PinOff, Plus, ShieldCheck, StickyNote } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/ui/popover';
	import SeverityBadge from '$lib/components/vulnerabilities/SeverityBadge.svelte';
	import KevBadge from '$lib/components/vulnerabilities/KevBadge.svelte';
	import type { ScopeCase } from '$lib/services/war-room-scope.service';
	import type {
		FindingsSummary,
		VulnerabilityMatrixCounts,
		VulnerabilityMatrixRow
	} from '$lib/services/vulnerabilities.service';
	import {
		matrixCellClass,
		matrixCellExploitedOpen,
		matrixCellTitle,
		matrixCaseTotals,
		matrixCasesByOpen,
		matrixRowCaseCells
	} from './vulnerability-helpers';
	import { caseLabel, showCaseColumns } from './helpers';
	import ScopePager from './scope-pager.svelte';

	type Props = {
		rows: VulnerabilityMatrixRow[];
		cases: ScopeCase[];
		summary: FindingsSummary | null;
		/** Per-case totals over every matching row, keyed by case id. */
		caseTotals: Record<string, VulnerabilityMatrixCounts>;
		page: number;
		perPage: number;
		/** Matching rows over all the pages. */
		total: number;
		onPage: (page: number) => void;
		/** True when the matrix has rows but the filters hide them all. */
		filtered: boolean;
		/** Track / untrack and edit notes (war room write + vulnerability create). */
		canTrack?: boolean;
		/** Record findings on scope assets (vulnerability create). */
		canRecord?: boolean;
		onTrack?: (row: VulnerabilityMatrixRow) => void;
		onUntrack?: (row: VulnerabilityMatrixRow) => void;
		/** Resolves true once saved. */
		onSaveNote?: (row: VulnerabilityMatrixRow, note: string | null) => Promise<boolean>;
		onRecord?: (row: VulnerabilityMatrixRow) => void;
	};

	let {
		rows,
		cases,
		summary,
		caseTotals,
		page,
		perPage,
		total,
		onPage,
		filtered,
		canTrack = false,
		canRecord = false,
		onTrack,
		onUntrack,
		onSaveNote,
		onRecord
	}: Props = $props();

	const showActions = $derived(canTrack || canRecord);
	let noteRow = $state<number | null>(null);
	let noteDraft = $state('');
	let noteSaving = $state(false);

	const openNote = (row: VulnerabilityMatrixRow, o: boolean) => {
		noteRow = o ? row.vulnerability.vulnerability_id : null;
		if (o) noteDraft = row.tracked?.note ?? '';
	};

	const saveNote = async (row: VulnerabilityMatrixRow) => {
		if (!onSaveNote || noteSaving) return;
		noteSaving = true;
		try {
			if (await onSaveNote(row, noteDraft.trim() || null)) noteRow = null;
		} finally {
			noteSaving = false;
		}
	};

	const trackedTitle = (row: VulnerabilityMatrixRow): string => {
		const t = row.tracked;
		if (!t) return '';
		const by = t.added_by_name ? ` by ${t.added_by_name}` : '';
		const at = t.added_at ? ` on ${t.added_at.slice(0, 10)}` : '';
		return `Tracked by the war room${by}${at}${t.note ? ` — ${t.note}` : ''}`;
	};

	const TH = 'h-10 px-2 text-left align-middle text-xs font-medium text-muted-foreground';
	const TD = 'px-2 py-1.5 align-middle';

	const TOP_CASES = 10;

	const columns = $derived(showCaseColumns(cases.length));
	const casesById = $derived(new Map(cases.map((c) => [c.case_id, c])));
	const totals = $derived(matrixCaseTotals(caseTotals, cases));
	const byOpen = $derived(columns ? [] : matrixCasesByOpen(totals, cases));
	let showAllCases = $state(false);

	const openRow = $state<{ id: number | null }>({ id: null });

	const stats = $derived(
		summary
			? [
					{ label: 'Open findings', value: summary.open, tone: '' },
					{
						label: 'Exploited & open',
						value: summary.exploited_open,
						tone: summary.exploited_open > 0 ? 'text-red-600 dark:text-red-400' : ''
					},
					{
						label: 'Overdue',
						value: summary.overdue,
						tone: summary.overdue > 0 ? 'text-amber-600 dark:text-amber-400' : ''
					},
					{
						label: 'KEV open',
						value: summary.kev_open,
						tone: summary.kev_open > 0 ? 'text-red-600 dark:text-red-400' : ''
					},
					{ label: 'Vulnerable assets', value: summary.assets_open, tone: '' },
					{ label: 'Vulnerabilities', value: summary.vulnerabilities, tone: '' },
					{ label: 'Fixed', value: summary.fixed, tone: '' },
					{ label: 'Dismissed', value: summary.dismissed, tone: '' },
					...(summary.tracked !== undefined
						? [
								{ label: 'Tracked', value: summary.tracked, tone: '' },
								{
									label: 'Tracked, not observed',
									value: summary.tracked_unobserved ?? 0,
									tone: ''
								}
							]
						: [])
				]
			: []
	);
</script>

{#if summary}
	<div
		class="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:grid-cols-10"
		data-testid="scope-vulns-summary"
	>
		{#each stats as s (s.label)}
			<div class="rounded-md border bg-card/40 px-3 py-2">
				<p class="truncate text-2xs text-muted-foreground">{s.label}</p>
				<p class={['text-lg font-semibold tabular-nums', s.tone]}>{s.value}</p>
			</div>
		{/each}
	</div>
{/if}

{#if rows.length === 0}
	<div
		class="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center"
		data-testid="scope-vulns-empty"
	>
		<ShieldCheck class="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
		<p class="text-sm text-muted-foreground">
			{filtered
				? 'No vulnerability matches the filters.'
				: 'No vulnerability tracked by the war room nor recorded in the attached cases you can access.'}
		</p>
	</div>
{:else}
	<div class="max-h-[70vh] overflow-auto rounded-md border">
		<table class="w-full caption-bottom text-sm" data-testid="scope-vulns-matrix">
			<thead class="sticky top-0 z-10 bg-background [&_tr]:border-b">
				<tr class="border-b">
					<th class={TH}>Vulnerability</th>
					<th class={TH}>Severity</th>
					<th class={`${TH} text-right`} title="Open findings over every case">Open</th>
					{#if columns}
						{#each cases as c (c.case_id)}
							<th class={`${TH} text-center`} title={`#${c.case_id} ${c.case_name}`}>
								<span class="font-mono">#{c.case_id}</span>
								<span class="block max-w-[7rem] truncate text-2xs font-normal">{c.case_name}</span>
							</th>
						{/each}
					{:else}
						<th class={TH}>Cases</th>
					{/if}
					{#if showActions}
						<th class={`${TH} text-right`}><span class="sr-only">Actions</span></th>
					{/if}
				</tr>
			</thead>
			<tbody class="[&_tr:last-child]:border-0">
				{#each rows as row (row.vulnerability.vulnerability_id)}
					{@const v = row.vulnerability}
					<tr
						class="border-b transition-colors hover:bg-muted/50"
						data-testid="scope-vuln-row"
						data-identifier={v.identifier}
					>
						<td class={`${TD} max-w-[24rem]`}>
							<div class="flex items-center gap-1.5">
								<span class="whitespace-nowrap font-mono text-xs font-medium">{v.identifier}</span>
								<KevBadge kev={v.kev} class="px-1.5 py-0 text-2xs" />
								{#if row.tracked}
									<span
										class="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-primary/40 px-1 text-2xs text-primary"
										title={trackedTitle(row)}
										data-testid="scope-vuln-tracked"
									>
										<Pin class="h-2.5 w-2.5" aria-hidden="true" />Tracked
									</span>
								{/if}
								{#if row.totals.exploited > 0 && row.totals.open > 0}
									<Flame
										class="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400"
										aria-label="Exploited and still open"
									/>
								{/if}
							</div>
							{#if v.title}
								<p class="truncate text-2xs text-muted-foreground" title={v.title}>{v.title}</p>
							{/if}
							{#if row.tracked && row.totals.findings === 0}
								<p
									class="text-2xs italic text-muted-foreground"
									data-testid="scope-vuln-unobserved"
								>
									Not observed on any asset yet
								</p>
							{/if}
							{#if row.tracked?.note}
								<p
									class="truncate text-2xs text-muted-foreground"
									title={row.tracked.note}
									data-testid="scope-vuln-note"
								>
									<StickyNote class="mr-0.5 inline h-2.5 w-2.5" aria-hidden="true" />{row.tracked
										.note}
								</p>
							{/if}
						</td>
						<td class={TD}>
							<SeverityBadge severity={v.severity} score={v.cvss_score} />
						</td>
						<td
							class={`${TD} text-right text-xs tabular-nums`}
							title={`${row.totals.open} open · ${row.totals.fixed} fixed · ${row.totals.dismissed} dismissed · ${row.totals.exploited} exploited, in ${row.totals.cases} case(s)`}
						>
							<span class={row.totals.open > 0 ? 'font-semibold' : 'text-muted-foreground'}>
								{row.totals.open}
							</span>
							<span class="text-muted-foreground">/{row.totals.findings}</span>
						</td>
						{#if !columns}
							<td class={TD}>
								{#if row.totals.cases > 0}
									<Popover
										open={openRow.id === v.vulnerability_id}
										onOpenChange={(o) => (openRow.id = o ? v.vulnerability_id : null)}
									>
										<PopoverTrigger>
											{#snippet child({ props })}
												<button
													{...props}
													type="button"
													class="rounded-md border px-1.5 py-0.5 text-xs tabular-nums transition-colors hover:bg-muted"
													aria-label={`${v.identifier}: found in ${row.totals.cases} case(s)`}
													data-testid="scope-vuln-cases"
												>
													{row.totals.cases}
													{row.totals.cases === 1 ? 'case' : 'cases'}
												</button>
											{/snippet}
										</PopoverTrigger>
										<PopoverContent align="start" class="w-80 p-0">
											{#if openRow.id === v.vulnerability_id}
												{@const cells = matrixRowCaseCells(row, casesById)}
												<p class="border-b px-3 py-2 font-mono text-xs">{v.identifier}</p>
												<ul class="max-h-72 overflow-y-auto py-1 text-xs">
													{#each cells as e (e.case.case_id)}
														{@const exploited = matrixCellExploitedOpen(e.counts)}
														<li>
															<a
																href={`/case/${e.case.case_id}/assets`}
																class="flex items-center gap-2 px-3 py-1 hover:bg-muted"
																title={matrixCellTitle(e.counts, e.case)}
																data-testid="scope-vuln-cell"
															>
																<span class="min-w-0 flex-1 truncate">{caseLabel(e.case)}</span>
																{#if exploited}
																	<Flame
																		class="h-3 w-3 shrink-0 text-red-600 dark:text-red-400"
																		aria-label="Exploited and still open"
																	/>
																{/if}
																<span
																	class={[
																		'min-w-[2.5rem] rounded-md px-1.5 text-center tabular-nums',
																		matrixCellClass(e.counts)
																	]}
																>
																	{e.counts.open}/{e.counts.findings}
																</span>
															</a>
														</li>
													{:else}
														<li class="px-3 py-1 text-muted-foreground">
															No finding in the cases you can read.
														</li>
													{/each}
												</ul>
											{/if}
										</PopoverContent>
									</Popover>
								{:else}
									<span class="text-xs text-muted-foreground/40">—</span>
								{/if}
							</td>
						{:else}
							{#each cases as c (c.case_id)}
								{@const cell = row.cases?.[String(c.case_id)]}
								<td class={`${TD} text-center`}>
									{#if cell}
										{@const exploited = matrixCellExploitedOpen(cell)}
										<a
											href={`/case/${c.case_id}/assets`}
											class={[
												'relative mx-auto inline-flex h-7 min-w-[3.25rem] items-center justify-center gap-1 rounded-md px-1.5 text-xs tabular-nums transition-opacity hover:opacity-80',
												matrixCellClass(cell),
												exploited && 'ring-2 ring-red-600 ring-offset-1 ring-offset-background'
											]}
											title={matrixCellTitle(cell, c)}
											aria-label={matrixCellTitle(cell, c)}
											data-testid="scope-vuln-cell"
										>
											{#if exploited}
												<Flame class="h-3 w-3 shrink-0" aria-hidden="true" />
											{/if}
											{#if cell.open > 0}
												<span class="font-semibold">{cell.open}</span>
											{/if}
											{#if cell.fixed > 0}
												<span class="inline-flex items-center opacity-80">
													<Check class="h-3 w-3" aria-hidden="true" />{cell.fixed}
												</span>
											{/if}
											{#if cell.open === 0 && cell.fixed === 0}
												<span class="opacity-70">{cell.dismissed}</span>
											{/if}
										</a>
									{:else}
										<span class="text-xs text-muted-foreground/40" aria-label="Not found">·</span>
									{/if}
								</td>
							{/each}
						{/if}
						{#if showActions}
							<td class={`${TD} whitespace-nowrap text-right`}>
								<div class="inline-flex items-center gap-0.5">
									{#if canRecord && onRecord}
										<Button
											variant="ghost"
											size="icon"
											class="h-7 w-7"
											title={`Record ${v.identifier} on scope assets`}
											aria-label={`Record ${v.identifier} on scope assets`}
											onclick={() => onRecord(row)}
											data-testid="scope-vuln-record"
										>
											<Plus class="h-3.5 w-3.5" />
										</Button>
									{/if}
									{#if canTrack && row.tracked}
										<Popover
											open={noteRow === v.vulnerability_id}
											onOpenChange={(o) => openNote(row, o)}
										>
											<PopoverTrigger>
												{#snippet child({ props })}
													<Button
														{...props}
														variant="ghost"
														size="icon"
														class="h-7 w-7"
														title="Edit the note"
														aria-label={`Edit the note of ${v.identifier}`}
														data-testid="scope-vuln-note-edit"
													>
														<StickyNote class="h-3.5 w-3.5" />
													</Button>
												{/snippet}
											</PopoverTrigger>
											<PopoverContent align="end" class="flex w-80 flex-col gap-2 p-3">
												{#if noteRow === v.vulnerability_id}
													<p class="font-mono text-xs">{v.identifier}</p>
													<Textarea
														bind:value={noteDraft}
														rows={3}
														maxlength={2000}
														placeholder="Why the war room tracks it"
													/>
													<div class="flex justify-end gap-2">
														<Button variant="outline" size="sm" onclick={() => (noteRow = null)}>
															Cancel
														</Button>
														<Button
															size="sm"
															disabled={noteSaving}
															onclick={() => void saveNote(row)}
															data-testid="scope-vuln-note-save"
														>
															{noteSaving ? 'Saving…' : 'Save'}
														</Button>
													</div>
												{/if}
											</PopoverContent>
										</Popover>
										<Button
											variant="ghost"
											size="icon"
											class="h-7 w-7"
											title="Stop tracking (findings are kept)"
											aria-label={`Stop tracking ${v.identifier}`}
											onclick={() => onUntrack?.(row)}
											data-testid="scope-vuln-untrack"
										>
											<PinOff class="h-3.5 w-3.5" />
										</Button>
									{:else if canTrack}
										<Button
											variant="ghost"
											size="icon"
											class="h-7 w-7"
											title="Track on the war room"
											aria-label={`Track ${v.identifier} on the war room`}
											onclick={() => onTrack?.(row)}
											data-testid="scope-vuln-track"
										>
											<Pin class="h-3.5 w-3.5" />
										</Button>
									{/if}
								</div>
							</td>
						{/if}
					</tr>
				{/each}
			</tbody>
			{#if columns}
				<tfoot class="border-t bg-muted/30">
					<tr>
						<td class={`${TD} text-xs font-medium text-muted-foreground`} colspan="3">
							Open per case
						</td>
						{#each cases as c (c.case_id)}
							{@const t = totals.get(c.case_id)}
							<td class={`${TD} text-center text-xs tabular-nums`}>
								{#if t && t.findings > 0}
									<a
										href={`/case/${c.case_id}/assets`}
										class={[
											'hover:underline',
											t.open > 0 ? 'font-semibold' : 'text-muted-foreground'
										]}
										title={matrixCellTitle(t, c)}
									>
										{t.open}
									</a>
								{:else}
									<span class="text-muted-foreground/40">—</span>
								{/if}
							</td>
						{/each}
						{#if showActions}
							<td></td>
						{/if}
					</tr>
				</tfoot>
			{/if}
		</table>
	</div>
	<ScopePager {page} {perPage} {total} noun="vulnerabilities" {onPage} testId="scope-vulns-pager" />
	{#if !columns && byOpen.length > 0}
		<div class="flex flex-wrap items-center gap-1.5 text-2xs" data-testid="scope-vulns-case-totals">
			<span class="font-medium text-muted-foreground">Open per case:</span>
			{#each showAllCases ? byOpen : byOpen.slice(0, TOP_CASES) as e (e.case.case_id)}
				<a
					href={`/case/${e.case.case_id}/assets`}
					class={[
						'rounded-md border px-1.5 py-0.5 tabular-nums hover:underline',
						e.counts.open > 0 ? 'font-semibold' : 'text-muted-foreground'
					]}
					title={matrixCellTitle(e.counts, e.case)}
				>
					#{e.case.case_id} · {e.counts.open}
				</a>
			{/each}
			{#if byOpen.length > TOP_CASES}
				<button
					type="button"
					class="text-primary hover:underline"
					onclick={() => (showAllCases = !showAllCases)}
				>
					{showAllCases ? 'Show fewer' : `Show all ${byOpen.length}`}
				</button>
			{/if}
		</div>
	{/if}
	<p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
		<span>Cells: open findings, <Check class="inline h-3 w-3" aria-hidden="true" /> fixed.</span>
		<span class="inline-flex items-center gap-1">
			<Flame class="h-3 w-3 text-red-600 dark:text-red-400" aria-hidden="true" /> exploited and still
			open
		</span>
		<span class="inline-flex items-center gap-1">
			Heat
			<span class="h-2.5 w-4 rounded-sm bg-orange-100 dark:bg-orange-500/20"></span>
			<span class="h-2.5 w-4 rounded-sm bg-orange-300 dark:bg-orange-500/40"></span>
			<span class="h-2.5 w-4 rounded-sm bg-red-400 dark:bg-red-600/60"></span>
			<span class="h-2.5 w-4 rounded-sm bg-red-600 dark:bg-red-700"></span>
			1 → 10+ open
		</span>
	</p>
{/if}

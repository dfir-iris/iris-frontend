<!--
  Assets of every readable attached case. Rows sharing a group_key (same
  type + name) are flagged: the same machine is tracked in several cases.
  The Vulns column lists the findings as identifier tags (click one to
  filter the scope on it) with an inline "+" to record a new one.
  With a paginated list, group headers and sightings come from the
  server-side totals so they cover every page, not just the loaded one.
-->
<script lang="ts">
	import {
		Building2,
		Copy,
		Flame,
		Gavel,
		Plus,
		Send,
		ShieldAlert,
		ShieldCheck,
		ShieldQuestion
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import AssetStageChip from '$lib/components/common/assets/AssetStageChip.svelte';
	import { COMPROMISE_STATUS } from '$lib/constants/compromise_status';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import type { AssetStage } from '$lib/services/asset-stages.service';
	import type {
		ScopeAsset,
		ScopeAssetCaseTotals,
		ScopeCase
	} from '$lib/services/war-room-scope.service';
	import { SEVERITY_CLASSES } from '$lib/components/vulnerabilities/labels';
	import { SELECT_CHECKBOX_CLASS, caseLabel, limitedList } from './helpers';
	import {
		assetVulnTagTitle,
		assetVulnTags,
		sumVulnCounts,
		vulnTooltip
	} from './vulnerability-helpers';

	type Props = {
		assets: ScopeAsset[];
		/**
		 * Loaded assets by group_key, the fallback to count sightings in other
		 * cases when the server did not send `sighting_count`.
		 */
		sightings: Map<string, ScopeAsset[]>;
		/** Per-case totals over every page (paginated lists only). */
		caseTotals?: Map<number, ScopeAssetCaseTotals>;
		stages: AssetStage[];
		cases: ScopeCase[];
		selected: number[];
		onSelectionChange: (next: number[]) => void;
		groupByCase: boolean;
		canWrite: boolean;
		onStage: (asset: ScopeAsset) => void;
		onPush: (asset: ScopeAsset) => void;
		/** Record a finding on this asset; the "+" is hidden when unset. */
		onRecordVulnerability?: (asset: ScopeAsset) => void;
		/** Filter the scope on a vulnerability identifier (tag click). */
		onFilterVulnerability?: (identifier: string) => void;
		/** Identifier currently filtered on, highlighted in the tags. */
		activeVulnerability?: string | null;
		/** False without vulnerability read: the Vulns column and counts are hidden. */
		showVulnerabilities?: boolean;
	};

	let {
		assets,
		sightings,
		caseTotals,
		stages,
		cases,
		selected,
		onSelectionChange,
		groupByCase,
		canWrite,
		onStage,
		onPush,
		onRecordVulnerability,
		onFilterVulnerability,
		activeVulnerability = null,
		showVulnerabilities = true
	}: Props = $props();

	const TH = 'h-10 px-2 text-left align-middle text-xs font-medium text-muted-foreground';
	const TD = 'px-2 py-1.5 align-middle';

	const stageById = $derived(new Map(stages.map((s) => [s.id, s])));
	const selectedSet = $derived(new Set(selected));
	const allSelected = $derived(
		assets.length > 0 && assets.every((a) => selectedSet.has(a.asset_id))
	);
	const someSelected = $derived(!allSelected && assets.some((a) => selectedSet.has(a.asset_id)));

	const groups = $derived.by(() => {
		if (!groupByCase) return [{ c: null as ScopeCase | null, rows: assets }];
		const byCase = new Map<number, ScopeAsset[]>();
		for (const a of assets) {
			const list = byCase.get(a.case_id);
			if (list) list.push(a);
			else byCase.set(a.case_id, [a]);
		}
		const known = cases
			.filter((c) => byCase.has(c.case_id))
			.map((c) => ({ c: c as ScopeCase | null, rows: byCase.get(c.case_id) ?? [] }));
		// Rows whose case is missing from `cases` (should not happen) stay visible.
		const knownIds = new Set(cases.map((c) => c.case_id));
		const orphans = assets.filter((a) => !knownIds.has(a.case_id));
		return orphans.length ? [...known, { c: null, rows: orphans }] : known;
	});

	const columnCount = $derived((groupByCase ? 12 : 13) - (showVulnerabilities ? 0 : 1));

	const toggle = (id: number, on: boolean) => {
		const next = new Set(selected);
		if (on) next.add(id);
		else next.delete(id);
		onSelectionChange([...next]);
	};

	const toggleAll = () => {
		const ids = new Set(assets.map((a) => a.asset_id));
		if (allSelected) onSelectionChange(selected.filter((id) => !ids.has(id)));
		else onSelectionChange([...new Set([...selected, ...ids])]);
	};

	const casesById = $derived(new Map(cases.map((c) => [c.case_id, c])));

	/** Other cases tracking the same asset: count and a bounded tooltip. */
	const otherCases = (a: ScopeAsset): { count: number; title: string } => {
		if (a.sighting_count != null) {
			const labels = (a.sighting_case_ids ?? []).map((id) => {
				const c = casesById.get(id);
				return c ? caseLabel(c) : `#${id}`;
			});
			const hidden = a.sighting_count - labels.length;
			const list = limitedList(labels, 10);
			return {
				count: a.sighting_count,
				title: `Also in ${list}${hidden > 0 ? ` and ${hidden} more` : ''}`
			};
		}
		const others = (sightings.get(a.group_key) ?? []).filter((o) => o.case_id !== a.case_id);
		return {
			count: others.length,
			title: `Also in ${limitedList(
				others.map((o) => `#${o.case_id} ${o.case_name}`),
				10
			)}`
		};
	};

	/** Group header figures: server totals when known, else the loaded rows. */
	const groupStats = (caseId: number, rows: ScopeAsset[]) => {
		const t = caseTotals?.get(caseId);
		if (t) {
			return {
				total: t.assets,
				done: t.done,
				open: t.vuln_open,
				exploitedOpen: t.vuln_exploited_open,
				title: `${t.vuln_open} open finding(s), ${t.vuln_exploited_open} exploited and open`
			};
		}
		const v = sumVulnCounts(rows);
		return {
			total: rows.length,
			done: doneCount(rows),
			open: v.vuln_open_count,
			exploitedOpen: v.vuln_exploited_open_count,
			title: vulnTooltip(v)
		};
	};

	const compromiseLabel = (id: number | null): string =>
		id != null && id in COMPROMISE_STATUS
			? COMPROMISE_STATUS[id as keyof typeof COMPROMISE_STATUS]
			: '—';

	const doneCount = (rows: ScopeAsset[]): number =>
		rows.filter((r) => r.stage_id != null && stageById.get(r.stage_id)?.kind === 'done').length;
</script>

<div class="max-h-[70vh] overflow-auto rounded-md border">
	<table class="w-full caption-bottom text-sm" data-testid="scope-assets-table">
		<thead class="sticky top-0 z-10 bg-background [&_tr]:border-b">
			<tr class="border-b">
				<th class={`${TH} w-8`}>
					<Checkbox
						class={SELECT_CHECKBOX_CLASS}
						checked={allSelected}
						indeterminate={someSelected}
						onCheckedChange={toggleAll}
						aria-label="Select all visible assets"
					/>
				</th>
				<th class={TH}>Asset</th>
				<th class={TH}>Type</th>
				<th class={TH}>IP</th>
				{#if !groupByCase}
					<th class={TH}>Case</th>
				{/if}
				<th class={TH}>Customer</th>
				<th class={TH}>Compromise</th>
				<th class={TH} title="Investigation progress (case analysis status)">Analysis</th>
				<th class={TH} title="Response progress (containment and recovery)">Stage</th>
				<th class={`${TH} text-right`}>IOCs</th>
				{#if showVulnerabilities}
					<th class={TH} title="Vulnerability findings, open first">Vulns</th>
				{/if}
				<th class={TH}>Updated</th>
				<th class={`${TH} w-10`}><span class="sr-only">Actions</span></th>
			</tr>
		</thead>
		<tbody class="[&_tr:last-child]:border-0">
			{#each groups as g, gi (g.c?.case_id ?? `orphans-${gi}`)}
				{#if groupByCase && g.c}
					{@const st = groupStats(g.c.case_id, g.rows)}
					<tr class="border-b bg-muted/30">
						<td colspan={columnCount} class="px-2 py-1.5">
							<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
								<a
									href={`/case/${g.c.case_id}/assets`}
									class="font-medium hover:underline"
									title="Open the case assets"
								>
									{caseLabel(g.c)}
								</a>
								{#if g.c.customer_name}
									<span class="inline-flex items-center gap-1 text-muted-foreground">
										<Building2 class="h-3 w-3 opacity-70" aria-hidden="true" />
										{g.c.customer_name}
									</span>
								{/if}
								<span class="text-muted-foreground">
									{#if st.total > g.rows.length}
										{g.rows.length} shown of
									{/if}
									{st.total}
									{st.total === 1 ? 'asset' : 'assets'} · {st.done} done
								</span>
								{#if showVulnerabilities && st.open > 0}
									<a
										href={`/case/${g.c.case_id}/assets`}
										class={[
											'inline-flex items-center gap-1 hover:underline',
											st.exploitedOpen > 0
												? 'font-medium text-red-700 dark:text-red-300'
												: 'text-muted-foreground'
										]}
										title={st.title}
									>
										{#if st.exploitedOpen > 0}
											<Flame class="h-3 w-3" aria-hidden="true" />
										{/if}
										{st.open} open
										{st.open === 1 ? 'vulnerability' : 'vulnerabilities'}
									</a>
								{/if}
							</div>
						</td>
					</tr>
				{/if}
				{#each g.rows as a (a.asset_id)}
					{@const others = otherCases(a)}
					{@const checked = selectedSet.has(a.asset_id)}
					{@const stage = a.stage_id != null ? (stageById.get(a.stage_id) ?? null) : null}
					{@const vulnTags = assetVulnTags(a.vulnerabilities)}
					<tr
						class={['border-b transition-colors hover:bg-muted/50', checked && 'bg-primary/5']}
						data-testid="scope-asset-row"
						data-asset-name={a.asset_name}
						data-case-id={a.case_id}
					>
						<td class={TD}>
							<Checkbox
								class={SELECT_CHECKBOX_CLASS}
								{checked}
								onCheckedChange={(v) => toggle(a.asset_id, !!v)}
								aria-label={`Select ${a.asset_name} in case #${a.case_id}`}
							/>
						</td>
						<td class={TD}>
							<div class="flex min-w-0 items-center gap-2">
								<a
									href={`/case/${a.case_id}/assets/${a.asset_id}`}
									class="truncate font-medium hover:underline"
									title={a.asset_description ?? a.asset_name}
								>
									{a.asset_name}
								</a>
								{#if others.count}
									<span
										class="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-sky-500/30 bg-sky-500/10 px-1 py-px text-2xs text-sky-700 dark:text-sky-300"
										title={others.title}
									>
										<Copy class="h-2.5 w-2.5" aria-hidden="true" />+{others.count}
										{others.count === 1 ? 'case' : 'cases'}
									</span>
								{/if}
							</div>
						</td>
						<td class={`${TD} text-xs text-muted-foreground`}>{a.asset_type_name ?? '—'}</td>
						<td class={`${TD} font-mono text-xs`}>{a.asset_ip || '—'}</td>
						{#if !groupByCase}
							<td class={`${TD} text-xs`}>
								<span class="font-mono text-2xs text-muted-foreground">#{a.case_id}</span>
								<span class="max-w-[12rem] truncate">{a.case_name}</span>
							</td>
						{/if}
						<td class={`${TD} text-xs text-muted-foreground`}>{a.customer_name ?? '—'}</td>
						<td class={`${TD} text-xs`}>
							<span class="inline-flex items-center gap-1">
								{#if a.asset_compromise_status_id === 1}
									<ShieldAlert class="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
								{:else if a.asset_compromise_status_id === 2}
									<ShieldCheck class="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
								{:else}
									<ShieldQuestion class="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
								{/if}
								{compromiseLabel(a.asset_compromise_status_id)}
							</span>
						</td>
						<td class={`${TD} whitespace-nowrap text-xs text-muted-foreground`}>
							{a.analysis_status_name ?? '—'}
						</td>
						<td class={TD}>
							<div class="flex items-center gap-1">
								{#if canWrite}
									<button
										type="button"
										class="rounded-md transition-opacity hover:opacity-80"
										onclick={() => onStage(a)}
										aria-label={`Change stage of ${a.asset_name} (currently ${stage?.name ?? 'no stage'})`}
										title={a.stage_reason ?? 'Change stage'}
									>
										<AssetStageChip {stage} size="xs" />
									</button>
								{:else}
									<span title={a.stage_reason ?? undefined}>
										<AssetStageChip {stage} size="xs" />
									</span>
								{/if}
								{#if a.stage_decision_id != null}
									<Gavel class="h-3 w-3 text-muted-foreground" aria-label="Linked to a decision" />
								{/if}
							</div>
						</td>
						<td class={`${TD} text-right text-xs tabular-nums`}>{a.ioc_count}</td>
						{#if showVulnerabilities}
							<td class={`${TD} text-xs`} data-testid="scope-asset-vulns">
								<div class="flex max-w-[18rem] flex-wrap items-center gap-1">
									{#each vulnTags.visible as t (t.finding_id)}
										{@const active =
											!!activeVulnerability &&
											t.identifier.toLowerCase() === activeVulnerability.toLowerCase()}
										<button
											type="button"
											class={[
												'inline-flex items-center gap-0.5 whitespace-nowrap rounded-md border px-1.5 py-px font-mono text-2xs transition-opacity hover:opacity-80 disabled:cursor-default',
												t.group === 'open'
													? (SEVERITY_CLASSES[t.severity] ?? SEVERITY_CLASSES.unknown)
													: 'border-dashed text-muted-foreground line-through decoration-muted-foreground/50',
												active && 'ring-1 ring-primary ring-offset-1 ring-offset-background'
											]}
											onclick={() => onFilterVulnerability?.(t.identifier)}
											disabled={!onFilterVulnerability}
											title={assetVulnTagTitle(t)}
											data-testid="scope-asset-vuln-tag"
										>
											{#if t.exploited && t.group === 'open'}
												<Flame class="h-2.5 w-2.5" aria-hidden="true" />
											{/if}
											{t.identifier}
										</button>
									{/each}
									{#if vulnTags.hidden.length > 0}
										<a
											href={`/case/${a.case_id}/assets/${a.asset_id}?tab=vulnerabilities`}
											class="whitespace-nowrap rounded-md px-1 py-px text-2xs text-muted-foreground hover:underline"
											title={`${vulnTags.hidden.map((t) => t.identifier).join(', ')} — open the asset findings`}
										>
											+{vulnTags.hidden.length}
										</a>
									{/if}
									{#if vulnTags.visible.length === 0 && !onRecordVulnerability}
										<span class="text-muted-foreground" title={vulnTooltip(a)}>—</span>
									{/if}
									{#if onRecordVulnerability}
										<button
											type="button"
											class="inline-flex h-5 w-5 items-center justify-center rounded-md border border-dashed text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground"
											onclick={() => onRecordVulnerability(a)}
											aria-label={`Record a vulnerability on ${a.asset_name}`}
											title="Record a vulnerability on this asset"
											data-testid="scope-asset-add-vuln"
										>
											<Plus class="h-3 w-3" />
										</button>
									{/if}
								</div>
							</td>
						{/if}
						<td class={`${TD} whitespace-nowrap text-xs text-muted-foreground`}>
							{a.date_update ? formatDateTime(a.date_update) : '—'}
						</td>
						<td class={TD}>
							{#if canWrite}
								<Button
									variant="ghost"
									size="icon"
									class="h-7 w-7 text-muted-foreground"
									onclick={() => onPush(a)}
									aria-label={`Push ${a.asset_name} to other cases`}
									title="Push to other cases"
								>
									<Send class="h-3.5 w-3.5" />
								</Button>
							{/if}
						</td>
					</tr>
				{/each}
			{/each}
			{#if assets.length === 0}
				<tr>
					<td colspan={columnCount} class="p-6 text-center text-sm text-muted-foreground">
						No asset matches.
					</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>

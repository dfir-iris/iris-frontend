<!--
  Widget editor. Opens against a copy of the widget so cancel discards
  cleanly. Schema comes in as a prop (one fetch at the editor-page level).
-->
<script lang="ts">
	import {
		ArrowDownIcon,
		ArrowUpIcon,
		ChevronDownIcon,
		ChevronUpIcon,
		DatabaseIcon,
		FilterIcon,
		PaletteIcon,
		PlusIcon,
		SettingsIcon,
		XIcon
	} from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Badge } from '$lib/components/ui/badge';
	import type {
		DashboardSchema,
		DashboardWidget,
		DashboardWidgetField,
		DashboardFilter
	} from '$lib/services/custom-dashboards.service';
	import FieldRow from './FieldRow.svelte';
	import FilterRow from './FilterRow.svelte';
	import VisualizationOptions from './VisualizationOptions.svelte';

	type Props = {
		open: boolean;
		widget: DashboardWidget | null;
		schema: DashboardSchema | null;
		breadcrumbSection?: string;
		onSave: (widget: DashboardWidget) => void;
		onOpenChange: (open: boolean) => void;
	};

	let {
		open = $bindable(false),
		widget,
		schema,
		breadcrumbSection,
		onSave,
		onOpenChange
	}: Props = $props();

	type Tab = 'data' | 'filters' | 'visualization' | 'advanced';
	let activeTab: Tab = $state('data');

	// Working copy — only commits on Save.
	let draft: DashboardWidget = $state({
		name: '',
		chart_type: 'number',
		fields: [{ table: 'alerts', column: 'alert_id', aggregation: 'count', alias: 'total' }]
	});

	let groupByText = $state('');

	$effect(() => {
		if (widget) {
			draft = structuredClone($state.snapshot(widget)) as DashboardWidget;
			groupByText = (widget.group_by ?? []).join(', ');
			activeTab = 'data';
		}
	});

	function addField() {
		draft.fields = [...draft.fields, { table: '', column: '', aggregation: null, alias: null }];
	}

	function setField(idx: number, next: DashboardWidgetField) {
		draft.fields = draft.fields.map((f, i) => (i === idx ? next : f));
	}

	function removeField(idx: number) {
		draft.fields = draft.fields.filter((_, i) => i !== idx);
	}

	function addFilter() {
		draft.filters = [
			...(draft.filters ?? []),
			{ table: '', column: '', operator: 'eq', value: '' }
		];
	}

	function setFilter(idx: number, next: DashboardFilter) {
		draft.filters = (draft.filters ?? []).map((f, i) => (i === idx ? next : f));
	}

	function removeFilter(idx: number) {
		draft.filters = (draft.filters ?? []).filter((_, i) => i !== idx);
	}

	type SortEntry = { key: string; dir: 'asc' | 'desc' };

	// Available sort keys = each field's alias (or table_column fallback).
	// Order matches the visible field order so the picker reflects what
	// the user actually built above.
	const sortableKeys = $derived.by(() => {
		const seen = new Set<string>();
		const out: { key: string; label: string }[] = [];
		for (const f of draft.fields ?? []) {
			const key = f.alias || (f.table && f.column ? `${f.table}_${f.column}` : '');
			if (!key || seen.has(key)) continue;
			seen.add(key);
			const label = f.alias ? f.alias : f.table && f.column ? `${f.table}.${f.column}` : key;
			out.push({ key, label });
		}
		return out;
	});

	function getSortList(): SortEntry[] {
		const opts = (draft.options ?? {}) as Record<string, unknown>;
		const raw = opts.default_sort;
		if (!Array.isArray(raw)) return [];
		return (raw as unknown[]).flatMap((entry) => {
			if (typeof entry !== 'object' || entry === null) return [];
			const e = entry as Record<string, unknown>;
			const key = typeof e.key === 'string' ? e.key : '';
			if (!key) return [];
			const dir: 'asc' | 'desc' = e.dir === 'desc' ? 'desc' : 'asc';
			return [{ key, dir }];
		});
	}

	function setSortList(list: SortEntry[]) {
		const opts = { ...((draft.options ?? {}) as Record<string, unknown>) };
		if (list.length === 0) {
			delete opts.default_sort;
		} else {
			opts.default_sort = list;
		}
		draft.options = opts;
	}

	function addSortEntry() {
		const list = getSortList();
		const used = new Set(list.map((s) => s.key));
		const candidate = sortableKeys.find((k) => !used.has(k.key)) ?? sortableKeys[0];
		if (!candidate) return;
		setSortList([...list, { key: candidate.key, dir: 'asc' }]);
	}

	function updateSortEntry(idx: number, patch: Partial<SortEntry>) {
		const list = getSortList();
		list[idx] = { ...list[idx], ...patch };
		setSortList(list);
	}

	function removeSortEntry(idx: number) {
		setSortList(getSortList().filter((_, i) => i !== idx));
	}

	function moveSortEntry(idx: number, delta: number) {
		const list = getSortList();
		const next = idx + delta;
		if (next < 0 || next >= list.length) return;
		[list[idx], list[next]] = [list[next], list[idx]];
		setSortList(list);
	}

	function commit() {
		const parsedGroupBy = groupByText
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
		onSave({ ...draft, group_by: parsedGroupBy.length ? parsedGroupBy : undefined });
		onOpenChange(false);
	}
</script>

<Dialog.Root bind:open onOpenChange={(v) => onOpenChange(v)}>
	<Dialog.Content class="max-w-3xl">
		<Dialog.Header>
			<div class="flex flex-col gap-1">
				<Dialog.Title>Edit widget</Dialog.Title>
				{#if breadcrumbSection || draft.name}
					<div class="flex items-center gap-1 text-xs text-muted-foreground">
						{#if breadcrumbSection}
							<span>In</span>
							<span class="font-medium text-foreground">{breadcrumbSection}</span>
							<span>›</span>
						{/if}
						<Badge variant="secondary">{draft.chart_type}</Badge>
						<span class="font-medium text-foreground">{draft.name || 'Untitled'}</span>
					</div>
				{/if}
			</div>
		</Dialog.Header>

		<div class="flex max-h-[60vh] min-h-0 flex-col gap-3 overflow-hidden">
			<div class="grid gap-2 sm:grid-cols-2">
				<div>
					<Label for="widget-name">Name</Label>
					<Input id="widget-name" bind:value={draft.name} placeholder="Widget name" />
				</div>
				<div>
					<Label for="widget-chart">Chart type</Label>
					<Select
						value={draft.chart_type}
						onValueChange={(v) => (draft.chart_type = v)}
						type="single"
					>
						<SelectTrigger>{draft.chart_type}</SelectTrigger>
						<SelectContent>
							{#each schema?.chart_types ?? ['number', 'pie', 'bar', 'line', 'percentage', 'table', 'timechart'] as t (t)}
								<SelectItem value={t}>{t}</SelectItem>
							{/each}
						</SelectContent>
					</Select>
				</div>
			</div>

			<nav class="flex shrink-0 gap-0.5 border-b text-sm">
				{#each [{ id: 'data', label: 'Data', Icon: DatabaseIcon }, { id: 'filters', label: 'Filters', Icon: FilterIcon }, { id: 'visualization', label: 'Visualization', Icon: PaletteIcon }, { id: 'advanced', label: 'Advanced', Icon: SettingsIcon }] as tab (tab.id)}
					{@const isActive = activeTab === tab.id}
					<button
						type="button"
						class={`flex items-center gap-1 border-b-2 px-3 py-2 transition ${isActive ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
						onclick={() => (activeTab = tab.id as Tab)}
					>
						<tab.Icon class="size-4" />
						{tab.label}
					</button>
				{/each}
			</nav>

			<div class="flex grow flex-col gap-4 overflow-y-auto pr-1">
				{#if activeTab === 'data'}
					<section class="flex flex-col gap-2">
						<div class="flex items-center justify-between">
							<Label>Fields</Label>
							<Button variant="outline" size="sm" onclick={addField}>
								<PlusIcon class="size-3" /> Field
							</Button>
						</div>
						{#each draft.fields as field, idx (idx)}
							<FieldRow
								{field}
								{schema}
								removable={draft.fields.length > 1}
								onChange={(f) => setField(idx, f)}
								onRemove={() => removeField(idx)}
							/>
						{/each}
					</section>

					<section class="flex flex-col gap-2">
						<Label for="widget-group-by">Group by (comma-separated table.column)</Label>
						<Input
							id="widget-group-by"
							bind:value={groupByText}
							placeholder="severities.severity_name"
						/>
						{#if groupByText}
							<div class="flex flex-wrap gap-1">
								{#each groupByText
									.split(',')
									.map((s) => s.trim())
									.filter((s) => s) as g (g)}
									<Badge variant="secondary">{g}</Badge>
								{/each}
							</div>
						{/if}
					</section>
				{/if}

				{#if activeTab === 'filters'}
					<section class="flex flex-col gap-2">
						<div class="flex items-center justify-between">
							<Label>Filters</Label>
							<Button variant="outline" size="sm" onclick={addFilter}>
								<PlusIcon class="size-3" /> Filter
							</Button>
						</div>
						{#if (draft.filters ?? []).length === 0}
							<p class="text-xs text-muted-foreground">
								No widget-level filters. Dashboard-level filters still apply.
							</p>
						{/if}
						{#each draft.filters ?? [] as filter, idx (idx)}
							<FilterRow
								{filter}
								{schema}
								onChange={(f) => setFilter(idx, f)}
								onRemove={() => removeFilter(idx)}
							/>
						{/each}
					</section>
				{/if}

				{#if activeTab === 'visualization'}
					{#if draft.chart_type === 'table'}
						{@const sortList = getSortList()}
						<section class="flex flex-col gap-2">
							<div class="flex items-center justify-between">
								<Label>Default sort</Label>
								<Button
									variant="outline"
									size="sm"
									disabled={sortableKeys.length === 0 || sortList.length >= sortableKeys.length}
									onclick={addSortEntry}
								>
									<PlusIcon class="size-3" /> Sort key
								</Button>
							</div>
							{#if sortableKeys.length === 0}
								<p class="text-xs text-muted-foreground">
									Add fields above first — sort keys come from field aliases.
								</p>
							{:else if sortList.length === 0}
								<p class="text-xs text-muted-foreground">
									No default sort. Rows render in backend-returned order; users can click a header
									to sort interactively.
								</p>
							{:else}
								<div class="flex flex-col gap-1">
									{#each sortList as entry, idx (`${idx}-${entry.key}`)}
										<div class="flex items-center gap-1">
											<span class="w-5 text-center text-xs text-muted-foreground">{idx + 1}</span>
											<Select
												value={entry.key}
												onValueChange={(v) => updateSortEntry(idx, { key: v })}
												type="single"
											>
												<SelectTrigger>{entry.key || 'Field'}</SelectTrigger>
												<SelectContent>
													{#each sortableKeys as k (k.key)}
														<SelectItem value={k.key}>{k.label}</SelectItem>
													{/each}
												</SelectContent>
											</Select>
											<Button
												variant="outline"
												size="sm"
												onclick={() =>
													updateSortEntry(idx, { dir: entry.dir === 'asc' ? 'desc' : 'asc' })}
											>
												{#if entry.dir === 'asc'}
													<ArrowUpIcon class="size-3" /> Asc
												{:else}
													<ArrowDownIcon class="size-3" /> Desc
												{/if}
											</Button>
											<Button
												variant="ghost"
												size="icon"
												disabled={idx === 0}
												onclick={() => moveSortEntry(idx, -1)}
												title="Move up"
											>
												<ChevronUpIcon class="size-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												disabled={idx === sortList.length - 1}
												onclick={() => moveSortEntry(idx, 1)}
												title="Move down"
											>
												<ChevronDownIcon class="size-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												onclick={() => removeSortEntry(idx)}
												title="Remove"
											>
												<XIcon class="size-4" />
											</Button>
										</div>
									{/each}
								</div>
							{/if}
						</section>
					{/if}

					<section class="flex flex-col gap-2">
						<Label for="widget-time-bucket">Time bucket (optional, for line/timechart)</Label>
						<Select
							value={draft.time_bucket ?? ''}
							onValueChange={(v) => (draft.time_bucket = v || null)}
							type="single"
						>
							<SelectTrigger>{draft.time_bucket || '(none)'}</SelectTrigger>
							<SelectContent>
								<SelectItem value="">(none)</SelectItem>
								{#each schema?.time_buckets ?? [] as b (b)}
									<SelectItem value={b}>{b}</SelectItem>
								{/each}
							</SelectContent>
						</Select>
					</section>

					<section class="flex flex-col gap-2">
						<div class="flex items-center justify-between">
							<Label>Visualization</Label>
						</div>
						<VisualizationOptions widget={draft} onChange={(w) => (draft = w)} />
					</section>
				{/if}

				{#if activeTab === 'advanced'}
					<section class="flex flex-col gap-3">
						<p class="text-xs text-muted-foreground">
							Free-form options stored under <span class="font-mono">widget.options</span>. The raw
							object below is what gets sent to the backend with this widget — useful for keys the
							UI doesn't surface (alternative time columns, ratio numerator/denominator keys,
							capitalization overrides, etc).
						</p>
						<textarea
							class="min-h-[200px] w-full rounded border bg-background p-2 font-mono text-xs"
							spellcheck="false"
							value={JSON.stringify(draft.options ?? {}, null, 2)}
							oninput={(e) => {
								const txt = (e.target as HTMLTextAreaElement).value;
								try {
									const parsed = JSON.parse(txt);
									if (typeof parsed === 'object' && parsed !== null) {
										draft = { ...draft, options: parsed };
									}
								} catch {
									/* ignore invalid keystrokes */
								}
							}}
						></textarea>
						<div>
							<Label class="text-xs">Layout (read-only preview)</Label>
							<pre class="overflow-auto rounded border bg-muted/40 p-2 text-2xs">{JSON.stringify(
									draft.layout ?? {},
									null,
									2
								)}</pre>
						</div>
					</section>
				{/if}
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => onOpenChange(false)}>Cancel</Button>
			<Button onclick={commit} disabled={!draft.name || draft.fields.length === 0}
				>Save widget</Button
			>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

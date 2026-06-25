<!--
  Dashboard editor. Schema-driven visual builder over /api/v2/custom-dashboards.
  Sections + widget grid, widget-editor dialog launched per widget. System
  dashboards short-circuit back to view-mode.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { flip } from 'svelte/animate';
	import {
		ArrowLeftIcon,
		EditIcon,
		GripVerticalIcon,
		LayersIcon,
		PlusIcon,
		SaveIcon,
		Trash2Icon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import {
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger
	} from '$lib/components/ui/select';
	import JsonEditor from '$lib/components/common/editors/JsonEditor.svelte';
	import {
		CustomDashboardsService,
		type CustomDashboard,
		type DashboardSchema,
		type DashboardSection,
		type DashboardWidget
	} from '$lib/services/custom-dashboards.service';
	import WidgetEditorDialog from './components/WidgetEditorDialog.svelte';
	import FilterBarEditor from './components/FilterBarEditor.svelte';
	import PresetGallery from './components/PresetGallery.svelte';
	import LivePreview from './components/LivePreview.svelte';

	let dashboard: CustomDashboard | null = $state(null);
	let schema: DashboardSchema | null = $state(null);
	let name = $state('');
	let description = $state('');
	let isShared = $state(false);
	let sections: DashboardSection[] = $state([]);
	let filtersSchema: Array<Record<string, unknown>> = $state([]);

	let saving = $state(false);
	let error: string | null = $state(null);
	let success: string | null = $state(null);

	let dialogOpen = $state(false);
	let editingWidget: DashboardWidget | null = $state(null);
	let editingTarget: { sectionIdx: number; widgetIdx: number | null } | null = $state(null);

	let presetOpen = $state(false);
	let presetSectionIdx: number | null = $state(null);

	// Flatten widgets for the dialog's left rail. Re-derives whenever the
	// in-memory layout changes so adding/removing widgets updates the rail
	// without manual sync.
	const railEntries = $derived(
		sections.flatMap((s, sIdx) =>
			s.widgets.map((w, wIdx) => ({
				sectionIdx: sIdx,
				widgetIdx: wIdx,
				sectionTitle: s.title ?? `Section ${sIdx + 1}`,
				widgetName: w.name,
				chartType: w.chart_type,
			})),
		),
	);

	const breadcrumbSection = $derived(
		editingTarget && editingTarget.sectionIdx >= 0
			? sections[editingTarget.sectionIdx]?.title ?? `Section ${editingTarget.sectionIdx + 1}`
			: undefined,
	);

	function switchEditingWidget(target: { sectionIdx: number; widgetIdx: number }) {
		const w = sections[target.sectionIdx]?.widgets[target.widgetIdx];
		if (!w) return;
		editingWidget = w;
		editingTarget = target;
	}

	let previewExpanded = $state(true);

	// Live-preview payload — strips client-only ids and uses the latest
	// in-memory state so the preview reflects unsaved edits.
	const previewDefinition = $derived({
		name,
		description,
		is_shared: isShared,
		sections: sections.map((s) => ({
			...s,
			widgets: s.widgets.map((w) => {
				const layout = { ...(w.layout ?? {}) } as Record<string, unknown>;
				delete layout._client_id;
				return { ...w, layout };
			}),
		})),
		filters_schema: filtersSchema,
	});

	// Editor mode toggle. JSON mode lets power users hand-edit the full
	// definition (sections, filters_schema, widget options) and validates
	// continuously against the live schema — both syntax (Ace+JSON.parse)
	// and structure (chart_type/aggregation/operator/table whitelists).
	let editorMode: 'visual' | 'json' = $state('visual');
	let jsonText = $state('');
	let jsonError: string | null = $state(null);
	let jsonValid = $state(true);
	let schemaIssues: string[] = $state([]);

	function validateDefinitionAgainstSchema(parsed: unknown): string[] {
		const issues: string[] = [];
		if (!schema) return issues;
		const allowedChartTypes = new Set(schema.chart_types);
		const allowedAggregations = new Set(schema.aggregations);
		const allowedOperators = new Set(schema.operators);
		const allowedTables = new Set([...schema.tables, 'computed']);
		const computedColumns = new Set(schema.named_aggregations.map((a) => a.name));

		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			issues.push('Root must be a JSON object.');
			return issues;
		}
		const def = parsed as Record<string, unknown>;
		if (typeof def.name !== 'string' || !def.name.trim()) {
			issues.push('`name` is required and must be a non-empty string.');
		}
		if (def.description !== undefined && def.description !== null && typeof def.description !== 'string') {
			issues.push('`description` must be a string or null.');
		}
		if (def.is_shared !== undefined && typeof def.is_shared !== 'boolean') {
			issues.push('`is_shared` must be a boolean.');
		}

		const validateField = (path: string, field: unknown) => {
			if (typeof field !== 'object' || field === null) {
				issues.push(`${path} must be an object.`);
				return;
			}
			const f = field as Record<string, unknown>;
			if (typeof f.table !== 'string' || !f.table) {
				issues.push(`${path}.table is required.`);
			} else if (!allowedTables.has(f.table)) {
				issues.push(`${path}.table "${f.table}" is not allowed. Allowed: ${[...allowedTables].join(', ')}.`);
			}
			if (typeof f.column !== 'string' || !f.column) {
				issues.push(`${path}.column is required.`);
			} else if (f.table === 'computed' && !computedColumns.has(f.column)) {
				issues.push(`${path}.column "${f.column}" is not a known computed metric. Known: ${[...computedColumns].join(', ')}.`);
			} else if (typeof f.table === 'string' && f.table !== 'computed' && schema!.columns[f.table] && !schema!.columns[f.table].includes(f.column as string)) {
				issues.push(`${path}.column "${f.column}" is not a known column of "${f.table}".`);
			}
			if (f.aggregation !== undefined && f.aggregation !== null && f.aggregation !== '') {
				if (typeof f.aggregation !== 'string' || !allowedAggregations.has(f.aggregation)) {
					issues.push(`${path}.aggregation "${f.aggregation}" is not allowed. Allowed: ${[...allowedAggregations].join(', ')}.`);
				}
			}
		};

		const validateFilter = (path: string, filter: unknown) => {
			if (typeof filter !== 'object' || filter === null) {
				issues.push(`${path} must be an object.`);
				return;
			}
			const fl = filter as Record<string, unknown>;
			if (typeof fl.table !== 'string') issues.push(`${path}.table is required.`);
			if (typeof fl.column !== 'string') issues.push(`${path}.column is required.`);
			if (typeof fl.operator !== 'string' || !allowedOperators.has(fl.operator)) {
				issues.push(`${path}.operator "${fl.operator}" is not allowed. Allowed: ${[...allowedOperators].join(', ')}.`);
			}
			if (!('value' in fl)) issues.push(`${path}.value is required.`);
		};

		const validateWidget = (path: string, widget: unknown) => {
			if (typeof widget !== 'object' || widget === null) {
				issues.push(`${path} must be an object.`);
				return;
			}
			const w = widget as Record<string, unknown>;
			if (typeof w.name !== 'string' || !w.name) issues.push(`${path}.name is required.`);
			if (typeof w.chart_type !== 'string' || !allowedChartTypes.has(w.chart_type)) {
				issues.push(`${path}.chart_type "${w.chart_type}" is not allowed. Allowed: ${[...allowedChartTypes].join(', ')}.`);
			}
			if (!Array.isArray(w.fields) || w.fields.length === 0) {
				issues.push(`${path}.fields must be a non-empty array.`);
			} else {
				w.fields.forEach((f, i) => validateField(`${path}.fields[${i}]`, f));
			}
			if (Array.isArray(w.filters)) {
				w.filters.forEach((fl, i) => validateFilter(`${path}.filters[${i}]`, fl));
			}
			if (w.group_by !== undefined && !Array.isArray(w.group_by)) {
				issues.push(`${path}.group_by must be an array of strings.`);
			}
		};

		const sectionsArr = Array.isArray(def.sections) ? def.sections : [];
		const widgetsArr = Array.isArray(def.widgets) ? def.widgets : [];
		if (sectionsArr.length === 0 && widgetsArr.length === 0) {
			issues.push('Definition must contain at least one section with widgets, or a widgets array.');
		}
		sectionsArr.forEach((s, sIdx) => {
			if (typeof s !== 'object' || s === null) {
				issues.push(`sections[${sIdx}] must be an object.`);
				return;
			}
			const sec = s as Record<string, unknown>;
			const sw = Array.isArray(sec.widgets) ? sec.widgets : [];
			sw.forEach((w, wIdx) => validateWidget(`sections[${sIdx}].widgets[${wIdx}]`, w));
		});
		widgetsArr.forEach((w, wIdx) => validateWidget(`widgets[${wIdx}]`, w));

		return issues;
	}

	function onJsonInput(next: string, isValid: boolean, err: string | null) {
		jsonText = next;
		jsonValid = isValid;
		jsonError = err;
		if (isValid) {
			try {
				const parsed = JSON.parse(next);
				schemaIssues = validateDefinitionAgainstSchema(parsed);
			} catch {
				schemaIssues = [];
			}
		} else {
			schemaIssues = [];
		}
	}

	const uuid = $derived(page.params.uuid);

	function withWidgetIds(widgets: DashboardWidget[]): DashboardWidget[] {
		return widgets.map((w, i) => {
			const layout = (w.layout ?? {}) as Record<string, unknown>;
			if (!layout._client_id) {
				layout._client_id = `w-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`;
			}
			return { ...w, layout };
		});
	}

	function widgetKey(widget: DashboardWidget): string {
		const layout = (widget.layout ?? {}) as Record<string, unknown>;
		return String(layout._client_id ?? `${widget.name}-${widget.chart_type}`);
	}

	function normalizeSections(def: CustomDashboard['definition']): DashboardSection[] {
		if (def.sections && def.sections.length > 0) {
			return def.sections.map((s) => ({ ...s, widgets: withWidgetIds(s.widgets ?? []) }));
		}
		if (def.widgets && def.widgets.length > 0) {
			return [{ id: 'section-default', title: def.name, widgets: withWidgetIds(def.widgets) }];
		}
		return [{ id: 'section-default', title: def.name, widgets: [] }];
	}

	function stripClientIds(srcSections: DashboardSection[]): DashboardSection[] {
		return srcSections.map((s) => ({
			...s,
			widgets: s.widgets.map((w) => {
				const layout = { ...(w.layout ?? {}) } as Record<string, unknown>;
				delete layout._client_id;
				return { ...w, layout };
			}),
		}));
	}

	function currentDefinitionJSON(): string {
		return JSON.stringify(
			{
				name,
				description,
				is_shared: isShared,
				sections: stripClientIds(sections),
				filters_schema: filtersSchema,
			},
			null,
			2,
		);
	}

	function applyJSONToState(text: string): boolean {
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch (e) {
			jsonError = `Invalid JSON: ${(e as Error).message}`;
			return false;
		}
		if (typeof parsed !== 'object' || parsed === null) {
			jsonError = 'Definition must be a JSON object.';
			return false;
		}
		const structural = validateDefinitionAgainstSchema(parsed);
		if (structural.length > 0) {
			schemaIssues = structural;
			jsonError = 'Definition does not match the schema. See the issues panel below.';
			return false;
		}
		const def = parsed as Record<string, unknown>;
		if (typeof def.name === 'string') name = def.name;
		if (typeof def.description === 'string') description = def.description;
		if (typeof def.is_shared === 'boolean') isShared = def.is_shared;
		if (Array.isArray(def.sections)) {
			sections = (def.sections as DashboardSection[]).map((s) => ({
				...s,
				widgets: withWidgetIds(s.widgets ?? []),
			}));
		}
		if (Array.isArray(def.filters_schema)) {
			filtersSchema = def.filters_schema as Array<Record<string, unknown>>;
		}
		jsonError = null;
		schemaIssues = [];
		return true;
	}

	function switchMode(next: 'visual' | 'json') {
		if (next === editorMode) return;
		if (next === 'json') {
			jsonText = currentDefinitionJSON();
			onJsonInput(jsonText, true, null);
			editorMode = 'json';
			return;
		}
		// Switching back to visual: parse what's in the textarea first so
		// in-flight edits aren't dropped on the floor.
		if (!applyJSONToState(jsonText)) return;
		editorMode = 'visual';
	}

	async function load() {
		const detail = await CustomDashboardsService.get(uuid);
		if (!detail.ok || !detail.data) {
			error = detail.error?.message ?? 'Failed to load dashboard.';
			return;
		}
		dashboard = detail.data;
		if (dashboard.is_system) {
			goto(`/dashboards/${uuid}`);
			return;
		}
		name = dashboard.name;
		description = dashboard.description ?? '';
		isShared = dashboard.is_shared;
		sections = normalizeSections(dashboard.definition);
		const fs = (dashboard.definition.filters_schema ?? []) as Array<Record<string, unknown>>;
		filtersSchema = Array.isArray(fs) ? [...fs] : [];

		const schemaResp = await CustomDashboardsService.getSchema();
		if (schemaResp.ok && schemaResp.data) schema = schemaResp.data;
	}

	function openNewWidget(sectionIdx: number) {
		editingWidget = {
			name: 'New widget',
			chart_type: 'number',
			fields: [
				{ table: 'alerts', column: 'alert_id', aggregation: 'count', alias: 'total' }
			]
		};
		editingTarget = { sectionIdx, widgetIdx: null };
		dialogOpen = true;
	}

	function openEditWidget(sectionIdx: number, widgetIdx: number) {
		editingWidget = sections[sectionIdx].widgets[widgetIdx];
		editingTarget = { sectionIdx, widgetIdx };
		dialogOpen = true;
	}

	function openPresetGallery(sectionIdx: number) {
		presetSectionIdx = sectionIdx;
		presetOpen = true;
	}

	function insertPreset(widget: DashboardWidget) {
		if (presetSectionIdx === null) return;
		const sIdx = presetSectionIdx;
		sections[sIdx].widgets = [...sections[sIdx].widgets, ...withWidgetIds([widget])];
		sections = [...sections];
		presetSectionIdx = null;
	}

	function commitWidget(widget: DashboardWidget) {
		if (!editingTarget) return;
		const { sectionIdx, widgetIdx } = editingTarget;
		if (widgetIdx === null) {
			sections[sectionIdx].widgets = [...sections[sectionIdx].widgets, ...withWidgetIds([widget])];
		} else {
			// Preserve the existing _client_id so animate:flip identity holds.
			const existing = sections[sectionIdx].widgets[widgetIdx];
			const existingLayout = (existing?.layout ?? {}) as Record<string, unknown>;
			const nextLayout = { ...(widget.layout ?? {}), _client_id: existingLayout._client_id };
			sections[sectionIdx].widgets = sections[sectionIdx].widgets.map((w, i) =>
				i === widgetIdx ? { ...widget, layout: nextLayout } : w
			);
		}
		sections = [...sections];
	}

	function removeWidget(sectionIdx: number, widgetIdx: number) {
		sections[sectionIdx].widgets = sections[sectionIdx].widgets.filter((_, i) => i !== widgetIdx);
		sections = [...sections];
	}

	function widgetSize(widget: DashboardWidget): string {
		const layout = (widget.layout ?? {}) as Record<string, unknown>;
		return String(layout.widget_size ?? 'half').toLowerCase();
	}

	function editorSizeClass(widget: DashboardWidget): string {
		const size = widgetSize(widget);
		if (size === 'full') return 'sm:col-span-12';
		if (size === 'half') return 'sm:col-span-6';
		if (size === 'third') return 'sm:col-span-4';
		if (size === 'kpi' || size === 'quarter') return 'sm:col-span-3';
		return 'sm:col-span-6';
	}

	function setWidgetSize(sectionIdx: number, widgetIdx: number, size: string) {
		const widgets = sections[sectionIdx].widgets;
		const widget = widgets[widgetIdx];
		const layout = { ...(widget.layout ?? {}), widget_size: size };
		widgets[widgetIdx] = { ...widget, layout };
		sections[sectionIdx].widgets = [...widgets];
		sections = [...sections];
	}

	// HTML5 DnD state.
	// dropTarget = { sectionIdx, widgetIdx, side } — widgetIdx may equal
	// section.widgets.length to mean "after the last widget" / empty area.
	// side ∈ 'before'|'after' is what makes the indicator land on the
	// correct side of the hovered card (we pick by cursor X vs card mid).
	type DragSource = { sectionIdx: number; widgetIdx: number };
	type DropTarget = { sectionIdx: number; widgetIdx: number; side: 'before' | 'after' };
	let dragSource: DragSource | null = $state(null);
	let dropTarget: DropTarget | null = $state(null);

	function onDragStart(e: DragEvent, source: DragSource) {
		dragSource = source;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			// Use the closest Card as the drag image so the cursor carries
			// a real preview of the widget being moved, not just the grip.
			const handle = e.currentTarget as HTMLElement | null;
			const card = handle?.closest('[data-widget-card]') as HTMLElement | null;
			if (card) {
				const rect = card.getBoundingClientRect();
				e.dataTransfer.setDragImage(card, e.clientX - rect.left, e.clientY - rect.top);
			}
			// Required for Firefox to actually start a drag operation.
			e.dataTransfer.setData('text/plain', `${source.sectionIdx}:${source.widgetIdx}`);
		}
	}

	function onDragEnd() {
		dragSource = null;
		dropTarget = null;
	}

	function onCardDragOver(e: DragEvent, sectionIdx: number, widgetIdx: number) {
		if (!dragSource) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		const target = e.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const side: 'before' | 'after' = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
		if (
			dropTarget?.sectionIdx !== sectionIdx ||
			dropTarget?.widgetIdx !== widgetIdx ||
			dropTarget?.side !== side
		) {
			dropTarget = { sectionIdx, widgetIdx, side };
		}
	}

	function onSectionDragOver(e: DragEvent, sectionIdx: number) {
		if (!dragSource) return;
		e.preventDefault();
		// Only register the "empty / end of section" target if the cursor
		// isn't already over a specific card in this section. Card-level
		// handlers fire first and set dropTarget; if they didn't, the
		// section is the fallback.
		if (
			!dropTarget ||
			dropTarget.sectionIdx !== sectionIdx ||
			dropTarget.widgetIdx >= sections[sectionIdx].widgets.length
		) {
			dropTarget = {
				sectionIdx,
				widgetIdx: sections[sectionIdx].widgets.length,
				side: 'before',
			};
		}
	}

	function moveWidget(source: DragSource, dest: DropTarget) {
		const sourceWidget = sections[source.sectionIdx].widgets[source.widgetIdx];
		if (!sourceWidget) return;

		// Compute the destination index BEFORE removing the source from its
		// section — same-section moves shift the dest index if source is
		// to the left of dest.
		let destIdx = dest.widgetIdx + (dest.side === 'after' ? 1 : 0);

		if (source.sectionIdx === dest.sectionIdx && source.widgetIdx < destIdx) {
			destIdx -= 1;
		}

		// No-op: dropping in the same slot.
		if (source.sectionIdx === dest.sectionIdx && source.widgetIdx === destIdx) return;

		sections[source.sectionIdx].widgets = sections[source.sectionIdx].widgets.filter(
			(_, i) => i !== source.widgetIdx,
		);
		const destWidgets = [...sections[dest.sectionIdx].widgets];
		destWidgets.splice(Math.max(0, Math.min(destIdx, destWidgets.length)), 0, sourceWidget);
		sections[dest.sectionIdx].widgets = destWidgets;
		sections = [...sections];
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		if (dragSource && dropTarget) moveWidget(dragSource, dropTarget);
		dragSource = null;
		dropTarget = null;
	}

	function addSection() {
		sections = [
			...sections,
			{
				id: `section-${Date.now()}`,
				title: 'New section',
				description: '',
				show_divider: true,
				widgets: []
			}
		];
	}

	function removeSection(idx: number) {
		sections = sections.filter((_, i) => i !== idx);
	}

	function setSectionTitle(idx: number, title: string) {
		sections[idx].title = title;
		sections = [...sections];
	}

	async function save() {
		if (!dashboard) return;
		if (editorMode === 'json' && !applyJSONToState(jsonText)) {
			// jsonError is set; keep the user in JSON mode so they can fix it.
			return;
		}
		saving = true;
		error = null;
		success = null;
		// Strip client-only ids from the persisted payload — _client_id
		// only matters in-session for animate:flip identity.
		const cleanSections = sections.map((s) => ({
			...s,
			widgets: s.widgets.map((w) => {
				const layout = { ...(w.layout ?? {}) } as Record<string, unknown>;
				delete layout._client_id;
				return { ...w, layout };
			}),
		}));
		const definition = {
			name,
			description,
			is_shared: isShared,
			sections: cleanSections,
			filters_schema: filtersSchema,
		};
		const response = await CustomDashboardsService.update(uuid, definition);
		if (response.ok) {
			success = 'Saved.';
		} else {
			error = response.error?.message ?? 'Failed to save dashboard.';
		}
		saving = false;
	}

	$effect(() => {
		if (uuid) load();
	});
</script>

<div class="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 p-6">
	<header class="flex items-end justify-between">
		<div class="flex flex-col gap-1">
			<a
				href={`/dashboards/${uuid}`}
				class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
			>
				<ArrowLeftIcon class="size-3" /> Back to dashboard
			</a>
			<h1 class="text-2xl font-semibold">Edit dashboard</h1>
		</div>
		<div class="flex items-center gap-2">
			<div class="flex rounded-md border bg-muted/40 p-0.5 text-xs">
				<button
					type="button"
					class={`rounded px-3 py-1 transition ${editorMode === 'visual' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
					onclick={() => switchMode('visual')}
				>
					Visual
				</button>
				<button
					type="button"
					class={`rounded px-3 py-1 transition ${editorMode === 'json' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
					onclick={() => switchMode('json')}
				>
					JSON
				</button>
			</div>
			<Button variant="outline" onclick={() => goto(`/dashboards/${uuid}`)}>Preview</Button>
			<Button
				onclick={save}
				disabled={saving || (editorMode === 'json' && (!jsonValid || schemaIssues.length > 0))}
			>
				<SaveIcon class="size-4" />
				{saving ? 'Saving…' : 'Save'}
			</Button>
		</div>
	</header>

	{#if error}
		<div class="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
	{/if}
	{#if success}
		<div class="rounded border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-700">{success}</div>
	{/if}

	{#if editorMode === 'visual'}
		<Card>
			<CardHeader>
				<CardTitle class="text-base">Dashboard</CardTitle>
				<CardDescription>Name, description, sharing and filter-bar entries.</CardDescription>
			</CardHeader>
			<CardContent class="flex flex-col gap-4">
				<div class="grid gap-3 sm:grid-cols-2">
					<div class="flex flex-col gap-1">
						<Label for="dash-name">Name</Label>
						<Input id="dash-name" bind:value={name} />
					</div>
					<div class="flex flex-col gap-1">
						<Label for="dash-desc">Description</Label>
						<Input id="dash-desc" bind:value={description} />
					</div>
					<div class="flex items-center gap-2 sm:col-span-2">
						<input id="dash-shared" type="checkbox" bind:checked={isShared} />
						<Label for="dash-shared">Share with other users</Label>
					</div>
				</div>
				<FilterBarEditor entries={filtersSchema as never} {schema} onChange={(e) => (filtersSchema = e)} />
			</CardContent>
		</Card>

		{#each sections as section, sIdx (section.id ?? sIdx)}
		<Card>
			<CardHeader class="flex flex-row items-center justify-between gap-2">
				<div class="flex grow flex-col gap-1">
					<Input
						value={section.title ?? ''}
						oninput={(e) => setSectionTitle(sIdx, (e.target as HTMLInputElement).value)}
						class="w-full max-w-md text-base font-semibold"
					/>
				</div>
				<div class="flex items-center gap-2">
					<Button variant="outline" size="sm" onclick={() => openNewWidget(sIdx)}>
						<PlusIcon class="size-3" /> Widget
					</Button>
					<Button variant="outline" size="sm" onclick={() => openPresetGallery(sIdx)}>
						<LayersIcon class="size-3" /> Preset
					</Button>
					<Button variant="ghost" size="icon" onclick={() => removeSection(sIdx)} title="Remove section">
						<Trash2Icon class="size-4" />
					</Button>
				</div>
			</CardHeader>
			<CardContent
				ondragover={(e) => onSectionDragOver(e, sIdx)}
				ondrop={onDrop}
			>
				{#if section.widgets.length === 0}
					<p
						class="rounded border border-dashed p-6 text-center text-sm text-muted-foreground transition-colors"
						class:bg-primary={dragSource && dropTarget?.sectionIdx === sIdx}
						class:bg-opacity-10={dragSource && dropTarget?.sectionIdx === sIdx}
						class:border-primary={dragSource && dropTarget?.sectionIdx === sIdx}
					>
						{dragSource ? 'Drop widget here' : 'No widgets. Click "+ Widget" to add one, or drop a widget here.'}
					</p>
				{:else}
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-12">
						{#each section.widgets as widget, wIdx (widgetKey(widget))}
							{@const isSource = dragSource?.sectionIdx === sIdx && dragSource?.widgetIdx === wIdx}
							{@const dropBefore = dropTarget?.sectionIdx === sIdx && dropTarget?.widgetIdx === wIdx && dropTarget?.side === 'before'}
							{@const dropAfter = dropTarget?.sectionIdx === sIdx && dropTarget?.widgetIdx === wIdx && dropTarget?.side === 'after'}
							<div
								class={`relative ${editorSizeClass(widget)}`}
								data-widget-card
								animate:flip={{ duration: 220 }}
								ondragover={(e) => onCardDragOver(e, sIdx, wIdx)}
								ondrop={onDrop}
							>
								{#if dropBefore}
									<div
										class="pointer-events-none absolute -left-2 top-0 z-10 h-full w-1 rounded-full bg-primary shadow-[0_0_8px_var(--tw-shadow-color)] shadow-primary/60"
									></div>
								{/if}
								{#if dropAfter}
									<div
										class="pointer-events-none absolute -right-2 top-0 z-10 h-full w-1 rounded-full bg-primary shadow-[0_0_8px_var(--tw-shadow-color)] shadow-primary/60"
									></div>
								{/if}
								<Card
									class={`border-muted transition-all ${isSource ? 'opacity-30 ring-2 ring-dashed ring-primary/50 scale-95' : ''}`}
								>
									<CardHeader class="pb-1">
										<CardTitle class="text-sm flex items-center justify-between gap-2">
											<span class="flex items-center gap-1 truncate">
												<button
													type="button"
													class="cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
													draggable="true"
													ondragstart={(e) => onDragStart(e, { sectionIdx: sIdx, widgetIdx: wIdx })}
													ondragend={onDragEnd}
													title="Drag to reorder"
													aria-label="Drag handle"
												>
													<GripVerticalIcon class="size-4" />
												</button>
												<span class="truncate">{widget.name}</span>
											</span>
											<div class="flex shrink-0 items-center gap-1">
												<Select
													value={widgetSize(widget)}
													onValueChange={(v) => setWidgetSize(sIdx, wIdx, v)}
													type="single"
												>
													<SelectTrigger class="h-7 w-20 text-xs">{widgetSize(widget)}</SelectTrigger>
													<SelectContent>
														<SelectItem value="kpi">kpi</SelectItem>
														<SelectItem value="third">third</SelectItem>
														<SelectItem value="half">half</SelectItem>
														<SelectItem value="full">full</SelectItem>
													</SelectContent>
												</Select>
												<Button variant="ghost" size="icon" onclick={() => openEditWidget(sIdx, wIdx)} title="Edit widget">
													<EditIcon class="size-3" />
												</Button>
												<Button variant="ghost" size="icon" onclick={() => removeWidget(sIdx, wIdx)} title="Remove widget">
													<Trash2Icon class="size-3" />
												</Button>
											</div>
										</CardTitle>
									</CardHeader>
									<CardContent class="flex flex-wrap gap-1 text-xs">
										<Badge variant="secondary">{widget.chart_type}</Badge>
										{#each widget.fields ?? [] as f (f.alias ?? `${f.table}.${f.column}`)}
											<Badge variant="outline">{f.table}.{f.column}{f.aggregation ? ` · ${f.aggregation}` : ''}</Badge>
										{/each}
									</CardContent>
								</Card>
							</div>
						{/each}
					</div>
				{/if}
			</CardContent>
		</Card>
		{/each}

		<Button variant="outline" onclick={addSection}>
			<PlusIcon class="size-4" /> Add section
		</Button>

		<LivePreview
			{uuid}
			definition={previewDefinition as never}
			bind:expanded={previewExpanded}
		/>
	{:else}
		<Card class="flex grow flex-col">
			<CardHeader class="shrink-0">
				<div class="flex items-start justify-between gap-3">
					<div>
						<CardTitle class="text-base">Definition (JSON)</CardTitle>
						<CardDescription>
							Ace-powered editor. Validates both JSON syntax and structure (chart types,
							aggregations, operators, table/column whitelist) against the live schema.
						</CardDescription>
					</div>
					<div class="flex shrink-0 gap-2">
						<Button
							variant="outline"
							size="sm"
							onclick={() => {
								jsonText = currentDefinitionJSON();
								onJsonInput(jsonText, true, null);
							}}
						>
							Reset to current
						</Button>
						<Button
							variant="outline"
							size="sm"
							onclick={() => {
								try {
									jsonText = JSON.stringify(JSON.parse(jsonText), null, 2);
									onJsonInput(jsonText, true, null);
								} catch (e) {
									jsonError = `Invalid JSON: ${(e as Error).message}`;
									jsonValid = false;
								}
							}}
						>
							Reformat
						</Button>
					</div>
				</div>
				<div class="mt-2 flex items-center gap-2 text-xs">
					{#if !jsonValid}
						<span class="rounded-full bg-destructive/15 px-2 py-0.5 font-medium text-destructive">
							JSON syntax error
						</span>
					{:else if schemaIssues.length > 0}
						<span class="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-700">
							{schemaIssues.length} schema issue{schemaIssues.length === 1 ? '' : 's'}
						</span>
					{:else}
						<span class="rounded-full bg-green-500/15 px-2 py-0.5 font-medium text-green-700">
							Valid
						</span>
					{/if}
				</div>
			</CardHeader>
			<CardContent class="flex grow flex-col gap-2">
				<div class="grow">
					<JsonEditor
						value={jsonText}
						onInput={onJsonInput}
						mode="json"
						minLines={28}
						maxLines={60}
					/>
				</div>
				{#if jsonValid && schemaIssues.length > 0}
					<div class="max-h-48 overflow-y-auto rounded border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
						<div class="mb-1 font-semibold text-amber-700">Schema issues</div>
						<ul class="list-disc space-y-0.5 pl-4 text-amber-900">
							{#each schemaIssues as issue (issue)}
								<li class="font-mono">{issue}</li>
							{/each}
						</ul>
					</div>
				{/if}
			</CardContent>
		</Card>
	{/if}
</div>

<WidgetEditorDialog
	bind:open={dialogOpen}
	widget={editingWidget}
	{schema}
	railEntries={railEntries as never}
	current={editingTarget as never}
	breadcrumbSection={breadcrumbSection}
	onSwitch={switchEditingWidget}
	onSave={commitWidget}
	onOpenChange={(v) => (dialogOpen = v)}
/>

<PresetGallery
	bind:open={presetOpen}
	onPick={insertPreset}
	onOpenChange={(v) => (presetOpen = v)}
/>

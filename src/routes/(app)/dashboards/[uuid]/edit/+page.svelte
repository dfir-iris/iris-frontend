<!--
  Dashboard editor. Schema-driven visual builder over /api/v2/custom-dashboards.
  Sections + widget grid, widget-editor dialog launched per widget. System
  dashboards short-circuit back to view-mode.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		ArrowLeftIcon,
		EditIcon,
		GripVerticalIcon,
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
	import {
		CustomDashboardsService,
		type CustomDashboard,
		type DashboardSchema,
		type DashboardSection,
		type DashboardWidget
	} from '$lib/services/custom-dashboards.service';
	import WidgetEditorDialog from './components/WidgetEditorDialog.svelte';

	let dashboard: CustomDashboard | null = $state(null);
	let schema: DashboardSchema | null = $state(null);
	let name = $state('');
	let description = $state('');
	let isShared = $state(false);
	let sections: DashboardSection[] = $state([]);

	let saving = $state(false);
	let error: string | null = $state(null);
	let success: string | null = $state(null);

	let dialogOpen = $state(false);
	let editingWidget: DashboardWidget | null = $state(null);
	let editingTarget: { sectionIdx: number; widgetIdx: number | null } | null = $state(null);

	const uuid = $derived(page.params.uuid);

	function normalizeSections(def: CustomDashboard['definition']): DashboardSection[] {
		if (def.sections && def.sections.length > 0) {
			return def.sections.map((s) => ({ ...s, widgets: s.widgets ?? [] }));
		}
		if (def.widgets && def.widgets.length > 0) {
			return [{ id: 'section-default', title: def.name, widgets: def.widgets }];
		}
		return [{ id: 'section-default', title: def.name, widgets: [] }];
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

	function commitWidget(widget: DashboardWidget) {
		if (!editingTarget) return;
		const { sectionIdx, widgetIdx } = editingTarget;
		if (widgetIdx === null) {
			sections[sectionIdx].widgets = [...sections[sectionIdx].widgets, widget];
		} else {
			sections[sectionIdx].widgets = sections[sectionIdx].widgets.map((w, i) =>
				i === widgetIdx ? widget : w
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

	// HTML5 DnD state — stash source coords on dragstart, splice on drop.
	// Dropping on a widget card inserts BEFORE it; dropping on the empty
	// area after the last card appends. The "+ Widget" button at the
	// header isn't a drop target so it never swallows a misaim.
	type DragSource = { sectionIdx: number; widgetIdx: number };
	let dragSource: DragSource | null = $state(null);
	let dragOverKey: string | null = $state(null);

	function onDragStart(source: DragSource) {
		dragSource = source;
	}

	function onDragEnd() {
		dragSource = null;
		dragOverKey = null;
	}

	function moveWidget(source: DragSource, dest: { sectionIdx: number; widgetIdx: number }) {
		if (source.sectionIdx === dest.sectionIdx && source.widgetIdx === dest.widgetIdx) return;
		const widget = sections[source.sectionIdx].widgets[source.widgetIdx];
		if (!widget) return;
		// Remove from source first; if dest is in the same section AFTER source,
		// the dest index shifts down by one.
		sections[source.sectionIdx].widgets = sections[source.sectionIdx].widgets.filter(
			(_, i) => i !== source.widgetIdx
		);
		let insertAt = dest.widgetIdx;
		if (source.sectionIdx === dest.sectionIdx && dest.widgetIdx > source.widgetIdx) {
			insertAt = dest.widgetIdx - 1;
		}
		const destWidgets = [...sections[dest.sectionIdx].widgets];
		destWidgets.splice(insertAt, 0, widget);
		sections[dest.sectionIdx].widgets = destWidgets;
		sections = [...sections];
	}

	function onDropOnWidget(e: DragEvent, dest: { sectionIdx: number; widgetIdx: number }) {
		e.preventDefault();
		if (!dragSource) return;
		moveWidget(dragSource, dest);
		dragSource = null;
		dragOverKey = null;
	}

	function onDropOnSection(e: DragEvent, sectionIdx: number) {
		e.preventDefault();
		if (!dragSource) return;
		moveWidget(dragSource, { sectionIdx, widgetIdx: sections[sectionIdx].widgets.length });
		dragSource = null;
		dragOverKey = null;
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
		saving = true;
		error = null;
		success = null;
		const definition = {
			name,
			description,
			is_shared: isShared,
			sections,
			filters_schema: dashboard.definition.filters_schema ?? []
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

<div class="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
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
		<div class="flex gap-2">
			<Button variant="outline" onclick={() => goto(`/dashboards/${uuid}`)}>Preview</Button>
			<Button onclick={save} disabled={saving}>
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

	<Card>
		<CardHeader>
			<CardTitle class="text-base">Dashboard</CardTitle>
			<CardDescription>Name, description and sharing.</CardDescription>
		</CardHeader>
		<CardContent class="grid gap-3 sm:grid-cols-2">
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
					<Button variant="ghost" size="icon" onclick={() => removeSection(sIdx)} title="Remove section">
						<Trash2Icon class="size-4" />
					</Button>
				</div>
			</CardHeader>
			<CardContent
				ondragover={(e) => {
					if (dragSource) e.preventDefault();
				}}
				ondrop={(e) => onDropOnSection(e, sIdx)}
			>
				{#if section.widgets.length === 0}
					<p
						class="rounded border border-dashed p-6 text-center text-sm text-muted-foreground"
						class:bg-muted={dragSource && dragOverKey === `section-${sIdx}-empty`}
						ondragenter={() => dragSource && (dragOverKey = `section-${sIdx}-empty`)}
						ondragleave={() => dragOverKey === `section-${sIdx}-empty` && (dragOverKey = null)}
					>
						No widgets. Click "+ Widget" to add one, or drop a widget here.
					</p>
				{:else}
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-12">
						{#each section.widgets as widget, wIdx (wIdx)}
							{@const dropKey = `${sIdx}-${wIdx}`}
							<div
								class={`${editorSizeClass(widget)} transition-opacity`}
								class:opacity-50={dragSource && dragSource.sectionIdx === sIdx && dragSource.widgetIdx === wIdx}
							>
								<Card
									class={`border-muted ${dragOverKey === dropKey ? 'ring-2 ring-primary' : ''}`}
									ondragover={(e) => {
										if (dragSource) {
											e.preventDefault();
											dragOverKey = dropKey;
										}
									}}
									ondragleave={() => dragOverKey === dropKey && (dragOverKey = null)}
									ondrop={(e) => onDropOnWidget(e, { sectionIdx: sIdx, widgetIdx: wIdx })}
								>
									<CardHeader class="pb-1">
										<CardTitle class="text-sm flex items-center justify-between gap-2">
											<span class="flex items-center gap-1 truncate">
												<button
													type="button"
													class="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
													draggable="true"
													ondragstart={() => onDragStart({ sectionIdx: sIdx, widgetIdx: wIdx })}
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
</div>

<WidgetEditorDialog
	bind:open={dialogOpen}
	widget={editingWidget}
	{schema}
	onSave={commitWidget}
	onOpenChange={(v) => (dialogOpen = v)}
/>

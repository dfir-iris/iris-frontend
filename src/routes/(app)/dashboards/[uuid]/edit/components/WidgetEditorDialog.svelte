<!--
  Widget editor. Opens against a copy of the widget so cancel discards
  cleanly. Schema comes in as a prop (one fetch at the editor-page level).
-->
<script lang="ts">
	import { PlusIcon } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger
	} from '$lib/components/ui/select';
	import { Badge } from '$lib/components/ui/badge';
	import type {
		DashboardSchema,
		DashboardWidget,
		DashboardWidgetField,
		DashboardFilter
	} from '$lib/services/custom-dashboards.service';
	import FieldRow from './FieldRow.svelte';
	import FilterRow from './FilterRow.svelte';

	type Props = {
		open: boolean;
		widget: DashboardWidget | null;
		schema: DashboardSchema | null;
		onSave: (widget: DashboardWidget) => void;
		onOpenChange: (open: boolean) => void;
	};

	let { open = $bindable(false), widget, schema, onSave, onOpenChange }: Props = $props();

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
			<Dialog.Title>Edit widget</Dialog.Title>
			<Dialog.Description>
				Pick a chart type and the data fields. Computed columns surface MTTD, MTTR and other named
				aggregations.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
			<div class="grid gap-2 sm:grid-cols-2">
				<div>
					<Label for="widget-name">Name</Label>
					<Input id="widget-name" bind:value={draft.name} placeholder="Widget name" />
				</div>
				<div>
					<Label for="widget-chart">Chart type</Label>
					<Select value={draft.chart_type} onValueChange={(v) => (draft.chart_type = v)} type="single">
						<SelectTrigger>{draft.chart_type}</SelectTrigger>
						<SelectContent>
							{#each schema?.chart_types ?? ['number', 'pie', 'bar', 'line', 'percentage', 'table', 'timechart'] as t (t)}
								<SelectItem value={t}>{t}</SelectItem>
							{/each}
						</SelectContent>
					</Select>
				</div>
			</div>

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

			<section class="flex flex-col gap-2">
				<div class="flex items-center justify-between">
					<Label>Filters</Label>
					<Button variant="outline" size="sm" onclick={addFilter}>
						<PlusIcon class="size-3" /> Filter
					</Button>
				</div>
				{#if (draft.filters ?? []).length === 0}
					<p class="text-xs text-muted-foreground">No widget-level filters. Dashboard-level filters still apply.</p>
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
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => onOpenChange(false)}>Cancel</Button>
			<Button onclick={commit} disabled={!draft.name || draft.fields.length === 0}>Save widget</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

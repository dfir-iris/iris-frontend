<!--
  One field in a widget definition. Schema-driven: tables come from the
  schema endpoint, columns key off the selected table. When table='computed'
  the column dropdown switches to the named-aggregation list and the
  aggregation selector hides (the computed metric IS the aggregation).
-->
<script lang="ts">
	import { XIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import type {
		DashboardSchema,
		DashboardWidgetField
	} from '$lib/services/custom-dashboards.service';

	type Props = {
		field: DashboardWidgetField;
		schema: DashboardSchema | null;
		onChange: (next: DashboardWidgetField) => void;
		onRemove: () => void;
		removable?: boolean;
	};

	let { field, schema, onChange, onRemove, removable = true }: Props = $props();

	const tableOptions = $derived.by(() => {
		if (!schema) return [];
		return ['computed', ...schema.tables.filter((t) => t !== 'computed')];
	});

	const columnOptions = $derived.by(() => {
		if (!schema || !field.table) return [] as string[];
		if (field.table === 'computed') {
			return schema.named_aggregations.map((a) => a.name);
		}
		return schema.columns[field.table] ?? [];
	});

	function patch(updates: Partial<DashboardWidgetField>) {
		onChange({ ...field, ...updates });
	}
</script>

<div class="flex items-center gap-2">
	<div class="grid grow grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr]">
		<Select
			value={field.table ?? ''}
			onValueChange={(v) =>
				patch({ table: v, column: '', aggregation: v === 'computed' ? null : field.aggregation })}
			type="single"
		>
			<SelectTrigger>{field.table || 'Table'}</SelectTrigger>
			<SelectContent>
				{#each tableOptions as t (t)}
					<SelectItem value={t}>{t}</SelectItem>
				{/each}
			</SelectContent>
		</Select>

		<Select value={field.column ?? ''} onValueChange={(v) => patch({ column: v })} type="single">
			<SelectTrigger>{field.column || 'Column'}</SelectTrigger>
			<SelectContent>
				{#each columnOptions as c (c)}
					<SelectItem value={c}>{c}</SelectItem>
				{/each}
			</SelectContent>
		</Select>

		{#if field.table !== 'computed'}
			<Select
				value={field.aggregation ?? ''}
				onValueChange={(v) => patch({ aggregation: v || null })}
				type="single"
			>
				<SelectTrigger>{field.aggregation || 'No aggregation'}</SelectTrigger>
				<SelectContent>
					<SelectItem value="">(none)</SelectItem>
					{#each schema?.aggregations ?? [] as a (a)}
						<SelectItem value={a}>{a}</SelectItem>
					{/each}
				</SelectContent>
			</Select>
		{:else}
			<div></div>
		{/if}

		<Input
			placeholder="alias"
			value={field.alias ?? ''}
			oninput={(e) => patch({ alias: (e.target as HTMLInputElement).value || null })}
		/>
	</div>
	{#if removable}
		<Button variant="ghost" size="icon" onclick={onRemove} title="Remove field">
			<XIcon class="size-4" />
		</Button>
	{/if}
</div>

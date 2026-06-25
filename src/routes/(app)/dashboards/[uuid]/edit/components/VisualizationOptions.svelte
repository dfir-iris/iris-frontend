<!--
  Color / palette / threshold inputs for a widget. Reads and writes
  widget.options.{color, palette, thresholds}. Threshold list lets the
  user define rules like "value >= 100 → red" which the KPI/percentage
  renderer applies to override the base color.
-->
<script lang="ts">
	import { PlusIcon, XIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger
	} from '$lib/components/ui/select';
	import type { DashboardWidget } from '$lib/services/custom-dashboards.service';

	type Threshold = { op: 'gte' | 'gt' | 'lte' | 'lt' | 'eq'; value: number | string; color: string };

	type Props = {
		widget: DashboardWidget;
		onChange: (next: DashboardWidget) => void;
	};

	let { widget, onChange }: Props = $props();

	function options(): Record<string, unknown> {
		return (widget.options ?? {}) as Record<string, unknown>;
	}

	function patchOptions(updates: Record<string, unknown>) {
		const next = { ...options(), ...updates };
		// Drop empty strings so widgets that never set a colour don't carry
		// an empty string forever in the JSON.
		Object.keys(next).forEach((k) => {
			if (next[k] === '' || next[k] === null || next[k] === undefined) delete next[k];
		});
		onChange({ ...widget, options: next });
	}

	const color = $derived(String(options().color ?? ''));
	const palette = $derived(String(options().palette ?? ''));
	const thresholds = $derived.by<Threshold[]>(() => {
		const raw = options().thresholds;
		if (!Array.isArray(raw)) return [];
		return (raw as unknown[]).flatMap((r) => {
			if (typeof r !== 'object' || r === null) return [];
			const t = r as Record<string, unknown>;
			const op = ['gte', 'gt', 'lte', 'lt', 'eq'].includes(String(t.op)) ? (t.op as Threshold['op']) : 'gte';
			const color = typeof t.color === 'string' ? t.color : '#dc2626';
			const value = (typeof t.value === 'number' || typeof t.value === 'string') ? t.value : 0;
			return [{ op, value, color }];
		});
	});

	function setThresholds(next: Threshold[]) {
		patchOptions({ thresholds: next });
	}

	function addThreshold() {
		setThresholds([...thresholds, { op: 'gte', value: 0, color: '#dc2626' }]);
	}

	function patchThreshold(idx: number, updates: Partial<Threshold>) {
		setThresholds(thresholds.map((t, i) => (i === idx ? { ...t, ...updates } : t)));
	}

	function removeThreshold(idx: number) {
		setThresholds(thresholds.filter((_, i) => i !== idx));
	}
</script>

<section class="flex flex-col gap-3">
	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		<div class="flex flex-col gap-1">
			<Label for="widget-color">Color</Label>
			<div class="flex gap-1">
				<Input
					id="widget-color"
					value={color}
					placeholder="#4e73df"
					oninput={(e) => patchOptions({ color: (e.target as HTMLInputElement).value })}
				/>
				<input
					type="color"
					class="h-9 w-9 cursor-pointer rounded border bg-background"
					value={color || '#4e73df'}
					oninput={(e) => patchOptions({ color: (e.target as HTMLInputElement).value })}
					aria-label="Pick widget color"
				/>
			</div>
		</div>
		<div class="flex flex-col gap-1">
			<Label for="widget-palette">Palette (comma-separated hex)</Label>
			<Input
				id="widget-palette"
				value={palette}
				placeholder="#4e73df,#1cc88a,#f6c23e"
				oninput={(e) => patchOptions({ palette: (e.target as HTMLInputElement).value })}
			/>
		</div>
	</div>

	<div class="flex flex-col gap-2">
		<div class="flex items-center justify-between">
			<Label>Thresholds</Label>
			<Button variant="outline" size="sm" onclick={addThreshold}>
				<PlusIcon class="size-3" /> Threshold
			</Button>
		</div>
		{#if thresholds.length === 0}
			<p class="text-xs text-muted-foreground">
				No thresholds. KPI / percentage widgets use the widget color. Add a rule like
				<span class="font-mono">value &ge; 100 → red</span> to highlight outliers.
			</p>
		{:else}
			<div class="flex flex-col gap-2">
				{#each thresholds as t, idx (idx)}
					<div class="grid grid-cols-1 items-end gap-2 rounded border p-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
						<div class="flex flex-col gap-1">
							<Label class="text-xs">Operator</Label>
							<Select
								value={t.op}
								onValueChange={(v) => patchThreshold(idx, { op: v as Threshold['op'] })}
								type="single"
							>
								<SelectTrigger>{t.op}</SelectTrigger>
								<SelectContent>
									<SelectItem value="gte">&ge;</SelectItem>
									<SelectItem value="gt">&gt;</SelectItem>
									<SelectItem value="lte">&le;</SelectItem>
									<SelectItem value="lt">&lt;</SelectItem>
									<SelectItem value="eq">=</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div class="flex flex-col gap-1">
							<Label class="text-xs">Value</Label>
							<Input
								value={String(t.value)}
								oninput={(e) => {
									const raw = (e.target as HTMLInputElement).value;
									const num = Number(raw);
									patchThreshold(idx, { value: Number.isFinite(num) && raw.trim() !== '' ? num : raw });
								}}
							/>
						</div>
						<div class="flex flex-col gap-1">
							<Label class="text-xs">Color</Label>
							<div class="flex gap-1">
								<Input
									value={t.color}
									oninput={(e) => patchThreshold(idx, { color: (e.target as HTMLInputElement).value })}
								/>
								<input
									type="color"
									class="h-9 w-9 cursor-pointer rounded border bg-background"
									value={t.color}
									oninput={(e) => patchThreshold(idx, { color: (e.target as HTMLInputElement).value })}
									aria-label="Pick threshold color"
								/>
							</div>
						</div>
						<Button variant="ghost" size="icon" onclick={() => removeThreshold(idx)} title="Remove">
							<XIcon class="size-4" />
						</Button>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</section>

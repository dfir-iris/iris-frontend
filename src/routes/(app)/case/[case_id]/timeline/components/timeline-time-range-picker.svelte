<!--
  Time range of the search view: relative presets on one side, and an
  absolute range on the other — between two dates, before one or after
  one. Dates are typed in the display timezone, like everything else the
  UI shows. The host owns the range: this only reports the new one.
-->
<script lang="ts">
	import { ChevronDownIcon, ClockIcon } from 'lucide-svelte';
	import {
		formatDateTime,
		fromDateTimeInputValue,
		toDateTimeInputValue
	} from '$lib/utils/time-formatter';
	import { Button } from '$lib/components/ui/button';
	import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/ui/popover';
	import {
		TIME_RANGE_PRESETS,
		customRangeMode,
		customTimeRange,
		resolveTimeRange,
		timeRangeLabel,
		type CustomRangeMode,
		type TimeRange
	} from '../search-helpers';

	type Props = {
		range: TimeRange;
		onChange: (range: TimeRange) => void;
	};

	let { range, onChange }: Props = $props();

	const MODES: { key: CustomRangeMode; label: string }[] = [
		{ key: 'between', label: 'Between' },
		{ key: 'before', label: 'Before' },
		{ key: 'after', label: 'After' }
	];

	let open = $state(false);
	let mode = $state<CustomRangeMode>('between');
	let startInput = $state('');
	let endInput = $state('');
	let error = $state<string | null>(null);

	const label = $derived(timeRangeLabel(range, (iso) => formatDateTime(iso)) ?? 'All time');

	// Opening starts from the current range, so nudging a window is an
	// edit of it rather than typing it again. A preset is shown as the
	// window it covers right now.
	const onOpenChange = (next: boolean) => {
		if (!next) return;
		error = null;
		mode = customRangeMode(range);
		const now = new Date();
		const { start, end } = resolveTimeRange(range, now);
		const shownEnd = end ?? (range.kind === 'preset' && start ? now.toISOString() : null);
		startInput = start ? toDateTimeInputValue(start, true) : '';
		endInput = shownEnd ? toDateTimeInputValue(shownEnd, true) : '';
	};

	const pick = (next: TimeRange) => {
		open = false;
		onChange(next);
	};

	const apply = (e: SubmitEvent) => {
		e.preventDefault();
		const next = customTimeRange(
			mode,
			fromDateTimeInputValue(startInput),
			fromDateTimeInputValue(endInput)
		);
		if ('error' in next) {
			error = next.error;
			return;
		}
		pick(next);
	};

	const isPreset = (key: string) => range.kind === 'preset' && range.preset === key;
	const inputClass =
		'h-8 w-full rounded-md border border-input bg-background px-2 text-xs tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-ring';
</script>

<Popover bind:open {onOpenChange}>
	<PopoverTrigger>
		<Button
			variant="outline"
			size="sm"
			class="h-8 max-w-80 shrink-0 gap-1.5 text-xs"
			title={label}
			data-testid="timeline-time-range"
		>
			<ClockIcon class="size-3.5 shrink-0" />
			<span class="truncate">{label}</span>
			<ChevronDownIcon class="size-3 shrink-0" />
		</Button>
	</PopoverTrigger>
	<PopoverContent align="end" class="flex w-[34rem] gap-4 p-3">
		<div class="w-36 shrink-0">
			<p class="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
				Presets
			</p>
			<ul class="flex flex-col">
				{#each TIME_RANGE_PRESETS as preset (preset.key)}
					<li>
						<button
							type="button"
							class={`w-full rounded px-2 py-1 text-left text-xs hover:bg-muted ${isPreset(preset.key) ? 'bg-muted font-medium' : ''}`}
							onclick={() => pick({ kind: 'preset', preset: preset.key })}
						>
							{preset.label}
						</button>
					</li>
				{/each}
			</ul>
		</div>

		<form class="flex min-w-0 flex-1 flex-col gap-3 border-l border-border pl-4" onsubmit={apply}>
			<p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
				Date &amp; time range
			</p>

			<div class="inline-flex self-start rounded-md border border-border p-0.5" role="radiogroup">
				{#each MODES as m (m.key)}
					<button
						type="button"
						role="radio"
						aria-checked={mode === m.key}
						class={`rounded px-2.5 py-1 text-xs ${mode === m.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
						onclick={() => {
							mode = m.key;
							error = null;
						}}
					>
						{m.label}
					</button>
				{/each}
			</div>

			{#if mode !== 'before'}
				<label class="flex flex-col gap-1 text-xs">
					<span class="text-muted-foreground">{mode === 'after' ? 'After' : 'From'}</span>
					<input type="datetime-local" step="1" class={inputClass} bind:value={startInput} />
				</label>
			{/if}
			{#if mode !== 'after'}
				<label class="flex flex-col gap-1 text-xs">
					<span class="text-muted-foreground">{mode === 'before' ? 'Before' : 'To'}</span>
					<input type="datetime-local" step="1" class={inputClass} bind:value={endInput} />
				</label>
			{/if}

			{#if error}
				<p class="text-xs text-destructive">{error}</p>
			{/if}

			<div class="mt-auto flex justify-end">
				<Button type="submit" size="sm" class="h-8 text-xs">Apply</Button>
			</div>
		</form>
	</PopoverContent>
</Popover>

<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import Input from '$lib/components/ui/input/input.svelte';

	export type AlertRelationshipsFiltersValue = {
		openAlerts: boolean;
		closedAlerts: boolean;
		openCases: boolean;
		closedCases: boolean;
		numberOfNodes: number;
		daysBack: number;
	};

	type Props = {
		value: AlertRelationshipsFiltersValue;
	};

	let { value = $bindable() }: Props = $props();

	const toggle = (
		key: keyof Pick<
			AlertRelationshipsFiltersValue,
			'openAlerts' | 'closedAlerts' | 'openCases' | 'closedCases'
		>
	) => {
		value[key] = !value[key];
	};

	const parsePositiveInt = (raw: string, fallback: number) => {
		const parsed = Number.parseInt(raw, 10);

		if (!Number.isFinite(parsed) || parsed < 0) {
			return fallback;
		}

		return parsed;
	};
</script>

<div class="space-y-4">
	<div class="flex flex-wrap gap-2">
		<Button
			type="button"
			size="xs"
			variant={value.openAlerts ? 'default' : 'outline'}
			onclick={() => toggle('openAlerts')}
		>
			Show open alerts
		</Button>

		<Button
			type="button"
			size="xs"
			variant={value.closedAlerts ? 'default' : 'outline'}
			onclick={() => toggle('closedAlerts')}
		>
			Show closed alerts
		</Button>

		<Button
			type="button"
			size="xs"
			variant={value.openCases ? 'default' : 'outline'}
			onclick={() => toggle('openCases')}
		>
			Show open cases
		</Button>

		<Button
			type="button"
			size="xs"
			variant={value.closedCases ? 'default' : 'outline'}
			onclick={() => toggle('closedCases')}
		>
			Show closed cases
		</Button>
	</div>

	<div class="flex flex-wrap gap-4">
		<div class="flex">
			<div
				class="flex h-7 items-center text-nowrap rounded-l-md border border-r-0 border-input bg-muted px-2.5 text-xs text-muted-foreground"
			>
				Nodes limit
			</div>

			<Input
				type="number"
				min="0"
				step="1"
				class="h-7 rounded-l-none text-xs"
				value={String(value.numberOfNodes)}
				oninput={(event) =>
					(value.numberOfNodes = parsePositiveInt(
						(event.currentTarget as HTMLInputElement).value,
						value.numberOfNodes
					))}
			/>
		</div>

		<div class="flex">
			<div
				class="flex h-7 items-center text-nowrap rounded-l-md border border-r-0 border-input bg-muted px-2.5 text-xs text-muted-foreground"
			>
				Lookback (days)
			</div>

			<Input
				type="number"
				min="0"
				step="1"
				class="h-7 rounded-l-none text-xs"
				value={String(value.daysBack)}
				oninput={(event) =>
					(value.numberOfNodes = parsePositiveInt(
						(event.currentTarget as HTMLInputElement).value,
						value.numberOfNodes
					))}
			/>
		</div>
	</div>
</div>

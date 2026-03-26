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
	<div class="flex gap-2">
		<Button
			type="button"
			variant={value.openAlerts ? 'default' : 'outline'}
			onclick={() => toggle('openAlerts')}
		>
			Show open alerts
		</Button>

		<Button
			type="button"
			variant={value.closedAlerts ? 'default' : 'outline'}
			onclick={() => toggle('closedAlerts')}
		>
			Show closed alerts
		</Button>

		<Button
			type="button"
			variant={value.openCases ? 'default' : 'outline'}
			onclick={() => toggle('openCases')}
		>
			Show open cases
		</Button>

		<Button
			type="button"
			variant={value.closedCases ? 'default' : 'outline'}
			onclick={() => toggle('closedCases')}
		>
			Show closed cases
		</Button>
	</div>

	<div class="flex gap-4">
		<div class="flex">
			<div
				class="flex h-9 items-center text-nowrap rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground shadow-sm"
			>
				Nodes limit
			</div>

			<Input
				type="number"
				min="0"
				step="1"
				class="rounded-l-none"
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
				class="flex h-9 items-center text-nowrap rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground shadow-sm"
			>
				Lookback (days)
			</div>

			<Input
				type="number"
				min="0"
				step="1"
				class="rounded-l-none"
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

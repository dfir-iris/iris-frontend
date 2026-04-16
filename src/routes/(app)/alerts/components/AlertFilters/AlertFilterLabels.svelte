<script lang="ts">
	import { XIcon } from 'lucide-svelte';
	import type { AlertResolution } from '$lib/services/alert-resolutions.service';
	import type { AlertStatus } from '$lib/services/alert-status.service';
	import type { CaseClassification } from '$lib/services/case-classifications.service';
	import type { Severity } from '$lib/services/severities.service';
	import type { Filters } from '.';

	type Props = {
		value: Filters;
		onRemove: (key: keyof Filters) => void;
		alertResolutions: AlertResolution[];
		alertStatuses: AlertStatus[];
		caseClassifications: CaseClassification[];
		severities: Severity[];
	};

	let { value, onRemove, alertResolutions, alertStatuses, caseClassifications, severities }: Props =
		$props();

	type Item = {
		key: keyof Filters;
		value: string;
	};

	const items = $derived.by<Item[]>(() => {
		const result: Item[] = [];

		for (const [key, raw] of Object.entries(value) as [keyof Filters, Filters[keyof Filters]][]) {
			if (key === 'sort') continue;
			if (raw == null) continue;

			let resolved = raw;

			if (key === 'resolution_status_id' && typeof raw === 'number') {
				resolved =
					alertResolutions.find((resolution) => resolution.resolution_status_id === raw)
						?.resolution_status_name ?? raw;
			}

			if (key === 'alert_status_id' && typeof raw === 'number') {
				resolved = alertStatuses.find((status) => status.status_id === raw)?.status_name ?? raw;
			}

			if (key === 'alert_classification_id' && typeof raw === 'number') {
				resolved =
					caseClassifications.find((classification) => classification.id === raw)?.name_expanded ??
					raw;
			}

			if (key === 'alert_severity_id' && typeof raw === 'number') {
				resolved =
					severities.find((severity) => severity.severity_id === raw)?.severity_name ?? raw;
			}

			const text = String(resolved).trim();
			if (!text) continue;

			result.push({ key, value: text });
		}

		return result;
	});
</script>

{#if items.length}
	<div class="flex flex-wrap items-center gap-1.5">
		{#each items as item, i (`${String(item.key)}:${i}`)}
			<div class="flex items-center gap-1.5">
				<div class="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs">
					<span>{item.value}</span>

					<button
						type="button"
						class="text-muted-foreground transition-colors hover:text-foreground"
						onclick={() => onRemove(item.key)}
					>
						<XIcon class="size-3" />
					</button>
				</div>

				{#if i < items.length - 1}
					<span class="text-xs opacity-70">+</span>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<script lang="ts">
	import { XIcon } from 'lucide-svelte';
	import type { AlertResolution } from '$lib/services/alert-resolutions.service';
	import type { AlertStatus } from '$lib/services/alert-status.service';
	import type { CaseClassification } from '$lib/services/case-classifications.service';
	import type { Severity } from '$lib/services/severities.service';
	import type { Customer } from '$lib/services/customers.service';
	import type { MentionableUser } from '$lib/services/users.service';
	import type { Filters } from '.';

	type Props = {
		value: Filters;
		onRemove: (key: keyof Filters) => void;
		alertResolutions: AlertResolution[];
		alertStatuses: AlertStatus[];
		caseClassifications: CaseClassification[];
		severities: Severity[];
		customers: Customer[];
		owners: MentionableUser[];
	};

	let {
		value,
		onRemove,
		alertResolutions,
		alertStatuses,
		caseClassifications,
		severities,
		customers,
		owners
	}: Props = $props();

	type Item = {
		key: keyof Filters;
		value: string;
	};

	// Count the leaves in a custom_conditions payload so we can render
	// a "custom conditions (N)" chip instead of dumping the whole JSON
	// tree into the label bar. Handles both group-rooted objects and
	// bare leaf arrays; anything unparseable renders as "custom".
	const countLeaves = (raw: string): number | null => {
		try {
			const parsed = JSON.parse(raw);
			let count = 0;
			const walk = (node: unknown): void => {
				if (!node || typeof node !== 'object') return;
				const g = node as { conditions?: unknown };
				if (Array.isArray(g.conditions)) {
					g.conditions.forEach(walk);
					return;
				}
				count += 1;
			};
			if (Array.isArray(parsed)) parsed.forEach(walk);
			else walk(parsed);
			return count;
		} catch {
			return null;
		}
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

			if (key === 'alert_customer_id' && typeof raw === 'number') {
				resolved = customers.find((customer) => customer.customer_id === raw)?.customer_name ?? raw;
			}

			if (key === 'alert_owner_id' && typeof raw === 'number') {
				const owner = owners.find((candidate) => Number(candidate.user_id) === raw);
				resolved = owner ? owner.user_name || owner.user_login : raw;
			}

			if (key === 'custom_conditions' && typeof raw === 'string') {
				const n = countLeaves(raw);
				resolved = n == null ? 'custom conditions' : `custom conditions (${n})`;
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

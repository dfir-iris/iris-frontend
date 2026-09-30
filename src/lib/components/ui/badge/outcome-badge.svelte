<script lang="ts">
	import {
		BadgeCheck,
		CircleHelp,
		CircleMinus,
		CircleSlash,
		Flame,
		ShieldCheck
	} from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { CASE_OUTCOME_UNKNOWN, caseOutcomeById } from '$lib/utils/case-outcomes';

	let {
		outcomeId,
		icon_only = false
	}: { outcomeId: number | null | undefined; icon_only?: boolean } = $props();

	// Keyed by the backend `CaseStatus` value, same as `CASE_OUTCOMES`. The
	// colour carries the verdict: red for a real incident, amber for a real
	// one that did no harm, green for legitimate activity, grey otherwise.
	const OUTCOME_STYLE: Record<number, { color: string; icon: typeof CircleHelp }> = {
		[CASE_OUTCOME_UNKNOWN]: { color: 'text-muted-foreground', icon: CircleHelp },
		1: { color: 'text-slate-600 dark:text-slate-300', icon: CircleSlash },
		2: { color: 'text-red-700 dark:text-red-400', icon: Flame },
		3: { color: 'text-muted-foreground', icon: CircleMinus },
		4: { color: 'text-amber-700 dark:text-amber-400', icon: ShieldCheck },
		5: { color: 'text-emerald-700 dark:text-emerald-400', icon: BadgeCheck }
	};

	const outcome = $derived(caseOutcomeById(outcomeId ?? CASE_OUTCOME_UNKNOWN));
	const style = $derived(OUTCOME_STYLE[outcome?.id ?? CASE_OUTCOME_UNKNOWN]);
	// "Unknown" alone reads like a broken field; say what is unknown.
	const label = $derived(
		!outcome || outcome.id === CASE_OUTCOME_UNKNOWN ? 'Outcome unknown' : outcome.label
	);
</script>

{#if icon_only}
	<Badge
		class="{style.color} border-0 bg-transparent p-1 hover:bg-muted/50"
		icon={style.icon}
		variant="outline"
		title={`Outcome: ${outcome?.label ?? 'Unknown'}`}
	></Badge>
{:else}
	<Badge
		class="items-center gap-1 {style.color} border-0 bg-transparent p-1 hover:bg-muted/50"
		icon={style.icon}
		variant="outline"
	>
		{label}
	</Badge>
{/if}

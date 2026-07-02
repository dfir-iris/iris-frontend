<!--
  Investigation-flow side pane for an incident. Local to the incident
  detail route (no context / cross-route sharing needed — an analyst
  only ever looks at one incident at a time). Shape mirrors the
  alert-scoped `$lib/components/common/InvestigationFlow/InvestigationFlowPanel.svelte`
  so the two feel identical.
-->
<script lang="ts">
	import { CheckSquareIcon, RefreshCwIcon, XIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { InvestigationFlowsService } from '$lib/services/investigation-flows.service';
	import type {
		InvestigationOverview,
		InvestigationProgress
	} from '$lib/types/resources/investigation-flow';
	import type { Incident } from '$lib/types/resources/incident';

	let {
		incident,
		onClose
	}: { incident: Incident; onClose: () => void } = $props();

	let overview = $state<InvestigationOverview | null>(null);
	let loading = $state(false);
	let noteDrafts = $state<Record<number, string>>({});

	const load = async () => {
		loading = true;
		try {
			const res = await InvestigationFlowsService.getIncidentProgress(
				incident.incident_id
			);
			overview = (res.data as InvestigationOverview) ?? null;
		} finally {
			loading = false;
		}
	};

	$effect(() => {
		void incident.incident_id;
		void load();
	});

	const progressByStep = $derived(() => {
		const map = new Map<number, InvestigationProgress>();
		for (const p of overview?.progress ?? []) map.set(p.step_id, p);
		return map;
	});

	const toggle = async (stepId: number, checked: boolean) => {
		if (checked) {
			await InvestigationFlowsService.recordIncidentProgress(
				incident.incident_id,
				stepId,
				noteDrafts[stepId]
			);
		} else {
			await InvestigationFlowsService.uncheckIncidentProgress(
				incident.incident_id,
				stepId
			);
		}
		await load();
	};

	const saveNote = async (stepId: number) => {
		await InvestigationFlowsService.recordIncidentProgress(
			incident.incident_id,
			stepId,
			noteDrafts[stepId]
		);
		await load();
	};
</script>

<div class="flex h-full w-full flex-col">
	<header class="flex items-center justify-between border-b px-4 py-3">
		<div class="flex items-center gap-2">
			<CheckSquareIcon class="h-4 w-4" />
			<div>
				<p class="text-sm font-medium">Investigation flow</p>
				{#if overview?.flow_name}
					<p class="text-xs text-muted-foreground">{overview.flow_name}</p>
				{/if}
			</div>
		</div>
		<div class="flex items-center gap-1">
			<Button variant="ghost" size="icon" onclick={load} disabled={loading} aria-label="Refresh">
				<RefreshCwIcon class="h-4 w-4" />
			</Button>
			<Button variant="ghost" size="icon" onclick={onClose} aria-label="Close">
				<XIcon class="h-4 w-4" />
			</Button>
		</div>
	</header>

	<div class="flex-1 overflow-y-auto px-4 py-3">
		{#if loading && !overview}
			<p class="text-sm text-muted-foreground">Loading…</p>
		{:else if !overview?.flow_id}
			<p class="text-sm text-muted-foreground">
				No investigation flow attached to this incident.
			</p>
		{:else}
			<ol class="space-y-3">
				{#each overview.steps as step (step.step_id)}
					{@const progress = progressByStep().get(step.step_id)}
					<li class="rounded border p-3">
						<label class="flex cursor-pointer items-start gap-2">
							<input
								type="checkbox"
								class="mt-1"
								checked={!!progress}
								onchange={(e) => toggle(step.step_id, e.currentTarget.checked)}
							/>
							<div class="flex-1">
								<p class="text-sm font-medium">
									{step.step_order}. {step.step_title}
									{#if step.step_is_required}
										<span class="text-xs text-red-600">*</span>
									{/if}
								</p>
								{#if step.step_description}
									<p class="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
										{step.step_description}
									</p>
								{/if}
							</div>
						</label>
						{#if progress}
							<p class="mt-2 text-xs text-muted-foreground">
								Completed by {progress.completed_by?.user_name ?? 'someone'} —
								{new Date(progress.completed_at).toLocaleString()}
							</p>
							<textarea
								class="mt-2 w-full rounded border p-2 text-xs"
								placeholder="Add a note"
								rows="2"
								value={noteDrafts[step.step_id] ?? progress.note ?? ''}
								oninput={(e) =>
									(noteDrafts = {
										...noteDrafts,
										[step.step_id]: e.currentTarget.value
									})}
							></textarea>
							<div class="mt-2 flex justify-end">
								<Button size="sm" variant="ghost" onclick={() => saveNote(step.step_id)}>
									Save note
								</Button>
							</div>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</div>
</div>

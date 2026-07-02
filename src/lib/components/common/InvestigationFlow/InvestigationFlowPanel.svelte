<!--
  Left-side panel showing the investigation flow (checklist) attached to
  an alert. Modeled on CommentsPanel: lives at the alerts layout level
  so it survives detail navigation, and re-loads whenever the panel's
  `entity` (an alert id + label) changes.

  Steps are rendered read-only for users lacking `alerts_write`; check-
  boxes toggle progress via /alerts/<id>/investigation-progress. A step
  with an existing progress row shows the user who checked it off and
  when — the audit trail is intentionally visible so analysts can see
  who covered which step.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { XIcon, RefreshCwIcon, CheckSquareIcon } from 'lucide-svelte';
	import {
		INVESTIGATION_FLOW_PANEL_CTX,
		type InvestigationFlowPanelContext
	} from '$lib/contexts/investigation-flow-panel.context.svelte';
	import { InvestigationFlowsService } from '$lib/services/investigation-flows.service';
	import type { AlertInvestigationOverview } from '$lib/types/resources/investigation-flow';
	import Button from '$lib/components/ui/button/button.svelte';

	const panel = getContext<InvestigationFlowPanelContext>(INVESTIGATION_FLOW_PANEL_CTX);

	let overview = $state<AlertInvestigationOverview | null>(null);
	let loading = $state(false);
	let noteDrafts = $state<Record<number, string>>({});

	const load = async () => {
		const entity = panel.state.entity;
		if (!entity) {
			overview = null;
			return;
		}
		loading = true;
		try {
			const res = await InvestigationFlowsService.getAlertProgress(entity.id);
			overview = (res.data as AlertInvestigationOverview) ?? null;
		} finally {
			loading = false;
		}
	};

	$effect(() => {
		void panel.state.entity;
		void load();
	});

	const progressByStep = $derived(() => {
		const map = new Map<number, AlertInvestigationOverview['progress'][number]>();
		for (const p of overview?.progress ?? []) map.set(p.step_id, p);
		return map;
	});

	const toggleStep = async (stepId: number, checked: boolean) => {
		const entity = panel.state.entity;
		if (!entity) return;
		if (checked) {
			await InvestigationFlowsService.recordAlertProgress(
				entity.id,
				stepId,
				noteDrafts[stepId]
			);
		} else {
			await InvestigationFlowsService.uncheckAlertProgress(entity.id, stepId);
		}
		await load();
	};

	const saveNote = async (stepId: number) => {
		const entity = panel.state.entity;
		if (!entity) return;
		await InvestigationFlowsService.recordAlertProgress(
			entity.id,
			stepId,
			noteDrafts[stepId]
		);
		await load();
	};
</script>

<aside class="flex h-full w-96 flex-col border-r bg-background">
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
			<Button variant="ghost" size="icon" onclick={panel.close} aria-label="Close">
				<XIcon class="h-4 w-4" />
			</Button>
		</div>
	</header>

	<div class="flex-1 overflow-y-auto px-4 py-3">
		{#if !panel.state.entity}
			<p class="text-sm text-muted-foreground">Select an alert to see its investigation flow.</p>
		{:else if loading && !overview}
			<p class="text-sm text-muted-foreground">Loading…</p>
		{:else if !overview?.flow_id}
			<p class="text-sm text-muted-foreground">
				No investigation flow is attached to this alert. Rules can attach one automatically —
				see settings.
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
								onchange={(e) => toggleStep(step.step_id, e.currentTarget.checked)}
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
</aside>

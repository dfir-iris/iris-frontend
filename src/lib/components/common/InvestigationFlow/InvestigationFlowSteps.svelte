<!--
  The investigation flow (guided triage checklist) of one alert: progress
  meter + the step list, with per-step check, markdown description and
  markdown note.

  Split out of `InvestigationFlowPanel` so the same checklist can be
  rendered in two places that frame it differently — the alerts layout
  side panel (which adds a header, a refresh button and a close button
  around this) and the split-view detail pane, where a third aside would
  squeeze the two triage panes and the checklist is a tab instead.

  Everything stateful lives here and is keyed off `alertId`, so a host
  only has to hand over an id. As in the panel, every mutation is
  followed by a full re-load rather than a client-side patch: a per-step
  round trip is cheap and the progress rows carry `completed_by`
  metadata we don't want to fabricate.
-->
<script lang="ts">
	import { CheckCircle2Icon, CircleIcon, PencilLineIcon } from 'lucide-svelte';
	import { InvestigationFlowsService } from '$lib/services/investigation-flows.service';
	import type { AlertInvestigationOverview } from '$lib/types/resources/investigation-flow';
	import { Button } from '$lib/components/ui/button';
	import { MarkDownEditor, MarkDownPreview } from '$lib/components/common/MarkDown';

	type Props = {
		/** Alert whose flow to show. `null` renders the "pick an alert" state. */
		alertId: number | null;
		/**
		 * Lets the host drive a refresh button of its own, and react to the
		 * flow name / progress (the panel puts both in its header).
		 */
		onLoaded?: (overview: AlertInvestigationOverview | null) => void;
	};

	let { alertId, onLoaded }: Props = $props();

	let overview = $state<AlertInvestigationOverview | null>(null);
	let loading = $state(false);

	// Drafted note per step id. Keyed so opening / closing / switching
	// alerts doesn't stomp an in-progress edit — we only push a draft
	// to the server on explicit Save.
	let noteDrafts = $state<Record<number, string>>({});
	let noteEditingFor = $state<number | null>(null);

	// Not $state: pure request bookkeeping, nothing renders from it.
	let requestSeq = 0;

	export const load = async () => {
		const seq = ++requestSeq;

		if (alertId === null) {
			overview = null;
			loading = false;
			onLoaded?.(null);
			return;
		}

		loading = true;

		try {
			const res = await InvestigationFlowsService.getAlertProgress(alertId);

			// Walking the queue with j/k fires one of these per alert, so a
			// slower earlier response must not land on top of a newer one.
			if (seq !== requestSeq) return;

			overview = (res.data as AlertInvestigationOverview) ?? null;
			onLoaded?.(overview);
		} finally {
			if (seq === requestSeq) loading = false;
		}
	};

	// Re-load whenever the host points us at a different alert. In the
	// split view that is every j/k press, so it has to key off the id
	// rather than a one-shot mount.
	$effect(() => {
		void alertId;

		// Drop the previous alert's checklist before the new one lands.
		// Leaving it up would show one alert's steps under another's
		// header, and `toggleStep` records against the *current* alertId —
		// so a click during that window would check a step on the wrong
		// alert.
		overview = null;
		void load();

		// Clear any note drafts from a previous alert so we don't leak
		// text between different investigations.
		noteDrafts = {};
		noteEditingFor = null;
	});

	const progressByStep = $derived(() => {
		const map = new Map<number, AlertInvestigationOverview['progress'][number]>();
		for (const p of overview?.progress ?? []) map.set(p.step_id, p);
		return map;
	});

	const completedCount = $derived((overview?.progress ?? []).length);
	const totalSteps = $derived(overview?.steps?.length ?? 0);
	const percent = $derived(totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0);

	const toggleStep = async (stepId: number, checked: boolean) => {
		if (alertId === null) return;

		if (checked) {
			await InvestigationFlowsService.recordAlertProgress(alertId, stepId, noteDrafts[stepId]);
		} else {
			await InvestigationFlowsService.uncheckAlertProgress(alertId, stepId);
			// Un-checking should not throw away the analyst's draft note —
			// keep whatever was in `noteDrafts` in case they re-check.
			noteEditingFor = null;
		}

		await load();
	};

	const saveNote = async (stepId: number) => {
		if (alertId === null) return;

		await InvestigationFlowsService.recordAlertProgress(alertId, stepId, noteDrafts[stepId] ?? '');
		noteEditingFor = null;
		await load();
	};

	const startEditingNote = (stepId: number, existing?: string | null) => {
		if (noteDrafts[stepId] === undefined) {
			noteDrafts = { ...noteDrafts, [stepId]: existing ?? '' };
		}

		noteEditingFor = stepId;
	};
</script>

<div class="flex h-full min-h-0 w-full flex-col">
	<!-- ————— Progress meter ————— -->
	{#if overview?.flow_id && totalSteps > 0}
		<div class="shrink-0 border-b border-border px-4 py-2.5">
			<div class="mb-1.5 flex items-center justify-between text-xs">
				<span class="text-muted-foreground">Progress</span>
				<span class="font-medium tabular-nums">
					{completedCount} / {totalSteps}
					{#if completedCount === totalSteps}
						<CheckCircle2Icon class="ml-1 inline h-3.5 w-3.5 text-green-600" />
					{/if}
				</span>
			</div>
			<div class="h-1.5 overflow-hidden rounded-full bg-muted">
				<div
					class="h-full rounded-full bg-primary transition-all duration-300"
					style="width: {percent}%"
				></div>
			</div>
		</div>
	{/if}

	<!-- ————— Body ————— -->
	<div class="min-h-0 flex-1 overflow-y-auto">
		{#if alertId === null}
			<div class="p-6 text-center text-sm text-muted-foreground">
				Select an alert to see its investigation flow.
			</div>
		{:else if loading && !overview}
			<div class="p-6 text-center text-sm text-muted-foreground">Loading…</div>
		{:else if !overview?.flow_id}
			<div class="p-6 text-center text-sm text-muted-foreground">
				No investigation flow is attached to this alert. Rules attach flows automatically — author
				or deploy one from Settings → Investigation flows.
			</div>
		{:else}
			<ol class="space-y-3 p-4">
				{#each overview.steps as step (step.step_id)}
					{@const progress = progressByStep().get(step.step_id)}
					{@const done = !!progress}
					{@const editingNote = noteEditingFor === step.step_id}
					<li
						class="group relative overflow-hidden rounded-lg border transition-colors {done
							? 'border-primary/30 bg-primary/5'
							: 'border-border bg-muted/30 hover:border-border/80'}"
					>
						<!-- Row: check button + title + description -->
						<div class="flex items-start gap-3 p-3">
							<button
								type="button"
								class="mt-0.5 shrink-0 rounded-full transition-transform hover:scale-110 active:scale-95"
								aria-pressed={done}
								aria-label={done ? 'Mark as not done' : 'Mark as done'}
								onclick={() => toggleStep(step.step_id, !done)}
							>
								{#if done}
									<CheckCircle2Icon class="h-5 w-5 text-primary" />
								{:else}
									<CircleIcon class="h-5 w-5 text-muted-foreground/60" />
								{/if}
							</button>

							<div class="min-w-0 flex-1">
								<div class="flex items-baseline gap-2">
									<span class="text-2xs font-medium tabular-nums text-muted-foreground">
										{step.step_order}.
									</span>
									<p
										class="text-sm font-medium leading-snug {done
											? 'text-foreground/90 line-through decoration-muted-foreground/40'
											: 'text-foreground'}"
									>
										{step.step_title}
									</p>
									{#if step.step_is_required}
										<span
											class="ml-auto shrink-0 rounded-full bg-red-500/10 px-1.5 py-0.5 text-2xs font-medium text-red-600"
											title="Required step"
										>
											Required
										</span>
									{/if}
								</div>

								{#if step.step_description}
									<!--
									  Markdown-rendered description — same
									  renderer used everywhere else (links,
									  fenced code, blockquotes / admonitions,
									  tables). DOMPurify runs on the sanitised
									  HTML inside MarkDownPreview.
									-->
									<div class="mt-2 text-xs text-muted-foreground/90">
										<MarkDownPreview markdown={step.step_description} />
									</div>
								{/if}
							</div>
						</div>

						<!-- Notes area — only when the step is checked -->
						{#if done}
							<div class="border-t border-primary/20 bg-muted/30 px-3 py-2">
								<div class="mb-1.5 flex items-center justify-between text-2xs">
									<span class="text-muted-foreground">
										Completed by
										<span class="font-medium text-foreground">
											{progress?.completed_by?.user_name ?? 'unknown'}
										</span>
										·
										{new Date(progress?.completed_at ?? '').toLocaleString()}
									</span>
									{#if !editingNote}
										<Button
											variant="ghost"
											size="xs"
											onclick={() => startEditingNote(step.step_id, progress?.note)}
										>
											<PencilLineIcon class="mr-1 h-3 w-3" />
											{progress?.note ? 'Edit note' : 'Add note'}
										</Button>
									{/if}
								</div>

								{#if editingNote}
									<MarkDownEditor
										value={noteDrafts[step.step_id] ?? progress?.note ?? ''}
										onChange={(v) => (noteDrafts = { ...noteDrafts, [step.step_id]: v })}
										onSave={() => saveNote(step.step_id)}
										initialMode="edit"
									/>
									<div class="mt-2 flex items-center justify-end gap-2">
										<Button
											size="sm"
											variant="ghost"
											onclick={() => {
												noteEditingFor = null;
												// Discard the in-flight draft so a future
												// re-open of the editor starts from the
												// persisted note.
												if (progress?.note !== undefined) {
													noteDrafts = {
														...noteDrafts,
														[step.step_id]: progress.note ?? ''
													};
												}
											}}
										>
											Cancel
										</Button>
										<Button size="sm" onclick={() => saveNote(step.step_id)}>Save note</Button>
									</div>
								{:else if progress?.note}
									<div class="text-xs">
										<MarkDownPreview markdown={progress.note} />
									</div>
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</div>
</div>

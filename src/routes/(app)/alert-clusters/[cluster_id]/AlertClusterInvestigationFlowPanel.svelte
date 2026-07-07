<!--
  Investigation-flow side pane for an cluster. Local to the alert cluster
  detail route (no cross-route context needed — an analyst only ever
  looks at one alert cluster at a time). Visual and interaction language
  mirrors `$lib/components/common/InvestigationFlow/InvestigationFlowPanel.svelte`
  so the alert and alert cluster checklists feel identical.

  Differences vs the alert pane:
    * Data source — `getAlertClusterProgress` + `recordAlertClusterProgress`.
    * `entity` is passed in as a prop instead of read from context, so
      the alert cluster detail page can render this pane without needing a
      workspace-level provider.
-->
<script lang="ts">
	import {
		CheckCircle2Icon,
		CheckSquareIcon,
		CircleIcon,
		PencilLineIcon,
		RefreshCwIcon,
		XIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { MarkDownEditor, MarkDownPreview } from '$lib/components/common/MarkDown';
	import { InvestigationFlowsService } from '$lib/services/investigation-flows.service';
	import type {
		InvestigationOverview,
		InvestigationProgress
	} from '$lib/types/resources/investigation-flow';
	import type { AlertCluster } from '$lib/types/resources/alert-cluster';

	let {
		cluster,
		onClose
	}: { cluster: AlertCluster; onClose: () => void } = $props();

	let overview = $state<InvestigationOverview | null>(null);
	let loading = $state(false);
	let noteDrafts = $state<Record<number, string>>({});
	let noteEditingFor = $state<number | null>(null);

	const load = async () => {
		loading = true;
		try {
			const res = await InvestigationFlowsService.getAlertClusterProgress(
				cluster.cluster_id
			);
			overview = (res.data as InvestigationOverview) ?? null;
		} finally {
			loading = false;
		}
	};

	$effect(() => {
		void cluster.cluster_id;
		void load();
		noteDrafts = {};
		noteEditingFor = null;
	});

	const progressByStep = $derived(() => {
		const map = new Map<number, InvestigationProgress>();
		for (const p of overview?.progress ?? []) map.set(p.step_id, p);
		return map;
	});

	const completedCount = $derived((overview?.progress ?? []).length);
	const totalSteps = $derived(overview?.steps?.length ?? 0);
	const percent = $derived(
		totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0
	);

	const toggleStep = async (stepId: number, checked: boolean) => {
		if (checked) {
			await InvestigationFlowsService.recordAlertClusterProgress(
				cluster.cluster_id,
				stepId,
				noteDrafts[stepId]
			);
		} else {
			await InvestigationFlowsService.uncheckAlertClusterProgress(
				cluster.cluster_id,
				stepId
			);
			noteEditingFor = null;
		}
		await load();
	};

	const saveNote = async (stepId: number) => {
		await InvestigationFlowsService.recordAlertClusterProgress(
			cluster.cluster_id,
			stepId,
			noteDrafts[stepId] ?? ''
		);
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

<!--
  No inner background — the host `<aside>` already provides `bg-card`,
  matching the visual weight of the comments pane. See the shared
  `InvestigationFlowPanel` for the rationale.
-->
<div class="flex h-full w-full flex-col">
	<header class="flex items-center justify-between border-b border-border px-4 py-3 dark:border-slate-700">
		<div class="flex min-w-0 items-center gap-2">
			<CheckSquareIcon class="h-4 w-4 shrink-0 text-primary" />
			<div class="min-w-0">
				<p class="text-sm font-semibold">Investigation flow</p>
				{#if overview?.flow_name}
					<p class="truncate text-xs text-muted-foreground">{overview.flow_name}</p>
				{/if}
			</div>
		</div>
		<div class="flex shrink-0 items-center gap-1">
			<Button
				variant="ghost"
				size="icon"
				onclick={load}
				disabled={loading}
				aria-label="Refresh"
			>
				<RefreshCwIcon class="h-4 w-4 {loading ? 'animate-spin' : ''}" />
			</Button>
			<Button variant="ghost" size="icon" onclick={onClose} aria-label="Close">
				<XIcon class="h-4 w-4" />
			</Button>
		</div>
	</header>

	{#if overview?.flow_id && totalSteps > 0}
		<div class="border-b border-border px-4 py-2.5">
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

	<div class="flex-1 overflow-y-auto">
		{#if loading && !overview}
			<div class="p-6 text-center text-sm text-muted-foreground">Loading…</div>
		{:else if !overview?.flow_id}
			<div class="p-6 text-center text-sm text-muted-foreground">
				No investigation flow attached to this cluster.
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
									<div class="mt-2 text-xs text-muted-foreground/90">
										<MarkDownPreview markdown={step.step_description} />
									</div>
								{/if}
							</div>
						</div>

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
										onChange={(v: string) =>
											(noteDrafts = { ...noteDrafts, [step.step_id]: v })}
										onSave={() => saveNote(step.step_id)}
										initialMode="edit"
									/>
									<div class="mt-2 flex items-center justify-end gap-2">
										<Button
											size="sm"
											variant="ghost"
											onclick={() => {
												noteEditingFor = null;
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
										<Button size="sm" onclick={() => saveNote(step.step_id)}>
											Save note
										</Button>
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

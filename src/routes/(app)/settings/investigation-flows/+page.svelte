<!--
  Investigation-flow authoring.

  A flow declares:
    * `flow_target` — which entity it can attach to (alert / alert cluster / both)
    * `flow_conditions` — the same AND/OR DSL as clustering rules, edited
      through the shared ConditionsBuilder
    * `steps` — the ordered checklist analysts work through in the
      alert / alert cluster left pane

  Two additional behaviours beyond CRUD:
    * On save, the backend Celery hooks re-evaluate flow attachment
      against new alerts / alert clusters automatically.
    * "Deploy to existing" attaches this flow to *historical* alerts
      / alert clusters whose contents match its conditions and that don't
      already have a flow attached (see `deploy_flow` in the business
      layer).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import {
		ArrowDownIcon,
		ArrowUpIcon,
		CheckSquareIcon,
		ListChecksIcon,
		PlusIcon,
		RocketIcon,
		SaveIcon,
		Trash2Icon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Tabs from '$lib/components/ui/tabs';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Loading } from '$lib/components/ui/loading';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/components/ui/toast';
	import { MarkDownEditor } from '$lib/components/common/MarkDown';
	import ConditionsBuilder, {
		emptyRootGroup,
		type GroupNode
	} from '$lib/components/common/ConditionsBuilder/ConditionsBuilder.svelte';
	import { InvestigationFlowsService } from '$lib/services/investigation-flows.service';
	import type {
		DeployFlowResult,
		FlowTarget,
		InvestigationFlow,
		InvestigationFlowStep
	} from '$lib/types/resources/investigation-flow';

	let flows = $state<InvestigationFlow[]>([]);
	let selected = $state<InvestigationFlow | null>(null);
	let loading = $state(false);

	// Local editors for the selected flow's own-conditions + metadata.
	// We snapshot on selection and push back to the API on Save so
	// individual keystrokes don't spam PUT.
	let editTarget = $state<FlowTarget>('alert');
	let editPriority = $state<number>(100);
	let editConditions = $state<GroupNode>(emptyRootGroup());

	// ---- Create-flow dialog ----
	let createOpen = $state(false);
	let createName = $state('');
	let createDescription = $state('');
	let createBusy = $state(false);

	// ---- Rename-flow dialog ----
	let renameOpen = $state(false);
	let renameName = $state('');
	let renameBusy = $state(false);

	// ---- Delete-flow confirmation ----
	let deleteOpen = $state(false);

	// ---- Deploy result feedback ----
	let deploying = $state(false);

	// ---- Step editor ----
	// Steps are edited one at a time in a full-height pane next to the
	// step list. Only the open step can hold unsaved edits: it is saved
	// before the user moves to another step / flow / page, and before
	// anything that reloads the flow (which would drop the edits).
	let tab = $state<'steps' | 'matching'>('steps');
	let activeStepId = $state<number | null>(null);
	let dirtyStepId = $state<number | null>(null);
	let stepToDelete = $state<InvestigationFlowStep | null>(null);
	let stepDeleteOpen = $state(false);

	const sortedSteps = $derived(
		(selected?.steps ?? []).slice().sort((a, b) => a.step_order - b.step_order)
	);
	// Falls back to the first step when nothing (or a step of another
	// flow) is selected.
	const activeStep = $derived(
		sortedSteps.find((s) => s.step_id === activeStepId) ?? sortedSteps[0] ?? null
	);

	const showError = (msg: string, detail?: string) =>
		toast({ title: msg, description: detail, variant: 'destructive' });
	const showSuccess = (msg: string) => toast({ title: msg, variant: 'success' });

	const load = async () => {
		// The reload replaces the step objects; don't let it eat edits.
		await flushActiveStep();
		loading = true;
		try {
			const res = await InvestigationFlowsService.list();
			if (!res.ok) {
				showError('Failed to load investigation flows', res.error?.message);
				return;
			}

			flows = (res.data as InvestigationFlow[]) ?? [];
			if (selected) {
				const refreshed = flows.find((f) => f.flow_id === selected!.flow_id) ?? null;
				setSelected(refreshed);
			}
		} finally {
			loading = false;
		}
	};

	const selectFlow = async (flow: InvestigationFlow) => {
		await flushActiveStep();
		activeStepId = null;
		setSelected(flow);
	};

	const setSelected = (flow: InvestigationFlow | null) => {
		selected = flow;
		if (!flow) return;
		editTarget = (flow.flow_target ?? 'alert') as FlowTarget;
		editPriority = flow.flow_priority ?? 100;
		const c = flow.flow_conditions ?? { logic: 'and', conditions: [] };
		editConditions = {
			logic: (c.logic as 'and' | 'or') ?? 'and',
			conditions: (c.conditions as GroupNode['conditions']) ?? []
		};
	};

	// ---- Create ----
	const openCreate = () => {
		createName = '';
		createDescription = '';
		createOpen = true;
	};

	const submitCreate = async () => {
		const name = createName.trim();
		if (!name) {
			showError('Flow name is required');
			return;
		}
		createBusy = true;
		try {
			const res = await InvestigationFlowsService.create({
				flow_name: name,
				flow_description: createDescription.trim() || undefined,
				flow_target: 'alert',
				flow_conditions: { logic: 'and', conditions: [] }
			});
			if (!res.ok) {
				showError('Failed to create flow', res.error?.message);
				return;
			}

			createOpen = false;
			await load();
			const created =
				res.data && typeof res.data === 'object' ? (res.data as InvestigationFlow) : null;
			if (created) setSelected(flows.find((f) => f.flow_id === created.flow_id) ?? created);
			showSuccess('Flow created');
		} finally {
			createBusy = false;
		}
	};

	// ---- Rename ----
	const openRename = () => {
		if (!selected) return;
		renameName = selected.flow_name;
		renameOpen = true;
	};

	const submitRename = async () => {
		if (!selected) return;
		const name = renameName.trim();
		if (!name) {
			showError('Flow name cannot be empty');
			return;
		}
		renameBusy = true;
		try {
			const res = await InvestigationFlowsService.update(selected.flow_id, { flow_name: name });
			if (!res.ok) {
				showError('Failed to rename flow', res.error?.message);
				return;
			}

			renameOpen = false;
			await load();
			showSuccess('Flow renamed');
		} finally {
			renameBusy = false;
		}
	};

	// ---- Save metadata + conditions ----
	const saveMetadata = async () => {
		if (!selected) return;

		const res = await InvestigationFlowsService.update(selected.flow_id, {
			flow_target: editTarget,
			flow_priority: editPriority,
			flow_conditions: {
				logic: editConditions.logic,
				conditions: editConditions.conditions
			}
		});
		if (!res.ok) {
			showError('Failed to save flow', res.error?.message);
			return;
		}

		await load();
		showSuccess('Flow saved');
	};

	// ---- Delete ----
	const confirmDelete = async () => {
		if (!selected) return;

		const res = await InvestigationFlowsService.remove(selected.flow_id);
		if (!res.ok) {
			showError('Failed to delete flow', res.error?.message);
			return;
		}

		selected = null;
		dirtyStepId = null;
		await load();
		showSuccess('Flow deleted');
	};

	// ---- Deploy ----
	const deploy = async () => {
		if (!selected) return;
		deploying = true;
		try {
			const res = await InvestigationFlowsService.deploy(selected.flow_id);
			if (!res.ok) {
				showError('Deploy failed', res.error?.message);
				return;
			}

			const payload =
				res.data && typeof res.data === 'object' ? (res.data as DeployFlowResult) : null;
			if (!payload) {
				showError('Deploy failed', 'The server returned an unexpected response.');
				return;
			}

			const parts: string[] = [];
			if (payload.alerts_attached > 0) parts.push(`${payload.alerts_attached} alert(s)`);
			if (payload.clusters_attached > 0)
				parts.push(`${payload.clusters_attached} alert cluster(s)`);
			showSuccess(parts.length ? `Attached to ${parts.join(', ')}` : 'No matches found');
		} finally {
			deploying = false;
		}
	};

	// ---- Steps ----
	const addStep = async () => {
		if (!selected) return;
		await flushActiveStep();
		const order = (sortedSteps.at(-1)?.step_order ?? 0) + 1;

		const res = await InvestigationFlowsService.createStep(selected.flow_id, {
			step_order: order,
			step_title: `Step ${order}`
		});
		if (!res.ok) {
			showError('Failed to add step', res.error?.message);
			return;
		}

		await load();
		// Open the new step straight away.
		activeStepId = sortedSteps.at(-1)?.step_id ?? null;
	};

	const removeStep = async (step: InvestigationFlowStep) => {
		if (!selected) return;
		const idx = sortedSteps.findIndex((s) => s.step_id === step.step_id);
		const neighbour = sortedSteps[idx + 1] ?? sortedSteps[idx - 1] ?? null;

		const res = await InvestigationFlowsService.deleteStep(selected.flow_id, step.step_id);
		if (!res.ok) {
			showError('Failed to delete step', res.error?.message);
			return;
		}

		if (dirtyStepId === step.step_id) dirtyStepId = null;
		activeStepId = neighbour?.step_id ?? null;
		await load();
	};

	const saveStep = async (step: InvestigationFlowStep, notify = false) => {
		if (!selected) return;

		const res = await InvestigationFlowsService.updateStep(selected.flow_id, step.step_id, {
			step_title: step.step_title,
			step_description: step.step_description ?? '',
			step_order: step.step_order,
			step_is_required: step.step_is_required
		});
		if (!res.ok) {
			showError('Failed to save step', res.error?.message);
			return;
		}
		if (dirtyStepId === step.step_id) dirtyStepId = null;
		if (notify) showSuccess('Step saved');
	};

	const flushActiveStep = async () => {
		if (dirtyStepId === null) return;
		const step = sortedSteps.find((s) => s.step_id === dirtyStepId);
		if (step) await saveStep(step);
		else dirtyStepId = null;
	};

	const selectStep = async (step: InvestigationFlowStep) => {
		if (step.step_id === activeStep?.step_id) return;
		await flushActiveStep();
		activeStepId = step.step_id;
	};

	// Swap two adjacent steps by trading `step_order`.
	const swap = async (a: InvestigationFlowStep, b: InvestigationFlowStep) => {
		if (!selected) return;
		await flushActiveStep();
		const orderA = a.step_order;

		const first = await InvestigationFlowsService.updateStep(selected.flow_id, a.step_id, {
			step_order: b.step_order
		});
		if (!first.ok) {
			showError('Failed to reorder step', first.error?.message);
			return;
		}

		const second = await InvestigationFlowsService.updateStep(selected.flow_id, b.step_id, {
			step_order: orderA
		});
		if (!second.ok) {
			showError(
				'Failed to reorder step',
				second.error?.message ?? 'The steps may now be out of order.'
			);
		}

		await load();
	};

	// Leaving the page saves the open step rather than dropping its edits.
	beforeNavigate(() => {
		void flushActiveStep();
	});

	onMount(load);
</script>

<svelte:head>
	<title>Investigation flows</title>
</svelte:head>

<div class="flex h-full min-h-0 w-full flex-col gap-4 p-4">
	<header class="flex items-center justify-between border-b pb-3">
		<div class="flex items-center gap-2">
			<ListChecksIcon class="h-5 w-5 text-muted-foreground" />
			<div>
				<h1 class="text-base font-semibold">Investigation flows</h1>
				<p class="text-2xs uppercase tracking-wide text-muted-foreground">
					Guided triage checklists · attached to alerts and/or alert clusters on match
				</p>
			</div>
		</div>
		<Button onclick={openCreate}>
			<PlusIcon class="mr-2 h-4 w-4" /> New flow
		</Button>
	</header>

	<div class="grid min-h-0 flex-1 grid-cols-[280px_1fr] gap-4">
		<!-- Flow list -->
		<aside class="flex min-h-0 flex-col overflow-y-auto rounded-md border">
			<div class="border-b px-3 py-2 text-2xs uppercase tracking-wide text-muted-foreground">
				Flows ({flows.length})
			</div>
			{#if loading}
				<div class="p-3"><Loading /></div>
			{:else if flows.length === 0}
				<p class="p-3 text-sm text-muted-foreground">
					No flows yet. Create one to guide analysts through repeatable triage.
				</p>
			{:else}
				<ul class="flex flex-col gap-0.5 p-2">
					{#each flows as flow (flow.flow_id)}
						{@const active = selected?.flow_id === flow.flow_id}
						<li>
							<button
								type="button"
								class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors {active
									? 'bg-primary/10 font-medium text-foreground'
									: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
								onclick={() => selectFlow(flow)}
								aria-current={active ? 'page' : undefined}
							>
								<CheckSquareIcon class="h-4 w-4 shrink-0" />
								<span class="min-w-0 flex-1 truncate">{flow.flow_name}</span>
								<span
									class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground"
								>
									{flow.flow_target ?? 'alert'}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</aside>

		<!-- Editor -->
		<main class="flex min-h-0 flex-col overflow-hidden rounded-md border bg-card">
			{#if !selected}
				<div class="flex flex-1 items-center justify-center p-8">
					<p class="text-sm text-muted-foreground">Select a flow, or create a new one.</p>
				</div>
			{:else}
				<header class="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3">
					<div class="min-w-0">
						<h2 class="truncate text-base font-semibold">{selected.flow_name}</h2>
						{#if selected.flow_description}
							<p class="mt-0.5 truncate text-xs text-muted-foreground">
								{selected.flow_description}
							</p>
						{/if}
					</div>
					<div class="flex shrink-0 gap-2">
						<Button variant="outline" size="sm" onclick={openRename}>Rename</Button>
						<Button variant="destructive" size="sm" onclick={() => (deleteOpen = true)}>
							<Trash2Icon class="mr-2 h-4 w-4" /> Delete
						</Button>
					</div>
				</header>

				<!--
				  Steps and matching rules each get the whole pane: stacked,
				  the steps were left a sliver at the bottom, scrolling inside
				  an already scrolling pane.
				-->
				<Tabs.Root bind:value={tab} class="flex min-h-0 flex-1 flex-col">
					<div class="shrink-0 border-b px-4 py-2">
						<Tabs.List>
							<Tabs.Trigger value="steps">Steps ({sortedSteps.length})</Tabs.Trigger>
							<Tabs.Trigger value="matching">Matching &amp; attachment</Tabs.Trigger>
						</Tabs.List>
					</div>

					<Tabs.Content
						value="steps"
						class="mt-0 grid min-h-0 flex-1 grid-cols-[260px_1fr] overflow-hidden"
					>
						<!-- Step list -->
						<div class="flex min-h-0 flex-col border-r">
							<div class="flex shrink-0 items-center justify-between px-3 py-2">
								<p class="text-2xs uppercase tracking-wide text-muted-foreground">
									Checklist order
								</p>
								<Button size="xs" variant="outline" onclick={addStep}>
									<PlusIcon class="mr-1 h-3.5 w-3.5" /> Add step
								</Button>
							</div>
							{#if sortedSteps.length === 0}
								<p class="px-3 py-2 text-sm text-muted-foreground">
									No steps yet. Steps appear to analysts in the entity's investigation-flow pane.
								</p>
							{:else}
								<ol class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 pt-0">
									{#each sortedSteps as step, idx (step.step_id)}
										{@const active = activeStep?.step_id === step.step_id}
										<li
											class="group flex items-center gap-1 rounded-md pr-1 transition-colors {active
												? 'bg-primary/10'
												: 'hover:bg-muted'}"
										>
											<button
												type="button"
												class="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
												onclick={() => selectStep(step)}
												aria-current={active ? 'step' : undefined}
											>
												<span
													class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-2xs font-medium {active
														? 'bg-primary text-primary-foreground'
														: 'bg-muted text-muted-foreground'}"
												>
													{idx + 1}
												</span>
												<span
													class="min-w-0 flex-1 truncate {active
														? 'font-medium text-foreground'
														: 'text-muted-foreground'}"
												>
													{step.step_title || 'Untitled step'}
												</span>
												{#if dirtyStepId === step.step_id}
													<span
														class="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
														title="Unsaved changes"
													></span>
												{/if}
												{#if step.step_is_required}
													<span
														class="shrink-0 rounded bg-muted px-1 py-0.5 text-2xs text-muted-foreground"
														title="Required step">req.</span
													>
												{/if}
											</button>
											<div
												class="flex shrink-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 {active
													? 'opacity-100'
													: 'opacity-0'}"
											>
												<Button
													size="icon"
													variant="ghost"
													class="h-6 w-6"
													disabled={idx === 0}
													onclick={() => swap(step, sortedSteps[idx - 1])}
													aria-label="Move step up"
												>
													<ArrowUpIcon class="h-3.5 w-3.5" />
												</Button>
												<Button
													size="icon"
													variant="ghost"
													class="h-6 w-6"
													disabled={idx === sortedSteps.length - 1}
													onclick={() => swap(step, sortedSteps[idx + 1])}
													aria-label="Move step down"
												>
													<ArrowDownIcon class="h-3.5 w-3.5" />
												</Button>
											</div>
										</li>
									{/each}
								</ol>
							{/if}
						</div>

						<!-- Open step -->
						{#if activeStep}
							{@const step = activeStep}
							<section class="flex min-h-0 min-w-0 flex-col">
								<div class="flex shrink-0 items-center gap-3 border-b px-4 py-3">
									<Input
										class="h-9 flex-1 text-base font-medium"
										bind:value={step.step_title}
										oninput={() => (dirtyStepId = step.step_id)}
										onblur={() => {
											if (dirtyStepId === step.step_id) void saveStep(step);
										}}
										placeholder="Step title"
										aria-label="Step title"
									/>
									<label
										class="inline-flex shrink-0 items-center gap-2 text-xs text-muted-foreground"
									>
										<input
											type="checkbox"
											bind:checked={step.step_is_required}
											onchange={() => saveStep(step)}
										/>
										Required
									</label>
									<Button
										size="sm"
										onclick={() => saveStep(step, true)}
										disabled={dirtyStepId !== step.step_id}
									>
										<SaveIcon class="mr-2 h-4 w-4" />
										{dirtyStepId === step.step_id ? 'Save' : 'Saved'}
									</Button>
									<Button
										size="icon"
										variant="ghost"
										onclick={() => {
											stepToDelete = step;
											stepDeleteOpen = true;
										}}
										aria-label="Delete step"
									>
										<Trash2Icon class="h-4 w-4 text-destructive" />
									</Button>
								</div>
								<!--
								  Same markdown editor analysts get for comments and
								  notes, opened straight in edit mode (the preview toggle
								  is in its toolbar). ⌘/Ctrl-S saves; the open step is
								  also saved when moving to another step, flow or page.
								-->
								<div class="min-h-0 flex-1 overflow-y-auto p-4">
									<p class="mb-1 text-2xs uppercase tracking-wide text-muted-foreground">
										Description — what the analyst should do and check
									</p>
									{#key step.step_id}
										<div class="[&_.tiptap]:min-h-[50vh]">
											<MarkDownEditor
												value={step.step_description ?? ''}
												onChange={(v: string) => {
													if (v === (step.step_description ?? '')) return;
													step.step_description = v;
													dirtyStepId = step.step_id;
												}}
												onSave={() => saveStep(step, true)}
												initialMode="edit"
											/>
										</div>
									{/key}
								</div>
							</section>
						{:else}
							<div class="flex items-center justify-center p-8">
								<Button onclick={addStep}>
									<PlusIcon class="mr-2 h-4 w-4" /> Add the first step
								</Button>
							</div>
						{/if}
					</Tabs.Content>

					<Tabs.Content value="matching" class="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
						<div class="grid max-w-3xl gap-3 sm:grid-cols-2">
							<div class="flex flex-col gap-1">
								<label
									for="flow-target"
									class="text-2xs uppercase tracking-wide text-muted-foreground">Attach to</label
								>
								<select
									id="flow-target"
									class="h-9 rounded-md border bg-background px-2 text-sm"
									bind:value={editTarget}
								>
									<option value="alert">Alerts only</option>
									<option value="alert_cluster">Alert clusters only</option>
									<option value="both">Both alerts and alert clusters</option>
								</select>
							</div>
							<div class="flex flex-col gap-1">
								<label
									for="flow-priority"
									class="text-2xs uppercase tracking-wide text-muted-foreground"
									>Priority (lower first)</label
								>
								<Input id="flow-priority" type="number" bind:value={editPriority} />
							</div>
						</div>

						<p class="mb-2 mt-4 text-2xs uppercase tracking-wide text-muted-foreground">
							Match conditions (empty = never auto-attaches)
						</p>
						<ConditionsBuilder
							bind:value={editConditions}
							target={editTarget === 'alert_cluster' ? 'alert_cluster' : 'alert'}
						/>

						<div class="mt-4 flex flex-wrap items-center gap-2">
							<Button onclick={saveMetadata}>Save changes</Button>
							<Button variant="outline" onclick={deploy} disabled={deploying}>
								<RocketIcon class="mr-2 h-4 w-4" />
								{deploying ? 'Deploying…' : 'Deploy to existing'}
							</Button>
							<span class="text-xs text-muted-foreground">
								Deploy back-fills this flow onto historical alerts / alert clusters that match and
								don't already have a flow attached.
							</span>
						</div>
					</Tabs.Content>
				</Tabs.Root>
			{/if}
		</main>
	</div>
</div>

<!-- Create-flow modal -->
<Dialog.Root bind:open={createOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>New investigation flow</Dialog.Title>
			<Dialog.Description>
				Give the flow a clear name — analysts will see it in the left pane of any alert or alert
				cluster it attaches to. You'll set the match conditions after creating it.
			</Dialog.Description>
		</Dialog.Header>
		<div class="flex flex-col gap-3 pt-2">
			<div class="flex flex-col gap-1">
				<label for="create-flow-name" class="text-2xs uppercase tracking-wide text-muted-foreground"
					>Name</label
				>
				<Input
					id="create-flow-name"
					placeholder="Brute-force triage"
					bind:value={createName}
					disabled={createBusy}
				/>
			</div>
			<div class="flex flex-col gap-1">
				<label for="create-flow-desc" class="text-2xs uppercase tracking-wide text-muted-foreground"
					>Description</label
				>
				<Textarea
					id="create-flow-desc"
					rows={3}
					bind:value={createDescription}
					disabled={createBusy}
					placeholder="Optional — what this flow is for"
				/>
			</div>
		</div>
		<Dialog.Footer class="pt-3">
			<Button variant="outline" onclick={() => (createOpen = false)} disabled={createBusy}>
				Cancel
			</Button>
			<Button onclick={submitCreate} disabled={createBusy}>
				{createBusy ? 'Saving…' : 'Create'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Rename-flow modal -->
<Dialog.Root bind:open={renameOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Rename flow</Dialog.Title>
		</Dialog.Header>
		<div class="flex flex-col gap-1 pt-2">
			<label for="rename-flow-name" class="text-2xs uppercase tracking-wide text-muted-foreground"
				>Name</label
			>
			<Input id="rename-flow-name" bind:value={renameName} disabled={renameBusy} />
		</div>
		<Dialog.Footer class="pt-3">
			<Button variant="outline" onclick={() => (renameOpen = false)} disabled={renameBusy}>
				Cancel
			</Button>
			<Button onclick={submitRename} disabled={renameBusy}>
				{renameBusy ? 'Saving…' : 'Save'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete confirmation -->
<ConfirmationDialog
	bind:open={deleteOpen}
	title="Delete flow?"
	message={selected
		? `Delete "${selected.flow_name}" and all its steps? Alerts and clusters using it lose their checklist and its progress. This cannot be undone.`
		: 'Delete this flow?'}
	confirmText="Delete"
	confirmButtonVariant="destructive"
	onConfirm={confirmDelete}
/>

<ConfirmationDialog
	bind:open={stepDeleteOpen}
	title="Delete step?"
	message={stepToDelete
		? `Delete "${stepToDelete.step_title || 'Untitled step'}" and its description? This cannot be undone.`
		: 'Delete this step?'}
	confirmText="Delete"
	confirmButtonVariant="destructive"
	onConfirm={() => {
		if (stepToDelete) void removeStep(stepToDelete);
	}}
/>

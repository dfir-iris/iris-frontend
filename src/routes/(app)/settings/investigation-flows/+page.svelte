<!--
  Investigation-flow authoring.

  A flow declares:
    * `flow_target` — which entity it can attach to (alert / incident / both)
    * `flow_conditions` — the same AND/OR DSL as incident rules, edited
      through the shared ConditionsBuilder
    * `steps` — the ordered checklist analysts work through in the
      alert / incident left pane

  Two additional behaviours beyond CRUD:
    * On save, the backend Celery hooks re-evaluate flow attachment
      against new alerts / incidents automatically.
    * "Deploy to existing" attaches this flow to *historical* alerts
      / incidents whose contents match its conditions and that don't
      already have a flow attached (see `deploy_flow` in the business
      layer).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		ArrowDownIcon,
		ArrowUpIcon,
		CheckSquareIcon,
		ListChecksIcon,
		PlusIcon,
		RocketIcon,
		Trash2Icon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
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

	const showError = (msg: string) => toast({ title: msg, variant: 'destructive' });
	const showSuccess = (msg: string) => toast({ title: msg, variant: 'success' });

	const load = async () => {
		loading = true;
		try {
			const res = await InvestigationFlowsService.list();
			flows = (res.data as InvestigationFlow[]) ?? [];
			if (selected) {
				const refreshed = flows.find((f) => f.flow_id === selected!.flow_id) ?? null;
				setSelected(refreshed);
			}
		} catch {
			showError('Failed to load investigation flows');
		} finally {
			loading = false;
		}
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
			createOpen = false;
			await load();
			const created = res.data && typeof res.data === 'object' ? (res.data as InvestigationFlow) : null;
			if (created) setSelected(flows.find((f) => f.flow_id === created.flow_id) ?? created);
			showSuccess('Flow created');
		} catch {
			showError('Failed to create flow');
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
			await InvestigationFlowsService.update(selected.flow_id, { flow_name: name });
			renameOpen = false;
			await load();
			showSuccess('Flow renamed');
		} catch {
			showError('Failed to rename flow');
		} finally {
			renameBusy = false;
		}
	};

	// ---- Save metadata + conditions ----
	const saveMetadata = async () => {
		if (!selected) return;
		try {
			await InvestigationFlowsService.update(selected.flow_id, {
				flow_target: editTarget,
				flow_priority: editPriority,
				flow_conditions: {
					logic: editConditions.logic,
					conditions: editConditions.conditions
				}
			});
			await load();
			showSuccess('Flow saved');
		} catch {
			showError('Failed to save flow');
		}
	};

	// ---- Delete ----
	const confirmDelete = async () => {
		if (!selected) return;
		try {
			await InvestigationFlowsService.remove(selected.flow_id);
			selected = null;
			await load();
			showSuccess('Flow deleted');
		} catch {
			showError('Failed to delete flow');
		}
	};

	// ---- Deploy ----
	const deploy = async () => {
		if (!selected) return;
		deploying = true;
		try {
			const res = await InvestigationFlowsService.deploy(selected.flow_id);
			const payload =
				res.data && typeof res.data === 'object' ? (res.data as DeployFlowResult) : null;
			if (payload) {
				const parts: string[] = [];
				if (payload.alerts_attached > 0)
					parts.push(`${payload.alerts_attached} alert(s)`);
				if (payload.incidents_attached > 0)
					parts.push(`${payload.incidents_attached} incident(s)`);
				const msg = parts.length ? `Attached to ${parts.join(', ')}` : 'No matches found';
				showSuccess(msg);
			}
		} catch {
			showError('Deploy failed');
		} finally {
			deploying = false;
		}
	};

	// ---- Steps ----
	const addStep = async () => {
		if (!selected) return;
		const order = (selected.steps?.length ?? 0) + 1;
		try {
			await InvestigationFlowsService.createStep(selected.flow_id, {
				step_order: order,
				step_title: `Step ${order}`
			});
			await load();
		} catch {
			showError('Failed to add step');
		}
	};

	const removeStep = async (step: InvestigationFlowStep) => {
		if (!selected) return;
		try {
			await InvestigationFlowsService.deleteStep(selected.flow_id, step.step_id);
			await load();
		} catch {
			showError('Failed to delete step');
		}
	};

	const saveStep = async (step: InvestigationFlowStep) => {
		if (!selected) return;
		try {
			await InvestigationFlowsService.updateStep(selected.flow_id, step.step_id, {
				step_title: step.step_title,
				step_description: step.step_description ?? '',
				step_order: step.step_order,
				step_is_required: step.step_is_required
			});
		} catch {
			showError('Failed to save step');
		}
	};

	// Swap two adjacent steps by trading `step_order`.
	const swap = async (a: InvestigationFlowStep, b: InvestigationFlowStep) => {
		if (!selected) return;
		const orderA = a.step_order;
		try {
			await InvestigationFlowsService.updateStep(selected.flow_id, a.step_id, {
				step_order: b.step_order
			});
			await InvestigationFlowsService.updateStep(selected.flow_id, b.step_id, {
				step_order: orderA
			});
			await load();
		} catch {
			showError('Failed to reorder step');
		}
	};

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
					Guided triage checklists · attached to alerts and/or incidents on match
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
								onclick={() => setSelected(flow)}
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
		<main class="flex min-h-0 flex-col overflow-y-auto rounded-md border bg-card">
			{#if !selected}
				<div class="flex flex-1 items-center justify-center p-8">
					<p class="text-sm text-muted-foreground">
						Select a flow, or create a new one.
					</p>
				</div>
			{:else}
				<header class="flex items-center justify-between border-b p-4">
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

				<!-- Metadata + conditions -->
				<section class="border-b p-4">
					<p class="mb-3 text-2xs uppercase tracking-wide text-muted-foreground">
						Attachment
					</p>
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="flex flex-col gap-1">
							<label
								for="flow-target"
								class="text-2xs uppercase tracking-wide text-muted-foreground"
								>Attach to</label
							>
							<select
								id="flow-target"
								class="h-9 rounded-md border bg-background px-2 text-sm"
								bind:value={editTarget}
							>
								<option value="alert">Alerts only</option>
								<option value="incident">Incidents only</option>
								<option value="both">Both alerts and incidents</option>
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
					<ConditionsBuilder bind:value={editConditions} target={editTarget === 'incident' ? 'incident' : 'alert'} />

					<div class="mt-4 flex flex-wrap items-center gap-2">
						<Button onclick={saveMetadata}>Save changes</Button>
						<Button variant="outline" onclick={deploy} disabled={deploying}>
							<RocketIcon class="mr-2 h-4 w-4" />
							{deploying ? 'Deploying…' : 'Deploy to existing'}
						</Button>
						<span class="text-xs text-muted-foreground">
							Deploy back-fills this flow onto historical alerts / incidents that
							match and don't already have a flow attached.
						</span>
					</div>
				</section>

				<!-- Steps -->
				<div class="flex items-center justify-between border-b px-4 py-2">
					<p class="text-2xs uppercase tracking-wide text-muted-foreground">
						Steps ({selected.steps?.length ?? 0})
					</p>
					<Button size="sm" onclick={addStep}>
						<PlusIcon class="mr-2 h-4 w-4" /> Add step
					</Button>
				</div>

				<div class="flex-1 overflow-y-auto p-4">
					{#if (selected.steps ?? []).length === 0}
						<p class="text-sm text-muted-foreground">
							No steps yet. Steps appear to analysts in the entity's investigation-flow pane.
						</p>
					{:else}
						{@const sorted = (selected.steps ?? [])
							.slice()
							.sort((a, b) => a.step_order - b.step_order)}
						<ol class="space-y-3">
							{#each sorted as step, idx (step.step_id)}
								<li class="rounded-md border bg-background p-3 shadow-sm">
									<div class="flex items-start gap-2">
										<span
											class="mt-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-2xs font-medium"
										>
											{step.step_order}
										</span>
										<div class="min-w-0 flex-1">
											<Input
												bind:value={step.step_title}
												onblur={() => saveStep(step)}
												placeholder="Step title"
											/>
											<!--
											  Rich markdown description editor — same one
											  analysts use for comments and case notes, so
											  step descriptions support links, fenced code
											  blocks, admonition-style blockquotes, tables,
											  and mentions. `initialMode="edit-preview"`
											  is a split view: authoring on the left, live
											  preview on the right, so authors can see what
											  analysts will see in the pane. onSave fires
											  on ⌘/Ctrl-S; the explicit "Save" button below
											  makes it discoverable.
											-->
											<label
												for="step-desc-{step.step_id}"
												class="mt-2 block text-2xs uppercase tracking-wide text-muted-foreground"
											>
												Description
											</label>
											<div id="step-desc-{step.step_id}" class="mt-1">
												<MarkDownEditor
													value={step.step_description ?? ''}
													onChange={(v: string) =>
														(step.step_description = v)}
													onSave={() => saveStep(step)}
													initialMode="edit-preview"
												/>
											</div>
											<div class="mt-1 flex items-center justify-between">
												<label
													class="inline-flex items-center gap-2 text-xs text-muted-foreground"
												>
													<input
														type="checkbox"
														bind:checked={step.step_is_required}
														onchange={() => saveStep(step)}
													/>
													Required step
												</label>
												<Button
													size="xs"
													variant="outline"
													onclick={() => saveStep(step)}
												>
													Save description
												</Button>
											</div>
										</div>
										<div class="flex shrink-0 flex-col gap-1">
											<Button
												size="icon"
												variant="ghost"
												disabled={idx === 0}
												onclick={() => swap(step, sorted[idx - 1])}
												aria-label="Move step up"
											>
												<ArrowUpIcon class="h-4 w-4" />
											</Button>
											<Button
												size="icon"
												variant="ghost"
												disabled={idx === sorted.length - 1}
												onclick={() => swap(step, sorted[idx + 1])}
												aria-label="Move step down"
											>
												<ArrowDownIcon class="h-4 w-4" />
											</Button>
											<Button
												size="icon"
												variant="ghost"
												onclick={() => removeStep(step)}
												aria-label="Delete step"
											>
												<Trash2Icon class="h-4 w-4 text-destructive" />
											</Button>
										</div>
									</div>
								</li>
							{/each}
						</ol>
					{/if}
				</div>
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
				Give the flow a clear name — analysts will see it in the left pane of any alert or
				incident it attaches to. You'll set the match conditions after creating it.
			</Dialog.Description>
		</Dialog.Header>
		<div class="flex flex-col gap-3 pt-2">
			<div class="flex flex-col gap-1">
				<label
					for="create-flow-name"
					class="text-2xs uppercase tracking-wide text-muted-foreground">Name</label
				>
				<Input
					id="create-flow-name"
					placeholder="Brute-force triage"
					bind:value={createName}
					disabled={createBusy}
				/>
			</div>
			<div class="flex flex-col gap-1">
				<label
					for="create-flow-desc"
					class="text-2xs uppercase tracking-wide text-muted-foreground">Description</label
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
			<label
				for="rename-flow-name"
				class="text-2xs uppercase tracking-wide text-muted-foreground">Name</label
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
		? `Delete "${selected.flow_name}" and all its steps? This cannot be undone.`
		: 'Delete this flow?'}
	confirmText="Delete"
	confirmButtonVariant="destructive"
	onConfirm={confirmDelete}
/>

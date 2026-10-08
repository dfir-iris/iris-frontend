<!--
  AI workflow editor (`/settings/ai-workflows/new` creates one).

  Header: name, active, validate / save / versions / run. Left panel:
  the workflow settings (trigger, scope, audience, budgets, write
  allowlist, owner). Centre: the xyflow canvas with its palette. Right
  drawer: the selected node's config.

  Canvas nodes / edges are raw arrays bound to xyflow; each node's
  label and config live in the deep-reactive `meta` map, shared with the
  node components through context. `flowToGraph` folds them back into
  the stored graph for validate / save.
-->
<script lang="ts">
	import { getContext, onMount, setContext } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import {
		ArrowLeftIcon,
		CheckCircle2Icon,
		CircleAlertIcon,
		HistoryIcon,
		ListIcon,
		PanelLeftIcon,
		PlayIcon,
		SaveIcon,
		ShieldCheckIcon,
		TriangleAlertIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import * as Dialog from '$lib/components/ui/dialog';
	import { toast } from '$lib/components/ui/toast';
	import ApiError from '$lib/components/ui/api-error.svelte';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { runtimeConfig } from '$lib/stores/runtime-config.store.svelte';
	import { CustomersService } from '$lib/services/customers.service';
	import { UsersService } from '$lib/services/users.service';
	import {
		AiWorkflowsService,
		type AiEntityType,
		type AiRunSummary,
		type AiValidateResult,
		type AiValidationError,
		type AiWorkflow,
		type AiWorkflowCatalogue
	} from '$lib/services/ai-workflows.service';
	import {
		createFlowNode,
		emptyGraph,
		flowToGraph,
		graphToFlow,
		groupErrors,
		labelFor,
		type FlowEdge,
		type FlowNode,
		type NodeMetaMap
	} from '$lib/utils/ai-workflow-graph';
	import FeatureGate from '../components/FeatureGate.svelte';
	import WorkflowCanvas from '../components/WorkflowCanvas.svelte';
	import NodeConfigForm from '../components/NodeConfigForm.svelte';
	import TriggerConfigForm from '../components/TriggerConfigForm.svelte';
	import MultiSelect, { type MultiSelectItem } from '../components/MultiSelect.svelte';
	import RunDialog from '../components/RunDialog.svelte';
	import VersionsDialog from '../components/VersionsDialog.svelte';
	import {
		bodyFromForm,
		cleanTriggerConfig,
		emptyWorkflowForm,
		formFromWorkflow,
		type WorkflowEditorCtx,
		type WorkflowForm
	} from '../helpers/editor';
	import {
		CLASSIFICATION_TONES,
		describeApiError,
		LABEL_CLASS,
		SELECT_CLASS,
		TEXTAREA_CLASS,
		workflowErrorsFrom,
		WORKFLOW_EDITOR_CTX
	} from '../helpers/ui';

	const userCtx = getContext<UserCtx>(USER_CTX);
	const canWrite = $derived(userCtx?.can('ai_workflows_write') ?? false);
	const isAdmin = $derived(userCtx?.can('server_administrator') ?? false);
	const readOnly = $derived(!canWrite);

	const routeId = $derived(page.params.id ?? 'new');
	const isNew = $derived(routeId === 'new');

	let workflow = $state<AiWorkflow | null>(null);
	let catalogue = $state<AiWorkflowCatalogue | null>(null);
	let form = $state<WorkflowForm>(emptyWorkflowForm());
	let nodes = $state.raw<FlowNode[]>([]);
	let edges = $state.raw<FlowEdge[]>([]);
	let meta = $state<NodeMetaMap>({});
	let errorsByNode = $state<Record<string, string[]>>({});
	let globalErrors = $state<string[]>([]);
	let validated = $state<boolean | null>(null);
	let selectedId = $state<string | null>(null);

	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let loadedId: string | null = null;
	let savedSnapshot = $state('');
	let saving = $state(false);
	let validating = $state(false);
	let settingsOpen = $state(true);
	let saveDialogOpen = $state(false);
	let versionNote = $state('');
	let versionsOpen = $state(false);
	let runOpen = $state(false);

	let customerItems = $state<MultiSelectItem[]>([]);
	let ownerOptions = $state<{ id: number; label: string }[]>([]);

	const ctx: WorkflowEditorCtx = {
		get meta() {
			return meta;
		},
		get errors() {
			return errorsByNode;
		},
		get catalogue() {
			return catalogue;
		}
	};
	setContext(WORKFLOW_EDITOR_CTX, ctx);

	const snapshot = $derived(
		JSON.stringify(bodyFromForm(form, flowToGraph(nodes, edges, meta), { includeOwner: true }))
	);
	const dirty = $derived(!loading && !loadError && snapshot !== savedSnapshot);

	const writeTools = $derived(
		(catalogue?.tools ?? [])
			.filter((t) => t.classification === 'write')
			.map((t) => ({
				value: t.name,
				label: t.name,
				description: t.description,
				badge: 'write',
				badgeClass: CLASSIFICATION_TONES.write
			}))
	);

	const selectedType = $derived(
		selectedId ? (nodes.find((n) => n.id === selectedId)?.data.nodeType ?? null) : null
	);
	const otherNodes = $derived(
		nodes
			.filter((n) => n.id !== selectedId && n.data.nodeType !== 'trigger')
			.map((n) => ({
				id: n.id,
				label: meta[n.id]?.label || labelFor(n.data.nodeType, catalogue?.node_types)
			}))
	);
	const errorCount = $derived(
		Object.values(errorsByNode).reduce((sum, list) => sum + list.length, 0) + globalErrors.length
	);

	function loadGraph(graph: AiWorkflow['graph'] | null | undefined) {
		const flow = graphToFlow(graph && graph.nodes?.length ? graph : emptyGraph());
		meta = flow.meta;
		nodes = flow.nodes;
		edges = flow.edges;
	}

	function applyErrors(list: AiValidationError[]) {
		const grouped = groupErrors(list);
		errorsByNode = grouped.byNode;
		globalErrors = grouped.global;
	}

	async function load(id: string) {
		loadedId = id;
		loading = true;
		loadError = null;
		selectedId = null;
		applyErrors([]);
		validated = null;
		const [cat, wf] = await Promise.all([
			AiWorkflowsService.catalogue(),
			id === 'new' ? Promise.resolve(null) : AiWorkflowsService.get(Number(id))
		]);
		if (cat.ok) catalogue = cat.data as AiWorkflowCatalogue;
		if (wf && !wf.ok) {
			loading = false;
			loadError =
				wf.status === 404
					? 'Workflow not found'
					: describeApiError(wf.data, wf.error?.message ?? 'Failed to load the workflow');
			return;
		}
		if (wf) {
			workflow = wf.data as AiWorkflow;
			form = formFromWorkflow(workflow);
			loadGraph(workflow.graph);
		} else {
			workflow = null;
			form = emptyWorkflowForm();
			loadGraph(emptyGraph());
		}
		loading = false;
		savedSnapshot = snapshot;
	}

	async function loadLookups() {
		const customers = await CustomersService.list();
		if (customers.ok && Array.isArray(customers.data)) {
			customerItems = customers.data.map((c) => ({
				value: String(c.customer_id),
				label: c.customer_name
			}));
		}
		if (isAdmin) {
			const users = await UsersService.list();
			if (users.ok && users.data && typeof users.data === 'object') {
				ownerOptions = (users.data.data ?? [])
					.filter((u) => u.user_active)
					.map((u) => ({ id: u.user_id, label: `${u.user_name} (${u.user_login})` }));
			}
		}
	}

	$effect(() => {
		const id = routeId;
		if (!runtimeConfig.aiWorkflowsEnabled || !userCtx?.ready) return;
		if (id !== loadedId) load(id);
	});

	onMount(() => {
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			if (dirty) e.preventDefault();
		};
		window.addEventListener('beforeunload', onBeforeUnload);
		return () => window.removeEventListener('beforeunload', onBeforeUnload);
	});

	$effect(() => {
		if (userCtx?.ready && runtimeConfig.aiWorkflowsEnabled) loadLookups();
	});

	beforeNavigate(({ cancel, to }) => {
		if (!dirty) return;
		// Same workflow (e.g. the id swap after the first save) is not a leave.
		if (to?.url.pathname === page.url.pathname) return;
		if (!confirm('Discard the unsaved changes to this workflow?')) cancel();
	});

	function addNode(type: string, position: { x: number; y: number }) {
		if (readOnly) return;
		const created = createFlowNode(type, position, nodes, catalogue?.node_types);
		meta[created.node.id] = created.meta;
		nodes = [...nodes, created.node];
		selectedId = created.node.id;
	}

	function deleteSelected() {
		const id = selectedId;
		if (!id || selectedType === 'trigger') return;
		nodes = nodes.filter((n) => n.id !== id);
		edges = edges.filter((e) => e.source !== id && e.target !== id);
		delete meta[id];
		delete errorsByNode[id];
		selectedId = null;
	}

	function currentGraph() {
		return flowToGraph(nodes, edges, meta);
	}

	async function validate(): Promise<boolean> {
		validating = true;
		const res = await AiWorkflowsService.validate({
			graph: currentGraph(),
			trigger_type: form.trigger_type,
			trigger_config: cleanTriggerConfig(
				form.trigger_type,
				form.trigger_configs[form.trigger_type] ?? {}
			),
			write_tool_allowlist: [...form.write_tool_allowlist]
		});
		validating = false;
		if (!res.ok) {
			toast({
				title: 'Validation failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return false;
		}
		const result = res.data as AiValidateResult;
		applyErrors(result.errors ?? []);
		validated = result.valid;
		toast(
			result.valid
				? { title: 'The workflow is valid', variant: 'success' }
				: {
						title: `${result.errors.length} problem${result.errors.length === 1 ? '' : 's'} found`,
						description: 'Nodes with problems are flagged on the canvas.',
						variant: 'warning'
					}
		);
		return result.valid;
	}

	function requestSave() {
		if (!form.name.trim()) {
			toast({ title: 'The workflow needs a name', variant: 'destructive' });
			return;
		}
		if (isNew) {
			save();
		} else {
			versionNote = '';
			saveDialogOpen = true;
		}
	}

	async function save(note?: string) {
		saving = true;
		const body = bodyFromForm(form, currentGraph(), {
			includeOwner: isAdmin,
			versionNote: note
		});
		const res =
			isNew || !workflow
				? await AiWorkflowsService.create(body)
				: await AiWorkflowsService.update(workflow.id, body);
		saving = false;
		if (!res.ok) {
			const structured = workflowErrorsFrom(res.data);
			if (structured.length) {
				applyErrors(structured);
				validated = false;
				toast({
					title: 'The workflow is invalid',
					description: `${structured.length} problem${structured.length === 1 ? '' : 's'}: see the flagged nodes.`,
					variant: 'destructive'
				});
			} else {
				toast({
					title: 'Save failed',
					description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
					variant: 'destructive'
				});
			}
			return;
		}
		saveDialogOpen = false;
		const wasNew = isNew;
		workflow = res.data as AiWorkflow;
		form.owner_id = workflow.owner_id ?? form.owner_id;
		applyErrors([]);
		validated = true;
		savedSnapshot = snapshot;
		toast({
			title: wasNew ? 'Workflow created' : 'Workflow saved',
			description: `${workflow.name} · v${workflow.version}`,
			variant: 'success'
		});
		if (wasNew) {
			loadedId = String(workflow.id);
			goto(`/settings/ai-workflows/${workflow.id}`, { replaceState: true });
		}
	}

	function onRunStarted(run: AiRunSummary) {
		goto(`/settings/ai-workflows/runs/${run.uuid}`);
	}

	const manualEntityTypes = $derived(
		(workflow?.trigger_type === 'manual' && Array.isArray(workflow.trigger_config?.entity_types)
			? workflow.trigger_config.entity_types
			: []) as AiEntityType[]
	);
</script>

<svelte:head>
	<title>{isNew ? 'New AI workflow' : (workflow?.name ?? 'AI workflow')}</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden" data-testid="wf-editor">
	<header class="flex flex-wrap items-center gap-2 border-b px-3 py-2">
		<Button
			variant="ghost"
			size="icon"
			class="h-7 w-7"
			href="/settings/ai-workflows"
			title="Back to the workflows"
		>
			<ArrowLeftIcon size={14} />
		</Button>
		<Input
			class="h-8 w-72 text-sm font-semibold"
			placeholder="Workflow name"
			disabled={readOnly || loading}
			bind:value={form.name}
			data-testid="wf-name"
		/>
		{#if workflow}
			<span class="rounded bg-muted px-1.5 py-0.5 font-mono text-2xs">v{workflow.version}</span>
		{/if}
		{#if dirty}
			<span class="text-2xs text-amber-600" data-testid="wf-dirty">Unsaved changes</span>
		{/if}
		<label class="ml-2 flex items-center gap-1.5 text-xs">
			<Switch
				checked={form.is_active}
				disabled={readOnly || loading}
				onCheckedChange={(v: boolean) => (form.is_active = v)}
				data-testid="wf-active"
			/>
			Active
		</label>

		<div class="ml-auto flex flex-wrap items-center gap-1.5">
			<Button
				variant="ghost"
				size="sm"
				class="h-7"
				onclick={() => (settingsOpen = !settingsOpen)}
				title="Workflow settings"
			>
				<PanelLeftIcon size={12} class="mr-1" /> Settings
			</Button>
			{#if workflow}
				<Button variant="outline" size="sm" class="h-7" onclick={() => (versionsOpen = true)}>
					<HistoryIcon size={12} class="mr-1" /> Versions
				</Button>
				<Button
					variant="outline"
					size="sm"
					class="h-7"
					href={`/settings/ai-workflows/runs?workflow_id=${workflow.id}`}
				>
					<ListIcon size={12} class="mr-1" /> Runs
				</Button>
				{#if canWrite}
					<Button
						variant="outline"
						size="sm"
						class="h-7"
						onclick={() => (runOpen = true)}
						data-testid="wf-run"
					>
						<PlayIcon size={12} class="mr-1" /> Run
					</Button>
				{/if}
			{/if}
			<Button
				variant="outline"
				size="sm"
				class="h-7"
				onclick={validate}
				disabled={validating || loading}
				data-testid="wf-validate"
			>
				{#if validated === true && errorCount === 0}
					<CheckCircle2Icon size={12} class="mr-1 text-green-600" />
				{:else if errorCount > 0}
					<CircleAlertIcon size={12} class="mr-1 text-destructive" />
				{:else}
					<ShieldCheckIcon size={12} class="mr-1" />
				{/if}
				{validating ? 'Validating…' : 'Validate'}
			</Button>
			{#if canWrite}
				<Button
					size="sm"
					class="h-7"
					onclick={requestSave}
					disabled={saving || loading || (!dirty && !isNew)}
					data-testid="wf-save"
				>
					<SaveIcon size={12} class="mr-1" />
					{saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
				</Button>
			{/if}
		</div>
	</header>

	<div class="flex min-h-0 flex-1 flex-col">
		<FeatureGate>
			{#if loadError}
				<div class="p-5"><ApiError error={loadError} onRetry={() => load(routeId)} /></div>
			{:else if loading}
				<p class="p-6 text-xs text-muted-foreground">Loading…</p>
			{:else}
				{#if globalErrors.length}
					<ul
						class="flex flex-col gap-0.5 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-2xs text-destructive"
						data-testid="wf-global-errors"
					>
						{#each globalErrors as err, i (i)}
							<li class="flex gap-1"><CircleAlertIcon size={11} class="mt-0.5 shrink-0" />{err}</li>
						{/each}
					</ul>
				{/if}
				{#if readOnly}
					<p class="border-b bg-muted/30 px-4 py-1.5 text-2xs text-muted-foreground">
						Read-only: editing needs the “AI workflows write” permission.
					</p>
				{/if}
				<div class="flex min-h-0 flex-1">
					{#if settingsOpen}
						<aside
							class="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r p-3"
							data-testid="wf-settings"
						>
							<label class="flex flex-col gap-1">
								<span class={LABEL_CLASS}>Description</span>
								<textarea
									class={TEXTAREA_CLASS.replace('font-mono ', '')}
									rows="2"
									disabled={readOnly}
									bind:value={form.description}
								></textarea>
							</label>

							<TriggerConfigForm
								bind:form
								{catalogue}
								{readOnly}
								workflowId={workflow?.id ?? null}
								savedTriggerType={workflow?.trigger_type ?? null}
								hasInboundToken={workflow?.has_inbound_token ?? false}
								hasSigningSecret={workflow?.has_signing_secret ?? false}
								inboundUrl={workflow?.inbound_url ?? null}
								onTokenRotated={(withSecret) => {
									if (!workflow) return;
									workflow.has_inbound_token = true;
									if (withSecret) workflow.has_signing_secret = true;
								}}
								onSigningSecretRotated={() => {
									if (workflow) workflow.has_signing_secret = true;
								}}
							/>

							<div class="flex flex-col gap-1">
								<span class={LABEL_CLASS}
									>Customer scope (empty = every customer the owner sees)</span
								>
								<MultiSelect
									items={[
										...customerItems,
										...form.customer_scope
											.filter((id) => !customerItems.some((c) => c.value === String(id)))
											.map((id) => ({ value: String(id), label: `Customer #${id}` }))
									]}
									values={form.customer_scope.map(String)}
									placeholder="All customers"
									disabled={readOnly}
									onChange={(v) => (form.customer_scope = v.map(Number))}
									testId="wf-customer-scope"
								/>
							</div>

							<label class="flex flex-col gap-1">
								<span class={LABEL_CLASS}>Suggestions are shown to</span>
								<select
									class={SELECT_CLASS}
									disabled={readOnly}
									bind:value={form.suggestion_audience}
								>
									<option value="entity">Everyone with access to the entity</option>
									<option value="owner">Only the workflow owner</option>
								</select>
							</label>

							<div class="grid grid-cols-2 gap-2">
								<label class="flex flex-col gap-1">
									<span class={LABEL_CLASS}>Max runs / hour</span>
									<Input
										type="number"
										min="1"
										class="h-8 text-xs"
										disabled={readOnly}
										bind:value={form.max_runs_per_hour}
									/>
								</label>
								<label class="flex flex-col gap-1">
									<span class={LABEL_CLASS}>Token budget / run</span>
									<Input
										type="number"
										min="0"
										class="h-8 text-xs"
										disabled={readOnly}
										bind:value={form.token_budget_per_run}
									/>
								</label>
							</div>

							<div class="flex flex-col gap-1">
								<span class={LABEL_CLASS}>Write tools allowed to run without approval</span>
								<MultiSelect
									items={writeTools}
									values={form.write_tool_allowlist}
									placeholder="None: every write is a suggestion"
									disabled={readOnly}
									onChange={(v) => (form.write_tool_allowlist = v)}
									testId="wf-write-allowlist"
								/>
								{#if form.write_tool_allowlist.length}
									<p
										class="flex items-start gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-2xs"
										data-testid="wf-allowlist-warning"
									>
										<TriangleAlertIcon size={12} class="mt-0.5 shrink-0 text-amber-600" />
										These tools change data without an analyst approving it, acting as the user the run
										executes as. Keep the list as short as possible.
									</p>
								{:else}
									<p class="text-2xs text-muted-foreground">
										Agent and Action writes become suggestions an analyst accepts.
									</p>
								{/if}
							</div>

							{#if isAdmin}
								<label class="flex flex-col gap-1">
									<span class={LABEL_CLASS}>Owner (event / cron / webhook runs act as them)</span>
									<select
										class={SELECT_CLASS}
										disabled={readOnly}
										value={form.owner_id === null ? '' : String(form.owner_id)}
										onchange={(e) => {
											const v = (e.currentTarget as HTMLSelectElement).value;
											form.owner_id = v ? Number(v) : null;
										}}
										data-testid="wf-owner"
									>
										<option value="">{isNew ? 'Me' : '—'}</option>
										{#each ownerOptions as o (o.id)}
											<option value={String(o.id)}>{o.label}</option>
										{/each}
										{#if form.owner_id !== null && !ownerOptions.some((o) => o.id === form.owner_id)}
											<option value={String(form.owner_id)}>
												{workflow?.owner?.name ?? `User #${form.owner_id}`}
											</option>
										{/if}
									</select>
								</label>
							{:else if workflow?.owner}
								<p class="text-2xs text-muted-foreground">
									Owner: {workflow.owner.name ?? workflow.owner.login}
								</p>
							{/if}
						</aside>
					{/if}

					<div class="min-w-0 flex-1">
						<SvelteFlowProvider>
							<WorkflowCanvas
								bind:nodes
								bind:edges
								{catalogue}
								{readOnly}
								onAddNode={addNode}
								onSelect={(id) => (selectedId = id)}
							/>
						</SvelteFlowProvider>
					</div>

					{#if selectedId && selectedType && meta[selectedId]}
						{@const sid = selectedId}
						<aside class="w-96 shrink-0 border-l" data-testid="wf-drawer">
							{#key sid}
								<NodeConfigForm
									nodeId={sid}
									nodeType={selectedType}
									bind:node={meta[sid]}
									{catalogue}
									writeAllowlist={form.write_tool_allowlist}
									errors={errorsByNode[sid] ?? []}
									{otherNodes}
									{readOnly}
									onClose={() => (selectedId = null)}
									onDelete={deleteSelected}
								/>
							{/key}
						</aside>
					{/if}
				</div>
			{/if}
		</FeatureGate>
	</div>
</div>

<Dialog.Root bind:open={saveDialogOpen}>
	<Dialog.Content class="sm:max-w-[460px]">
		<Dialog.Header>
			<Dialog.Title class="text-sm">Save the workflow</Dialog.Title>
			<Dialog.Description class="text-xs">
				A change to the definition creates a new version. Running and waiting runs keep the version
				they started with.
			</Dialog.Description>
		</Dialog.Header>
		<form
			class="flex flex-col gap-3"
			onsubmit={(e) => {
				e.preventDefault();
				save(versionNote);
			}}
		>
			<label class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Version note (optional)</span>
				<Input
					class="h-8 text-xs"
					placeholder="What changed?"
					bind:value={versionNote}
					data-testid="wf-version-note"
				/>
			</label>
			<Dialog.Footer>
				<Button type="button" variant="outline" size="sm" onclick={() => (saveDialogOpen = false)}>
					Cancel
				</Button>
				<Button type="submit" size="sm" disabled={saving} data-testid="wf-save-confirm">
					{saving ? 'Saving…' : 'Save'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

{#if workflow}
	<VersionsDialog
		bind:open={versionsOpen}
		workflowId={workflow.id}
		currentVersion={workflow.version}
	/>
	<RunDialog
		bind:open={runOpen}
		workflowId={workflow.id}
		workflowName={workflow.name}
		entityTypes={manualEntityTypes}
		{dirty}
		onStarted={onRunStarted}
	/>
{/if}

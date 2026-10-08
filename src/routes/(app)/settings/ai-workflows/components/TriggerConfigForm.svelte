<!--
  Trigger type + its config. One config object per type is kept in the
  form so switching type back and forth keeps what was typed.
-->
<script lang="ts">
	import { CopyIcon, RefreshCwIcon, TriangleAlertIcon } from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { cronPreview } from '$lib/utils/cron-preview';
	import {
		AiWorkflowsService,
		type AiEntityType,
		type AiInboundToken,
		type AiTriggerType,
		type AiWorkflowCatalogue
	} from '$lib/services/ai-workflows.service';
	import MultiSelect from './MultiSelect.svelte';
	import type { WorkflowForm } from '../helpers/editor';
	import {
		describeApiError,
		ENTITY_LABELS,
		ENTITY_TYPES,
		LABEL_CLASS,
		SELECT_CLASS,
		TRIGGER_LABELS
	} from '../helpers/ui';

	type Props = {
		form: WorkflowForm;
		catalogue: AiWorkflowCatalogue | null;
		readOnly?: boolean;
		/** Saved workflow id (null while creating). */
		workflowId: number | null;
		/** Trigger type as saved on the server (the token needs a saved webhook workflow). */
		savedTriggerType: AiTriggerType | null;
		hasInboundToken: boolean;
		hasSigningSecret?: boolean;
		inboundUrl: string | null;
		/** `withSecret`: the rotation issued a signing secret as well. */
		onTokenRotated?: (withSecret: boolean) => void;
		onSigningSecretRotated?: () => void;
	};

	let {
		form = $bindable(),
		catalogue,
		readOnly = false,
		workflowId,
		savedTriggerType,
		hasInboundToken,
		hasSigningSecret = false,
		inboundUrl,
		onTokenRotated,
		onSigningSecretRotated
	}: Props = $props();

	const TRIGGERS: AiTriggerType[] = ['event', 'cron', 'manual', 'webhook'];

	const config = $derived(form.trigger_configs[form.trigger_type]);

	const hookItems = $derived(
		(catalogue?.hooks ?? []).map((h) => ({
			value: h.name,
			label: h.name,
			description: h.description
		}))
	);
	const entityItems = ENTITY_TYPES.map((t) => ({ value: t, label: ENTITY_LABELS[t] }));

	const preview = $derived(
		form.trigger_type === 'cron' ? cronPreview(String(config.cron ?? '')) : null
	);

	const fmtUtc = (d: Date) =>
		`${d.toISOString().slice(0, 16).replace('T', ' ')} UTC · ${d.toLocaleString()}`;

	let rotating = $state(false);
	let confirmRotate = $state(false);
	let token = $state<AiInboundToken | null>(null);

	async function rotate() {
		if (!workflowId) return;
		rotating = true;
		const res = await AiWorkflowsService.rotateInboundToken(workflowId);
		rotating = false;
		if (!res.ok) {
			toast({
				title: 'Could not rotate the token',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		token = res.data as AiInboundToken;
		signingSecret = null;
		onTokenRotated?.(Boolean(token.signing_secret));
	}

	let confirmRotateSecret = $state(false);
	let signingSecret = $state<string | null>(null);

	async function rotateSecret() {
		if (!workflowId) return;
		rotating = true;
		const res = await AiWorkflowsService.rotateSigningSecret(workflowId);
		rotating = false;
		if (!res.ok) {
			toast({
				title: 'Could not rotate the signing secret',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		signingSecret = (res.data as { signing_secret?: string } | null)?.signing_secret ?? null;
		if (token) token = { ...token, signing_secret: null };
		onSigningSecretRotated?.();
	}

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast({ title: 'Copied' });
		} catch {
			toast({ title: 'Copy failed', variant: 'destructive' });
		}
	}

	const asStrings = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
</script>

<div class="flex flex-col gap-3" data-testid="wf-trigger-form">
	<div class="flex flex-col gap-1">
		<span class={LABEL_CLASS}>Trigger</span>
		<div class="flex flex-wrap gap-1">
			{#each TRIGGERS as t (t)}
				<button
					type="button"
					disabled={readOnly}
					class={`rounded-md border px-2.5 py-1 text-xs ${form.trigger_type === t ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted'}`}
					onclick={() => (form.trigger_type = t)}
					data-testid={`wf-trigger-${t}`}
				>
					{TRIGGER_LABELS[t]}
				</button>
			{/each}
		</div>
	</div>

	{#if form.trigger_type === 'event'}
		<div class="flex flex-col gap-1">
			<span class={LABEL_CLASS}>Hooks</span>
			<MultiSelect
				items={hookItems}
				values={asStrings(config.hooks)}
				placeholder="Select hooks…"
				disabled={readOnly}
				onChange={(v) => (config.hooks = v)}
				testId="wf-trigger-hooks"
			/>
		</div>
		<label class="flex flex-col gap-1">
			<span class={LABEL_CLASS}>Condition (optional Jinja expression)</span>
			<Input
				class="h-8 font-mono text-xs"
				placeholder={'payload.alert_severity_id >= 4'}
				disabled={readOnly}
				value={String(config.condition ?? '')}
				oninput={(e) => (config.condition = (e.currentTarget as HTMLInputElement).value)}
			/>
		</label>
		<label class="flex flex-col gap-1">
			<span class={LABEL_CLASS}
				>De-duplicate: skip a new run on the same entity within (minutes)</span
			>
			<Input
				type="number"
				min="0"
				class="h-8 w-32 text-xs"
				disabled={readOnly}
				value={String(config.dedup_minutes ?? 0)}
				oninput={(e) =>
					(config.dedup_minutes = Number((e.currentTarget as HTMLInputElement).value))}
			/>
		</label>
	{:else if form.trigger_type === 'cron'}
		<label class="flex flex-col gap-1">
			<span class={LABEL_CLASS}>Cron expression (UTC)</span>
			<Input
				class="h-8 font-mono text-xs"
				placeholder="*/15 * * * *"
				disabled={readOnly}
				value={String(config.cron ?? '')}
				oninput={(e) => (config.cron = (e.currentTarget as HTMLInputElement).value)}
				data-testid="wf-trigger-cron"
			/>
		</label>
		{#if preview}
			<div class="rounded-md border bg-muted/30 px-2 py-1.5 text-2xs" data-testid="wf-cron-preview">
				{#if preview.ok}
					<p class="font-medium">{preview.text} (UTC)</p>
					{#each preview.next as d (d.getTime())}
						<p class="text-muted-foreground">{fmtUtc(d)}</p>
					{:else}
						<p class="text-muted-foreground">Never fires.</p>
					{/each}
				{:else}
					<p class="text-destructive">{preview.error}</p>
				{/if}
			</div>
		{/if}
		<div class="grid grid-cols-2 gap-2">
			<label class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Run once per</span>
				<select
					class={SELECT_CLASS}
					disabled={readOnly}
					value={String(config.target ?? 'none')}
					onchange={(e) => (config.target = (e.currentTarget as HTMLSelectElement).value)}
				>
					<option value="none">Nothing (one run, no entity)</option>
					<option value="war_rooms">Open war room</option>
					<option value="cases">Open case</option>
				</select>
			</label>
			<label class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Max targets per tick</span>
				<Input
					type="number"
					min="1"
					class="h-8 text-xs"
					disabled={readOnly || config.target === 'none'}
					value={String(config.max_targets ?? 50)}
					oninput={(e) =>
						(config.max_targets = Number((e.currentTarget as HTMLInputElement).value))}
				/>
			</label>
		</div>
	{:else if form.trigger_type === 'manual'}
		<div class="flex flex-col gap-1">
			<span class={LABEL_CLASS}>Entity types the Run button accepts (none = no entity)</span>
			<MultiSelect
				items={entityItems}
				values={asStrings(config.entity_types)}
				placeholder="No entity needed"
				disabled={readOnly}
				onChange={(v) => (config.entity_types = v as AiEntityType[])}
				testId="wf-trigger-entity-types"
			/>
		</div>
	{:else if form.trigger_type === 'webhook'}
		<label class="flex items-center justify-between gap-2 text-xs">
			<span>
				Require an HMAC signature
				<span class="block text-2xs text-muted-foreground">
					<code class="font-mono">X-IRIS-Signature</code> over the timestamp and body, keyed by the signing
					secret shown when the token is generated.
				</span>
			</span>
			<Switch
				checked={Boolean(config.require_signature)}
				disabled={readOnly}
				onCheckedChange={(v) => (config.require_signature = v)}
			/>
		</label>
		<div class="grid grid-cols-2 gap-2">
			<label class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Entity type (optional)</span>
				<select
					class={SELECT_CLASS}
					disabled={readOnly}
					value={String(config.entity_type ?? '')}
					onchange={(e) =>
						(config.entity_type = (e.currentTarget as HTMLSelectElement).value || null)}
				>
					<option value="">None</option>
					{#each ENTITY_TYPES as t (t)}
						<option value={t}>{ENTITY_LABELS[t]}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Entity id path in the payload</span>
				<Input
					class="h-8 font-mono text-xs"
					placeholder="data.alert.id"
					disabled={readOnly || !config.entity_type}
					value={String(config.entity_id_path ?? '')}
					oninput={(e) => (config.entity_id_path = (e.currentTarget as HTMLInputElement).value)}
				/>
			</label>
		</div>

		<div class="flex flex-col gap-1.5 rounded-md border bg-muted/20 p-2 text-2xs">
			{#if savedTriggerType !== 'webhook' || !workflowId}
				<p class="text-muted-foreground">
					Save the workflow with the webhook trigger to generate its inbound token.
				</p>
			{:else}
				{#if inboundUrl}
					<div class="flex items-center gap-1">
						<span class="text-muted-foreground">URL</span>
						<code class="truncate font-mono">{inboundUrl}</code>
						<button type="button" aria-label="Copy URL" onclick={() => copy(inboundUrl)}>
							<CopyIcon size={11} />
						</button>
					</div>
				{/if}
				<p class="text-muted-foreground">
					{hasInboundToken
						? 'A token is set. Rotating it invalidates the current one immediately.'
						: 'No token yet: the endpoint rejects every call until one is generated.'}
				</p>
				<p class="text-muted-foreground" data-testid="wf-signing-secret-state">
					{hasSigningSecret
						? 'A signing secret is set.'
						: 'No signing secret yet: signed requests cannot be verified.'}
				</p>
				{#if !readOnly}
					<div class="flex flex-wrap gap-1">
						<Button
							type="button"
							size="sm"
							variant="outline"
							class="h-7 w-fit gap-1 text-xs"
							disabled={rotating}
							onclick={() => (hasInboundToken ? (confirmRotate = true) : rotate())}
							data-testid="wf-rotate-token"
						>
							<RefreshCwIcon size={12} />
							{hasInboundToken ? 'Rotate inbound token' : 'Generate inbound token'}
						</Button>
						{#if hasInboundToken}
							<Button
								type="button"
								size="sm"
								variant="outline"
								class="h-7 w-fit gap-1 text-xs"
								disabled={rotating}
								onclick={() => (hasSigningSecret ? (confirmRotateSecret = true) : rotateSecret())}
								data-testid="wf-rotate-signing-secret"
							>
								<RefreshCwIcon size={12} />
								{hasSigningSecret ? 'Rotate signing secret' : 'Generate signing secret'}
							</Button>
						{/if}
					</div>
				{/if}
				{#if signingSecret}
					<div
						class="flex flex-col gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 p-2"
						data-testid="wf-new-signing-secret"
					>
						<p class="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
							<TriangleAlertIcon size={12} />
							Copy it now: the signing secret is shown only once.
						</p>
						<div class="flex items-center gap-1">
							<span class="w-10 shrink-0 text-muted-foreground">Secret</span>
							<code class="truncate font-mono">{signingSecret}</code>
							<button
								type="button"
								aria-label="Copy signing secret"
								onclick={() => copy(signingSecret ?? '')}
							>
								<CopyIcon size={11} />
							</button>
						</div>
					</div>
				{/if}
				{#if token}
					<div
						class="flex flex-col gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 p-2"
						data-testid="wf-inbound-token"
					>
						<p class="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
							<TriangleAlertIcon size={12} />
							{token.signing_secret
								? 'Copy them now: the token and signing secret are shown only once.'
								: 'Copy it now: the token is shown only once.'}
						</p>
						<div class="flex items-center gap-1">
							<span class="w-10 shrink-0 text-muted-foreground">Token</span>
							<code class="truncate font-mono">{token.token}</code>
							<button type="button" aria-label="Copy token" onclick={() => copy(token!.token)}>
								<CopyIcon size={11} />
							</button>
						</div>
						<div class="flex items-center gap-1">
							<span class="w-10 shrink-0 text-muted-foreground">URL</span>
							<code class="truncate font-mono">{token.url}</code>
							<button type="button" aria-label="Copy URL" onclick={() => copy(token!.url)}>
								<CopyIcon size={11} />
							</button>
						</div>
						{#if token.signing_secret}
							<div class="flex items-center gap-1" data-testid="wf-inbound-signing-secret">
								<span class="w-10 shrink-0 text-muted-foreground">Secret</span>
								<code class="truncate font-mono">{token.signing_secret}</code>
								<button
									type="button"
									aria-label="Copy signing secret"
									onclick={() => copy(token!.signing_secret ?? '')}
								>
									<CopyIcon size={11} />
								</button>
							</div>
						{/if}
						<p class="text-muted-foreground">
							Send it as <code class="font-mono">Authorization: Bearer &lt;token&gt;</code>.
						</p>
						{#if token.signing_secret}
							<p class="text-muted-foreground">
								Sign requests with HMAC-SHA256(key=signing secret, msg=<code class="font-mono"
									>&lt;X-IRIS-Timestamp&gt;.</code
								>
								+ raw body) → <code class="font-mono">X-IRIS-Signature: sha256=&lt;hex&gt;</code>.
							</p>
						{/if}
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</div>

<ConfirmationDialog
	bind:open={confirmRotate}
	title="Rotate the inbound token?"
	message="The current token stops working immediately. Every caller must be updated with the new one."
	confirmText="Rotate"
	confirmButtonVariant="destructive"
	onConfirm={rotate}
/>

<ConfirmationDialog
	bind:open={confirmRotateSecret}
	title="Rotate the signing secret?"
	message="Signatures made with the current secret stop verifying immediately. Every caller must be updated with the new one."
	confirmText="Rotate"
	confirmButtonVariant="destructive"
	onConfirm={rotateSecret}
/>

<!--
  Chatbot admin page.

  Two panes reachable from the top tab bar:

    * **Policies** — CRUD for `ChatbotPolicy` rows. A policy pins a
      customer to a provider/model/redaction/budget/retention profile
      (Stage 1 + Stage 3). The war-room resolver takes the strictest
      applicable policy across all customers touched by the scope.
    * **Sessions** — cross-user conversation viewer for oversight
      (Stage 2). Admin reads are activity-logged server-side.

  Deliberately compact — no split-pane, no wizard. Chatbot admin is
  a low-traffic surface; density beats polish here.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		SparklesIcon,
		PencilIcon,
		PlusIcon,
		Trash2Icon,
		EyeIcon,
		BotIcon,
		SaveIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from '$lib/components/ui/toast';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import {
		ChatbotAdminService,
		type ChatbotPolicy,
		type ChatbotPolicyBody,
		type AdminSession,
		type AdminSessionDetail
	} from '$lib/services/chatbot-admin.service';
	import {
		ServerSettingsService,
		type ServerSettings,
		type ServerSettingsResponse,
		type ServerSettingsUpdateBody
	} from '$lib/services/server-settings.service';

	// ---------- Tab state ----------
	//
	// `Tabs.Root` needs a two-way binding on its value prop — without
	// `bind:`, clicking a Trigger can't update the parent's state and
	// every tab's content renders at once.
	let activeTab = $state<'global' | 'policies' | 'sessions' | 'gdpr'>('global');

	// ---------- Global chatbot settings (moved from Server Settings) ----------
	//
	// This mirrors the diff-on-save pattern from the Server Settings
	// page: snapshot the server row, mutate a working copy, and PUT
	// only fields the admin actually changed so concurrent admin
	// sessions don't stomp each other's edits.
	let srvPayload = $state<ServerSettingsResponse | null>(null);
	let srvLoading = $state(false);
	let srvSaving = $state(false);
	let srvSaveError = $state<string | null>(null);
	let srvForm = $state<Partial<ServerSettings>>({});

	async function loadServerSettings() {
		srvLoading = true;
		try {
			const res = await ServerSettingsService.get();
			if (res.ok && res.data && typeof res.data !== 'string') {
				srvPayload = res.data as ServerSettingsResponse;
				srvForm = { ...srvPayload.settings };
			} else {
				toast({
					title: res.error?.message ?? 'Failed to load chatbot settings',
					variant: 'destructive'
				});
			}
		} finally {
			srvLoading = false;
		}
	}

	// Only the chatbot fields participate in dirty-tracking here —
	// the other server-settings sections live on their own page.
	const CHATBOT_KEYS: Array<keyof ServerSettings> = [
		'chatbot_enabled',
		'chatbot_provider',
		'chatbot_api_key',
		'chatbot_model',
		'chatbot_base_url',
		'chatbot_max_turns_per_conversation',
		'chatbot_max_tool_calls_per_turn',
		'chatbot_auto_execute_read_tools',
		'chatbot_auto_approve_write_tools',
		'chatbot_daily_token_budget_per_user',
		'chatbot_daily_token_budget_org',
		'chatbot_redact_ips',
		'chatbot_redact_emails',
		'chatbot_redact_hashes'
	];

	const srvFieldChanged = <K extends keyof ServerSettings>(key: K): boolean => {
		if (srvPayload == null) return false;
		const original = (srvPayload.settings as ServerSettings)[key];
		const current = (srvForm as Partial<ServerSettings>)[key];
		return (original ?? null) !== (current ?? null);
	};

	const srvIsDirty = $derived.by<boolean>(() => {
		if (srvPayload == null) return false;
		return CHATBOT_KEYS.some((k) => srvFieldChanged(k));
	});

	async function saveServerSettings() {
		if (srvPayload == null) return;
		const patch: ServerSettingsUpdateBody = {};
		for (const key of CHATBOT_KEYS) {
			if (srvFieldChanged(key)) {
				(patch as Record<string, unknown>)[key] = (srvForm as Record<string, unknown>)[key];
			}
		}
		if (Object.keys(patch).length === 0) return;
		srvSaving = true;
		srvSaveError = null;
		try {
			const res = await ServerSettingsService.update(patch);
			if (res.ok && res.data && typeof res.data !== 'string') {
				srvPayload = { ...srvPayload, settings: res.data as ServerSettings };
				srvForm = { ...(res.data as ServerSettings) };
				toast({ title: 'Chatbot settings updated', variant: 'success' });
			} else {
				const data = res.data as { message?: string } | null;
				srvSaveError = data?.message ?? res.error?.message ?? 'Save failed';
			}
		} catch (e) {
			srvSaveError = (e as Error).message;
		} finally {
			srvSaving = false;
		}
	}

	function discardServerSettings() {
		if (srvPayload == null) return;
		srvForm = { ...srvPayload.settings };
		srvSaveError = null;
	}

	// ---------- Policies tab ----------

	let policies = $state<ChatbotPolicy[]>([]);
	let policiesLoading = $state(false);

	async function refreshPolicies() {
		policiesLoading = true;
		try {
			const res = await ChatbotAdminService.listPolicies();
			if (res.ok && res.data && typeof res.data !== 'string') {
				const body = res.data as { policies?: ChatbotPolicy[] };
				policies = body.policies ?? [];
			}
		} finally {
			policiesLoading = false;
		}
	}

	let editorOpen = $state(false);
	let editing = $state<ChatbotPolicy | null>(null);
	let submitting = $state(false);
	// Blank form; also acts as the "new" template.
	let form = $state<ChatbotPolicyBody>({});
	// API-key input is separated so we can distinguish "unchanged"
	// (undefined — don't send) from "clear it" (empty string — send
	// null to null the column) at update time.
	let apiKeyInput = $state<string>('');
	let apiKeyTouched = $state(false);

	function beginCreate() {
		editing = null;
		form = {
			name: '',
			description: '',
			restriction_level: 10,
			provider: '',
			model: '',
			base_url: '',
			auto_execute_read_tools: true,
			auto_approve_write_tools: false,
			max_turns_per_conversation: 25,
			max_tool_calls_per_turn: 8,
			daily_token_budget_per_user: 500_000,
			daily_token_budget_org: 10_000_000,
			redact_ips: false,
			redact_emails: false,
			redact_hashes: false,
			retention_days: 0
		};
		apiKeyInput = '';
		apiKeyTouched = false;
		editorOpen = true;
	}

	function beginEdit(p: ChatbotPolicy) {
		editing = p;
		form = {
			name: p.name,
			description: p.description,
			restriction_level: p.restriction_level,
			provider: p.provider,
			model: p.model,
			base_url: p.base_url,
			auto_execute_read_tools: p.auto_execute_read_tools,
			auto_approve_write_tools: p.auto_approve_write_tools,
			max_turns_per_conversation: p.max_turns_per_conversation,
			max_tool_calls_per_turn: p.max_tool_calls_per_turn,
			daily_token_budget_per_user: p.daily_token_budget_per_user,
			daily_token_budget_org: p.daily_token_budget_org,
			redact_ips: p.redact_ips,
			redact_emails: p.redact_emails,
			redact_hashes: p.redact_hashes,
			retention_days: p.retention_days
		};
		// Never populate the api-key field — the plaintext is not
		// available (encrypted at rest, never returned). Empty box
		// means "unchanged" unless the admin types in it.
		apiKeyInput = '';
		apiKeyTouched = false;
		editorOpen = true;
	}

	async function submit() {
		submitting = true;
		try {
			const body: ChatbotPolicyBody = { ...form };
			// Only include api_key in the payload if the admin touched
			// the field. Empty-after-touch means "clear" (send null);
			// non-empty means "set to this plaintext".
			if (apiKeyTouched) {
				body.api_key = apiKeyInput === '' ? null : apiKeyInput;
			}
			const res = editing
				? await ChatbotAdminService.updatePolicy(editing.id, body)
				: await ChatbotAdminService.createPolicy(body);
			if (!res.ok) {
				toast({
					title: 'Failed to save policy',
					description: (res.error?.message as string) ?? '',
					variant: 'destructive'
				});
				return;
			}
			editorOpen = false;
			await refreshPolicies();
		} finally {
			submitting = false;
		}
	}

	let confirmOpen = $state(false);
	let pendingDelete = $state<ChatbotPolicy | null>(null);
	function askDelete(p: ChatbotPolicy) {
		pendingDelete = p;
		confirmOpen = true;
	}
	async function confirmDelete() {
		if (!pendingDelete) return;
		const res = await ChatbotAdminService.deletePolicy(pendingDelete.id);
		if (res.ok) {
			await refreshPolicies();
		}
		confirmOpen = false;
		pendingDelete = null;
	}

	function restrictionLabel(level: number): string {
		if (level >= 100) return 'Local-only';
		if (level >= 50) return 'Cloud + redaction';
		if (level >= 10) return 'Cloud';
		return 'Default';
	}

	// ---------- Sessions tab ----------

	let sessions = $state<AdminSession[]>([]);
	let sessionsLoading = $state(false);
	let sessionsFilter = $state({ include_archived: false });

	async function refreshSessions() {
		sessionsLoading = true;
		try {
			const res = await ChatbotAdminService.listSessions({
				limit: 100,
				include_archived: sessionsFilter.include_archived
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				const body = res.data as { conversations?: AdminSession[] };
				sessions = body.conversations ?? [];
			}
		} finally {
			sessionsLoading = false;
		}
	}

	let sessionViewOpen = $state(false);
	let sessionDetail = $state<AdminSessionDetail | null>(null);
	let sessionLoading = $state(false);
	async function viewSession(id: number) {
		sessionLoading = true;
		sessionViewOpen = true;
		sessionDetail = null;
		try {
			const res = await ChatbotAdminService.readSession(id);
			if (res.ok && res.data && typeof res.data !== 'string') {
				sessionDetail = res.data as AdminSessionDetail;
			}
		} finally {
			sessionLoading = false;
		}
	}

	function scopeLabel(s: AdminSession): string {
		if (s.war_room_id != null) return `war-room #${s.war_room_id}`;
		if (s.case_id != null) return `case #${s.case_id}`;
		return 'global';
	}

	// ---------- Retention & DPO tab ----------

	let retentionRunning = $state(false);
	let retentionResult = $state<{
		conversations_deleted: number;
		messages_deleted: number;
		egress_deleted: number;
	} | null>(null);

	async function runRetention() {
		retentionRunning = true;
		try {
			const res = await ChatbotAdminService.runRetention();
			if (res.ok && res.data && typeof res.data !== 'string') {
				retentionResult = res.data as typeof retentionResult;
			} else {
				toast({
					title: 'Retention run failed',
					description: (res.error?.message as string) ?? '',
					variant: 'destructive'
				});
			}
		} finally {
			retentionRunning = false;
		}
	}

	let dpoUserIdInput = $state<number | null>(null);
	let dpoBusy = $state(false);
	let eraseConfirmOpen = $state(false);
	let eraseResult = $state<{
		conversations_deleted: number;
		messages_deleted: number;
		egress_deleted: number;
	} | null>(null);

	async function dpoExport() {
		if (!dpoUserIdInput) {
			toast({ title: 'Enter a user id first', variant: 'destructive' });
			return;
		}
		dpoBusy = true;
		try {
			const res = await ChatbotAdminService.dpoExport(dpoUserIdInput);
			if (res.ok && res.data) {
				// Browser-side JSON download. Blob wrapped in an anchor
				// click is the simplest cross-browser approach that
				// doesn't need a server-generated presigned URL.
				const blob = new Blob([JSON.stringify(res.data, null, 2)], {
					type: 'application/json'
				});
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `chat-export-user-${dpoUserIdInput}.json`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			}
		} finally {
			dpoBusy = false;
		}
	}

	async function confirmErase() {
		if (!dpoUserIdInput) return;
		dpoBusy = true;
		try {
			const res = await ChatbotAdminService.dpoErase(dpoUserIdInput);
			if (res.ok && res.data && typeof res.data !== 'string') {
				eraseResult = res.data as typeof eraseResult;
				await refreshSessions();
			}
		} finally {
			dpoBusy = false;
			eraseConfirmOpen = false;
		}
	}

	onMount(() => {
		void loadServerSettings();
		void refreshPolicies();
		void refreshSessions();
	});
</script>

<svelte:head>
	<title>Chatbot · Settings</title>
</svelte:head>

<div class="flex h-full min-h-0 flex-col">
	<header class="flex shrink-0 items-center gap-3 border-b px-6 py-4">
		<SparklesIcon size={18} class="text-primary" />
		<div class="flex flex-col">
			<h1 class="text-sm font-semibold">Chatbot</h1>
			<p class="text-xs text-muted-foreground">
				Per-customer policies and cross-user session oversight for Yuki.
			</p>
		</div>
	</header>

	<Tabs.Root bind:value={activeTab} class="flex min-h-0 flex-1 flex-col">
		<Tabs.List class="mx-6 mt-4 w-fit shrink-0">
			<Tabs.Trigger value="global">Global settings</Tabs.Trigger>
			<Tabs.Trigger value="policies">Policies</Tabs.Trigger>
			<Tabs.Trigger value="sessions">Sessions</Tabs.Trigger>
			<Tabs.Trigger value="gdpr">Retention &amp; DPO</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content
			value="global"
			class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6"
		>
			<!--
			  Global chatbot config — the fallback the war-room resolver
			  uses when no per-customer policy applies. Moved here from
			  Server Settings so all chatbot admin lives in one place.
			-->
			<div class="flex items-start justify-between gap-3">
				<p class="text-xs text-muted-foreground">
					Default provider, model, budgets, and redaction settings for the
					IRIS chatbot. Per-customer policies (next tab) override these for
					their bound customers.
				</p>
				<div class="flex shrink-0 items-center gap-1.5">
					<Button
						variant="outline"
						size="sm"
						class="h-7"
						onclick={discardServerSettings}
						disabled={srvSaving || !srvIsDirty}
					>
						Discard
					</Button>
					<Button
						size="sm"
						class="h-7"
						onclick={saveServerSettings}
						disabled={srvSaving || !srvIsDirty}
					>
						<SaveIcon size={12} class="mr-1" />
						{srvSaving ? 'Saving…' : 'Save changes'}
					</Button>
				</div>
			</div>

			{#if srvLoading && srvPayload == null}
				<p class="text-xs text-muted-foreground">Loading…</p>
			{:else if srvPayload == null}
				<p class="text-xs text-muted-foreground">Could not load chatbot settings.</p>
			{:else}
				<section class="rounded-md border">
					<header class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
						<div class="flex items-center gap-2">
							<BotIcon size={14} class="text-muted-foreground" />
							<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Chatbot
							</h2>
						</div>
					</header>
					<div class="grid grid-cols-1 gap-3 p-4 text-xs sm:grid-cols-2">
						<label class="flex items-start gap-2 sm:col-span-2">
							<Switch
								checked={!!srvForm.chatbot_enabled}
								onCheckedChange={(v: boolean) => (srvForm.chatbot_enabled = v)}
								disabled={srvSaving}
							/>
							<div>
								<div class="font-medium">Enable the IRIS chatbot</div>
								<p class="text-2xs text-muted-foreground">
									When on, a floating chat button appears in the top bar. The
									assistant sends case content — case name, description, notes,
									IOC values, asset names, task titles — to the configured LLM
									provider. Writes require analyst approval before running. Off
									by default; enabling counts as an opt-in to third-party data
									sharing.
								</p>
							</div>
						</label>

						<div class="flex flex-col gap-1">
							<label
								for="chatbot-provider"
								class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
							>
								Provider
							</label>
							<select
								id="chatbot-provider"
								class="h-7 rounded border bg-background px-2 text-xs"
								value={srvForm.chatbot_provider ?? ''}
								disabled={srvSaving}
								onchange={(e) =>
									(srvForm.chatbot_provider =
										(e.currentTarget as HTMLSelectElement).value || null)}
							>
								<option value="">— select —</option>
								<option value="anthropic">Anthropic</option>
								<option value="openai">OpenAI</option>
								<option value="ollama">Ollama (self-hosted)</option>
							</select>
						</div>

						<div class="flex flex-col gap-1">
							<label
								for="chatbot-model"
								class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
							>
								Model
							</label>
							<Input
								id="chatbot-model"
								class="h-7 text-xs"
								placeholder="claude-sonnet-5 / gpt-4o / llama3.1:70b"
								value={String(srvForm.chatbot_model ?? '')}
								disabled={srvSaving}
								oninput={(e) =>
									(srvForm.chatbot_model =
										(e.currentTarget as HTMLInputElement).value || null)}
							/>
						</div>

						<div class="flex flex-col gap-1 sm:col-span-2">
							<label
								for="chatbot-api-key"
								class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
							>
								API key
							</label>
							<Input
								id="chatbot-api-key"
								type="password"
								autocomplete="off"
								class="h-7 text-xs"
								placeholder={srvForm.chatbot_api_key_set
									? '•••••• (unchanged — leave blank to keep)'
									: 'sk-…'}
								value={String(srvForm.chatbot_api_key ?? '')}
								disabled={srvSaving}
								oninput={(e) =>
									(srvForm.chatbot_api_key =
										(e.currentTarget as HTMLInputElement).value || null)}
							/>
							<p class="text-2xs text-muted-foreground">
								Stored encrypted at rest. Leave blank to keep the current value.
								Ollama does not require a key when run unauthenticated on
								localhost.
							</p>
						</div>

						<div class="flex flex-col gap-1 sm:col-span-2">
							<label
								for="chatbot-base-url"
								class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
							>
								Base URL (optional)
							</label>
							<Input
								id="chatbot-base-url"
								class="h-7 text-xs"
								placeholder="e.g. https://<resource>.openai.azure.com/anthropic  or  http://ollama.internal:11434"
								value={String(srvForm.chatbot_base_url ?? '')}
								disabled={srvSaving}
								oninput={(e) =>
									(srvForm.chatbot_base_url =
										(e.currentTarget as HTMLInputElement).value || null)}
							/>
							<p class="text-2xs text-muted-foreground">
								Overrides the provider's default endpoint. Useful for
								Ollama, self-hosted proxies, and Azure Foundry's
								Anthropic passthrough (set provider = Anthropic, base URL
								to <code class="rounded bg-muted px-1 py-0.5 font-mono text-2xs"
									>https://&lt;resource&gt;.openai.azure.com/anthropic</code
								>). The provider's standard path is appended
								automatically (e.g. <code
									class="rounded bg-muted px-1 py-0.5 font-mono text-2xs"
									>/v1/messages</code
								> for Anthropic).
							</p>
						</div>

						<div class="flex flex-col gap-1">
							<label
								for="chatbot-max-turns"
								class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
							>
								Max turns / conversation
							</label>
							<Input
								id="chatbot-max-turns"
								type="number"
								min="1"
								class="h-7 text-xs"
								value={String(srvForm.chatbot_max_turns_per_conversation ?? '')}
								disabled={srvSaving}
								oninput={(e) => {
									const raw = (e.currentTarget as HTMLInputElement).value;
									srvForm.chatbot_max_turns_per_conversation =
										raw === '' ? 25 : Number(raw);
								}}
							/>
						</div>

						<div class="flex flex-col gap-1">
							<label
								for="chatbot-max-tool-calls"
								class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
							>
								Max tool calls / turn
							</label>
							<Input
								id="chatbot-max-tool-calls"
								type="number"
								min="1"
								class="h-7 text-xs"
								value={String(srvForm.chatbot_max_tool_calls_per_turn ?? '')}
								disabled={srvSaving}
								oninput={(e) => {
									const raw = (e.currentTarget as HTMLInputElement).value;
									srvForm.chatbot_max_tool_calls_per_turn =
										raw === '' ? 8 : Number(raw);
								}}
							/>
						</div>

						<div class="flex flex-col gap-1">
							<label
								for="chatbot-budget-user"
								class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
							>
								Daily token budget / user
							</label>
							<Input
								id="chatbot-budget-user"
								type="number"
								min="0"
								class="h-7 text-xs"
								value={String(srvForm.chatbot_daily_token_budget_per_user ?? '')}
								disabled={srvSaving}
								oninput={(e) => {
									const raw = (e.currentTarget as HTMLInputElement).value;
									srvForm.chatbot_daily_token_budget_per_user =
										raw === '' ? 500000 : Number(raw);
								}}
							/>
						</div>

						<div class="flex flex-col gap-1">
							<label
								for="chatbot-budget-org"
								class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
							>
								Daily token budget / org
							</label>
							<Input
								id="chatbot-budget-org"
								type="number"
								min="0"
								class="h-7 text-xs"
								value={String(srvForm.chatbot_daily_token_budget_org ?? '')}
								disabled={srvSaving}
								oninput={(e) => {
									const raw = (e.currentTarget as HTMLInputElement).value;
									srvForm.chatbot_daily_token_budget_org =
										raw === '' ? 10000000 : Number(raw);
								}}
							/>
						</div>

						<label class="flex items-start gap-2 sm:col-span-2">
							<Switch
								checked={!!srvForm.chatbot_auto_execute_read_tools}
								onCheckedChange={(v: boolean) =>
									(srvForm.chatbot_auto_execute_read_tools = v)}
								disabled={srvSaving}
							/>
							<div>
								<div class="font-medium">Auto-execute read-only tools</div>
								<p class="text-2xs text-muted-foreground">
									On (default): the assistant can run read tools (list IOCs,
									fetch case, search) without asking. Off: every tool call,
									even reads, shows an Approve/Deny card.
								</p>
							</div>
						</label>

						<label class="flex items-start gap-2 sm:col-span-2">
							<Switch
								checked={!!srvForm.chatbot_auto_approve_write_tools}
								onCheckedChange={(v: boolean) =>
									(srvForm.chatbot_auto_approve_write_tools = v)}
								disabled={srvSaving}
							/>
							<div>
								<div class="font-medium">Auto-approve write tools</div>
								<p class="text-2xs text-muted-foreground">
									Off (default): the assistant asks before every write —
									creating IOCs, updating assets, closing cases, etc. On:
									writes run without confirmation. Only enable once you
									trust the assistant's behaviour on this install; deletes
									and status changes are irreversible from the analyst's
									side.
								</p>
							</div>
						</label>

						<label class="flex items-start gap-2 sm:col-span-2">
							<Switch
								checked={!!srvForm.chatbot_redact_ips}
								onCheckedChange={(v: boolean) => (srvForm.chatbot_redact_ips = v)}
								disabled={srvSaving}
							/>
							<div>
								<div class="font-medium">Redact IPv4 addresses before sending</div>
								<p class="text-2xs text-muted-foreground">
									Off by default — redaction breaks IOC pivoting. Enable if
									strict DLP compliance forbids sending IP addresses to the
									LLM provider.
								</p>
							</div>
						</label>
						<label class="flex items-start gap-2 sm:col-span-2">
							<Switch
								checked={!!srvForm.chatbot_redact_emails}
								onCheckedChange={(v: boolean) => (srvForm.chatbot_redact_emails = v)}
								disabled={srvSaving}
							/>
							<div class="font-medium">Redact email addresses before sending</div>
						</label>
						<label class="flex items-start gap-2 sm:col-span-2">
							<Switch
								checked={!!srvForm.chatbot_redact_hashes}
								onCheckedChange={(v: boolean) => (srvForm.chatbot_redact_hashes = v)}
								disabled={srvSaving}
							/>
							<div class="font-medium">
								Redact MD5 / SHA1 / SHA256 hashes before sending
							</div>
						</label>
					</div>
				</section>

				{#if srvSaveError}
					<p class="whitespace-pre-wrap text-2xs text-destructive">{srvSaveError}</p>
				{/if}
			{/if}
		</Tabs.Content>

		<Tabs.Content value="policies" class="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
			<div class="flex items-center justify-between pb-3">
				<p class="text-xs text-muted-foreground">
					A policy overrides the global chatbot config for every customer bound to it.
					For war rooms, the strictest attached customer's policy wins.
				</p>
				<Button size="sm" onclick={beginCreate}>
					<PlusIcon size={14} class="mr-1" /> New policy
				</Button>
			</div>

			{#if policiesLoading && policies.length === 0}
				<p class="text-xs text-muted-foreground">Loading…</p>
			{:else if policies.length === 0}
				<p class="text-xs text-muted-foreground">
					No policies defined. Customers without a policy use the global Server
					Settings chatbot block.
				</p>
			{:else}
				<div class="overflow-x-auto rounded-md border">
					<table class="w-full text-xs">
						<thead class="bg-muted/50 text-muted-foreground">
							<tr>
								<th class="px-3 py-2 text-left font-medium">Name</th>
								<th class="px-3 py-2 text-left font-medium">Restriction</th>
								<th class="px-3 py-2 text-left font-medium">Provider · Model</th>
								<th class="px-3 py-2 text-left font-medium">Customers</th>
								<th class="px-3 py-2 text-left font-medium">Retention</th>
								<th class="px-3 py-2"></th>
							</tr>
						</thead>
						<tbody>
							{#each policies as p (p.id)}
								<tr class="border-t hover:bg-muted/30">
									<td class="px-3 py-2">
										<div class="font-medium">{p.name}</div>
										{#if p.description}
											<div class="text-2xs text-muted-foreground">
												{p.description}
											</div>
										{/if}
									</td>
									<td class="px-3 py-2">
										<span class="rounded bg-muted px-1.5 py-0.5 text-2xs">
											{restrictionLabel(p.restriction_level)} · {p.restriction_level}
										</span>
									</td>
									<td class="px-3 py-2">
										{p.provider || '—'}
										{#if p.model}<span class="text-muted-foreground"> · {p.model}</span>{/if}
									</td>
									<td class="px-3 py-2">{p.customer_count ?? 0}</td>
									<td class="px-3 py-2">
										{p.retention_days > 0 ? `${p.retention_days}d` : 'off'}
									</td>
									<td class="px-3 py-2 text-right">
										<button
											type="button"
											class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
											aria-label="Edit"
											onclick={() => beginEdit(p)}
										>
											<PencilIcon size={12} />
										</button>
										<button
											type="button"
											class="rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
											aria-label="Delete"
											onclick={() => askDelete(p)}
										>
											<Trash2Icon size={12} />
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</Tabs.Content>

		<Tabs.Content value="sessions" class="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
			<div class="flex items-center justify-between pb-3">
				<p class="text-xs text-muted-foreground">
					Every Yuki conversation across every user. Reading a session logs an
					admin-oversight activity — visible in the audit trail.
				</p>
				<label class="flex items-center gap-2 text-xs">
					<Switch
						checked={sessionsFilter.include_archived}
						onCheckedChange={(v) => {
							sessionsFilter.include_archived = v;
							void refreshSessions();
						}}
					/>
					Include archived
				</label>
			</div>

			{#if sessionsLoading && sessions.length === 0}
				<p class="text-xs text-muted-foreground">Loading…</p>
			{:else if sessions.length === 0}
				<p class="text-xs text-muted-foreground">No conversations to display.</p>
			{:else}
				<div class="overflow-x-auto rounded-md border">
					<table class="w-full text-xs">
						<thead class="bg-muted/50 text-muted-foreground">
							<tr>
								<th class="px-3 py-2 text-left font-medium">#</th>
								<th class="px-3 py-2 text-left font-medium">Title</th>
								<th class="px-3 py-2 text-left font-medium">Scope</th>
								<th class="px-3 py-2 text-left font-medium">User</th>
								<th class="px-3 py-2 text-left font-medium">Model</th>
								<th class="px-3 py-2 text-left font-medium">Restriction</th>
								<th class="px-3 py-2 text-left font-medium">Updated</th>
								<th class="px-3 py-2"></th>
							</tr>
						</thead>
						<tbody>
							{#each sessions as s (s.id)}
								<tr class="border-t hover:bg-muted/30">
									<td class="px-3 py-2 text-muted-foreground">#{s.id}</td>
									<td class="px-3 py-2">
										{s.title || `Untitled #${s.id}`}
									</td>
									<td class="px-3 py-2 text-muted-foreground">{scopeLabel(s)}</td>
									<td class="px-3 py-2 text-muted-foreground">#{s.user_id}</td>
									<td class="px-3 py-2 text-muted-foreground">{s.model || '—'}</td>
									<td class="px-3 py-2">
										<span class="rounded bg-muted px-1.5 py-0.5 text-2xs">
											{s.resolved_restriction_level}
										</span>
									</td>
									<td class="px-3 py-2 text-muted-foreground">
										{new Date(s.updated_at).toLocaleString()}
									</td>
									<td class="px-3 py-2 text-right">
										<button
											type="button"
											class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
											aria-label="View"
											onclick={() => viewSession(s.id)}
										>
											<EyeIcon size={12} />
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</Tabs.Content>

		<Tabs.Content value="gdpr" class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
			<section class="rounded-md border p-4">
				<h2 class="text-sm font-semibold">Retention purge</h2>
				<p class="mt-1 text-xs text-muted-foreground">
					Hard-deletes conversations older than each policy's retention window
					(<code>retention_days</code>). Only policies with a non-zero window
					are considered — customers on the global default are never purged
					by this job. Run this from an external cron for a scheduled purge.
				</p>
				<div class="mt-3 flex items-center gap-3">
					<Button size="sm" onclick={runRetention} disabled={retentionRunning}>
						{retentionRunning ? 'Running…' : 'Run retention now'}
					</Button>
					{#if retentionResult}
						<span class="text-2xs text-muted-foreground">
							Deleted {retentionResult.conversations_deleted} conversation(s),
							{retentionResult.messages_deleted} message(s),
							{retentionResult.egress_deleted} egress row(s).
						</span>
					{/if}
				</div>
			</section>

			<section class="rounded-md border p-4">
				<h2 class="text-sm font-semibold">DPO export (right of access)</h2>
				<p class="mt-1 text-xs text-muted-foreground">
					Download every chat record for one user as JSON. Includes archived
					conversations. Hitting this endpoint is activity-logged.
				</p>
				<div class="mt-3 flex items-end gap-3">
					<label class="flex flex-col gap-1 text-xs">
						<span>User ID</span>
						<Input
							type="number"
							bind:value={dpoUserIdInput}
							min="1"
							class="w-40"
						/>
					</label>
					<Button size="sm" variant="outline" onclick={dpoExport} disabled={dpoBusy}>
						{dpoBusy ? 'Working…' : 'Export JSON'}
					</Button>
				</div>
			</section>

			<section class="rounded-md border border-destructive/40 p-4">
				<h2 class="text-sm font-semibold text-destructive">DPO erasure (right to be forgotten)</h2>
				<p class="mt-1 text-xs text-muted-foreground">
					Hard-deletes every chat record for one user — conversations,
					messages, pending tool calls, and egress audit rows. Cannot be
					undone. Activity-logged.
				</p>
				<div class="mt-3 flex items-end gap-3">
					<label class="flex flex-col gap-1 text-xs">
						<span>User ID</span>
						<Input
							type="number"
							bind:value={dpoUserIdInput}
							min="1"
							class="w-40"
						/>
					</label>
					<Button
						size="sm"
						variant="destructive"
						onclick={() => (eraseConfirmOpen = true)}
						disabled={dpoBusy}
					>
						Erase all chat records
					</Button>
				</div>
				{#if eraseResult}
					<p class="mt-3 text-2xs text-muted-foreground">
						Erased {eraseResult.conversations_deleted} conversation(s),
						{eraseResult.messages_deleted} message(s),
						{eraseResult.egress_deleted} egress row(s).
					</p>
				{/if}
			</section>
		</Tabs.Content>
	</Tabs.Root>
</div>

<!-- Policy editor modal. -->
<Dialog.Root bind:open={editorOpen}>
	<Dialog.Content class="max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>{editing ? `Edit "${editing.name}"` : 'New chatbot policy'}</Dialog.Title>
		</Dialog.Header>
		<div class="grid grid-cols-2 gap-3 py-2 text-xs">
			<label class="col-span-2 flex flex-col gap-1">
				<span>Name</span>
				<Input bind:value={form.name} placeholder="strict-local" />
			</label>
			<label class="col-span-2 flex flex-col gap-1">
				<span>Description</span>
				<Textarea rows={2} bind:value={form.description} />
			</label>
			<label class="flex flex-col gap-1">
				<span>Restriction level</span>
				<Input type="number" bind:value={form.restriction_level} min="0" max="100" />
			</label>
			<label class="flex flex-col gap-1">
				<span>Retention (days, 0 = off)</span>
				<Input type="number" bind:value={form.retention_days} min="0" />
			</label>
			<label class="flex flex-col gap-1">
				<span>Provider</span>
				<Input bind:value={form.provider} placeholder="anthropic / openai / ollama" />
			</label>
			<label class="flex flex-col gap-1">
				<span>Model</span>
				<Input bind:value={form.model} placeholder="claude-opus-4-8" />
			</label>
			<label class="col-span-2 flex flex-col gap-1">
				<span>Base URL (optional)</span>
				<Input bind:value={form.base_url} placeholder="http://ollama.local:11434" />
			</label>
			<label class="col-span-2 flex flex-col gap-1">
				<span>API key {editing ? '(leave blank to keep unchanged)' : ''}</span>
				<Input
					type="password"
					value={apiKeyInput}
					oninput={(e) => {
						apiKeyInput = (e.target as HTMLInputElement).value;
						apiKeyTouched = true;
					}}
					placeholder="sk-…"
				/>
			</label>
			<label class="flex flex-col gap-1">
				<span>Max turns / conversation</span>
				<Input type="number" bind:value={form.max_turns_per_conversation} min="1" />
			</label>
			<label class="flex flex-col gap-1">
				<span>Max tool calls / turn</span>
				<Input type="number" bind:value={form.max_tool_calls_per_turn} min="1" />
			</label>
			<label class="flex flex-col gap-1">
				<span>Daily budget · user</span>
				<Input type="number" bind:value={form.daily_token_budget_per_user} min="0" />
			</label>
			<label class="flex flex-col gap-1">
				<span>Daily budget · org</span>
				<Input type="number" bind:value={form.daily_token_budget_org} min="0" />
			</label>
			<label class="col-span-2 flex items-center gap-2">
				<Switch
					checked={form.auto_execute_read_tools ?? true}
					onCheckedChange={(v) => (form.auto_execute_read_tools = v)}
				/>
				<span>Auto-execute read-only tools</span>
			</label>
			<label class="col-span-2 flex items-center gap-2">
				<Switch
					checked={form.auto_approve_write_tools ?? false}
					onCheckedChange={(v) => (form.auto_approve_write_tools = v)}
				/>
				<span>Auto-approve writes (skip Approve/Deny)</span>
			</label>
			<label class="flex items-center gap-2">
				<Switch
					checked={form.redact_ips ?? false}
					onCheckedChange={(v) => (form.redact_ips = v)}
				/>
				<span>Redact IPs</span>
			</label>
			<label class="flex items-center gap-2">
				<Switch
					checked={form.redact_emails ?? false}
					onCheckedChange={(v) => (form.redact_emails = v)}
				/>
				<span>Redact emails</span>
			</label>
			<label class="flex items-center gap-2">
				<Switch
					checked={form.redact_hashes ?? false}
					onCheckedChange={(v) => (form.redact_hashes = v)}
				/>
				<span>Redact hashes</span>
			</label>
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (editorOpen = false)} disabled={submitting}>
				Cancel
			</Button>
			<Button onclick={submit} disabled={submitting}>
				{submitting ? 'Saving…' : editing ? 'Save' : 'Create'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Session viewer modal. -->
<Dialog.Root bind:open={sessionViewOpen}>
	<Dialog.Content class="max-h-[80vh] max-w-3xl overflow-hidden">
		<Dialog.Header>
			<Dialog.Title>
				{#if sessionDetail}
					{sessionDetail.title || `Untitled #${sessionDetail.id}`}
				{:else}
					Loading conversation…
				{/if}
			</Dialog.Title>
		</Dialog.Header>
		<div class="max-h-[60vh] overflow-y-auto text-xs">
			{#if sessionLoading}
				<p class="text-muted-foreground">Loading…</p>
			{:else if sessionDetail}
				<div class="mb-3 flex flex-wrap gap-2 text-2xs text-muted-foreground">
					<span>User #{sessionDetail.user_id}</span>
					<span>·</span>
					<span>{scopeLabel(sessionDetail)}</span>
					{#if sessionDetail.model}<span>·</span><span>{sessionDetail.model}</span>{/if}
					<span>·</span>
					<span>
						Restriction {sessionDetail.resolved_restriction_level}
					</span>
					{#if sessionDetail.usage}
						<span>·</span>
						<span>
							{sessionDetail.usage.total_tokens.toLocaleString()} tokens
						</span>
						<span>·</span>
						<span>
							avg ctx {sessionDetail.usage.avg_context_size.toLocaleString()}
						</span>
					{/if}
				</div>
				<div class="flex flex-col gap-2">
					{#each sessionDetail.messages as m (m.id)}
						<div class="rounded border bg-muted/20 p-2">
							<div class="mb-1 text-2xs font-medium text-muted-foreground">
								{m.role}
							</div>
							<div class="whitespace-pre-wrap break-words">
								{#each m.content as block, i (i)}
									{#if block.type === 'text' && typeof block.text === 'string'}
										{block.text}
									{:else if block.type === 'tool_use'}
										<span class="text-blue-600">
											[tool_use {block.name}({JSON.stringify(block.input)})]
										</span>
									{:else if block.type === 'tool_result'}
										<span class="text-green-700">
											[tool_result {typeof block.content === 'string'
												? block.content
												: JSON.stringify(block.content)}]
										</span>
									{:else}
										<span class="text-muted-foreground">
											[{block.type}]
										</span>
									{/if}
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (sessionViewOpen = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<ConfirmationDialog
	bind:open={confirmOpen}
	title="Delete this policy?"
	message={pendingDelete
		? `"${pendingDelete.name}" will be deleted. Customers bound to it will revert to the global chatbot settings.`
		: ''}
	confirmText="Delete"
	onConfirm={confirmDelete}
/>

<ConfirmationDialog
	bind:open={eraseConfirmOpen}
	title="Erase all chat records for this user?"
	message={dpoUserIdInput
		? `Every conversation, message, and egress audit row for user #${dpoUserIdInput} will be hard-deleted. This cannot be undone.`
		: ''}
	confirmText="Erase permanently"
	onConfirm={confirmErase}
/>

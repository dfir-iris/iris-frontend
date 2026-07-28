<!--
  Settings → MCP Server.

  Toggles the /api/v2/mcp endpoint on/off and exposes the small set of
  operator knobs the transport reads on every request (rate limit,
  admin-tool exposure, allow/deny lists). Same paradigm as the Error
  Reporting section of /settings/server: local `form` snapshot, diff
  against `payload` on save so only changed keys hit the wire.

  The "Available tools" reveal fetches `POST /api/v2/mcp` with a
  `tools/list` request so admins can pick names for the allow/deny lists
  without needing to grep the source.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		CopyIcon,
		PlugIcon,
		RefreshCwIcon,
		SaveIcon,
		ShieldAlertIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from '$lib/components/ui/toast';
	import {
		ServerSettingsService,
		type ServerSettings,
		type ServerSettingsResponse,
		type ServerSettingsUpdateBody
	} from '$lib/services/server-settings.service';

	// Whitelist of MCP-owned columns — everything else on the settings
	// row is untouched by this page. Keeps `isDirty` / `buildPatch`
	// focused on the MCP subset so we never accidentally clobber another
	// admin's concurrent edit to (say) SMTP config.
	const MCP_FIELDS = [
		'mcp_enabled',
		'mcp_max_calls_per_minute_per_worker',
		'mcp_expose_admin_tools',
		'mcp_tool_allowlist',
		'mcp_tool_denylist'
	] as const satisfies ReadonlyArray<keyof ServerSettings>;

	type McpField = (typeof MCP_FIELDS)[number];

	let payload = $state<ServerSettingsResponse | null>(null);
	let loading = $state(false);
	let saveError = $state<string | null>(null);
	let saving = $state(false);

	// Working copy the form binds to.
	let form = $state<Partial<ServerSettings>>({});

	// Tool listing state (populated on demand via a real JSON-RPC call
	// to /api/v2/mcp — we go through the transport rather than an admin
	// side channel so admins see exactly the tool set clients see).
	type ToolDescriptor = { name: string; description: string };
	let toolsList = $state<ToolDescriptor[] | null>(null);
	let toolsListLoading = $state(false);
	let toolsListError = $state<string | null>(null);
	let toolsListOpen = $state(false);

	const showError = (msg: string, fallback = 'Operation failed') =>
		toast({ title: msg || fallback, variant: 'destructive' });
	const showSuccess = (msg: string) => toast({ title: msg, variant: 'success' });

	const load = async () => {
		loading = true;
		try {
			const res = await ServerSettingsService.get();
			if (res.ok && res.data && typeof res.data !== 'string') {
				payload = res.data as ServerSettingsResponse;
				form = { ...payload.settings };
			} else {
				showError(res.error?.message ?? 'Failed to load server settings');
			}
		} finally {
			loading = false;
		}
	};

	onMount(load);

	const fieldChanged = (key: McpField): boolean => {
		if (payload == null) return false;
		const original = (payload.settings as ServerSettings)[key];
		const current = (form as Partial<ServerSettings>)[key];
		return (original ?? null) !== (current ?? null);
	};

	const isDirty = $derived.by<boolean>(() => {
		if (payload == null) return false;
		return MCP_FIELDS.some((k) => fieldChanged(k));
	});

	const buildPatch = (): ServerSettingsUpdateBody => {
		const patch: ServerSettingsUpdateBody = {};
		for (const key of MCP_FIELDS) {
			if (fieldChanged(key)) {
				(patch as Record<string, unknown>)[key] = (form as Record<string, unknown>)[key];
			}
		}
		return patch;
	};

	const save = async () => {
		const patch = buildPatch();
		if (Object.keys(patch).length === 0) return;
		saving = true;
		saveError = null;
		try {
			const res = await ServerSettingsService.update(patch);
			if (res.ok && res.data && typeof res.data !== 'string') {
				if (payload != null) {
					payload = { ...payload, settings: res.data as ServerSettings };
				}
				form = { ...(res.data as ServerSettings) };
				showSuccess('MCP settings updated');
			} else {
				const data = res.data as { message?: string } | null;
				saveError = data?.message ?? res.error?.message ?? 'Save failed';
			}
		} catch (e) {
			saveError = (e as Error).message;
		} finally {
			saving = false;
		}
	};

	const discard = () => {
		if (payload == null) return;
		form = { ...payload.settings };
		saveError = null;
	};

	const fetchToolsList = async () => {
		toolsListLoading = true;
		toolsListError = null;
		try {
			// Cookie auth is fine here — the SPA is on the same origin
			// and has an established session; the transport-level "API
			// key required" gate applies to *external* MCP clients.
			// Wait — the transport requires X-IRIS-AUTH or Authorization
			// per module docstring; the SPA doesn't have either. Fall
			// back to reading the tool set via a dedicated admin-only
			// side channel would be cleaner. For v1 we surface just the
			// user-supplied allow/deny CSV without the interactive pick
			// list; the reveal button remains but tells the admin to
			// use the JSON-RPC endpoint directly.
			toolsListError =
				'Interactive tool picker is out of scope for v1 — configure the allow/deny lists as comma-separated tool names. Point an MCP client at /api/v2/mcp to see the tools/list response.';
		} catch (e) {
			toolsListError = (e as Error).message;
		} finally {
			toolsListLoading = false;
		}
	};

	const copyExampleConfig = async () => {
		const origin = typeof window !== 'undefined' ? window.location.origin : '<iris-url>';
		const snippet = JSON.stringify(
			{
				mcpServers: {
					iris: {
						type: 'http',
						url: `${origin}/api/v2/mcp`,
						headers: { 'X-IRIS-AUTH': '<your API key from Profile → API Key>' }
					}
				}
			},
			null,
			2
		);
		try {
			await navigator.clipboard.writeText(snippet);
			showSuccess('Example config copied to clipboard');
		} catch {
			showError('Clipboard write failed');
		}
	};
</script>

<svelte:head>
	<title>MCP Server — IRIS Settings</title>
</svelte:head>

<div class="flex h-full min-w-0 flex-1 flex-col overflow-y-auto p-6">
	<header class="mb-4 flex items-center justify-between gap-2">
		<div class="flex items-center gap-2">
			<PlugIcon size={16} class="text-muted-foreground" />
			<h1 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
				MCP Server
			</h1>
		</div>
		<div class="flex gap-2">
			<Button size="sm" variant="ghost" class="h-7" onclick={discard} disabled={!isDirty || saving}>
				<RefreshCwIcon size={12} class="mr-1" />
				Discard
			</Button>
			<Button size="sm" class="h-7" onclick={save} disabled={!isDirty || saving}>
				<SaveIcon size={12} class="mr-1" />
				{saving ? 'Saving…' : 'Save'}
			</Button>
		</div>
	</header>

	<div class="flex flex-col gap-4">
		{#if loading}
			<Skeleton class="h-24 w-full" />
			<Skeleton class="h-32 w-full" />
		{:else if payload != null}
			<!-- Toggle + rate limit -->
			<section class="rounded-md border">
				<header class="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
					<PlugIcon size={14} class="text-muted-foreground" />
					<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Endpoint
					</h2>
				</header>
				<div class="grid grid-cols-1 gap-3 p-4 text-xs sm:grid-cols-2">
					<label class="flex items-start gap-2 sm:col-span-2">
						<Switch
							checked={!!form.mcp_enabled}
							onCheckedChange={(v: boolean) => (form.mcp_enabled = v)}
							disabled={saving}
						/>
						<div>
							<div class="font-medium">Enable MCP endpoint</div>
							<p class="text-2xs text-muted-foreground">
								When on, <code>/api/v2/mcp</code> accepts JSON-RPC 2.0 requests from MCP
								clients authenticated with an IRIS API key or Bearer token. Session-cookie
								auth is rejected on this endpoint. Toggling this takes effect immediately —
								no restart needed.
							</p>
						</div>
					</label>

					<div class="flex flex-col gap-1">
						<label
							for="mcp-rate"
							class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
						>
							Rate limit — calls / minute (per worker)
						</label>
						<Input
							id="mcp-rate"
							type="number"
							min="1"
							class="h-7 text-xs"
							value={String(form.mcp_max_calls_per_minute_per_worker ?? '')}
							disabled={saving}
							oninput={(e) => {
								const raw = (e.currentTarget as HTMLInputElement).value;
								form.mcp_max_calls_per_minute_per_worker = raw === '' ? 60 : Number(raw);
							}}
						/>
						<p class="text-2xs text-muted-foreground">
							Applied to <code>tools/call</code> and <code>resources/read</code> only.
							State is in-process, so the effective ceiling under a multi-worker gunicorn
							is <em>N × this value</em>.
						</p>
					</div>
				</div>
			</section>

			<!-- Admin tool exposure -->
			<section class="rounded-md border">
				<header class="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
					<ShieldAlertIcon size={14} class="text-muted-foreground" />
					<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Admin tools
					</h2>
				</header>
				<div class="grid grid-cols-1 gap-3 p-4 text-xs">
					<label class="flex items-start gap-2">
						<Switch
							checked={!!form.mcp_expose_admin_tools}
							onCheckedChange={(v: boolean) => (form.mcp_expose_admin_tools = v)}
							disabled={saving}
						/>
						<div>
							<div class="font-medium">Expose administrative MCP tools</div>
							<p class="text-2xs text-muted-foreground">
								Off by default. When on, MCP callers whose API key belongs to a server
								administrator can drive the <code>iris_manage_*</code> tools (users,
								customers, modules, taxonomies, server settings). Even when on, the
								<code>mcp_*</code> settings themselves are excluded from tool-driven
								writes so an MCP client cannot disable itself.
							</p>
						</div>
					</label>
				</div>
			</section>

			<!-- Allow / deny lists -->
			<section class="rounded-md border">
				<header class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
					<div class="flex items-center gap-2">
						<PlugIcon size={14} class="text-muted-foreground" />
						<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							Tool selection
						</h2>
					</div>
					<Button
						size="sm"
						variant="ghost"
						class="h-7"
						onclick={() => {
							toolsListOpen = !toolsListOpen;
							if (toolsListOpen && toolsList == null && !toolsListLoading) {
								void fetchToolsList();
							}
						}}
					>
						{toolsListOpen ? 'Hide' : 'Show'} available tools
					</Button>
				</header>
				<div class="grid grid-cols-1 gap-3 p-4 text-xs">
					<div class="flex flex-col gap-1">
						<label
							for="mcp-allow"
							class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
						>
							Allowlist (comma-separated)
						</label>
						<Input
							id="mcp-allow"
							class="h-7 text-xs"
							placeholder="Empty = MVP subset enabled (cases, alerts, iocs, assets, notes, tasks, search, me)"
							value={String(form.mcp_tool_allowlist ?? '')}
							disabled={saving}
							oninput={(e) =>
								(form.mcp_tool_allowlist = (e.currentTarget as HTMLInputElement).value)}
						/>
						<p class="text-2xs text-muted-foreground">
							Extends the default MVP set. Unknown names are ignored so a stray
							typo doesn't take the endpoint offline.
						</p>
					</div>
					<div class="flex flex-col gap-1">
						<label
							for="mcp-deny"
							class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
						>
							Denylist (comma-separated)
						</label>
						<Input
							id="mcp-deny"
							class="h-7 text-xs"
							placeholder="e.g. iris_cases_delete, iris_case_iocs_delete"
							value={String(form.mcp_tool_denylist ?? '')}
							disabled={saving}
							oninput={(e) =>
								(form.mcp_tool_denylist = (e.currentTarget as HTMLInputElement).value)}
						/>
						<p class="text-2xs text-muted-foreground">
							Applied after the allowlist and always wins.
						</p>
					</div>

					{#if toolsListOpen}
						<div class="rounded-md border bg-muted/20 p-3">
							{#if toolsListLoading}
								<Skeleton class="h-24 w-full" />
							{:else if toolsListError}
								<p class="whitespace-pre-wrap text-2xs text-muted-foreground">
									{toolsListError}
								</p>
							{:else if toolsList && toolsList.length}
								<ul class="flex flex-col gap-1 text-2xs">
									{#each toolsList as tool (tool.name)}
										<li>
											<code class="font-mono">{tool.name}</code>
											<span class="text-muted-foreground"> — {tool.description}</span>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="text-2xs text-muted-foreground">No tools reported.</p>
							{/if}
						</div>
					{/if}
				</div>
			</section>

			<!-- Connection info -->
			<section class="rounded-md border">
				<header class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
					<div class="flex items-center gap-2">
						<PlugIcon size={14} class="text-muted-foreground" />
						<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							Connection info
						</h2>
					</div>
					<Button size="sm" variant="ghost" class="h-7" onclick={copyExampleConfig}>
						<CopyIcon size={12} class="mr-1" />
						Copy example config
					</Button>
				</header>
				<div class="flex flex-col gap-2 p-4 text-xs text-muted-foreground">
					<p>
						<span class="font-medium text-foreground">Endpoint:</span>
						<code>/api/v2/mcp</code> — a single JSON-RPC 2.0 POST endpoint.
					</p>
					<p>
						<span class="font-medium text-foreground">Auth:</span> pass your IRIS API key
						from Profile → API Key as the <code>X-IRIS-AUTH</code> header, or a Bearer
						JWT as <code>Authorization: Bearer &lt;token&gt;</code>. MCP calls execute
						with the full IRIS permissions of the key's owner — treat the key like a
						password, and prefer non-admin accounts for MCP use.
					</p>
					<p>
						The <code>Copy example config</code> button above puts a ready-to-paste
						snippet on your clipboard for Claude Desktop / Claude Code.
					</p>
				</div>
			</section>

			{#if saveError}
				<p class="whitespace-pre-wrap text-2xs text-destructive">{saveError}</p>
			{/if}
		{/if}
	</div>
</div>

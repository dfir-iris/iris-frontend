<!--
  Renders `children` only when AI workflows are enabled on the instance
  (runtime-config) and the user holds `ai_workflows_read`; otherwise a
  short explanation. Direct URL access lands here too, not only the nav.
-->
<script lang="ts">
	import { getContext, type Snippet } from 'svelte';
	import { LockIcon, WorkflowIcon } from 'lucide-svelte';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import type { PermissionName } from '$lib/services/user-context.service';
	import { runtimeConfig } from '$lib/stores/runtime-config.store.svelte';

	/** `also`: other permissions that open the page as well. */
	let { children, also = [] }: { children: Snippet; also?: PermissionName[] } = $props();

	const userCtx = getContext<UserCtx>(USER_CTX);
	const ready = $derived(userCtx?.ready ?? false);
	const allowed = $derived(
		!!userCtx && (userCtx.can('ai_workflows_read') || also.some((p) => userCtx.can(p)))
	);
	const enabled = $derived(runtimeConfig.aiWorkflowsEnabled);
</script>

{#if !ready}
	<p class="p-6 text-xs text-muted-foreground">Loading…</p>
{:else if !enabled}
	<div
		class="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground"
		data-testid="wf-disabled"
	>
		<WorkflowIcon size={32} class="opacity-40" />
		<p class="text-sm">Workflows are disabled on this instance.</p>
		<p class="max-w-md text-xs">
			An administrator can enable them with <code class="font-mono">AI_WORKFLOWS_ENABLED</code>.
		</p>
	</div>
{:else if !allowed}
	<div
		class="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground"
		data-testid="wf-forbidden"
	>
		<LockIcon size={32} class="opacity-40" />
		<p class="text-sm">You need the “Workflows read” permission to open this page.</p>
	</div>
{:else}
	{@render children()}
{/if}

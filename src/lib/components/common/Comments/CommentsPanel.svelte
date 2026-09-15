<!--
  Sliding side panel that hosts a comments thread for any case entity
  (event / asset / IOC / note / task / alert / evidence). Lives at the
  case workspace level so it doesn't tear down when the user navigates
  between detail pages. Driven by the `comments-panel.context` store.

  The thread itself — data lifecycle, list, composer — is
  `CommentsThread`; this component is only the panel chrome around it.
  A caller only needs to call `commentsPanel.open({ type, id, label })`
  — no clean-up callbacks required.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { XIcon, RefreshCwIcon, MessageSquareIcon } from 'lucide-svelte';
	import {
		COMMENTS_PANEL_CTX,
		type CommentsPanelContext
	} from '$lib/contexts/comments-panel.context.svelte';
	import CommentsThread from './CommentsThread.svelte';
	import Button from '$lib/components/ui/button/button.svelte';

	const panel = getContext<CommentsPanelContext>(COMMENTS_PANEL_CTX);

	let thread = $state<CommentsThread | null>(null);
	let loading = $state(false);

	// Escape-to-close
	$effect(() => {
		if (!panel.state.open) return;

		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') panel.close();
		};
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	});
</script>

{#if panel.state.open}
	<!--
	  Rendered inside CaseWorkspace as a sibling rounded card. The host
	  component owns the outer aside + corners; we just fill it.
	-->
	<div class="flex h-full w-full flex-col">
		<header class="flex items-center gap-2 border-b border-border px-4 py-3 dark:border-slate-700">
			<MessageSquareIcon class="size-4 shrink-0 text-muted-foreground" />
			<div class="min-w-0 flex-1">
				<div class="text-2xs uppercase tracking-wide text-muted-foreground">Comments</div>
				{#if panel.state.entity}
					<div class="truncate text-sm font-semibold">{panel.state.entity.label}</div>
				{:else}
					<div class="truncate text-sm italic text-muted-foreground">No selection</div>
				{/if}
			</div>
			<Button
				variant="ghost"
				size="icon"
				class="size-7"
				onclick={() => thread?.reload()}
				disabled={!panel.state.entity || loading}
				aria-label="Refresh comments"
			>
				<RefreshCwIcon class={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="size-7"
				onclick={() => panel.close()}
				aria-label="Close comments panel"
			>
				<XIcon class="size-4" />
			</Button>
		</header>

		<CommentsThread
			bind:this={thread}
			bind:loading
			entity={panel.state.entity}
			class="min-h-0 flex-1"
		/>
	</div>
{/if}

<!--
  What a template can reference: the run context variables, the output
  of the other nodes and `key('NAME')` for every keystore entry the
  user can use. Each snippet copies on click.
-->
<script lang="ts">
	import { ChevronRightIcon, CopyIcon, KeyRoundIcon, LockIcon } from 'lucide-svelte';
	import { toast } from '$lib/components/ui/toast';
	import type { AiKeystoreRef } from '$lib/services/ai-workflows.service';

	type Props = {
		keystore: AiKeystoreRef[];
		/** Other nodes, for `nodes.<id>.output`. */
		nodes?: { id: string; label: string }[];
		/** Show `callback.url` / `callback.token` (async http_request). */
		callback?: boolean;
		open?: boolean;
	};

	let { keystore, nodes = [], callback = false, open = false }: Props = $props();

	let expanded = $state(false);
	$effect.pre(() => {
		expanded = open;
	});

	const CONTEXT: { expr: string; help: string }[] = [
		{ expr: 'trigger.type', help: 'event / cron / manual / webhook' },
		{ expr: 'trigger.hook', help: 'Hook name (event trigger)' },
		{ expr: 'trigger.payload', help: 'Trigger payload' },
		{ expr: 'trigger.entity_type', help: 'alert, alert_cluster, case, war_room' },
		{ expr: 'trigger.entity_id', help: 'Entity id' },
		{ expr: 'trigger.sub_entity', help: 'Sub-entity (e.g. the IOC of a case)' },
		{ expr: 'entity', help: 'Snapshot of the entity' },
		{ expr: 'vars', help: 'Variables set by Set variables nodes' },
		{ expr: 'run.uuid', help: 'Run id' },
		{ expr: 'run.workflow_name', help: 'Workflow name' },
		{ expr: 'run.version', help: 'Workflow version' },
		{ expr: 'run.dry_run', help: 'True for a dry run' },
		{ expr: 'now', help: 'Current time (ISO 8601)' }
	];

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast({ title: 'Copied', description: text });
		} catch {
			toast({ title: 'Copy failed', variant: 'destructive' });
		}
	}
</script>

<div class="rounded-md border bg-muted/20 text-xs" data-testid="wf-template-help">
	<button
		type="button"
		class="flex w-full items-center gap-1 px-2 py-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground"
		aria-expanded={expanded}
		onclick={() => (expanded = !expanded)}
	>
		<ChevronRightIcon size={11} class={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
		Template variables
	</button>
	{#if expanded}
		<div class="flex flex-col gap-2 border-t px-2 py-2">
			<p class="text-2xs text-muted-foreground">
				Jinja templates, e.g. <code class="font-mono">{'{{ entity.alert_title }}'}</code>. Click to
				copy.
			</p>
			<div class="flex flex-col gap-0.5">
				{#each CONTEXT as item (item.expr)}
					<button
						type="button"
						class="group flex items-baseline gap-2 rounded px-1 py-0.5 text-left hover:bg-muted"
						onclick={() => copy(`{{ ${item.expr} }}`)}
					>
						<code class="shrink-0 font-mono text-2xs">{item.expr}</code>
						<span class="truncate text-2xs text-muted-foreground">{item.help}</span>
						<CopyIcon size={10} class="ml-auto shrink-0 opacity-0 group-hover:opacity-60" />
					</button>
				{/each}
				{#if callback}
					<button
						type="button"
						class="flex items-baseline gap-2 rounded px-1 py-0.5 text-left hover:bg-muted"
						onclick={() => copy('{{ callback.url }}')}
					>
						<code class="font-mono text-2xs">callback.url</code>
						<span class="text-2xs text-muted-foreground">Async callback URL</span>
					</button>
					<button
						type="button"
						class="flex items-baseline gap-2 rounded px-1 py-0.5 text-left hover:bg-muted"
						onclick={() => copy('{{ callback.token }}')}
					>
						<code class="font-mono text-2xs">callback.token</code>
						<span class="text-2xs text-muted-foreground">Bearer token for the callback</span>
					</button>
				{/if}
			</div>

			{#if nodes.length}
				<div class="flex flex-col gap-0.5">
					<span class="text-2xs font-semibold text-muted-foreground">Node outputs</span>
					{#each nodes as n (n.id)}
						<button
							type="button"
							class="flex items-baseline gap-2 rounded px-1 py-0.5 text-left hover:bg-muted"
							onclick={() => copy(`{{ nodes.${n.id}.output }}`)}
						>
							<code class="shrink-0 font-mono text-2xs">nodes.{n.id}.output</code>
							<span class="truncate text-2xs text-muted-foreground">{n.label}</span>
						</button>
					{/each}
				</div>
			{/if}

			<div class="flex flex-col gap-0.5">
				<span class="text-2xs font-semibold text-muted-foreground">Keystore</span>
				{#each keystore as entry (`${entry.scope}:${entry.name}`)}
					<button
						type="button"
						class="flex items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-muted"
						onclick={() => copy(`{{ key('${entry.name}') }}`)}
					>
						{#if entry.is_secret}
							<LockIcon size={10} class="shrink-0 text-amber-600" />
						{:else}
							<KeyRoundIcon size={10} class="shrink-0 text-muted-foreground" />
						{/if}
						<code class="font-mono text-2xs">key('{entry.name}')</code>
						<span class="text-2xs text-muted-foreground">{entry.scope}</span>
					</button>
				{:else}
					<p class="px-1 text-2xs text-muted-foreground">
						No keystore entries. Add some under Settings › Keystore.
					</p>
				{/each}
				<p class="px-1 text-2xs text-muted-foreground">
					Secret values are never sent to the LLM: in an agent prompt they render as
					<code class="font-mono">[secret:NAME]</code>.
				</p>
			</div>
		</div>
	{/if}
</div>

<!--
  Approve / Deny UI for a pending write tool call.

  Shows a **diff-of-state** description in analyst language via
  `_describeAction()` — falls back to a JSON dump for tools without a
  hand-written renderer. Includes an untrusted-content banner (§7 of
  the plan) so the analyst is nudged to evaluate the suggestion
  independently of the case data that may have inspired it.
-->
<script lang="ts">
	import { AlertTriangleIcon, CheckIcon, XIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import type { PendingToolCall } from '$lib/services/chat.service';

	let {
		pending,
		onApprove,
		onDeny
	}: {
		pending: PendingToolCall;
		onApprove: (id: number) => void;
		onDeny: (id: number) => void;
	} = $props();

	// Per-tool state-diff descriptions. Extending this dict is the
	// canonical way to make the Approve card readable for a new write
	// tool. Fall-through renders raw JSON with a warning.
	function describeAction(pc: PendingToolCall): string | null {
		const a = pc.arguments as Record<string, unknown>;
		switch (pc.tool_name) {
			case 'iris_cases_close':
				return `Close case #${a.case_identifier}.`;
			case 'iris_cases_reopen':
				return `Reopen case #${a.case_identifier}.`;
			case 'iris_cases_update':
				return `Update case #${a.case_identifier}.`;
			case 'iris_cases_create':
				return `Create a new case${
					a.payload && typeof a.payload === 'object'
						? ` named ${JSON.stringify((a.payload as Record<string, unknown>).case_name ?? '')}`
						: ''
				}.`;
			case 'iris_case_iocs_create':
				return `Create a new IOC on case #${a.case_identifier}.`;
			case 'iris_case_iocs_update':
				return `Update IOC #${a.ioc_identifier} on case #${a.case_identifier}.`;
			case 'iris_case_iocs_delete':
				return `Delete IOC #${a.ioc_identifier} from case #${a.case_identifier}.`;
			case 'iris_case_assets_create':
				return `Create a new asset on case #${a.case_identifier}.`;
			case 'iris_case_assets_update':
				return `Update asset #${a.asset_identifier} on case #${a.case_identifier}.`;
			case 'iris_case_assets_delete':
				return `Delete asset #${a.asset_identifier} from case #${a.case_identifier}.`;
			case 'iris_case_notes_create': {
				const p = (a.payload as Record<string, unknown>) ?? {};
				return `Create a note${p.note_title ? ` titled "${p.note_title}"` : ''} on case #${a.case_identifier}.`;
			}
			case 'iris_case_notes_update':
				return `Update note #${a.note_identifier} on case #${a.case_identifier}.`;
			case 'iris_case_tasks_create':
				return `Create a task on case #${a.case_identifier}.`;
			case 'iris_case_tasks_update':
				return `Update task #${a.task_identifier} on case #${a.case_identifier}.`;
			case 'iris_case_tasks_set_status':
				return `Set task #${a.task_identifier} to status ${a.task_status_id}.`;
			case 'iris_alerts_escalate':
				return `Escalate alert #${a.alert_identifier} into a new case.`;
			case 'iris_alerts_merge':
				return `Merge alert #${a.alert_identifier} into case #${a.target_case_id}.`;
			default:
				return null;
		}
	}

	const description = $derived(describeAction(pending));
</script>

<div class="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
	<div class="flex items-start gap-2">
		<AlertTriangleIcon
			size={14}
			class="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
		/>
		<div class="flex flex-col gap-2">
			<div class="font-medium">
				The assistant proposes to run
				<code class="rounded bg-muted px-1 py-0.5 font-mono text-2xs">
					{pending.tool_name}
				</code>
			</div>
			{#if description}
				<div class="text-xs">{description}</div>
			{:else}
				<pre
					class="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono text-2xs"
				>{JSON.stringify(pending.arguments, null, 2)}</pre>
			{/if}
			<p class="text-2xs text-muted-foreground">
				This suggestion may have been influenced by content in your case
				data. Approve only if the action matches what you intended to do.
			</p>
			<div class="mt-1 flex gap-2">
				<Button size="sm" onclick={() => onApprove(pending.id)}>
					<CheckIcon size={12} class="mr-1" />
					Approve
				</Button>
				<Button
					size="sm"
					variant="outline"
					onclick={() => onDeny(pending.id)}
				>
					<XIcon size={12} class="mr-1" />
					Deny
				</Button>
			</div>
		</div>
	</div>
</div>

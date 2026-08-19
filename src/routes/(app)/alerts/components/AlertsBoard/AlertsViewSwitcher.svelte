<!--
  List / board toggle for the alerts page, plus the board's grouping
  choice.

  The two live together because the grouping only means anything in
  board mode: showing it as a standalone control in the header would
  offer the analyst a knob that does nothing half the time.
-->
<script lang="ts">
	import { Columns3, List } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Tooltip, TooltipProvider, TooltipTrigger } from '$lib/components/ui/tooltip';
	import TooltipContent from '$lib/components/ui/tooltip/tooltip-content.svelte';
	import type { AlertBoardGroup, AlertViewMode } from './board-config';

	type Props = {
		view: AlertViewMode;
		group: AlertBoardGroup;
		onViewChange: (view: AlertViewMode) => void;
		onGroupChange: (group: AlertBoardGroup) => void;
	};

	let { view, group, onViewChange, onGroupChange }: Props = $props();

	const views = [
		{ mode: 'list', Icon: List, label: 'List view' },
		{ mode: 'board', Icon: Columns3, label: 'Board view' }
	] as const;

	const groups = [
		{
			mode: 'severity',
			label: 'Unassigned by severity',
			hint: 'Alerts nobody owns yet, one column per severity'
		},
		{
			mode: 'status',
			label: 'Assigned by status',
			hint: 'Alerts that have an owner, one column per status'
		}
	] as const;
</script>

<div class="flex items-center gap-2">
	{#if view === 'board'}
		<div class="flex items-center gap-1">
			{#each groups as g (g.mode)}
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger>
							<Button
								variant={group === g.mode ? 'default' : 'outline'}
								size="xs"
								aria-pressed={group === g.mode}
								onclick={() => onGroupChange(g.mode)}
							>
								{g.label}
							</Button>
						</TooltipTrigger>
						<TooltipContent align="center" side="bottom">{g.hint}</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			{/each}
		</div>
	{/if}

	<div class="flex items-center gap-1">
		{#each views as v (v.mode)}
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button
							variant={view === v.mode ? 'default' : 'outline'}
							size="xs"
							aria-label={v.label}
							aria-pressed={view === v.mode}
							onclick={() => onViewChange(v.mode)}
						>
							<v.Icon class="h-4 w-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent align="center" side="bottom">{v.label}</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		{/each}
	</div>
</div>

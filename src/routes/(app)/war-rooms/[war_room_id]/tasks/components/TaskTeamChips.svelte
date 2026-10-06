<!--
  Compact, colour-tinted chips for the teams a war-room task is assigned
  to. Shows the first couple and folds the rest into "+N", whose tooltip
  names them.
-->
<script lang="ts">
	import type { WarRoomTaskTeam } from '$lib/services/war-room-tasks.service';
	import { splitTeamChips, teamChipStyle, teamDotStyle } from '../task-teams';

	interface Props {
		teams: WarRoomTaskTeam[] | null | undefined;
		max?: number;
	}

	let { teams, max }: Props = $props();

	const split = $derived(splitTeamChips(teams, max));
</script>

{#if split.shown.length || split.hidden.length}
	<span class="inline-flex min-w-0 items-center gap-1 align-middle" data-testid="task-team-chips">
		{#each split.shown as t (t.team_id)}
			<span
				class="inline-flex max-w-[10rem] items-center gap-1 rounded-full border px-1.5 py-0 text-2xs text-foreground"
				style={teamChipStyle(t.color)}
				title={`Team @${t.name}`}
			>
				<span
					class="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground"
					style={teamDotStyle(t.color)}
					aria-hidden="true"
				></span>
				<span class="truncate">@{t.name}</span>
			</span>
		{/each}
		{#if split.hidden.length}
			<span
				class="inline-flex shrink-0 items-center rounded-full border px-1.5 py-0 text-2xs text-muted-foreground"
				title={split.hiddenTitle}
				aria-label={`${split.hidden.length} more team${split.hidden.length === 1 ? '' : 's'}: ${split.hiddenTitle}`}
			>
				+{split.hidden.length}
			</span>
		{/if}
	</span>
{/if}

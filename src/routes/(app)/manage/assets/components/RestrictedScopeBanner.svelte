<!--
  Standing notice that the sighting data on this page is filtered.

  Deliberately not dismissible. Every count, timestamp and compromise
  badge in the registry is computed over the cases and alerts the
  current viewer can open — never the true total — and there is no
  per-asset indicator of what was left out (that would be a one-bit
  oracle for the existence of investigations the viewer isn't cleared
  for). The one honest thing to show is this caller-level flag, so it
  stays on screen for as long as it applies.
-->
<script lang="ts">
	import { InfoIcon } from 'lucide-svelte';

	type Props = { visible?: boolean };
	let { visible = false }: Props = $props();
</script>

{#if visible}
	<div
		role="note"
		class="flex items-start gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-800 dark:text-sky-300"
	>
		<InfoIcon size={14} class="mt-0.5 shrink-0" />
		<p>
			Sighting counts, timestamps and compromise status cover only the cases and alerts you have
			access to. Assets may have been seen elsewhere.
		</p>
	</div>
{/if}

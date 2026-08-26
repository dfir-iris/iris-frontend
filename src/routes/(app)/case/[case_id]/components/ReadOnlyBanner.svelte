<!--
  Read-only banner shown under the case topbar when the current user has
  CaseAccessLevel.READ_ONLY (2). Lives inside the case layout so it persists
  across every sub-route of /case/:id. Matches the warning toast palette
  used elsewhere in the app to stay visually consistent.
-->
<script lang="ts">
	import { EyeIcon } from 'lucide-svelte';
</script>

<div
	class="flex shrink-0 items-center gap-2 border-b border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800 dark:border-yellow-700/40 dark:bg-yellow-700/10 dark:text-yellow-200"
	role="status"
>
	<EyeIcon class="size-4 shrink-0" />
	<span>
		You have read-only access to this case. Edit, create and delete actions are disabled.
	</span>
</div>

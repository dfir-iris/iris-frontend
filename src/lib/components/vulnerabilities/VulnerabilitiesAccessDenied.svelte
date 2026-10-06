<!--
  Shown in place of a vulnerability page for users without
  `vulnerabilities_read`: nothing is fetched behind it.
-->
<script lang="ts">
	import { ShieldOffIcon } from 'lucide-svelte';
</script>

<div
	class="mx-auto flex max-w-md flex-col items-center gap-2 px-5 py-16 text-center"
	data-testid="vulnerabilities-access-denied"
>
	<ShieldOffIcon class="h-8 w-8 text-muted-foreground" />
	<p class="text-sm font-medium">You don't have permission to view vulnerabilities</p>
	<p class="text-xs text-muted-foreground">
		Ask an administrator for the <code>vulnerabilities_read</code> permission.
	</p>
</div>

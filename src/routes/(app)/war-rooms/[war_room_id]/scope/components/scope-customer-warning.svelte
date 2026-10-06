<!--
  Shown before submitting a write that spans more than one customer:
  pushing one customer's data into another customer's case is a leak the
  operator has to opt into knowingly.
-->
<script lang="ts">
	import { AlertTriangle } from 'lucide-svelte';
	import { limitedList } from './helpers';

	type Props = { customers: string[] };

	let { customers }: Props = $props();
</script>

{#if customers.length > 1}
	<div
		class="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
		role="alert"
		title={customers.length > 5 ? customers.join(', ') : undefined}
		data-testid="scope-cross-customer-warning"
	>
		<AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
		<p>
			<span class="font-medium">This spans {customers.length} customers</span>
			({limitedList(customers)}). Make sure the data may be shared between them before going on.
		</p>
	</div>
{/if}

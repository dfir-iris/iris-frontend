<script lang="ts">
	// Free-text column (a description, typically): one line in the row,
	// the whole thing on hover. The td has to be width-constrained for
	// `truncate` to bite — give the column a `tdClass` of `max-w-0`.
	export let value: string | null | undefined = '';
	export let placeholder: string = '-';
</script>

<span class="block truncate" title={value || ''}>
	{value || placeholder}
</span>

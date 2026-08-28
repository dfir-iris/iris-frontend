<script lang="ts">
	import { TagInput as TagInputComponent, TagDisplay } from '$lib/components/common/tag';
	import type { TagInput } from '$lib/types/resources/tag';

	let {
		tags = $bindable([] as TagInput),
		isEditing = false,
		outputFormat = 'auto',
		onTagsChange = (_newTags: TagInput) => {}
	}: {
		tags: TagInput;
		isEditing: boolean;
		outputFormat?: 'auto' | 'array' | 'string';
		onTagsChange?: (newTags: TagInput) => void;
	} = $props();

	// Determine the output format based on input if set to auto
	let actualOutputFormat = $state<'array' | 'string'>('array');

	$effect(() => {
		if (outputFormat === 'auto') {
			actualOutputFormat = typeof tags === 'string' ? 'string' : 'array';
		} else {
			actualOutputFormat = outputFormat as 'array' | 'string';
		}
	});

	// Watch for changes to tags
	$effect(() => {
		if (tags) {
			onTagsChange(tags);
		}
	});
</script>

<div class="space-y-2">
	{#if isEditing}
		<TagInputComponent bind:tags outputFormat={actualOutputFormat} />
	{:else}
		<TagDisplay {tags} />
	{/if}
</div>

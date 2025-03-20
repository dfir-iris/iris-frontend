<script lang="ts">
  import { TagInput, TagDisplay } from '$lib/components/common/tag';
  
  let {
    tags = $bindable([]),
    isEditing = false,
    outputFormat = 'auto',
    onTagsChange = (newTags: TagInput) => {}
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
    <TagInput bind:tags outputFormat={actualOutputFormat} />
  {:else}
    <TagDisplay {tags} />
  {/if}
</div>
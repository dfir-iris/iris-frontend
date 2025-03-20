<script lang="ts">
  import { cn } from '$lib/utils';
  import { tagsStore, type Tag, type TagInput } from '$lib/stores/tags.store';
	import { Tag as TagI } from 'lucide-svelte';
  
  let {
    tags = [],
    size = 'default',
    limit = 0,
    className = ''
  }: {
    tags: TagInput;
    size?: 'small' | 'default' | 'large';
    limit?: number;
    className?: string;
  } = $props();
  
  // Convert string to tags if needed
  let normalizedTags = $state<Tag[]>([]);
  
  $effect(() => {
    normalizedTags = tagsStore.normalizeTags(tags);
  });
  
  // Determine if we need to show a "+X more" indicator
  let displayedTags = $state<Tag[]>([]);
  let hasMore = $state(false);
  let moreCount = $state(0);
  
  $effect(() => {
    displayedTags = limit > 0 && normalizedTags.length > limit 
      ? normalizedTags.slice(0, limit)
      : normalizedTags;
    
    hasMore = limit > 0 && normalizedTags.length > limit;
    moreCount = normalizedTags.length - limit;
  });
  
  // Size-based classes
  const sizeClasses = {
    small: "h-5 text-xs px-1.5",
    default: "h-6 text-xs px-2",
    large: "h-7 text-sm px-2.5"
  };
</script>

<div class={cn("flex flex-wrap gap-1.5", className)}>
  {#each displayedTags as tag (tag.tag_id)}
    <div 
      class={cn(
        "inline-flex items-center rounded-md bg-muted",
        sizeClasses[size]
      )}
      title={tag.tag_title}
    >
      {#if tag.tag_color}
        <span 
          class="mr-1.5 inline-block h-2 w-2 rounded-full" 
          style={`background-color: ${tag.tag_color};`}
        ></span>
      {/if}
      <div class="flex items-center gap-1 rounded-full bg-muted py-1 text-xs truncate max-w-[150px]">
        <TagI size={12} />
        <span>{tag.tag_title}</span>
      </div>
    </div>
  {/each}
  
  {#if hasMore}
    <div 
      class={cn(
        "inline-flex items-center rounded-md bg-muted text-muted-foreground",
        sizeClasses[size]
      )}
    >
      +{moreCount} more
    </div>
  {/if}
  
  {#if normalizedTags.length === 0}
    <div class="text-sm text-muted-foreground">No tags</div>
  {/if}
</div>
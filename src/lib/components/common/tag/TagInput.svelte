<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { XIcon, PlusIcon, Loader2Icon } from 'lucide-svelte';
  import { tagsStore, type Tag, type TagInput } from '$lib/stores/tags.store';
  import { clickOutside } from '$lib/actions/click-outside';
  import { cn } from '$lib/utils';
  
  let {
    tags = $bindable([]),
    disabled = false,
    placeholder = 'Add tags...',
    maxTags = 10,
    className = '',
    outputFormat = 'array'
  }: {
    tags: TagInput;
    disabled?: boolean;
    placeholder?: string;
    maxTags?: number;
    className?: string;
    outputFormat?: 'array' | 'string';
    onchange?: (tags: Tag[]) => void;
  } = $props();
  
  // Local state
  let inputValue = $state('');
  let isFocused = $state(false);
  let selectedIndex = $state(-1);
  let inputElement: HTMLInputElement;
  let containerElement: HTMLDivElement;
  let suggestions = $state<Tag[]>([]);
  let isLoading = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout>;
  let internalTags = $state<Tag[]>([]);
  let shouldShowSuggestions = $state(false);
  
  // Initialize internal tags from input
  $effect(() => {
    internalTags = tagsStore.normalizeTags(tags);
  });
  
  // Update output based on format preference
  $effect(() => {
    if (outputFormat === 'string' && Array.isArray(tags)) {
      tags = tagsStore.tagsToString(internalTags);
    } else if (outputFormat === 'array' && typeof tags === 'string') {
      tags = internalTags;
    }
  });
  
  // Subscribe to the tags store
  const unsubscribe = tagsStore.subscribe((state) => {
    suggestions = state.suggestions;
    isLoading = state.isLoading;
  });
  
  onDestroy(() => {
    unsubscribe();
    clearTimeout(debounceTimer);
  });
  
  // Handle input changes with debounce
  function handleInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    
    // Check if the input contains a comma
    if (value.includes(',')) {
      // Split by comma and process each part
      const parts = value.split(',');
      
      // Process all parts except the last one as tags
      for (let i = 0; i < parts.length - 1; i++) {
        const tagText = parts[i].trim();
        if (tagText) {
          createTagFromText(tagText);
        }
      }
      
      // Keep only the last part in the input
      inputValue = parts[parts.length - 1];
    } else {
      inputValue = value;
      
      // Debounce the suggestion fetch
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (inputValue.trim()) {
          fetchSuggestions(inputValue);
        }
      }, 300);
    }
  }
  
  // Fetch suggestions from the API
  async function fetchSuggestions(query: string) {
    try {
      await tagsStore.fetchSuggestions(query);
      selectedIndex = -1;
      shouldShowSuggestions = true;
      
      // Force update to ensure suggestions are shown
      isFocused = true;
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    }
  }
  
  // Create a tag from text input
  function createTagFromText(text: string) {
    if (text.trim() && internalTags.length < maxTags) {
      // Check if tag already exists
      const exists = internalTags.some(t => 
        t.tag_title.toLowerCase() === text.trim().toLowerCase()
      );
      
      if (!exists) {
        // Create a temporary tag with a negative ID
        const newTag: Tag = {
          tag_id: -Date.now() - Math.floor(Math.random() * 1000), // Ensure uniqueness
          tag_title: text.trim()
        };
        
        addTag(newTag);
      }
    }
  }
  
  // Add a tag to the list
  async function addTag(tag: Tag) {
    // Check if tag already exists
    const exists = internalTags.some(t => 
      t.tag_id === tag.tag_id || 
      t.tag_title.toLowerCase() === tag.tag_title.toLowerCase()
    );
    
    if (!exists && internalTags.length < maxTags) {
      internalTags = [...internalTags, tag];
      
      // Update the output based on format
      if (outputFormat === 'string') {
        tags = tagsStore.tagsToString(internalTags);
      } else {
        tags = internalTags;
      }
      
      // Call the onchange handler with the updated tags
      if (onchange) {
        onchange(internalTags);
      }
      
      // Clear input but maintain focus
      inputValue = '';
      
      // Make sure we keep focus and show suggestions
      shouldShowSuggestions = true;
      
      // Focus the input after adding a tag
      await tick();
      inputElement?.focus();
    
    }
  }
  
  // Create a new tag from input
  function createTag() {
    if (inputValue.trim()) {
      createTagFromText(inputValue);
    }
  }
  
  // Remove a tag from the list
  function removeTag(index: number) {
    internalTags = internalTags.filter((_, i) => i !== index);
    
    // Update the output based on format
    if (outputFormat === 'string') {
      tags = tagsStore.tagsToString(internalTags);
    } else {
      tags = internalTags;
    }
    
    // Call the onchange handler with the updated tags
    onchange(internalTags);
  }
  
  // Handle keyboard navigation
  function handleKeydown(event: KeyboardEvent) {
    if (disabled) return;
    
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
        break;
        
      case 'ArrowUp':
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        break;
        
      case 'Enter':
        event.preventDefault();
        if (selectedIndex >= 0 && suggestions[selectedIndex]) {
          addTag(suggestions[selectedIndex]);
        } else if (inputValue.trim()) {
          createTag();
        }
        break;
        
      case 'Escape':
        event.preventDefault();
        shouldShowSuggestions = false;
        break;
        
      case 'Backspace':
        if (inputValue === '' && internalTags.length > 0) {
          removeTag(internalTags.length - 1);
        }
        break;
        
      case ',':
        // Prevent the comma from being added to the input
        event.preventDefault();
        if (inputValue.trim()) {
          createTag();
        }
        break;
    }
  }
  
  // Handle focus events
  async function handleFocus() {
    isFocused = true;
    shouldShowSuggestions = true;
    
    // Fetch suggestions on focus
    await fetchSuggestions(inputValue);
  }
  
  function handleBlur() {
    // Delay hiding suggestions to allow for clicks
    setTimeout(() => {
      isFocused = false;
    }, 200);
  }
  
  // Handle click outside
  function handleClickOutside() {
    isFocused = false;
    shouldShowSuggestions = false;
  }
  
  // Handle paste event to process multiple tags at once
  function handlePaste(event: ClipboardEvent) {
    // Get pasted text
    const pastedText = event.clipboardData?.getData('text') || '';
    
    if (pastedText.includes(',')) {
      // Prevent default paste behavior
      event.preventDefault();
      
      // Split by comma and process each part
      const parts = pastedText.split(',');
      
      // Process all parts as tags
      for (let i = 0; i < parts.length; i++) {
        const tagText = parts[i].trim();
        if (tagText) {
          createTagFromText(tagText);
        }
      }
    }
  }
  
  // Calculate dropdown position
  function getDropdownPosition() {
    if (!containerElement) return {};
    
    // Get container dimensions and position
    const rect = containerElement.getBoundingClientRect();
    
    // Check if we're near the bottom of the viewport
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    
    // Determine if dropdown should appear above or below
    const showAbove = spaceBelow < 200 && spaceAbove > spaceBelow;
    
    return {
      width: `${rect.width}px`,
      left: '0',
      [showAbove ? 'bottom' : 'top']: '100%'
    };
  }
</script>

<div 
  bind:this={containerElement}
  class={cn(
    "relative flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
    disabled && "cursor-not-allowed opacity-50",
    className
  )}
  use:clickOutside={handleClickOutside}
>
  {#each internalTags as tag, index (tag.tag_id)}
    <div class="flex h-6 items-center gap-1 rounded-md bg-muted px-2 text-xs">
      <span>{tag.tag_title}</span>
      {#if !disabled}
        <button
          type="button"
          class="flex h-4 w-4 items-center justify-center rounded-full hover:bg-muted-foreground/20"
          onclick={() => removeTag(index)}
          aria-label={`Remove ${tag.tag_title} tag`}
        >
          <XIcon class="h-3 w-3" />
        </button>
      {/if}
    </div>
  {/each}
  
  {#if !disabled && internalTags.length < maxTags}
    <div class="flex-1">
      <input
        bind:this={inputElement}
        value={inputValue}
        oninput={handleInput}
        onfocus={handleFocus}
        onblur={handleBlur}
        onkeydown={handleKeydown}
        onpaste={handlePaste}
        type="text"
        class="w-full min-w-[120px] bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        placeholder={internalTags.length === 0 ? placeholder : ''}
        {disabled}
      />
    </div>
  {/if}
  
  {#if (isFocused || shouldShowSuggestions) && (suggestions.length > 0 || isLoading)}
    <div 
      class="absolute z-50 rounded-md border border-border bg-popover shadow-md"
      style={Object.entries(getDropdownPosition()).map(([key, value]) => `${key}: ${value}`).join(';')}
    >
      {#if isLoading}
        <div class="flex items-center justify-center p-2">
          <Loader2Icon class="h-4 w-4 animate-spin text-muted-foreground" />
          <span class="ml-2 text-sm text-muted-foreground">Loading suggestions...</span>
        </div>
      {:else}
        <ul class="max-h-60 overflow-auto p-1">
          {#each suggestions as suggestion, i}
            <li
              class={cn(
                "flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm",
                selectedIndex === i ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"
              )}
              onclick={() => addTag(suggestion)}
              onkeydown={(e) => e.key === 'Enter' && addTag(suggestion)}
              tabindex="0"
              role="option"
              aria-selected={selectedIndex === i}
            >
              {suggestion.tag_title}
            </li>
          {/each}
          
          {#if inputValue.trim() && !suggestions.some(s => s.tag_title.toLowerCase() === inputValue.trim().toLowerCase())}
            <li
              class="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
              onclick={createTag}
              onkeydown={(e) => e.key === 'Enter' && createTag()}
              tabindex="0"
              role="option"
            >
              <PlusIcon class="mr-1 h-4 w-4" />
              Create "{inputValue}"
            </li>
          {/if}
        </ul>
      {/if}
    </div>
  {/if}
</div>
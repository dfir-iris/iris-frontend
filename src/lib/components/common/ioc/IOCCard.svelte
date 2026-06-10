<script lang="ts">
  import {
    FileText,
    Globe,
    HelpCircle,
    Link as LinkIcon, // Renamed to avoid conflict with <a>
    Lock,
    Mail,
    Network,
    ShieldAlert,
    User,
    Cog,
    ChevronDown,
    ChevronUp,
    ShieldIcon, 
    CopyIcon, 
    ExternalLinkIcon,
    HashIcon,
    AtSignIcon,
    GlobeIcon,
    FileIcon,
    UserIcon,
    ServerIcon,
    CodeIcon,
    DatabaseIcon,
  } from 'lucide-svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';
  import type { Ioc } from '$lib/types/resources/ioc';
  import { TagDisplay } from '../tag';
  import { cn } from '$lib/utils';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { marked } from 'marked';
	import TlpBadge from '$lib/components/common/tlp/TlpBadge.svelte';

  let { ioc, compact = false, isSelected = false }: { ioc: Ioc; compact?: boolean; isSelected?: boolean } = $props();


  function getIOCTypeIcon(typeName: string) {
    const type = typeName.toLowerCase();
    
    if (type.includes('ip')) return GlobeIcon;
    if (type.includes('email')) return AtSignIcon;
    if (type.includes('domain') || type.includes('hostname')) return GlobeIcon;
    if (type.includes('url')) return LinkIcon;
    if (type.includes('hash') || type.includes('md5') || type.includes('sha')) return HashIcon;
    if (type.includes('file')) return FileIcon;
    if (type.includes('account') || type.includes('user')) return UserIcon;
    if (type.includes('registry')) return DatabaseIcon;
    if (type.includes('mutex')) return CodeIcon;
    if (type.includes('server')) return ServerIcon;
    
    return ShieldIcon;
  }

  let IocTypeIcon = $derived(getIOCTypeIcon(ioc.ioc_type?.type_name));

  // IOC Value Formatting
  function formatIOCValue(value: string, typeName: string | undefined) {
    if (!typeName) return value;
    const lowerTypeName = typeName.toLowerCase();
    if (lowerTypeName.includes('hash') || lowerTypeName.includes('md5') || lowerTypeName.includes('sha')) {
      if (value.length > 16) {
        return `${value.substring(0, 8)}...${value.substring(value.length - 8)}`;
      }
    }
    if (lowerTypeName.includes('filename') && value.includes('|')) {
      const parts = value.split('|');
      if (parts.length === 2 && (parts[1].length > 16)) {
        return `${parts[0]} | ${parts[1].substring(0, 8)}...`;
      }
    }
    if (value.length > 40 && !lowerTypeName.includes('hash') && !lowerTypeName.includes('md5') && !lowerTypeName.includes('sha')) {
        return `${value.substring(0, 37)}...`;
    }
    return value;
  }

  // Description Handling
  let iocDescription = $derived(ioc.ioc_description || '');
  let parsedDescription = $derived(iocDescription ? marked(iocDescription) : '');
  let isDescriptionExpanded = $state(false);

  function toggleDescription(e: MouseEvent) {
    e.stopPropagation();
    isDescriptionExpanded = !isDescriptionExpanded;
  }

  // Navigation
  function handleClick() {
    if (compact) return;
    goto(`/case/${page.params.case_id}/iocs/${ioc.ioc_id}`);
  }

  let showDescriptionToggle = $derived(!isDescriptionExpanded && iocDescription.length > 120);
</script>

<button
  type="button"
  id={`ioc-card-${ioc.ioc_id}`}
  class="relative w-full text-left overflow-hidden rounded-lg border p-2.5 text-sm transition-colors duration-150 group {
    isSelected
      ? 'bg-primary/10 text-foreground border-l-4 border-l-primary border-primary/40 shadow-sm'
      : 'border-border/60 bg-card hover:border-border hover:bg-muted/40'
  }"
  onclick={handleClick}
  aria-label={`View details for IOC ${ioc.ioc_value}`}
  disabled={compact}
>

  <!-- Header: Icon, Value, TLP -->
  <div class="flex items-start justify-between gap-2">
    <div class="flex items-center gap-2 flex-1 min-w-0">
      <div
        class={cn(
          "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full",
          isSelected ? 'bg-primary/20' : 'bg-muted'
        )}
      >
        <IocTypeIcon
          size={14}
          class={isSelected ? 'text-primary' : 'text-muted-foreground'}
        />
      </div>
      <div class="flex-1 min-w-0">
        <div class="group/item flex items-center gap-1">
          <code class="font-mono text-foreground/90 break-all text-sm leading-tight">
            {compact ? formatIOCValue(ioc.ioc_value, ioc.ioc_type?.type_name) : ioc.ioc_value}
          </code>
          <ClipboardCopy
            value={ioc.ioc_value}
            tooltipText="Copy IOC value"
            className="ml-1 opacity-0 group-hover/item:opacity-100 transition-opacity flex-shrink-0"
            iconSize={14}
          />
        </div>
        <div class="text-xs text-muted-foreground truncate mt-0.5" title={ioc.ioc_type?.type_name}>
          {ioc.ioc_type?.type_name || 'Unknown type'}
        </div>
      </div>
    </div>
    <div class="flex-shrink-0 ml-2">
      <TlpBadge
        tlp_name={ioc.tlp?.tlp_name}
      />
    </div>
  </div>

  <!-- Description (if available and not compact) -->
  {#if !compact && iocDescription}
    <div class="mt-2 mb-1 bg-muted/30 rounded-md p-2 relative text-xs">
      <div class="absolute top-1 right-1">
        <ClipboardCopy
          value={iocDescription}
          tooltipText="Copy description"
          className="text-muted-foreground hover:text-primary"
          iconSize={12}
        />
      </div>
      <div
        class={cn(
          "prose prose-sm max-w-none text-foreground/80 overflow-hidden transition-all duration-300 ease-in-out",
          isDescriptionExpanded ? 'max-h-[160px] overflow-y-auto' : 'max-h-[48px]'
        )}
      >
        {@html parsedDescription}
      </div>
      {#if showDescriptionToggle || isDescriptionExpanded}
        <div class="mt-0.5 text-right">
          <Button
            variant="link"
            type="button"
            class="text-xs text-primary hover:underline p-0 h-auto"
            onclick={toggleDescription}
            aria-expanded={isDescriptionExpanded}
          >
            {isDescriptionExpanded ? 'Show less' : 'Show more'}
            {#if isDescriptionExpanded}
              <ChevronUp size={12} class="ml-1" />
            {:else}
              <ChevronDown size={12} class="ml-1" />
            {/if}
          </Button>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Tags (if available and not compact) -->
  {#if !compact && ioc.ioc_tags && ioc.ioc_tags.length > 0}
    <div class="mt-1.5">
      <TagDisplay tags={ioc.ioc_tags} size="small" />
    </div>
  {/if}
</button>

<style>
  :global(.prose) {
    @apply text-foreground;
  }
  :global(.prose a) {
    @apply text-primary hover:underline;
  }
  :global(.prose p) {
    @apply my-1;
  }
  :global(.prose ul, .prose ol) {
    @apply pl-4 my-1;
  }
  :global(.prose li) {
    @apply my-0.5;
  }
  :global(.prose strong) {
    @apply font-semibold;
  }
  :global(.prose em) {
    @apply italic;
  }
  :global(.prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6) {
    @apply font-semibold my-2 leading-tight;
  }
  :global(.prose code) {
    @apply bg-muted/70 px-1 py-0.5 rounded text-xs font-mono text-foreground/90;
  }
  :global(.prose pre) {
    @apply bg-muted/80 p-2 rounded my-2 overflow-x-auto text-xs;
  }
  :global(.prose pre code) {
    @apply bg-transparent p-0 rounded-none font-mono;
  }
  :global(.prose blockquote) {
    @apply border-l-4 border-border pl-3 italic my-2 text-muted-foreground;
  }
  :global(.prose table) {
    @apply w-full my-2 border-collapse border border-border;
  }
  :global(.prose th, .prose td) {
    @apply border border-border px-2 py-1;
  }
  :global(.prose th) {
    @apply bg-muted/50 font-semibold;
  }

  /* Custom scrollbar for description */
  :global(.prose::-webkit-scrollbar) {
    @apply w-1.5;
  }
  :global(.prose::-webkit-scrollbar-track) {
    @apply bg-muted/50 rounded-full;
  }
  :global(.prose::-webkit-scrollbar-thumb) {
    @apply bg-border rounded-full hover:bg-primary/50;
  }
</style>
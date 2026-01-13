<script lang="ts">
  import { SearchableSelect } from "$lib/components/ui/searchable-select";
  import { analysisStatuses } from "$lib/stores/analysis-status.store";

  let {
    value = $bindable(),
    placeholder = "Select analysis status",
    searchPlaceholder = "Search analysis statuses...",
    emptyMessage = "No analysis statuses found.",
    disabled = false,
    required = false,
    class: className = "",
    id = "analysis-status-select",
    "aria-label": ariaLabel = "Select analysis status",
    onValueChange = undefined,
    hasError = false,
    ...restProps
  }: {
    value?: string;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyMessage?: string;
    disabled?: boolean;
    required?: boolean;
    class?: string;
    id?: string;
    "aria-label"?: string;
    onValueChange?: (value: string) => void;
    hasError?: boolean;
    [key: string]: any;
  } = $props();

  // Transform analysis statuses to SearchableSelect items format
  let items = $derived($analysisStatuses.map((status) => ({
    value: status.id.toString(),
    label: status.name,
    disabled: false
  })));

  function handleValueChange(newValue: string) {
    value = newValue;
    onValueChange?.(newValue);
  }

  // Convert numeric value to string for display
  let stringValue = $state(value?.toString() ?? "");
  
  $effect(() => {
    stringValue = value?.toString() ?? "";
  });
</script>

<SearchableSelect
  {items}
  value={stringValue}
  {placeholder}
  {searchPlaceholder}
  {emptyMessage}
  {disabled}
  {required}
  class={className + (hasError ? " border-destructive" : "")}
  {id}
  aria-label={ariaLabel}
  onValueChange={handleValueChange}
  {...restProps}
/>

<script lang="ts">
  import { SearchableSelect } from "$lib/components/ui/searchable-select";
  import { iocTypes } from "$lib/stores/ioc-types.store";

  let {
    value = $bindable(),
    placeholder = "Select IOC type",
    searchPlaceholder = "Search IOC types...",
    emptyMessage = "No IOC types found.",
    disabled = false,
    required = false,
    class: className = "",
    id = "ioc-type-select",
    "aria-label": ariaLabel = "Select IOC type",
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

  // Transform IOC types to SearchableSelect items format
  let items = $derived($iocTypes.map((type) => ({
    value: type.type_id.toString(),
    label: type.type_name,
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
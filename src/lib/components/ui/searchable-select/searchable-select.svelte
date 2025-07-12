<script lang="ts">
  import { Check, ChevronsUpDown } from "lucide-svelte";
  import * as Command from "$lib/components/ui/command";
  import * as Popover from "$lib/components/ui/popover";
  import { Button } from "$lib/components/ui/button";
  import { cn } from "$lib/utils";

  type Item = {
    value: string;
    label: string;
    disabled?: boolean;
  };

  let {
    items = [],
    value = $bindable(),
    placeholder = "Select an option...",
    searchPlaceholder = "Search...",
    emptyMessage = "No items found.",
    disabled = false,
    required = false,
    class: className = "",
    id = "",
    "aria-label": ariaLabel = "",
    onValueChange = undefined,
    ...restProps
  }: {
    items: Item[];
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
    [key: string]: any;
  } = $props();

  let open = $state(false);
  let inputValue = $state("");

  let selectedItem = $derived(items.find((item) => item.value === value));
  let filteredItems = $derived(items.filter((item) =>
    item.label.toLowerCase().includes(inputValue.toLowerCase())
  ));

  function handleSelect(selectedValue: string) {
    if (selectedValue === value) {
      value = "";
    } else {
      value = selectedValue;
    }
    onValueChange?.(value);
    open = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open = !open;
    }
  }

  // Reset search when popover closes
  $effect(() => {
    if (!open) {
      inputValue = "";
    }
  });
</script>

<div class={cn("relative", className)} {...restProps}>
  <Popover.Root bind:open>
    <Popover.Trigger>
      <Button
        variant="outline"
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
        class={cn(
          "w-full justify-between",
          !value && "text-muted-foreground"
        )}
        {disabled}
        id={`trigger-${id}`}
        onkeydown={handleKeydown}
      >
        {selectedItem?.label ?? placeholder}
        <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    </Popover.Trigger>
    <Popover.Content class="w-[--bits-popover-trigger-width] p-0" side="bottom" align="start">
      <Command.Root shouldFilter={false}>
        <Command.Input
          placeholder={searchPlaceholder}
          bind:value={inputValue}
          class="h-9"
        />
        <Command.Empty>{emptyMessage}</Command.Empty>
        <Command.List class="max-h-[200px] overflow-y-auto">
          <Command.Group>
            {#each filteredItems as item (item.value)}
              <Command.Item
                value={item.value}
                disabled={item.disabled}
                onSelect={() => handleSelect(item.value)}
                class={cn(
                  "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                  item.disabled && "cursor-not-allowed opacity-50"
                )}
              >
                <Check
                  class={cn(
                    "mr-2 h-4 w-4",
                    value === item.value ? "opacity-100" : "opacity-0"
                  )}
                />
                {item.label}
              </Command.Item>
            {/each}
          </Command.Group>
        </Command.List>
      </Command.Root>
    </Popover.Content>
  </Popover.Root>
</div>

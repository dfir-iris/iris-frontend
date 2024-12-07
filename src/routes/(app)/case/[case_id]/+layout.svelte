<script lang="ts">
  import type { Snippet } from "svelte";
  import type { LayoutData } from "./$types";
  import {
    DropdownMenu,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuContent,
  } from "$lib/components/ui/dropdown-menu";
  import Button from "$lib/components/ui/button/button.svelte";
  import {
    ActivityIcon,
    ChartGanttIcon,
    ClipboardListIcon,
    FileBadgeIcon,
    FlagIcon,
    NotepadTextIcon,
    PlusIcon,
    RouterIcon,
  } from "lucide-svelte";

  let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<div class="flex flex-row overflow-hidden h-full">
  <!-- Case sidebar -->
  <div
    class="flex flex-col gap-y-1 w-1/4 max-w-[350px] h-full overflow-y-auto bg-secondary p-4 border-r shadow items-start"
  >
    <div>
      <p class="text-secondary-foreground">#80</p>
      <h1 class="text-2xl font-medium">Case Name</h1>
    </div>

    <!-- Add to case control -->
    <DropdownMenu>
      <DropdownMenuTrigger class="!w-fit py-4">
        <Button
          variant="default"
          class="bg-primary-gradient gap-x-1.5 text-lg !px-4 py-6 rounded-full shadow dark:text-white"
        >
          <PlusIcon /> Add to case
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent class="w-56" align="start" side="right">
        <DropdownMenuItem>
          <NotepadTextIcon size={20}></NotepadTextIcon>
          <span>Note</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <ClipboardListIcon size={20}></ClipboardListIcon>
          <span>Task</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <RouterIcon size={20}></RouterIcon>
          <span>Asset</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <FlagIcon size={20}></FlagIcon>
          <span>Indicator</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <!-- Menu items -->
    <Button variant="ghost" class="gap-x-1.5" href="">
      <NotepadTextIcon size={20}></NotepadTextIcon> Notes
    </Button>
    <Button variant="ghost" class="gap-x-1.5" href="">
      <ClipboardListIcon size={20}></ClipboardListIcon> Tasks
    </Button>
    <Button variant="ghost" class="gap-x-1.5" href="">
      <RouterIcon size={20}></RouterIcon> Assets
    </Button>
    <Button variant="ghost" class="gap-x-1.5" href="">
      <FlagIcon size={20}></FlagIcon> Indicators
    </Button>
    <Button variant="ghost" class="gap-x-1.5" href="">
      <ChartGanttIcon size={20}></ChartGanttIcon> Timeline
    </Button>
    <Button variant="ghost" class="gap-x-1.5" href="">
      <FileBadgeIcon size={20}></FileBadgeIcon> Evidence
    </Button>
    <Button variant="ghost" class="gap-x-1.5" href="">
      <ActivityIcon size={20}></ActivityIcon> Activity
    </Button>
  </div>

  <!-- Case content -->
  <div>
    {@render children()}
  </div>
</div>

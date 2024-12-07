<script>
  import {
  BellIcon,
    ClipboardList,
    LogOutIcon,
    MoonIcon,
    SearchIcon,
    SettingsIcon,
    SlidersHorizontalIcon,
    SunIcon,
    UserRoundIcon,
  } from "lucide-svelte";
  import Button from "$lib/components/ui/button/button.svelte";
  import Input from "$lib/components/ui/input/input.svelte";
  import {
    DropdownMenu,
    DropdownMenuLabel,
    DropdownMenuContent,
    DropdownMenuTrigger,
    DropdownMenuItem,
    DropdownMenuSeparator,
  } from "$lib/components/ui/dropdown-menu";
  import { authUserStore } from "$lib/stores/auth.store";
  import { mode, toggleMode } from "mode-watcher";

  const { data } = $props();
</script>

<header
  class="sticky top-0 h-16 bg-primary-gradient flex flex-row items-center px-4 shadow"
>
  <!-- Logo -->
  <a href="/">
    <img
      src="/logo/logo-white.png"
      alt="IRIS Logo"
      class="transition-all duration-300 w-[100px]"
    />
  </a>

  <div class="ml-auto"></div>

  <!-- Search bar -->
  <div class="relative group pr-2">
    <Input type="text" placeholder="Search" class="bg-background pl-8"></Input>
    <SearchIcon
      size={20}
      class="absolute top-2 left-2 opacity-70 group-focus-within:opacity-100"
    />
  </div>

  <!-- Tasks dropdown -->
  <DropdownMenu>
    <DropdownMenuTrigger>
      <Button variant="ghost" class="px-2 text-gray-100"
        ><ClipboardList /></Button
      >
    </DropdownMenuTrigger>
    <DropdownMenuContent class="w-56">
      <DropdownMenuLabel>
        Tasks
      </DropdownMenuLabel>

      <DropdownMenuSeparator />
      <DropdownMenuItem href="/tasks">
        <span>View all</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>

  <!-- Alerts dropdown -->
  <DropdownMenu>
    <DropdownMenuTrigger>
      <Button variant="ghost" class="px-2 text-gray-100"
        ><BellIcon /></Button
      >
    </DropdownMenuTrigger>
    <DropdownMenuContent class="w-56">
      <DropdownMenuLabel>
        Alerts
      </DropdownMenuLabel>

      <DropdownMenuSeparator />
      <DropdownMenuItem href="/alerts">
        <span>View all</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>

  <!-- User dropdown -->
  <DropdownMenu>
    <DropdownMenuTrigger>
      <Button variant="ghost" class="px-2 text-gray-100"
        ><UserRoundIcon /></Button
      >
    </DropdownMenuTrigger>
    <DropdownMenuContent class="w-56">
      <DropdownMenuLabel
        >{$authUserStore?.name || "My account"}</DropdownMenuLabel
      >
      <DropdownMenuItem >
        <SlidersHorizontalIcon size={18} />
        <span>Preferences</span>
      </DropdownMenuItem>
      <DropdownMenuItem on:click={toggleMode}>
        {#if $mode == "light"}
          <MoonIcon size={18} />
          <span>Dark mode</span>
        {:else}
          <SunIcon size={18} />
          <span>Light mode</span>
        {/if}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem>
        <SettingsIcon size={18} />
        <span>Manage IRIS</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem>
        <LogOutIcon size={18} />
        <span>Log out</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</header>

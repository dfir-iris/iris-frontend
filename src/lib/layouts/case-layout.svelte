<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import * as Resizable  from "$lib/components/ui/resizable";
    import { 
		PlusIcon,
		NotepadTextIcon,
		ClipboardListIcon,
		RouterIcon,
		FlagIcon,
		File,
		CheckCheck,
		Computer,
		Biohazard} from 'lucide-svelte'
    import { ScrollArea } from "$lib/components/ui/scroll-area";


	import {
		DropdownMenu,
		DropdownMenuItem,
		DropdownMenuTrigger,
		DropdownMenuContent,
		DropdownMenuLabel,
        DropdownMenuSeparator
	} from '$lib/components/ui/dropdown-menu';
    import { setMode } from "mode-watcher";
    import { writable } from 'svelte/store';
    import { investigationRoutes } from "$lib/constants/routes";
    import Nav from '$lib/layouts/nav-layout.svelte';
    import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import CaseSwitcher from './case-switcher.svelte';


    let { data, children }: { data: LayoutData; children: Snippet } = $props();

    
    //let isSidebarOpen = true
    let currentTime = new Date().toLocaleString()

    let defaultLayout = [80, 1000];
	let defaultCollapsed = false;
	let navCollapsedSize:5;

	let isCollapsed = $state(defaultCollapsed);

	function onLayoutChange(sizes: number[]) {
		document.cookie = `PaneForge:layout=${JSON.stringify(sizes)}`;
	}

	function onCollapse() {
		isCollapsed = true;
		document.cookie = `PaneForge:collapsed=${true}`;
	}

	function onExpand() {
		isCollapsed = false;
		document.cookie = `PaneForge:collapsed=${false}`;
	}

    // const toggleSidebar = () => {
    //   isSidebarOpen = !isSidebarOpen
    // }
    
    let uiMode = writable('Light');
    const switchMode = () => {
        uiMode.update(mode => {
            const newMode = mode === 'Light' ? 'Dark' : 'Light';
            setMode(newMode.toLowerCase() as 'dark' | 'light');
            return newMode;
        });
    }
  </script>
  

  <div class="hidden md:block">
	<Resizable.PaneGroup
		direction="horizontal"
		{onLayoutChange}
		class="items-stretch"
	>
		<Resizable.Pane
			defaultSize={defaultLayout[0]}
			collapsedSize={navCollapsedSize}
			collapsible
			minSize={7}
			maxSize={20}
			{onCollapse}
			{onExpand}
            class="bg-muted/40 rounded-r-lg"
		>
            <div class="mt-4 mb-2 px-4 text-lg font-semibold tracking-tight">
                <DropdownMenu>
                    <DropdownMenuTrigger class="w-fit">
                        <Button variant="outline" class="!px-3 py-4">
                            <PlusIcon size={22} /> Add item
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent class=" shadow" align="end" side="left">
                        <DropdownMenuLabel>Add item to the case</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                            <File class="mr-2 h-4 w-4" />
                            <span>Note</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <CheckCheck class="mr-2 h-4 w-4" />
                            <span>Task</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <Computer class="mr-2 h-4 w-4" />
                            <span>Asset</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <Biohazard class="mr-2 h-4 w-4"  />
                            <span>IOC</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <h2 class="mt-4 mb-2 px-4 text-lg font-semibold tracking-tight">Investigation</h2>
            <Nav {isCollapsed} routes={investigationRoutes} />

        </Resizable.Pane>
		<Resizable.Handle withHandle />
		<Resizable.Pane defaultSize={defaultLayout[1]} minSize={10}>
            <div class="flex flex-col items-start gap-y-1 p-4">
                <div class="mb-4 flex w-full flex-row items-center">
                    <div>
                        <h1 class="text-2xl ml-2 font-semibold">{data.case_name}</h1>
                        <p class="text-sm ml-2 text-muted-foreground">Opened on {new Date(data.open_date).toLocaleString()} by {data.owner?.user_name}</p>
                    </div>
    
                    <!-- Add to case control -->
                    <div class="ml-auto">
                        <CaseSwitcher />
                    </div>
                </div>
            </div>
            <ScrollArea class="h-screen">
                <main class="flex-1 p-6">
                    {@render children()}
                </main>
            </ScrollArea>
        </Resizable.Pane>
    </Resizable.PaneGroup>
</div>
    
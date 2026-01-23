<script>
	import { BellIcon, ClipboardList } from 'lucide-svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import {
		DropdownMenu,
		DropdownMenuLabel,
		DropdownMenuContent,
		DropdownMenuTrigger,
		DropdownMenuItem,
		DropdownMenuSeparator
	} from '$lib/components/ui/dropdown-menu';
</script>

<header class="sticky top-0 flex max-h-16 min-h-16 w-full bg-primary-gradient p-4 drop-shadow-lg">
	<div class="ml-auto">
		<!-- Tasks dropdown -->
		<DropdownMenu>
			<DropdownMenuTrigger>
				<Button variant="ghost" class="px-2 text-gray-100"><ClipboardList /></Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent class="w-56">
				<DropdownMenuLabel>Tasks</DropdownMenuLabel>

				<DropdownMenuSeparator />
				<a href="/#tasks">
					<DropdownMenuItem>
						<span>View all</span>
					</DropdownMenuItem>
				</a>
			</DropdownMenuContent>
		</DropdownMenu>

		<!-- Alerts dropdown -->
		<DropdownMenu>
			<DropdownMenuTrigger>
				<Button variant="ghost" class="px-2 text-gray-100"><BellIcon /></Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent class="w-56">
				<DropdownMenuLabel>Alerts</DropdownMenuLabel>

				<DropdownMenuSeparator />
				<a href="/#alerts">
					<DropdownMenuItem>
						<span>View all</span>
					</DropdownMenuItem>
				</a>
			</DropdownMenuContent>
		</DropdownMenu>
	</div>
</header>

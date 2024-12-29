<script>
	import { Button } from '../ui/button';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '../ui/dropdown-menu';
	import { Input } from '../ui/input';

	let search = $state('');
</script>

<DropdownMenu>
	<DropdownMenuTrigger asChild let:builder>
		<Button builders={[builder]} variant="ghost" class="px-2 text-gray-100">Cases</Button>
	</DropdownMenuTrigger>
	<DropdownMenuContent class="w-56" align="start">
		<div class="px-1 py-1">
			<Input type="text" placeholder="Search cases" bind:value={search} class="w-full" />
		</div>
		<DropdownMenuItem href="/case/1">
			<span>#1 - Initial Demo</span>
		</DropdownMenuItem>
		<DropdownMenuItem href="/case/2">
			<span>#2 - Initial Demo 2</span>
		</DropdownMenuItem>

		<DropdownMenuSeparator />
		<DropdownMenuItem href="/cases">
			<span>View all</span>
		</DropdownMenuItem>
	</DropdownMenuContent>
</DropdownMenu>

<script lang="ts">
	import { onMount } from 'svelte';
	import { AuthService, type DemoAccount } from '$lib/services/auth.service';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';

	let accounts = $state<DemoAccount[]>([]);
	let loadError = $state(false);

	onMount(async () => {
		try {
			const settings = await AuthService.getAuthSettings();
			accounts = settings?.demo_accounts ?? [];
		} catch (e) {
			console.error('Failed to load demo accounts:', e);
			loadError = true;
		}
	});
</script>

<h2 class="my-4 text-lg">Accounts</h2>

<p class="my-2">
	The following accounts are available on this instance. They cannot be updated or deleted, but new
	users and groups can be created.
</p>

{#if loadError}
	<p class="my-2 text-red-500">Could not load the demo accounts.</p>
{:else if accounts.length}
	<table class="my-4 w-full text-left text-sm">
		<thead>
			<tr class="border-b">
				<th class="py-2 pr-4 font-semibold">Username</th>
				<th class="py-2 pr-4 font-semibold">Password</th>
				<th class="py-2 font-semibold">Role</th>
			</tr>
		</thead>
		<tbody>
			{#each accounts as account (account.username)}
				<tr class="group border-b last:border-0">
					<td class="py-2 pr-4 font-mono">{account.username}</td>
					<td class="py-2 pr-4">
						<span class="flex items-center gap-2">
							<span class="font-mono">{account.password}</span>
							<ClipboardCopy value={account.password} tooltipText="Copy password" />
						</span>
					</td>
					<td class="py-2">{account.role}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

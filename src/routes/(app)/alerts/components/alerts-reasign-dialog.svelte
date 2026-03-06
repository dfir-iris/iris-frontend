<script lang="ts">
	import { onMount } from 'svelte';
	import type { RequestResponse } from '$lib/services/api.service';
	import { UsersService, type User } from '$lib/services/users.service';
	import type { Alert } from '$lib/types/resources/alert';
	import * as Dialog from '$lib/components/ui/dialog';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Select } from '$lib/components/ui/select';
	import SelectContent from '$lib/components/ui/select/select-content.svelte';
	import SelectItem from '$lib/components/ui/select/select-item.svelte';
	import SelectTrigger from '$lib/components/ui/select/select-trigger.svelte';

	type Props = {
		open: boolean;
		alert: Alert | null;
		ownerId: string;
		onOwnerIdChange: (v: string) => void;
		onConfirm: () => void;
	};

	let { open = $bindable(), alert, ownerId, onOwnerIdChange, onConfirm }: Props = $props();

	let users = $state<User[]>([]);

	const DEFAULT_VALUE = 'Select user';

	const loadReassignUsers = async () => {
		const usersResponse = (await UsersService.list()).data as unknown as RequestResponse<User[]>;
		users = usersResponse.data as User[];
	};

	onMount(() => loadReassignUsers());
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-[520px]">
		<Dialog.Header>
			{#if alert}
				<Dialog.Title>Reassign Alert #{alert?.alert_id ?? ''}</Dialog.Title>
			{:else}
				<Dialog.Title>Reassign Multiple Alerts</Dialog.Title>
			{/if}
		</Dialog.Header>

		<div class="flex flex-col gap-2 py-2">
			<div class="text-sm font-medium">New Owner</div>

			<Select value={ownerId} onValueChange={onOwnerIdChange} type="single">
				<SelectTrigger
					>{users.find((user) => Number(user.user_id) === Number(ownerId))?.user_name ??
						DEFAULT_VALUE}</SelectTrigger
				>

				<SelectContent>
					<SelectItem value="">{DEFAULT_VALUE}</SelectItem>

					{#each users as u (u.user_id)}
						<SelectItem value={String(u.user_id)}>
							{u.user_login ?? u.user_name ?? String(u.user_id)}
						</SelectItem>
					{/each}
				</SelectContent>
			</Select>
		</div>

		<Dialog.Footer class="flex gap-2">
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button disabled={ownerId === ''} onclick={onConfirm}>Assign</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

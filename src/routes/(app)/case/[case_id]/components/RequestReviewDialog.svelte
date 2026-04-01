<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import Button from '$lib/components/ui/button/button.svelte';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import type { UserInfo } from '$lib/services/auth.service';
	import { onMount } from 'svelte';
	import { UsersService, type User } from '$lib/services/users.service';
	import type { RequestResponse } from '$lib/services/api.service';

	export type MergeMode = 'new' | 'existing';

	type Props = {
		open: boolean;
		onConfirm: (admin: UserInfo) => void;
	};

	let { open = $bindable(), onConfirm }: Props = $props();

	let users = $state<User[]>([]);
	let userId = $state('');
	let selectedUser = $derived.by<User>(
		() => users.find((user) => user.user_id === Number(userId)) as User
	);

	const reviewerOptions = $derived.by<SelectOption[]>(() =>
		users.map((u) => ({ value: String(u.user_id), label: u.user_name }))
	);

	onMount(async () => {
		const usersResponse = (await UsersService.list()).data as unknown as RequestResponse<User[]>;

		users = usersResponse.data as User[];
	});

	$effect(() => {
		if (!open) return;

		if (users.length) {
			userId = String(users[0].user_id);
		} else {
			userId = '';
		}
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex flex-col p-0">
		<Dialog.Header class="border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">Choose reviewer</Dialog.Title>
		</Dialog.Header>

		<div class="flex-1 overflow-auto px-6 py-5">
			<SearchSelect
				value={userId}
				options={reviewerOptions}
				placeholder="Reviewer"
				searchPlaceholder="Search reviewer..."
				onChange={(value) => (userId = value as string)}
			/>
		</div>

		<div class="flex items-center justify-end gap-2 border-t px-6 py-4">
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>

			<Button
				onclick={() => {
					if (selectedUser) {
						onConfirm(selectedUser);
						open = false;
					}
				}}
				disabled={selectedUser === null}
			>
				Request
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>

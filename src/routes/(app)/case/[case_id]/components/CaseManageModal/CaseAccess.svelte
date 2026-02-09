<script lang="ts">
	import type { ColumnDef } from '@tanstack/svelte-table';
	import { getContext, onMount } from 'svelte';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import { CaseAccessService, type CaseAccessEntry } from '$lib/services/case-access.service';
	import type { RequestResponse } from '$lib/services/api.service';
	import { UsersService, type User } from '$lib/services/users.service';
	import DataTable from '$lib/components/ui/data-table-tanstack/data-table.svelte';
	import Button from '$lib/components/ui/button/button.svelte';

	type Access = {
		name: string;
		level: number;
	};

	type CaseAccessProps = {
		onDelete?: () => void;
		onClose?: () => void;
	};

	const columns: ColumnDef<{ user: User; access: Access | null }>[] = [
		{
			id: 'user_id',
			header: () => 'User ID',
			accessorFn: (row) => row.user.user_id,
			cell: (cell) => cell.getValue()
		},
		{
			id: 'user_name',
			header: 'User Name',
			accessorFn: (row) => row.user.user_name,
			cell: (cell) => cell.getValue()
		},
		{
			id: 'user_login',
			header: 'User Login',
			accessorFn: (row) => row.user.user_login,
			cell: (cell) => cell.getValue()
		},
		{
			id: 'access_name',
			header: 'User Access',
			accessorFn: (row) => row.access?.name ?? 'no access',
			cell: (cell) => cell.getValue()
		}
	];

	let { onDelete, onClose }: CaseAccessProps = $props();

	const cases = getContext<CasesContext>(CASES_CTX);
	const currentCaseId = cases.currentCaseId();

	let usersAccess = $state<Array<{ user: User; access: Access | null }>>([]);

	onMount(async () => {
		const usersResponse = (await UsersService.list()).data as unknown as RequestResponse<User[]>;
		const users = usersResponse.data as User[];

		const rows: Array<{ user: User; access: Access | null }> = [];

		for (const user of users) {
			const caseAccessResponse = (await CaseAccessService.listUserCasesAccess(user.user_id))
				.data as unknown as RequestResponse<CaseAccessEntry[]>;

			const caseAccess = caseAccessResponse.data as CaseAccessEntry[];

			const currentCaseAccess =
				caseAccess?.find((e) => Number(e.case_id) === Number(currentCaseId)) ?? null;

			if (currentCaseAccess) {
				const name =
					currentCaseAccess?.access_level_list?.[0]?.name ??
					`level_${currentCaseAccess.access_level}`;

				rows.push({
					user,
					access: {
						name,
						level: currentCaseAccess.access_level
					}
				});
			} else {
				rows.push({ user, access: null });
			}
		}

		usersAccess = rows;
	});
</script>

<div class="flex flex-col overflow-hidden rounded border bg-card">
	<DataTable {columns} data={usersAccess} page={1} />
</div>

<div class="mt-8 flex justify-end gap-2">
	<Button type="button" variant="destructive" onclick={onDelete}>Delete case</Button>
	<Button type="button" variant="secondary" onclick={onClose}>Close case</Button>
</div>

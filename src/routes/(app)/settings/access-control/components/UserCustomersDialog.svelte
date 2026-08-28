<!--
  Per-user customer-access editor.

  Loads every customer once (paginated v2 search, per_page=200) and
  shows them as a checkbox list. The selection initialises from the
  user's existing customer grants — `user_customers` on the v2
  payload — and the backend handles the in-place diff on save.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { SearchIcon, XIcon } from 'lucide-svelte';
	import {
		AccessControlService,
		type AccessControlUser
	} from '$lib/services/access-control.service';
	import { CustomersService, type Customer } from '$lib/services/customers.service';

	type Props = {
		open: boolean;
		user: AccessControlUser;
		showError: (msg: string, fallback?: string) => void;
		onSaved: (user: AccessControlUser) => void;
	};

	let { open = $bindable(), user, showError, onSaved }: Props = $props();

	let allCustomers = $state<Customer[]>([]);
	let loading = $state(false);
	let saving = $state(false);
	let selected = $state<Set<number>>(new Set());
	let filter = $state('');

	const visible = $derived.by<Customer[]>(() => {
		const needle = filter.trim().toLowerCase();
		if (!needle) return allCustomers;
		return allCustomers.filter(
			(c) =>
				c.customer_name.toLowerCase().includes(needle) ||
				(c.customer_description ?? '').toLowerCase().includes(needle)
		);
	});

	$effect(() => {
		if (!open) return;
		selected = new Set((user.user_customers ?? []).map((c) => c.customer_id));
		void load();
	});

	const load = async () => {
		loading = true;
		try {
			const res = await CustomersService.search({ page: 1, per_page: 200 });
			if (res.ok && res.data && typeof res.data !== 'string') {
				allCustomers = (res.data as { data: Customer[] }).data;
			} else {
				showError(res.error?.message ?? 'Failed to load customers');
			}
		} finally {
			loading = false;
		}
	};

	const toggle = (id: number) => {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	};

	const submit = async () => {
		saving = true;
		try {
			const res = await AccessControlService.setUserCustomers(user.user_id, [...selected]);
			if (res.ok && res.data && typeof res.data !== 'string') {
				onSaved(res.data as AccessControlUser);
				open = false;
			} else {
				const data = res.data as { message?: string } | null;
				showError(data?.message ?? res.error?.message ?? 'Save failed');
			}
		} finally {
			saving = false;
		}
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Customer access — @{user.user_login}</Dialog.Title>
			<Dialog.Description>
				Tick the customers the user should have access to. Required for the user to see cases owned
				by the customer (subject to per-case ACL).
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-2 pt-2">
			<div class="relative">
				<SearchIcon
					size={12}
					class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					type="search"
					placeholder="Filter customers…"
					class="h-7 pl-7 pr-7 text-xs"
					bind:value={filter}
				/>
				{#if filter}
					<button
						type="button"
						class="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted"
						aria-label="Clear"
						onclick={() => (filter = '')}
					>
						<XIcon size={11} />
					</button>
				{/if}
			</div>

			<div class="max-h-[50vh] overflow-y-auto rounded-md border">
				{#if loading}
					<div class="space-y-1 p-2">
						{#each Array(5) as _}
							<Skeleton class="h-6 w-full" />
						{/each}
					</div>
				{:else if visible.length === 0}
					<p class="px-3 py-4 text-center text-2xs text-muted-foreground">No customers match.</p>
				{:else}
					<ul class="divide-y">
						{#each visible as c (c.customer_id)}
							<li>
								<label
									class="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs hover:bg-muted/30"
								>
									<Checkbox
										checked={selected.has(c.customer_id)}
										onCheckedChange={() => toggle(c.customer_id)}
										disabled={saving}
									/>
									<div class="min-w-0 flex-1">
										<div class="truncate">{c.customer_name}</div>
										{#if c.customer_description}
											<div class="truncate text-2xs text-muted-foreground">
												{c.customer_description}
											</div>
										{/if}
									</div>
								</label>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>

		<Dialog.Footer class="pt-3">
			<Button variant="outline" onclick={() => (open = false)} disabled={saving}>Cancel</Button>
			<Button onclick={submit} disabled={saving}>
				{saving ? 'Saving…' : 'Save'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

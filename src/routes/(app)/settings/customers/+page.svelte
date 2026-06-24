<!--
  Customers admin page — Svelte port of the legacy
  /manage/customers list + /manage/customers/<id>/view detail.

  Layout: a single screen with two independently-scrolling panes —
    • LEFT (basis-2/5): paginated customers list with infinite scroll,
      add / refresh / search; each row opens the detail pane.
    • RIGHT (basis-3/5): selected customer's metadata + contacts list
      with inline add / edit / delete.

  Edits use simple Dialog modals (Add customer / Edit customer / Add
  contact / Edit contact) sharing the standard chrome — same building
  blocks as /settings/modules so the two pages feel consistent.

  Access is gated by `customers_read` / `customers_write` on the
  backend; the page itself sits inside /settings which is admin-only,
  so the UI does not duplicate the permission checks — it just relies
  on the API to surface 403s.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		BuildingIcon,
		CircleUserIcon,
		MailIcon,
		MoreHorizontalIcon,
		PencilIcon,
		PhoneIcon,
		PlusIcon,
		RefreshCwIcon,
		SearchIcon,
		SmartphoneIcon,
		Trash2Icon,
		UserPlusIcon,
		XIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/components/ui/toast';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import {
		CustomersService,
		type Customer,
		type CustomerBody,
		type CustomerContact,
		type CustomerContactBody
	} from '$lib/services/customers.service';

	const PAGE_SIZE = 25;

	// Roles the legacy contact modal offered in its <datalist>. Kept
	// as suggestions rather than a hard enum so installations can write
	// custom roles too.
	const CONTACT_ROLES = ['CISO', 'CEO', 'Manager', 'Sales', 'Support', 'Billing', 'Other'];

	type ListState<T> = {
		items: T[];
		total: number;
		nextPage: number | null;
		loading: boolean;
		loadingMore: boolean;
	};

	const emptyListState = <T,>(): ListState<T> => ({
		items: [],
		total: 0,
		nextPage: 1,
		loading: false,
		loadingMore: false
	});

	let customersList = $state<ListState<Customer>>(emptyListState());

	// Free-text search across customer name + description. Debounced
	// before hitting the backend so each keystroke doesn't fire a
	// request — the wait also keeps the auto-select on the first row
	// of the new result set predictable (no partial-keystroke flashes).
	let searchValue = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	// Detail-pane state. `selectedId` doubles as "is a customer
	// selected?" — null means the empty-state placeholder shows.
	let selectedId = $state<number | null>(null);
	let selectedCustomer = $state<Customer | null>(null);
	let selectedLoading = $state(false);

	// Contacts. The detail GET embeds them, but we keep an explicit
	// list so we can refresh / reorder after a CRUD op without
	// re-fetching the full customer.
	let contacts = $state<CustomerContact[]>([]);
	let contactsLoading = $state(false);

	// Add customer modal -----------------------------------------------
	let addOpen = $state(false);
	let addBusy = $state(false);
	let addError = $state<string | null>(null);
	let addForm = $state<CustomerBody>({
		customer_name: '',
		customer_description: '',
		customer_sla: ''
	});

	// Edit customer modal ----------------------------------------------
	let editOpen = $state(false);
	let editBusy = $state(false);
	let editError = $state<string | null>(null);
	let editForm = $state<CustomerBody>({});

	// Contact modal (add + edit share one) -----------------------------
	let contactOpen = $state(false);
	let contactBusy = $state(false);
	let contactError = $state<string | null>(null);
	let contactEditingId = $state<number | null>(null);
	let contactForm = $state<CustomerContactBody>({});

	// Confirmation modal — shared instance, switched per action.
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmMessage = $state('');
	let confirmAction = $state<() => Promise<void> | void>(() => {});

	const showError = (msg: string, fallback = 'Operation failed') =>
		toast({ title: msg || fallback, variant: 'destructive' });
	const showSuccess = (msg: string) => toast({ title: msg, variant: 'success' });

	// Customers list ---------------------------------------------------
	const currentSearchTerm = () => searchValue.trim() || undefined;

	const loadCustomers = async () => {
		customersList = { ...emptyListState<Customer>(), loading: true };
		try {
			const res = await CustomersService.search({
				page: 1,
				per_page: PAGE_SIZE,
				search: currentSearchTerm()
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				const env = res.data;
				customersList = {
					items: env.data,
					total: env.total,
					nextPage: env.next_page,
					loading: false,
					loadingMore: false
				};
				// Auto-select the first customer so the right pane isn't
				// empty on first paint. Only when nothing is selected
				// yet — re-loads triggered by Refresh keep the user's
				// current selection if it survived.
				if (selectedId == null && env.data.length > 0) {
					void selectCustomer(env.data[0].customer_id);
				} else if (selectedId != null && !env.data.find((c) => c.customer_id === selectedId)) {
					// Selected customer dropped out of the first page —
					// clear so we don't show stale metadata for a row
					// the user can no longer see.
					selectedId = null;
					selectedCustomer = null;
					contacts = [];
				}
			} else {
				showError(res.error?.message ?? 'Failed to load customers');
				customersList = { ...customersList, loading: false };
			}
		} catch (e) {
			showError((e as Error).message);
			customersList = { ...customersList, loading: false };
		}
	};

	// Debounced search trigger — bound to the input's `oninput`.
	const queueSearch = () => {
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			void loadCustomers();
		}, 250);
	};

	const loadMoreCustomers = async () => {
		if (
			customersList.loading ||
			customersList.loadingMore ||
			customersList.nextPage == null
		)
			return;
		customersList = { ...customersList, loadingMore: true };
		const page = customersList.nextPage as number;
		try {
			const res = await CustomersService.search({
				page,
				per_page: PAGE_SIZE,
				search: currentSearchTerm()
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				const env = res.data;
				customersList = {
					items: [...customersList.items, ...env.data],
					total: env.total,
					nextPage: env.next_page,
					loading: false,
					loadingMore: false
				};
			} else {
				customersList = { ...customersList, loadingMore: false };
			}
		} catch {
			customersList = { ...customersList, loadingMore: false };
		}
	};

	onMount(loadCustomers);

	let customersSentinel = $state<HTMLDivElement | null>(null);
	$effect(() => {
		if (!customersSentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) void loadMoreCustomers();
			},
			{ rootMargin: '120px' }
		);
		observer.observe(customersSentinel);
		return () => observer.disconnect();
	});

	// Detail-pane loaders ---------------------------------------------
	const selectCustomer = async (id: number) => {
		selectedId = id;
		selectedLoading = true;
		selectedCustomer = null;
		contacts = [];
		try {
			const res = await CustomersService.get(id);
			if (res.ok && res.data && typeof res.data !== 'string') {
				const c = res.data as Customer;
				selectedCustomer = c;
				// `contacts` is embedded by the v2 GET — fall back to
				// an explicit fetch if the field is missing so older
				// backends still hydrate the panel.
				if (Array.isArray(c.contacts)) {
					contacts = c.contacts;
				} else {
					void refreshContacts(id);
				}
			} else {
				showError(res.error?.message ?? 'Failed to load customer');
			}
		} catch (e) {
			showError((e as Error).message);
		} finally {
			selectedLoading = false;
		}
	};

	const refreshContacts = async (id: number) => {
		contactsLoading = true;
		try {
			const res = await CustomersService.listContacts(id);
			if (res.ok && Array.isArray(res.data)) {
				contacts = res.data;
			}
		} finally {
			contactsLoading = false;
		}
	};

	const refresh = async () => {
		await loadCustomers();
		if (selectedId != null) await selectCustomer(selectedId);
	};

	// Add customer -----------------------------------------------------
	const openAdd = () => {
		addForm = { customer_name: '', customer_description: '', customer_sla: '' };
		addError = null;
		addOpen = true;
	};

	const submitAdd = async () => {
		const name = (addForm.customer_name ?? '').trim();
		if (name.length < 2) {
			addError = 'Name must be at least 2 characters';
			return;
		}
		addBusy = true;
		addError = null;
		try {
			const res = await CustomersService.create({
				customer_name: name,
				customer_description: addForm.customer_description?.trim() || undefined,
				customer_sla: addForm.customer_sla?.trim() || undefined
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				const created = res.data as Customer;
				showSuccess(`Customer "${created.customer_name}" created`);
				addOpen = false;
				await loadCustomers();
				void selectCustomer(created.customer_id);
			} else {
				const data = res.data as { message?: string; data?: unknown } | null;
				addError = data?.message ?? res.error?.message ?? 'Unable to create customer';
			}
		} catch (e) {
			addError = (e as Error).message;
		} finally {
			addBusy = false;
		}
	};

	// Edit customer ----------------------------------------------------
	const openEdit = () => {
		if (!selectedCustomer) return;
		editForm = {
			customer_name: selectedCustomer.customer_name,
			customer_description: selectedCustomer.customer_description ?? '',
			customer_sla: selectedCustomer.customer_sla ?? ''
		};
		editError = null;
		editOpen = true;
	};

	const submitEdit = async () => {
		if (!selectedCustomer) return;
		const name = (editForm.customer_name ?? '').trim();
		if (name.length < 2) {
			editError = 'Name must be at least 2 characters';
			return;
		}
		editBusy = true;
		editError = null;
		try {
			const res = await CustomersService.update(selectedCustomer.customer_id, {
				customer_name: name,
				customer_description: editForm.customer_description?.trim() || undefined,
				customer_sla: editForm.customer_sla?.trim() || undefined
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				const updated = res.data as Customer;
				showSuccess('Customer updated');
				editOpen = false;
				// Refresh the row in the list + the detail pane so the
				// rename is reflected everywhere.
				customersList = {
					...customersList,
					items: customersList.items.map((c) =>
						c.customer_id === updated.customer_id ? { ...c, ...updated } : c
					)
				};
				await selectCustomer(updated.customer_id);
			} else {
				const data = res.data as { message?: string } | null;
				editError = data?.message ?? res.error?.message ?? 'Unable to update customer';
			}
		} catch (e) {
			editError = (e as Error).message;
		} finally {
			editBusy = false;
		}
	};

	const removeCustomer = (customer: Customer) => {
		confirmTitle = `Remove customer ${customer.customer_name}?`;
		confirmMessage =
			'This deletes the customer record and all its contacts. The backend refuses if the customer is still referenced by cases or assets.';
		confirmAction = async () => {
			const res = await CustomersService.remove(customer.customer_id);
			if (res.ok) {
				showSuccess('Customer removed');
				if (selectedId === customer.customer_id) {
					selectedId = null;
					selectedCustomer = null;
					contacts = [];
				}
				await loadCustomers();
			} else {
				const data = res.data as { message?: string } | null;
				showError(data?.message ?? res.error?.message ?? 'Unable to remove customer');
			}
		};
		confirmOpen = true;
	};

	// Contact CRUD -----------------------------------------------------
	const openAddContact = () => {
		contactEditingId = null;
		contactForm = {
			contact_name: '',
			contact_role: '',
			contact_email: '',
			contact_work_phone: '',
			contact_mobile_phone: '',
			contact_note: ''
		};
		contactError = null;
		contactOpen = true;
	};

	const openEditContact = (contact: CustomerContact) => {
		contactEditingId = contact.id;
		contactForm = {
			contact_name: contact.contact_name,
			contact_role: contact.contact_role ?? '',
			contact_email: contact.contact_email ?? '',
			contact_work_phone: contact.contact_work_phone ?? '',
			contact_mobile_phone: contact.contact_mobile_phone ?? '',
			contact_note: contact.contact_note ?? ''
		};
		contactError = null;
		contactOpen = true;
	};

	const submitContact = async () => {
		if (!selectedCustomer) return;
		const name = (contactForm.contact_name ?? '').trim();
		if (name.length < 2) {
			contactError = 'Contact name must be at least 2 characters';
			return;
		}
		// Empty strings become undefined so we don't override a stored
		// value with a blank string on the backend — Marshmallow's
		// `allow_none=False` rejects nulls but accepts missing keys.
		const body: CustomerContactBody = {
			contact_name: name,
			contact_role: contactForm.contact_role?.trim() || undefined,
			contact_email: contactForm.contact_email?.trim() || undefined,
			contact_work_phone: contactForm.contact_work_phone?.trim() || undefined,
			contact_mobile_phone: contactForm.contact_mobile_phone?.trim() || undefined,
			contact_note: contactForm.contact_note?.trim() || undefined
		};
		contactBusy = true;
		contactError = null;
		try {
			const res =
				contactEditingId == null
					? await CustomersService.createContact(selectedCustomer.customer_id, body)
					: await CustomersService.updateContact(
							selectedCustomer.customer_id,
							contactEditingId,
							body
						);
			if (res.ok) {
				showSuccess(contactEditingId == null ? 'Contact added' : 'Contact updated');
				contactOpen = false;
				await refreshContacts(selectedCustomer.customer_id);
			} else {
				const data = res.data as { message?: string } | null;
				contactError = data?.message ?? res.error?.message ?? 'Unable to save contact';
			}
		} catch (e) {
			contactError = (e as Error).message;
		} finally {
			contactBusy = false;
		}
	};

	const removeContact = (contact: CustomerContact) => {
		confirmTitle = `Remove contact ${contact.contact_name}?`;
		confirmMessage = 'This deletes the contact. The action cannot be undone.';
		confirmAction = async () => {
			if (!selectedCustomer) return;
			const res = await CustomersService.removeContact(
				selectedCustomer.customer_id,
				contact.id
			);
			if (res.ok) {
				showSuccess('Contact removed');
				await refreshContacts(selectedCustomer.customer_id);
			} else {
				const data = res.data as { message?: string } | null;
				showError(data?.message ?? res.error?.message ?? 'Unable to remove contact');
			}
		};
		confirmOpen = true;
	};

	const runConfirm = async () => {
		await confirmAction();
	};
</script>

<svelte:head>
	<title>Customers | DFIR-IRIS</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden">
	<!-- Page header — same chrome as /settings/modules. -->
	<header class="flex items-center justify-between gap-3 border-b px-5 py-3">
		<div class="flex items-center gap-2.5">
			<BuildingIcon size={18} class="text-muted-foreground" />
			<div class="leading-tight">
				<h1 class="text-sm font-semibold">Customers</h1>
				<p class="text-2xs text-muted-foreground">
					Manage customer records and their contacts.
				</p>
			</div>
		</div>

		<div class="flex items-center gap-1.5">
			<Button
				variant="outline"
				size="sm"
				class="h-7"
				onclick={refresh}
				disabled={customersList.loading}
			>
				<RefreshCwIcon
					size={12}
					class={`mr-1 ${customersList.loading ? 'animate-spin' : ''}`}
				/>
				Refresh
			</Button>
			<Button size="sm" class="h-7" onclick={openAdd}>
				<PlusIcon size={12} class="mr-1" />
				Add customer
			</Button>
		</div>
	</header>

	<!--
	  Master/detail split. Each pane owns its own `overflow-y-auto` so
	  long contact lists scroll independently of the customers list.
	-->
	<div class="flex flex-1 gap-3 overflow-hidden p-4">
		<!-- Customers list (master) -->
		<section class="flex min-h-0 flex-1 basis-2/5 flex-col overflow-hidden rounded-md border">
			<div class="flex flex-col gap-2 border-b bg-muted/30 px-3 py-2">
				<div class="flex items-center justify-between gap-2">
					<div class="flex items-baseline gap-2">
						<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							Customers
						</h2>
						<span class="text-2xs text-muted-foreground tabular-nums">
							{customersList.items.length} / {customersList.total}
						</span>
					</div>
				</div>

				<!--
				  Search input lives under the title so it scrolls
				  with the list header bar (stays visible at top of
				  the master pane). Debounced ILIKE match against
				  customer name + description.
				-->
				<div class="relative">
					<SearchIcon
						size={12}
						class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						type="search"
						placeholder="Search by name or description…"
						class="h-7 pl-7 pr-7 text-xs"
						bind:value={searchValue}
						oninput={queueSearch}
					/>
					{#if searchValue}
						<button
							type="button"
							aria-label="Clear search"
							class="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							onclick={() => {
								searchValue = '';
								queueSearch();
							}}
						>
							<XIcon size={11} />
						</button>
					{/if}
				</div>
			</div>

			<div class="flex-1 overflow-y-auto">
				{#if customersList.loading && customersList.items.length === 0}
					<div class="space-y-1 p-3">
						{#each Array(6) as _}
							<Skeleton class="h-7 w-full" />
						{/each}
					</div>
				{:else if customersList.items.length === 0}
					{#if searchValue.trim()}
						<p class="px-3 py-6 text-center text-xs text-muted-foreground">
							No customers match <span class="font-mono">{searchValue.trim()}</span>.
						</p>
					{:else}
						<p class="px-3 py-6 text-center text-xs text-muted-foreground">
							No customers yet. Click <span class="font-medium">Add customer</span> to create one.
						</p>
					{/if}
				{:else}
					<ul class="divide-y">
						{#each customersList.items as customer (customer.customer_id)}
							{@const active = customer.customer_id === selectedId}
							<li>
								<button
									type="button"
									class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors
										{active
										? 'bg-primary/10 font-medium text-foreground'
										: 'hover:bg-muted/40'}"
									onclick={() => selectCustomer(customer.customer_id)}
								>
									<CircleUserIcon size={14} class="shrink-0 text-muted-foreground" />
									<div class="min-w-0 flex-1">
										<div class="truncate">{customer.customer_name}</div>
										{#if customer.customer_description}
											<div class="truncate text-2xs text-muted-foreground">
												{customer.customer_description}
											</div>
										{/if}
									</div>
									<span class="font-mono text-2xs text-muted-foreground">
										#{customer.customer_id}
									</span>
								</button>
							</li>
						{/each}
					</ul>

					{#if customersList.nextPage != null}
						<div
							bind:this={customersSentinel}
							class="flex items-center justify-center gap-2 border-t px-3 py-2 text-2xs text-muted-foreground"
						>
							{#if customersList.loadingMore}
								<RefreshCwIcon size={11} class="animate-spin" />
								Loading more…
							{:else}
								<span class="opacity-0">Loading more…</span>
							{/if}
						</div>
					{:else if customersList.total > PAGE_SIZE}
						<div class="border-t px-3 py-2 text-center text-2xs text-muted-foreground">
							End of list — {customersList.total} customers
						</div>
					{/if}
				{/if}
			</div>
		</section>

		<!-- Detail (selected customer + contacts) -->
		<section class="flex min-h-0 flex-1 basis-3/5 flex-col overflow-hidden rounded-md border">
			<div
				class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2"
			>
				<div class="flex items-baseline gap-2">
					<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Details
					</h2>
					{#if selectedCustomer}
						<span class="text-2xs text-muted-foreground">
							{selectedCustomer.customer_name}
						</span>
					{/if}
				</div>

				{#if selectedCustomer}
					<div class="flex items-center gap-1.5">
						<Button variant="outline" size="sm" class="h-7" onclick={openEdit}>
							<PencilIcon size={12} class="mr-1" />
							Edit
						</Button>
						<Button
							variant="outline"
							size="sm"
							class="h-7 text-destructive hover:text-destructive"
							onclick={() => selectedCustomer && removeCustomer(selectedCustomer)}
						>
							<Trash2Icon size={12} class="mr-1" />
							Delete
						</Button>
					</div>
				{/if}
			</div>

			<div class="flex-1 overflow-y-auto">
				{#if selectedLoading}
					<div class="space-y-2 p-4">
						<Skeleton class="h-4 w-1/3" />
						<Skeleton class="h-4 w-2/3" />
						<Skeleton class="h-4 w-1/2" />
					</div>
				{:else if !selectedCustomer}
					<p class="px-3 py-10 text-center text-xs text-muted-foreground">
						Select a customer on the left to see its details.
					</p>
				{:else}
					<!-- Metadata strip -->
					<dl class="grid grid-cols-1 gap-3 border-b p-4 text-xs sm:grid-cols-2">
						<div>
							<dt class="text-2xs uppercase tracking-wide text-muted-foreground">
								Name
							</dt>
							<dd class="font-medium">{selectedCustomer.customer_name}</dd>
						</div>
						<div>
							<dt class="text-2xs uppercase tracking-wide text-muted-foreground">
								Customer ID
							</dt>
							<dd class="font-mono text-2xs">{selectedCustomer.customer_id}</dd>
						</div>
						<div class="sm:col-span-2">
							<dt class="text-2xs uppercase tracking-wide text-muted-foreground">
								Description
							</dt>
							<dd class="whitespace-pre-wrap">
								{selectedCustomer.customer_description || '—'}
							</dd>
						</div>
						<div class="sm:col-span-2">
							<dt class="text-2xs uppercase tracking-wide text-muted-foreground">
								SLA
							</dt>
							<dd class="whitespace-pre-wrap">
								{selectedCustomer.customer_sla || '—'}
							</dd>
						</div>
					</dl>

					<!-- Contacts -->
					<div
						class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2"
					>
						<div class="flex items-baseline gap-2">
							<h3
								class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
							>
								Contacts
							</h3>
							<span class="text-2xs text-muted-foreground tabular-nums">
								{contacts.length}
							</span>
						</div>
						<Button size="sm" class="h-7" onclick={openAddContact}>
							<UserPlusIcon size={12} class="mr-1" />
							Add contact
						</Button>
					</div>

					{#if contactsLoading}
						<div class="space-y-1 p-3">
							{#each Array(3) as _}
								<Skeleton class="h-10 w-full" />
							{/each}
						</div>
					{:else if contacts.length === 0}
						<p class="px-3 py-6 text-center text-xs text-muted-foreground">
							No contacts. Add one to get started.
						</p>
					{:else}
						<ul class="divide-y">
							{#each contacts as contact (contact.id)}
								<li class="flex items-start gap-3 px-3 py-2.5 text-xs">
									<CircleUserIcon
										size={16}
										class="mt-0.5 shrink-0 text-muted-foreground"
									/>
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-2">
											<span class="font-medium">{contact.contact_name}</span>
											{#if contact.contact_role}
												<span
													class="rounded-sm border bg-muted/40 px-1.5 py-0 text-2xs text-muted-foreground"
												>
													{contact.contact_role}
												</span>
											{/if}
										</div>
										<div class="flex flex-wrap gap-x-3 gap-y-0.5 pt-1 text-2xs text-muted-foreground">
											{#if contact.contact_email}
												<span class="flex items-center gap-1">
													<MailIcon size={10} />
													{contact.contact_email}
												</span>
											{/if}
											{#if contact.contact_work_phone}
												<span class="flex items-center gap-1">
													<PhoneIcon size={10} />
													{contact.contact_work_phone}
												</span>
											{/if}
											{#if contact.contact_mobile_phone}
												<span class="flex items-center gap-1">
													<SmartphoneIcon size={10} />
													{contact.contact_mobile_phone}
												</span>
											{/if}
										</div>
										{#if contact.contact_note}
											<p class="whitespace-pre-wrap pt-1 text-2xs text-muted-foreground">
												{contact.contact_note}
											</p>
										{/if}
									</div>
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											<Button variant="ghost" size="sm" class="h-6 w-6 p-0">
												<MoreHorizontalIcon size={12} />
											</Button>
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end" class="min-w-[140px]">
											<DropdownMenu.Item onclick={() => openEditContact(contact)}>
												<PencilIcon size={12} class="mr-2" />
												Edit
											</DropdownMenu.Item>
											<DropdownMenu.Separator />
											<DropdownMenu.Item
												class="text-destructive focus:text-destructive"
												onclick={() => removeContact(contact)}
											>
												<Trash2Icon size={12} class="mr-2" />
												Remove
											</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			</div>
		</section>
	</div>
</div>

<!-- Add customer modal -->
<Dialog.Root bind:open={addOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Add customer</Dialog.Title>
			<Dialog.Description>
				Create a new customer record. SLA and description are optional.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-3 pt-2">
			<div class="flex flex-col gap-1">
				<label for="add-customer-name" class="text-2xs uppercase tracking-wide text-muted-foreground">
					Name
				</label>
				<Input
					id="add-customer-name"
					placeholder="Acme Corp"
					bind:value={addForm.customer_name}
					disabled={addBusy}
				/>
			</div>
			<div class="flex flex-col gap-1">
				<label for="add-customer-description" class="text-2xs uppercase tracking-wide text-muted-foreground">
					Description
				</label>
				<Textarea
					id="add-customer-description"
					rows={3}
					bind:value={addForm.customer_description}
					disabled={addBusy}
				/>
			</div>
			<div class="flex flex-col gap-1">
				<label for="add-customer-sla" class="text-2xs uppercase tracking-wide text-muted-foreground">
					SLA
				</label>
				<Textarea
					id="add-customer-sla"
					rows={3}
					bind:value={addForm.customer_sla}
					disabled={addBusy}
				/>
			</div>
			{#if addError}
				<p class="text-2xs text-destructive">{addError}</p>
			{/if}
		</div>

		<Dialog.Footer class="pt-3">
			<Button variant="outline" onclick={() => (addOpen = false)} disabled={addBusy}>
				Cancel
			</Button>
			<Button onclick={submitAdd} disabled={addBusy}>
				{addBusy ? 'Saving…' : 'Create'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Edit customer modal -->
<Dialog.Root bind:open={editOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Edit customer</Dialog.Title>
			<Dialog.Description>
				Update the customer's name, description or SLA.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-3 pt-2">
			<div class="flex flex-col gap-1">
				<label for="edit-customer-name" class="text-2xs uppercase tracking-wide text-muted-foreground">
					Name
				</label>
				<Input id="edit-customer-name" bind:value={editForm.customer_name} disabled={editBusy} />
			</div>
			<div class="flex flex-col gap-1">
				<label for="edit-customer-description" class="text-2xs uppercase tracking-wide text-muted-foreground">
					Description
				</label>
				<Textarea
					id="edit-customer-description"
					rows={3}
					bind:value={editForm.customer_description}
					disabled={editBusy}
				/>
			</div>
			<div class="flex flex-col gap-1">
				<label for="edit-customer-sla" class="text-2xs uppercase tracking-wide text-muted-foreground">
					SLA
				</label>
				<Textarea
					id="edit-customer-sla"
					rows={3}
					bind:value={editForm.customer_sla}
					disabled={editBusy}
				/>
			</div>
			{#if editError}
				<p class="text-2xs text-destructive">{editError}</p>
			{/if}
		</div>

		<Dialog.Footer class="pt-3">
			<Button variant="outline" onclick={() => (editOpen = false)} disabled={editBusy}>
				Cancel
			</Button>
			<Button onclick={submitEdit} disabled={editBusy}>
				{editBusy ? 'Saving…' : 'Save'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Contact modal (add + edit) -->
<Dialog.Root bind:open={contactOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>
				{contactEditingId == null ? 'Add contact' : 'Edit contact'}
			</Dialog.Title>
			<Dialog.Description>
				Contact info for {selectedCustomer?.customer_name ?? 'the customer'}.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-3 pt-2">
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div class="flex flex-col gap-1">
					<label for="contact-name" class="text-2xs uppercase tracking-wide text-muted-foreground">
						Name
					</label>
					<Input id="contact-name" bind:value={contactForm.contact_name} disabled={contactBusy} />
				</div>
				<div class="flex flex-col gap-1">
					<label for="contact-role" class="text-2xs uppercase tracking-wide text-muted-foreground">
						Role
					</label>
					<Input
						id="contact-role"
						list="contact-role-suggestions"
						bind:value={contactForm.contact_role}
						disabled={contactBusy}
					/>
					<datalist id="contact-role-suggestions">
						{#each CONTACT_ROLES as role}
							<option value={role}></option>
						{/each}
					</datalist>
				</div>
				<div class="flex flex-col gap-1 sm:col-span-2">
					<label for="contact-email" class="text-2xs uppercase tracking-wide text-muted-foreground">
						Email
					</label>
					<Input
						id="contact-email"
						type="email"
						bind:value={contactForm.contact_email}
						disabled={contactBusy}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label for="contact-work-phone" class="text-2xs uppercase tracking-wide text-muted-foreground">
						Work phone
					</label>
					<Input
						id="contact-work-phone"
						bind:value={contactForm.contact_work_phone}
						disabled={contactBusy}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label for="contact-mobile-phone" class="text-2xs uppercase tracking-wide text-muted-foreground">
						Mobile phone
					</label>
					<Input
						id="contact-mobile-phone"
						bind:value={contactForm.contact_mobile_phone}
						disabled={contactBusy}
					/>
				</div>
			</div>
			<div class="flex flex-col gap-1">
				<label for="contact-note" class="text-2xs uppercase tracking-wide text-muted-foreground">
					Notes
				</label>
				<Textarea
					id="contact-note"
					rows={3}
					bind:value={contactForm.contact_note}
					disabled={contactBusy}
				/>
			</div>
			{#if contactError}
				<p class="text-2xs text-destructive">{contactError}</p>
			{/if}
		</div>

		<Dialog.Footer class="pt-3">
			<Button variant="outline" onclick={() => (contactOpen = false)} disabled={contactBusy}>
				Cancel
			</Button>
			<Button onclick={submitContact} disabled={contactBusy}>
				{contactBusy ? 'Saving…' : contactEditingId == null ? 'Add' : 'Save'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<ConfirmationDialog
	bind:open={confirmOpen}
	title={confirmTitle}
	message={confirmMessage}
	confirmText="Remove"
	onConfirm={runConfirm}
/>

<!--
  Add/Edit user dialog.

  Bound to a `user` prop:
    • `null`            → create mode; shows password field
    • existing record   → edit mode; password field stays editable
                          (admins can reset a password here without
                          the user needing to log in) — except in demo
                          mode, where resetting a shared account's
                          password would lock out the next visitor.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import {
		AccessControlService,
		type AccessControlUser,
		type CreateUserBody,
		type UpdateUserBody
	} from '$lib/services/access-control.service';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { demoLocksCredentials } from '$lib/services/user-context.service';

	type Props = {
		open: boolean;
		user: AccessControlUser | null;
		showError: (msg: string, fallback?: string) => void;
		onSaved: (user: AccessControlUser) => void;
	};

	let { open = $bindable(), user, showError, onSaved }: Props = $props();

	const isEdit = $derived(user != null);

	const userCtx = getContext<UserCtx>(USER_CTX);
	// Only the *reset* is blocked: a brand-new account still needs a
	// password, and the create route allows one. Editing an existing
	// account's password is what the API refuses in demo mode.
	const passwordLocked = $derived(isEdit && demoLocksCredentials(userCtx.ctx));

	let form = $state<CreateUserBody>({
		user_name: '',
		user_login: '',
		user_email: '',
		user_password: '',
		user_active: true,
		user_isadmin: false,
		user_is_service_account: false
	});

	let busy = $state(false);
	let error = $state<string | null>(null);

	// Hydrate the form whenever the dialog opens with a new user.
	$effect(() => {
		if (!open) return;
		error = null;
		if (user) {
			form = {
				user_name: user.user_name,
				user_login: user.user_login,
				user_email: user.user_email,
				user_password: '',
				user_active: user.user_active,
				user_isadmin: !!user.user_isadmin,
				user_is_service_account: !!user.user_is_service_account
			};
		} else {
			form = {
				user_name: '',
				user_login: '',
				user_email: '',
				user_password: '',
				user_active: true,
				user_isadmin: false,
				user_is_service_account: false
			};
		}
	});

	const submit = async () => {
		// Minimal client-side validation mirroring backend `Length(min=2)`.
		for (const k of ['user_name', 'user_login', 'user_email'] as const) {
			if ((form[k] ?? '').trim().length < 2) {
				error = `${k.replace('user_', '').replace('_', ' ')} must be at least 2 characters`;
				return;
			}
		}
		busy = true;
		error = null;
		try {
			if (isEdit && user) {
				const body: UpdateUserBody = {
					user_name: form.user_name.trim(),
					user_login: form.user_login.trim(),
					user_email: form.user_email.trim(),
					user_active: form.user_active,
					user_isadmin: form.user_isadmin,
					user_is_service_account: form.user_is_service_account
				};
				// Only send the password if the admin actually entered
				// one — leaving it blank means "keep the existing
				// password unchanged".
				if (!passwordLocked && form.user_password && form.user_password.length > 0) {
					body.user_password = form.user_password;
				}
				const res = await AccessControlService.updateUser(user.user_id, body);
				if (res.ok && res.data && typeof res.data !== 'string') {
					onSaved(res.data as AccessControlUser);
					open = false;
				} else {
					const data = res.data as { message?: string; data?: unknown } | null;
					error = data?.message ?? res.error?.message ?? 'Save failed';
				}
			} else {
				if (!form.user_password || form.user_password.length < 8) {
					error = 'Password must be at least 8 characters';
					return;
				}
				const res = await AccessControlService.createUser(form);
				if (res.ok && res.data && typeof res.data !== 'string') {
					onSaved(res.data as AccessControlUser);
					open = false;
				} else {
					const data = res.data as { message?: string; data?: unknown } | null;
					error = data?.message ?? res.error?.message ?? 'Create failed';
				}
			}
		} catch (e) {
			showError((e as Error).message);
		} finally {
			busy = false;
		}
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{isEdit ? 'Edit user' : 'Add user'}</Dialog.Title>
			<Dialog.Description>
				{#if passwordLocked}
					Update the user record. Password resets are disabled in demo mode.
				{:else if isEdit}
					Update the user record. Leave password blank to keep the existing one.
				{:else}
					Create a new user account.
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		<div class="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
			<div class="flex flex-col gap-1">
				<label class="text-2xs uppercase tracking-wide text-muted-foreground" for="ued-name">
					Display name *
				</label>
				<Input id="ued-name" class="h-7 text-xs" bind:value={form.user_name} disabled={busy} />
			</div>
			<div class="flex flex-col gap-1">
				<label class="text-2xs uppercase tracking-wide text-muted-foreground" for="ued-login">
					Login *
				</label>
				<Input id="ued-login" class="h-7 text-xs" bind:value={form.user_login} disabled={busy} />
			</div>
			<div class="flex flex-col gap-1 sm:col-span-2">
				<label class="text-2xs uppercase tracking-wide text-muted-foreground" for="ued-email">
					Email *
				</label>
				<Input
					id="ued-email"
					type="email"
					class="h-7 text-xs"
					bind:value={form.user_email}
					disabled={busy}
				/>
			</div>
			{#if !passwordLocked}
				<div class="flex flex-col gap-1 sm:col-span-2">
					<label class="text-2xs uppercase tracking-wide text-muted-foreground" for="ued-pwd">
						Password{isEdit ? '' : ' *'}
					</label>
					<Input
						id="ued-pwd"
						type="password"
						class="h-7 text-xs"
						placeholder={isEdit ? 'Leave blank to keep the current password' : 'min 8 characters'}
						bind:value={form.user_password}
						disabled={busy}
						autocomplete="new-password"
					/>
				</div>
			{/if}

			<div class="flex items-center gap-2 sm:col-span-2">
				<Switch
					checked={form.user_active}
					onCheckedChange={(v: boolean) => (form.user_active = v)}
					disabled={busy}
				/>
				<span class="text-2xs">Active</span>
			</div>
			<div class="flex items-center gap-2 sm:col-span-2">
				<Switch
					checked={!!form.user_is_service_account}
					onCheckedChange={(v: boolean) => (form.user_is_service_account = v)}
					disabled={busy}
				/>
				<span class="text-2xs">
					Service account
					<span class="text-muted-foreground">(no interactive login, API-key only)</span>
				</span>
			</div>

			{#if error}
				<p class="whitespace-pre-wrap text-2xs text-destructive sm:col-span-2">{error}</p>
			{/if}
		</div>

		<Dialog.Footer class="pt-3">
			<Button variant="outline" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
			<Button onclick={submit} disabled={busy}>
				{busy ? 'Saving…' : isEdit ? 'Save' : 'Create'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

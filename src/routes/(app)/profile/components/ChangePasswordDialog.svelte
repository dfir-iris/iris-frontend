<!--
  Password change dialog. Posts to `PUT /api/v2/me` with `user_password`,
  same field the schema's load-only password accepts. Mirrors the legacy
  modal_pwd_user.html — two password fields, equality check before submit.
  Server-side password policy errors come back through the
  `response_api_error` `data` field which we surface as inline help.
-->
<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { toast } from '$lib/components/ui/toast';
	import { ProfileService } from '$lib/services/profile.service';

	type Props = {
		open: boolean;
		onSaved?: () => void;
	};

	let { open = $bindable(), onSaved }: Props = $props();

	let currentPwd = $state('');
	let pwd = $state('');
	let pwdConfirm = $state('');
	let saving = $state(false);
	let errorMsg = $state<string | null>(null);

	const reset = () => {
		currentPwd = '';
		pwd = '';
		pwdConfirm = '';
		errorMsg = null;
	};

	$effect(() => {
		if (!open) reset();
	});

	const save = async () => {
		errorMsg = null;
		if (!currentPwd) {
			errorMsg = 'Current password is required';
			return;
		}
		if (pwd !== pwdConfirm) {
			errorMsg = 'Password and verification do not match';
			return;
		}
		if (!pwd) {
			errorMsg = 'New password cannot be empty';
			return;
		}

		saving = true;
		try {
			const res = await ProfileService.update({
				user_current_password: currentPwd,
				user_password: pwd
			});
			if (!res.ok) {
				const detail =
					res.error?.message ??
					(typeof res.data === 'string' ? res.data : 'Failed to update password');
				errorMsg = detail;
				return;
			}
			toast({ title: 'Password updated', variant: 'success' });
			open = false;
			onSaved?.();
		} finally {
			saving = false;
		}
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex flex-col p-0 sm:max-w-md">
		<Dialog.Header class="border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">Change password</Dialog.Title>
		</Dialog.Header>

		<div class="flex flex-col gap-4 px-6 py-5">
			<div class="flex flex-col gap-1.5">
				<Label for="current_password">Current password</Label>
				<Input
					id="current_password"
					type="password"
					bind:value={currentPwd}
					placeholder="Current password"
					autocomplete="current-password"
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="new_password">New password</Label>
				<Input
					id="new_password"
					type="password"
					bind:value={pwd}
					placeholder="Password"
					autocomplete="new-password"
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="new_password_v">Verification</Label>
				<Input
					id="new_password_v"
					type="password"
					bind:value={pwdConfirm}
					placeholder="Verification"
					autocomplete="new-password"
				/>
			</div>

			{#if errorMsg}
				<p class="text-sm text-destructive">{errorMsg}</p>
			{/if}
		</div>

		<div class="flex items-center justify-end gap-2 border-t px-6 py-4">
			<Button variant="outline" onclick={() => (open = false)} disabled={saving}>Cancel</Button>
			<Button onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>

<!--
  Cross-app user avatar. The image bytes come from
  `/api/v2/users/<userId>/avatar`; that endpoint sits behind the
  bearer-token auth pipeline, so a naive `<img src=…>` would 401 (the
  browser would not attach the bearer token). We solve this by going
  through `avatarStore` — it `fetch`es the bytes with the session
  token, wraps them in an object URL, and caches the result. When the
  endpoint 404s (user has no upload) we fall through to a deterministic
  initials tile.

  Usage:

      <UserAvatar userId={comment.user.user_id} name={comment.user.user_name} />
-->
<script lang="ts">
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import { avatarStore, getAvatarKey } from '$lib/services/avatar-cache';
	import { cn } from '$lib/utils';

	type Props = {
		userId: number | null | undefined;
		/** Display name used for both the fallback initials and alt
		 *  text. When the user is unknown, the fallback paints a
		 *  question mark instead. */
		name?: string | null;
		/** When set, busts the browser cache after an upload (the
		 *  caller passes `user.avatar_updated_at`). */
		updatedAt?: string | null;
		/** Tailwind size class, defaults to `size-8`. */
		size?: string;
		class?: string;
		title?: string;
	};

	let {
		userId,
		name = null,
		updatedAt = null,
		size = 'size-8',
		class: className = '',
		title
	}: Props = $props();

	const initials = $derived(computeInitials(name ?? ''));
	const tone = $derived(toneFor(name ?? `user-${userId ?? 'unknown'}`));
	const altText = $derived(name ?? (userId != null ? `User ${userId}` : 'Unknown user'));

	// We track the object URL in local state instead of reading
	// `$avatarStore[cacheKey]?.objectUrl` from inside a `$derived`,
	// because Svelte 5's auto-subscription doesn't fire reliably for
	// store reads buried in derived expressions. A manual
	// `store.subscribe` keeps the component reactive to cache writes
	// from anywhere in the app (e.g. another `<UserAvatar>` for the
	// same user finishing its fetch, or `bumpUser(id)` after upload).
	let objectUrl = $state<string>('');

	$effect(() => {
		if (userId == null) {
			objectUrl = '';
			return;
		}
		const key = getAvatarKey(userId, updatedAt ?? null);
		avatarStore.prime(userId, updatedAt ?? null);
		const unsubscribe = avatarStore.subscribe((cacheMap) => {
			objectUrl = cacheMap[key]?.objectUrl ?? '';
		});
		return unsubscribe;
	});

	function computeInitials(value: string): string {
		const trimmed = value.trim();
		if (!trimmed) return '?';
		const parts = trimmed.split(/\s+/).slice(0, 2);
		const letters = parts.map((part) => part[0] ?? '').join('');
		return (letters || trimmed[0]).toUpperCase();
	}

	function toneFor(seed: string): string {
		const palette = [
			'bg-blue-500/15 text-blue-700 dark:text-blue-300',
			'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
			'bg-violet-500/15 text-violet-700 dark:text-violet-300',
			'bg-amber-500/15 text-amber-700 dark:text-amber-300',
			'bg-rose-500/15 text-rose-700 dark:text-rose-300',
			'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
			'bg-orange-500/15 text-orange-700 dark:text-orange-300',
			'bg-teal-500/15 text-teal-700 dark:text-teal-300'
		];
		let hash = 0;
		for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
		return palette[Math.abs(hash) % palette.length];
	}
</script>

<Avatar class={cn(size, className)} {title}>
	{#if objectUrl}
		<AvatarImage src={objectUrl} alt={altText} class="object-cover" />
	{/if}
	<AvatarFallback class={cn('text-2xs font-semibold', tone)}>
		{initials}
	</AvatarFallback>
</Avatar>

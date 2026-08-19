<!--
  `@login` lifted out of a chat message so an operator can see at a
  glance who's being paged. Self-mentions get a warmer highlight so you
  notice when *you* were named.

  Mounted imperatively by <ChatMessageBody> into a placeholder the DOM
  pass leaves behind, so it takes the handle as a plain prop.
-->
<script lang="ts">
	import { AtSignIcon } from 'lucide-svelte';
	import { current_user } from '$lib/stores/auth.store';

	let { handle }: { handle: string } = $props();

	// Case-insensitive compare so `@Pamicelli`, `@pamicelli` and
	// `@PAMICELLI` all pop the same self-highlight. `user_login` is the
	// canonical string the composer inserts, but a human writing a
	// mention by hand may vary the casing.
	const isSelf = $derived(
		($current_user?.user_login ?? '').toLowerCase() !== '' &&
			handle.toLowerCase() === ($current_user?.user_login ?? '').toLowerCase()
	);
</script>

<span
	class={[
		'mx-0.5 inline-flex items-baseline gap-0.5 rounded-md border px-1.5 py-0 align-baseline text-2xs font-medium no-underline transition-colors',
		isSelf
			? 'border-amber-500/60 bg-amber-500/15 text-amber-800 dark:border-amber-400/50 dark:bg-amber-500/20 dark:text-amber-200'
			: 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-200'
	]}
	title={isSelf ? `${handle} — that's you` : `Mention: ${handle}`}
>
	<AtSignIcon class="h-2.5 w-2.5 shrink-0 self-center opacity-80" />{handle}</span
>

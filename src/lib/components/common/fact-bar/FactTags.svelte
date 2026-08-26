<!--
  Tag row of the fact strip. Its own line because a full tag set is wide and
  would push every other fact off the first line; hidden entirely when the
  entity has no tags.
-->
<script lang="ts">
	import { TagDisplay } from '$lib/components/common/tag';
	import type { TagInput } from '$lib/types/resources/tag';

	let { tags }: { tags?: TagInput | null } = $props();

	const hasTags = $derived(Array.isArray(tags) ? tags.length > 0 : Boolean(tags));
</script>

{#if hasTags}
	<!--
	  VISUAL TEST (lighter chrome): no `border-b`. Tags now read as the
	  second line of the fact strip above rather than as their own band.
	-->
	<div class="flex flex-wrap items-center gap-1.5 px-3.5 pb-2 pt-0.5">
		<span class="mr-1 text-2xs uppercase tracking-wide text-muted-foreground">Tags</span>

		<TagDisplay tags={tags ?? []} size="xs" />
	</div>
{/if}

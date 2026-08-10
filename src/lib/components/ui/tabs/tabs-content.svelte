<script lang="ts">
	import { Tabs as TabsPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		value,
		...restProps
	}: TabsPrimitive.ContentProps = $props();
</script>

<!--
  `data-[state=inactive]:hidden !important` — bits-ui hides inactive
  panels via the HTML `hidden` attribute, but callers routinely pass
  `flex`/`grid` in `class`, which sets `display:*` and beats the
  browser's default `[hidden] { display: none }`. Forcing `display:
  none` on inactive panels is the only reliable way to keep the
  panels' consumer classes from leaking display through.
-->
<TabsPrimitive.Content
	bind:ref
	class={cn(
		"ring-offset-background focus-visible:ring-ring mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 data-[state=inactive]:!hidden",
		className
	)}
	{value}
	{...restProps}
/>

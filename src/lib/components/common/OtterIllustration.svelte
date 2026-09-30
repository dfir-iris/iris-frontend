<script lang="ts">
	// An otter bobbing in the water, holding up a sign. Drawn inline rather
	// than shipped as an image so the sign text can change per use and the
	// palette follows the theme where it has to (the water).
	let {
		sign = '',
		class: className = ''
	}: {
		sign?: string;
		class?: string;
	} = $props();
</script>

<svg
	viewBox="0 40 240 160"
	class={className}
	role="img"
	aria-label={sign ? `An otter holding a sign reading ${sign}` : 'An otter'}
>
	<!-- Body, mostly under water -->
	<ellipse cx="120" cy="168" rx="46" ry="46" fill="#8b5e3c" />

	<!-- Small ears, set low on the sides of a wide, flat head -->
	<circle cx="70" cy="74" r="8" fill="#8b5e3c" />
	<circle cx="70" cy="74" r="4" fill="#5c3b24" />
	<circle cx="170" cy="74" r="8" fill="#8b5e3c" />
	<circle cx="170" cy="74" r="4" fill="#5c3b24" />

	<!-- Head, with the paler cheeks and throat -->
	<ellipse cx="120" cy="92" rx="54" ry="40" fill="#8b5e3c" />
	<ellipse cx="120" cy="106" rx="42" ry="26" fill="#d9b48f" />

	<!-- Eyes, looking a little apologetic -->
	<circle cx="97" cy="82" r="6" fill="#2b1d14" />
	<circle cx="143" cy="82" r="6" fill="#2b1d14" />
	<circle cx="99" cy="80" r="2" fill="#ffffff" />
	<circle cx="145" cy="80" r="2" fill="#ffffff" />
	<path
		d="M88 71 q8 -5 16 0 M136 71 q8 -5 16 0"
		fill="none"
		stroke="#5c3b24"
		stroke-width="2.5"
		stroke-linecap="round"
	/>

	<!-- Whisker pads, the otter's tell -->
	<circle cx="110" cy="108" r="11" fill="#f1dcc3" />
	<circle cx="130" cy="108" r="11" fill="#f1dcc3" />
	<g fill="#8b6a4f">
		<circle cx="105" cy="107" r="1.2" />
		<circle cx="109" cy="111" r="1.2" />
		<circle cx="104" cy="113" r="1.2" />
		<circle cx="135" cy="107" r="1.2" />
		<circle cx="131" cy="111" r="1.2" />
		<circle cx="136" cy="113" r="1.2" />
	</g>

	<!-- Nose and mouth -->
	<path d="M111 97 q9 -3 18 0 q-2 8 -9 9 q-7 -1 -9 -9 Z" fill="#2b1d14" />
	<path
		d="M114 123 q6 -4 12 0"
		fill="none"
		stroke="#2b1d14"
		stroke-width="2"
		stroke-linecap="round"
	/>

	<!-- Whiskers -->
	<g stroke="#5c3b24" stroke-width="1.2" stroke-linecap="round" fill="none">
		<path d="M100 106 q-18 -6 -36 -4" />
		<path d="M100 111 q-18 0 -38 5" />
		<path d="M140 106 q18 -6 36 -4" />
		<path d="M140 111 q18 0 38 5" />
	</g>

	<!-- Water -->
	<path
		d="M0 176 q15 -8 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V200 H0 Z"
		class="fill-sky-300/80 dark:fill-sky-700/80"
	/>
	<path
		d="M10 188 q10 -5 20 0 M200 192 q10 -5 20 0 M60 196 q10 -5 20 0"
		fill="none"
		class="stroke-sky-100 dark:stroke-sky-400"
		stroke-width="2"
		stroke-linecap="round"
	/>

	{#if sign}
		<!-- The sign, held up just above the water line -->
		<rect
			x="78"
			y="140"
			width="84"
			height="36"
			rx="6"
			fill="#fef3c7"
			stroke="#92400e"
			stroke-width="2"
		/>
		<text
			x="120"
			y="164"
			text-anchor="middle"
			font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
			font-size="18"
			font-weight="700"
			fill="#92400e">{sign}</text
		>
		<!-- Paws over the sign's edges -->
		<ellipse cx="80" cy="156" rx="10" ry="8" fill="#8b5e3c" />
		<ellipse cx="160" cy="156" rx="10" ry="8" fill="#8b5e3c" />
	{/if}
</svg>

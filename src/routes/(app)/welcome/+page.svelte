<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import Card from '$lib/components/ui/card/card.svelte';
	import Disclaimer from './Disclaimer.svelte';
	import RulesOfEngagement from './RulesOfEngagement.svelte';

	let expandedSection = $state<'rules' | 'disclaimer' | null>(null);

	const toggleRules = () => {
		expandedSection = expandedSection === 'rules' ? null : 'rules';
	};

	const toggleDisclaimer = () => {
		expandedSection = expandedSection === 'disclaimer' ? null : 'disclaimer';
	};
</script>

<svelte:head>
	<title>Welcome | DFIR-IRIS</title>
</svelte:head>

<div class="mx-auto my-4 w-full max-w-6xl">
	<Card>
		<div class="flex flex-col px-24 py-4">
			<img src="/img/logo/logo-full-blue.png" alt="IRIS Logo" class="mx-auto w-96" />

			<h2 class="my-6 text-lg">Kindly read the following carefully</h2>

			<ul class="my-2 list-disc pl-6">
				<li>Do not upload any illegal or confidential materials</li>
				<li>Do not download and open files from other users blindly</li>
				<li>
					Respect a <a
						href="https://cheatsheetseries.owasp.org/cheatsheets/Vulnerability_Disclosure_Cheat_Sheet.html#responsible-or-coordinated-disclosure"
						>responsible disclosure</a
					> of 30 days if you find a vulnerability
				</li>
			</ul>

			<p class="my-6 font-bold">
				Not sure what IRIS is about? You'll find out more info on the <a
					href="https://www.dfir-iris.org/">main website</a
				>
			</p>

			<p>IRIS is not optimized to be used on phones. We recommend accessint it from a computer.</p>
			<p>If you notice anything suspicious or have any question, please contact us.</p>

			<p class="my-6 italic">
				By accessing this instance you confirm you read, understand and agree with all the
				information on this page.
			</p>

			<div class="mx-auto my-6 flex gap-4">
				<Button onclick={toggleRules}>Rules of engagement</Button>
				<Button onclick={toggleDisclaimer}>Disclaimer</Button>
			</div>

			{#if expandedSection !== null}
				<div class="mt-2 border-t pt-4">
					{#if expandedSection === 'rules'}
						<RulesOfEngagement />
					{/if}

					{#if expandedSection === 'disclaimer'}
						<Disclaimer />
					{/if}
				</div>
			{/if}
		</div>
	</Card>
</div>

import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';

// These assertions track the "Case queue" page (src/routes/(app)/cases/+page.svelte).
// They were previously written against an older "Open Cases" table layout and
// went stale when the page was redesigned into the queue + detail split view.

test.describe('Cases · list', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('/cases page loads with the Case queue header and sortable columns', async ({ page }) => {
		await page.goto('/cases');
		await expect(page.getByRole('heading', { name: /^case queue$/i, level: 1 })).toBeVisible({
			timeout: 10_000
		});

		// The column headers are buttons, not <th role="columnheader">. Their
		// accessible name is "Sort by <label>", plus " (ascending)"/" (descending)"
		// on whichever column is currently sorted — hence the prefix match.
		await expect(page.getByRole('button', { name: /^Sort by Case\b/ })).toBeVisible();
		await expect(page.getByRole('button', { name: /^Sort by Stage\b/ })).toBeVisible();
		await expect(page.getByRole('button', { name: /^Sort by Owner\b/ })).toBeVisible();
	});

	test('/cases page exposes the "Open a case" create affordance', async ({ page }) => {
		await page.goto('/cases');
		// The create-case action reads "Open a case" (as in "open a new
		// investigation case").
		await expect(page.getByRole('button', { name: /^Open a case$/i })).toBeVisible({
			timeout: 10_000
		});
	});

	test('the queue search box filters the list down to the empty state', async ({ page }) => {
		// Login + first paint + debounce + refetch, each with its own ceiling.
		test.setTimeout(60_000);

		// `networkidle` so we type into a hydrated input. With the default
		// `load` the fill can land on the SSR DOM, before `bind:value` exists.
		await page.goto('/cases', { waitUntil: 'networkidle' });

		// The search input is a shadcn <Input> with no aria-label, so the
		// placeholder is the only stable handle on it.
		const search = page.getByPlaceholder(/^Filter by title/);
		await expect(search).toBeVisible({ timeout: 10_000 });

		await search.fill('nonexistent-case-name-xyzzy');

		// Fail here, with a readable message, if the app ever eats the input
		// again — rather than as an opaque URL timeout three lines down.
		await expect(search).toHaveValue('nonexistent-case-name-xyzzy');

		// The box is debounced and then pushes the term into the URL, which is
		// what triggers the refetch. Asserting on the URL is deterministic where
		// waiting on a fixed timeout is not. `toHaveURL` polls `page.url()`, so
		// it observes SvelteKit's same-document `goto(…, { replaceState: true })`
		// regardless of whether that counts as a navigation.
		await expect(page).toHaveURL(/[?&]search=nonexistent-case-name-xyzzy/, {
			timeout: 10_000
		});

		// Nothing can match, so the queue must fall through to its empty state.
		await expect(page.getByText('No cases match this view.')).toBeVisible({ timeout: 10_000 });
	});

	// Regression: `search` was assigned by the same $effect that built the list
	// query, so that effect's other dependencies (`debouncedGroup`, `sort`,
	// `perPage`) reset the box mid-typing. Re-sorting before the search debounce
	// landed used to wipe the term, and the follow-up `updateUrl('')` then
	// no-opped on its `nextHref === curHref` guard, so the URL never updated.
	test('re-sorting does not wipe a half-typed search term', async ({ page }) => {
		test.setTimeout(60_000);

		await page.goto('/cases', { waitUntil: 'networkidle' });

		const search = page.getByPlaceholder(/^Filter by title/);
		const sortByStage = page.getByRole('button', { name: /^Sort by Stage\b/ });
		await expect(search).toBeVisible({ timeout: 10_000 });

		// Resolve the sort button BEFORE typing: its actionability check would
		// otherwise eat most of the 250ms debounce window we are trying to land
		// inside, and the clobber only reproduces while `search` is still
		// pending. (With the fix the term survives either way, so a slow click
		// costs coverage, never a false failure.)
		await expect(sortByStage).toBeVisible({ timeout: 10_000 });

		await search.fill('nonexistent-case-name-xyzzy');
		await sortByStage.click();

		// The term must survive the re-sort — in the box and in the URL.
		await expect(search).toHaveValue('nonexistent-case-name-xyzzy');
		await expect(page).toHaveURL(/[?&]search=nonexistent-case-name-xyzzy/, {
			timeout: 10_000
		});
	});

	// Regression: `updateUrl` trims before writing, so the echo coming back from
	// the URL differs from the text still in the box. The mirror used to adopt
	// that echo unconditionally and delete the space the user had just typed —
	// and the corrective write then no-opped on `nextHref === curHref`, so the
	// character was gone for good. Unlike the re-sort case above this one has no
	// race: we wait for the debounce to land before asserting.
	test('committing a search term does not eat a trailing space', async ({ page }) => {
		test.setTimeout(60_000);

		await page.goto('/cases', { waitUntil: 'networkidle' });

		const search = page.getByPlaceholder(/^Filter by title/);
		await expect(search).toBeVisible({ timeout: 10_000 });

		// A word plus the space that separates it from the next one.
		await search.fill('nonexistent-case-name-xyzzy ');

		// Wait for the debounced (and trimmed) write to reach the URL, which is
		// what echoes back into the component.
		await expect(page).toHaveURL(/[?&]search=nonexistent-case-name-xyzzy(&|$)/, {
			timeout: 10_000
		});

		// The box must still hold the trailing space.
		await expect(search).toHaveValue('nonexistent-case-name-xyzzy ');
	});

	// Regression: the filters $effect had no first-run guard. `filterGroup` and
	// `debouncedGroup` are seeded by two separate `emptyGroup('and')` calls, so
	// mount looked like a real filter edit and the debounce fired
	// `updateUrl({ page: 1 })` ~250ms in — and `updateUrl` *deletes* the page
	// param at page <= 1, so a deep link silently snapped back to page 1.
	test('a deep link to a specific page is not reset to page 1 on mount', async ({ page }) => {
		test.setTimeout(60_000);

		await page.goto('/cases?page=2', { waitUntil: 'networkidle' });

		await expect(page.getByRole('heading', { name: /^case queue$/i, level: 1 })).toBeVisible({
			timeout: 10_000
		});

		// This asserts an absence, so it needs a window rather than a poll: the
		// reset arrived one debounce (250ms) after mount, and `toHaveURL` would
		// pass on the very first tick and never see it. Both debounces on this
		// page are 250ms, so a second is comfortably past all of them.
		await page.waitForTimeout(1_000);

		// Deliberately asserted on the URL, not on rendered rows: whether page 2
		// holds any cases depends on how much the environment is seeded with,
		// but the param must survive either way.
		await expect(page).toHaveURL(/[?&]page=2(&|$)/);
	});

	// Regression: `hasActiveFilter` counts the search box and the Show-closed
	// toggle as well as the builder tree, but `clearActiveFilter` reset only the
	// tree. So the empty state's "Clear filters" button rendered (the search term
	// made `hasActiveFilter` true) and then did nothing when clicked.
	test('"Clear filters" clears a search-only filter', async ({ page }) => {
		test.setTimeout(60_000);

		await page.goto('/cases', { waitUntil: 'networkidle' });

		const search = page.getByPlaceholder(/^Filter by title/);
		await expect(search).toBeVisible({ timeout: 10_000 });

		// Filter down to nothing so the empty state — the only place this button
		// lives — is on screen.
		await search.fill('nonexistent-case-name-xyzzy');
		await expect(page.getByText('No cases match this view.')).toBeVisible({ timeout: 10_000 });

		const clear = page.getByRole('button', { name: /^Clear filters$/ });
		await expect(clear).toBeVisible({ timeout: 10_000 });
		await clear.click();

		// The term must be gone from the box and from the URL. `clearActiveFilter`
		// drops every param this page owns (search, page, show_closed), and those
		// are the only ones it ever sets, so the bare path is the exact result.
		await expect(search).toHaveValue('');
		await expect(page).toHaveURL(/\/cases$/, { timeout: 10_000 });

		// ...and the queue comes back, which is the point of the button. (Every
		// IRIS install ships with a demo case, so the unfiltered list is never
		// empty; if this ever fails on a truly empty tenant, seed one here.)
		await expect(page.getByText('No cases match this view.')).toBeHidden({ timeout: 10_000 });
	});

	// Regression: `applyFiltersNow` commits a filter synchronously, but its
	// callers reassign `filterGroup` first — so the filters $effect re-ran
	// afterwards and armed a fresh 250ms timer anyway. That timer re-applied the
	// tree that had just been applied (a second, pointless list fetch) and called
	// `updateUrl({ page: 1 })`, which strips the page param out from under anyone
	// who paginated inside that window.
	//
	// The stray URL write is a no-op unless you paginate within 250ms of the
	// click, so racing it would make a flaky test. The duplicate fetch is the
	// same leak observed deterministically.
	test('applying a KPI filter does not schedule a second list fetch', async ({ page }) => {
		test.setTimeout(60_000);

		await page.goto('/cases', { waitUntil: 'networkidle' });

		// "Open" is the environment-independent choice: it reassigns `filterGroup`
		// to a fresh empty tree on every click regardless of what severities or
		// cases the tenant has, so the click always drives exactly one refetch.
		const openKpi = page.locator('button.kpi--open');
		await expect(openKpi).toBeVisible({ timeout: 10_000 });

		let fetches = 0;
		page.on('request', (req) => {
			if (req.url().includes('/api/v2/cases/filter')) fetches++;
		});

		await openKpi.click();

		// Well past the 250ms debounce the leaked timer used to fire on.
		await page.waitForTimeout(1_500);

		// Exactly one: the click's own refetch. Two means the timer leaked. If the
		// page's fetch fan-out ever legitimately changes, update the number rather
		// than loosening the bound — the whole point is that it is exact.
		expect(fetches).toBe(1);
	});
});

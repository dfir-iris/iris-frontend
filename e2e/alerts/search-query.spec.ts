import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup } from '../helpers/api';
import type { APIRequestContext, Page } from '@playwright/test';

/**
 * The alerts search bar, end to end.
 *
 * Two seeded alerts per test, sharing a random token so they can be found
 * in whatever the instance already holds, and differing in one field so a
 * query that names it must return one and not the other. Asserting "the
 * expression returns fewer rows" would pass on a query that returns none.
 */

const token = () => `e2eq${Math.random().toString(36).slice(2, 8)}`;

type Pair = { tag: string; matching: string; other: string; ids: number[] };

/** Seed a matching / non-matching pair, told apart by `alert_source`. */
const seedPair = async (api: APIRequestContext): Promise<Pair> => {
	const tag = token();
	const matching = `${tag} crowdstrike`;
	const other = `${tag} sentinel`;

	const ids = [
		await seed.alert(api, { alert_title: matching, alert_source: 'crowdstrike' }),
		await seed.alert(api, { alert_title: other, alert_source: 'sentinel' })
	];

	return { tag, matching, other, ids };
};

const dropPair = async (api: APIRequestContext, pair: Pair) => {
	for (const id of pair.ids) await cleanup.alert(api, id);
};

/**
 * The bar's text input. It is a combobox, not a plain box — and it only
 * ever holds the clause being *typed*: everything already submitted has
 * become a chip, so its value says nothing about what the queue is
 * filtered by. Use `chip` for that.
 */
const searchBar = (page: Page) => page.getByRole('combobox', { name: 'Search expression' });

/** One committed condition, located by the × an analyst would click. */
const chip = (page: Page, clause: string) =>
	page.getByRole('button', { name: `Remove ${clause}`, exact: true });

/** Assert every clause of an expression came back as its own chip. */
const expectChips = async (page: Page, clauses: string[], because = '') => {
	for (const clause of clauses) {
		await expect(chip(page, clause), `${because} ${clause}`.trim()).toBeVisible();
	}
};

/**
 * An alert in the queue, by title. Matched on text rather than on a role:
 * the three views render a title as a heading, a span and a paragraph
 * respectively, and this has to mean the same thing in all of them. Split
 * view also echoes the selected alert into the detail pane, hence `first`.
 */
const alertRow = (page: Page, title: string) => page.getByText(title, { exact: true });

type GroupedUnit = { kind: string; alert?: Alertish; alerts?: Alertish[] };
type Alertish = { alert_title: string };

/**
 * Alert titles in a listing response. The grouped route returns queue
 * units rather than alerts — a clustered alert is only reachable through
 * its cluster — so both shapes have to be unwrapped.
 */
const titlesIn = (data: (Alertish | GroupedUnit)[]): string[] =>
	data.flatMap((entry) => {
		const unit = entry as GroupedUnit;
		if (unit.kind === 'cluster') return (unit.alerts ?? []).map((alert) => alert.alert_title);
		if (unit.kind === 'alert') return unit.alert ? [unit.alert.alert_title] : [];
		return [(entry as Alertish).alert_title];
	});

const typeQuery = async (page: Page, expression: string) => {
	const bar = searchBar(page);
	await bar.click();
	await bar.fill(expression);
	await bar.press('Enter');
};

test.describe('Alerts · search expression · API', () => {
	test('a query narrows the flat and grouped listings identically', async () => {
		const api = await adminApi();
		const pair = await seedPair(api);

		try {
			const expression = `${pair.tag} source:crowdstrike`;

			for (const path of ['/api/v2/alerts', '/api/v2/alerts/grouped']) {
				const res = await api.get(`${path}?query=${encodeURIComponent(expression)}`);
				expect(res.ok(), `${path}: ${await res.text()}`).toBeTruthy();

				// Read raw rather than through `apiJson`. Both listings answer
				// with the paginated envelope `{total, data, last_page, …}`, and
				// `apiJson` unwraps a `data` key — which here is the row array
				// itself, leaving nothing to take `.data` off.
				const body = (await res.json()) as { data: (Alertish | GroupedUnit)[] };
				const titles = titlesIn(body.data);

				expect(titles, path).toContain(pair.matching);
				expect(titles, path).not.toContain(pair.other);
			}
		} finally {
			await dropPair(api, pair);
			await api.dispose();
		}
	});

	test('a syntax error is a 400 pointing at the offending character', async () => {
		const api = await adminApi();

		try {
			const res = await api.get('/api/v2/alerts?query=' + encodeURIComponent('status:(New'));
			expect(res.status()).toBe(400);

			// `{message, data: {position}}`, and the offset is what the bar
			// underlines. Raw again — `apiJson` would unwrap `data` and hand
			// back the offset object with the key already spent.
			const body = (await res.json()) as { message?: string; data?: { position?: number } };
			expect(body.data?.position, 'the bar underlines from this').toBeGreaterThanOrEqual(0);
		} finally {
			await api.dispose();
		}
	});
});

test.describe('Alerts · search expression · UI', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('typing an expression narrows the queue and lands in the URL', async ({ page }) => {
		const api = await adminApi();
		const pair = await seedPair(api);

		try {
			await page.goto('/alerts?view=list');
			await typeQuery(page, `${pair.tag} source:crowdstrike`);

			await expect(page).toHaveURL(/[?&]query=/);
			// Committing empties the input and turns each clause into a chip.
			await expect(searchBar(page)).toHaveValue('');
			await expectChips(page, [pair.tag, 'source:crowdstrike']);

			await expect(alertRow(page, pair.matching).first()).toBeVisible();
			await expect(alertRow(page, pair.other)).toHaveCount(0);
		} finally {
			await dropPair(api, pair);
			await api.dispose();
		}
	});

	// The point of chips: drop one condition without retyping the rest.
	test('removing a chip drops just that condition', async ({ page }) => {
		const api = await adminApi();
		const pair = await seedPair(api);
		const expression = `${pair.tag} source:crowdstrike`;

		try {
			await page.goto(`/alerts?view=list&query=${encodeURIComponent(expression)}`);
			await expect(alertRow(page, pair.other)).toHaveCount(0);

			await chip(page, 'source:crowdstrike').click();

			// The source condition is gone and the tag one is not, so the
			// alert it had been hiding comes back and both are now listed.
			await expect(chip(page, 'source:crowdstrike')).toHaveCount(0);
			await expect(chip(page, pair.tag)).toBeVisible();
			await expect(alertRow(page, pair.matching).first()).toBeVisible();
			await expect(alertRow(page, pair.other).first()).toBeVisible();
		} finally {
			await dropPair(api, pair);
			await api.dispose();
		}
	});

	// Defect report from the field: the dropdown never appeared, because the
	// page unwrapped `/search-schema` one level too deep and left the
	// vocabulary permanently empty.
	test('autocomplete offers the vocabulary and completes a clause', async ({ page }) => {
		await page.goto('/alerts?view=list');

		const bar = searchBar(page);
		await bar.click();
		await bar.pressSequentially('stat');

		const suggestions = page.getByRole('listbox', { name: 'Search suggestions' });
		await expect(suggestions.getByRole('option', { name: /^status/ })).toBeVisible();

		// A field name is only half a clause, so accepting it leaves the bar
		// open on the value rather than running the search.
		await bar.press('Enter');
		await expect(bar).toHaveValue('status:');
		await expect(suggestions.getByRole('option').first()).toBeVisible();
	});

	// Juxtaposition is AND and binds tighter than OR, so an alternation
	// dropped beside an existing condition reassociates — the one rewrite a
	// search bar must never make on its own, because it makes the query
	// *wider* from an edit that reads like a narrowing one.
	test('an alternation appended to a condition narrows rather than widens', async ({ page }) => {
		const api = await adminApi();
		const pair = await seedPair(api);

		// Shares a source with one half of the alternation but not the tag.
		// Correct bracketing keeps it off screen; the reassociation into
		// `(tag AND crowdstrike) OR sentinel` puts it back.
		const decoy = `${token()} sentinel decoy`;
		const decoyId = await seed.alert(api, { alert_title: decoy, alert_source: 'sentinel' });

		try {
			await page.goto('/alerts?view=list');
			await typeQuery(page, pair.tag);
			await typeQuery(page, 'source:crowdstrike OR source:sentinel');

			// Bracketed on commit, and one chip rather than two: a × on either
			// half of an alternation would widen the query too.
			await expectChips(page, [pair.tag, '(source:crowdstrike OR source:sentinel)']);

			await expect(alertRow(page, pair.matching).first()).toBeVisible();
			await expect(alertRow(page, pair.other).first()).toBeVisible();
			await expect(alertRow(page, decoy)).toHaveCount(0);
		} finally {
			await cleanup.alert(api, decoyId);
			await dropPair(api, pair);
			await api.dispose();
		}
	});

	// `OR` binds loosest, so typing a whole expression with one in it is a
	// single condition — correct, and the one rule nobody guesses right.
	// It shows up as a working query collapsing into one unreadable chip,
	// so the bar has to say why and offer the other reading.
	test('a loose OR is explained, and the other reading is one click away', async ({ page }) => {
		const api = await adminApi();
		const pair = await seedPair(api);
		const typed = `${pair.tag} source:crowdstrike OR source:sentinel`;

		try {
			// `query=` empty rather than absent. With no filter named at all the
			// page applies the stored default view — `is:open` out of the box —
			// and an alternation committed onto a bar that already holds a
			// condition is bracketed on the way in, which is the *other* test.
			// A loose `OR` only stays loose when it is the whole expression.
			await page.goto('/alerts?view=list&query=');
			await typeQuery(page, typed);

			// One chip, because that genuinely is one condition.
			await expectChips(page, [typed]);
			await expect(page.getByText(/applies to everything written before it/).first()).toBeVisible();

			const tighten = page.getByRole('button', { name: 'Apply it to the last condition only' });
			await tighten.click();

			// Bound to the clause in front of it, so the query chips one
			// condition at a time again and the note has nothing left to say.
			await expectChips(page, [pair.tag, '(source:crowdstrike OR source:sentinel)']);
			await expect(tighten).toHaveCount(0);

			await expect(alertRow(page, pair.matching).first()).toBeVisible();
			await expect(alertRow(page, pair.other).first()).toBeVisible();
		} finally {
			await dropPair(api, pair);
			await api.dispose();
		}
	});

	test('NOT excludes what follows it', async ({ page }) => {
		const api = await adminApi();
		const pair = await seedPair(api);

		try {
			await page.goto('/alerts?view=list');
			await typeQuery(page, `${pair.tag} NOT source:sentinel`);

			// The negation stays attached to the clause it negates — chipping
			// `NOT` on its own would leave a × that inverts the query.
			await expectChips(page, [pair.tag, 'NOT source:sentinel']);

			await expect(alertRow(page, pair.matching).first()).toBeVisible();
			await expect(alertRow(page, pair.other)).toHaveCount(0);
		} finally {
			await dropPair(api, pair);
			await api.dispose();
		}
	});

	// Every other affordance in the bar narrows — chips, values, the
	// advanced grid — so nothing hints that a query can widen or exclude.
	// An analyst who cannot find OR runs two searches instead of one.
	test('the operators are offered once there is something to combine', async ({ page }) => {
		await page.goto('/alerts?view=list');

		const bar = searchBar(page);
		await bar.click();

		const suggestions = page.getByRole('listbox', { name: 'Search suggestions' });
		await expect(suggestions.getByRole('option').first()).toBeVisible();

		// Nothing to join to yet, and the first thing wanted on an empty bar
		// is a field rather than a syntax lesson.
		await expect(suggestions.getByRole('option', { name: /^OR/ })).toHaveCount(0);

		await bar.pressSequentially('severity:High ');

		await expect(suggestions.getByRole('option', { name: /^OR/ })).toBeVisible();
		await expect(suggestions.getByRole('option', { name: /^NOT/ })).toBeVisible();

		// Picking one leaves the bar open for the other side of the clause,
		// and inserts a word rather than the start of a `field:` pair.
		await suggestions.getByRole('option', { name: /^OR/ }).click();
		await expect(bar).toHaveValue('severity:High OR ');
	});

	test('a reload restores the expression and its results', async ({ page }) => {
		const api = await adminApi();
		const pair = await seedPair(api);
		const expression = `${pair.tag} source:crowdstrike`;

		try {
			await page.goto('/alerts?view=list');
			await typeQuery(page, expression);
			await expect(alertRow(page, pair.matching).first()).toBeVisible();

			await page.reload();

			await expectChips(page, [pair.tag, 'source:crowdstrike']);
			await expect(alertRow(page, pair.matching).first()).toBeVisible();
			await expect(alertRow(page, pair.other)).toHaveCount(0);
		} finally {
			await dropPair(api, pair);
			await api.dispose();
		}
	});

	test('the expression survives moving between split, list and board', async ({ page }) => {
		const api = await adminApi();
		const pair = await seedPair(api);
		const expression = `${pair.tag} source:crowdstrike`;

		try {
			for (const view of ['split', 'list', 'board']) {
				await page.goto(`/alerts?view=${view}&query=${encodeURIComponent(expression)}`);

				await expectChips(page, [pair.tag, 'source:crowdstrike'], view);
				await expect(alertRow(page, pair.matching).first(), view).toBeVisible();
				await expect(alertRow(page, pair.other), view).toHaveCount(0);
			}
		} finally {
			await dropPair(api, pair);
			await api.dispose();
		}
	});

	// The panel is an editing surface over the expression, and it can only
	// render a subset of it. Anything it cannot show has to survive an edit
	// untouched — this is the one way the demoted panel can lose an
	// analyst's work, so it is worth a browser to prove.
	test('the advanced panel keeps a clause it cannot render', async ({ page }) => {
		const api = await adminApi();
		const pair = await seedPair(api);
		const alternation = '(source:crowdstrike OR source:sentinel)';

		try {
			await page.goto(`/alerts?view=list&query=${encodeURIComponent(alternation)}`);
			// One chip, not two: splitting an alternation would put a × on
			// each half, and dropping either widens the query.
			await expect(chip(page, alternation)).toBeVisible();

			await page.getByRole('button', { name: 'Filter', exact: true }).click();

			const title = page.getByPlaceholder('Filter by title...');
			await expect(title).toBeVisible();
			await title.fill(pair.tag);
			await page.getByRole('button', { name: 'Apply Filters' }).click();

			// The alternation is still there, and the panel's edit joined it
			// rather than replacing it.
			await expect(chip(page, alternation)).toBeVisible();
			await expect(
				page.getByRole('button', { name: new RegExp(`^Remove .*${pair.tag}`) })
			).toBeVisible();
			await expect(alertRow(page, pair.matching).first()).toBeVisible();
		} finally {
			await dropPair(api, pair);
			await api.dispose();
		}
	});
});

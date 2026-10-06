/**
 * Pure helpers to split a war-room scope fan-out over many cases into the
 * batches the server accepts, and to merge the per-case outcomes back.
 */

/** Server cap on target cases per scope create / push request. */
export const SCOPE_MAX_TARGET_CASES = 50;

/** `ids` cut into consecutive slices of at most `size` (order kept). */
export const chunkIds = <T>(ids: T[], size: number): T[][] => {
	if (size <= 0) throw new Error('size must be positive');
	const out: T[][] = [];
	for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
	return out;
};

/**
 * `fn` over `items` with at most `limit` calls in flight; results keep the
 * order of `items`. Used for per-case fan-outs over hundreds of cases.
 */
export const mapWithConcurrency = async <T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
	if (limit <= 0) throw new Error('limit must be positive');
	const out = new Array<R>(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next;
			next += 1;
			out[i] = await fn(items[i], i);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return out;
};

interface CustomerRef {
	customer_id: number;
	customer_name: string;
}

/**
 * Concatenate the `results` of several batch responses and de-duplicate
 * their `customers` by id. Other fields come from the first response.
 */
export const mergeCaseBatchResults = <R, T extends { results: R[]; customers: CustomerRef[] }>(
	responses: T[]
): T => {
	if (responses.length === 0) throw new Error('nothing to merge');
	const customers = new Map<number, CustomerRef>();
	for (const r of responses) {
		for (const c of r.customers ?? []) {
			if (!customers.has(c.customer_id)) customers.set(c.customer_id, c);
		}
	}
	return {
		...responses[0],
		results: responses.flatMap((r) => r.results ?? []),
		customers: [...customers.values()]
	};
};

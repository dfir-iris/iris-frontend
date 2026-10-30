/**
 * Coarse-grained reactive Set / Map: any write bumps a single version that
 * every read depends on.
 *
 * `svelte/reactivity` is resolved to its server build under vitest (no
 * `browser` condition), where SvelteSet / SvelteMap are plain collections and
 * the graph store could not be tested. These subclasses only rely on `$state`,
 * which behaves the same in both builds, and stay real `Set` / `Map`
 * instances for the pure helpers that take one.
 */
export class KeySet<T> extends Set<T> {
	#version = $state(0);

	constructor(values?: Iterable<T> | null) {
		super();
		if (values) for (const v of values) super.add(v);
	}

	#read() {
		void this.#version;
	}

	override has(value: T) {
		this.#read();
		return super.has(value);
	}

	override add(value: T) {
		if (!super.has(value)) {
			super.add(value);
			this.#version++;
		}
		return this;
	}

	override delete(value: T) {
		const deleted = super.delete(value);
		if (deleted) this.#version++;
		return deleted;
	}

	override clear() {
		if (super.size) {
			super.clear();
			this.#version++;
		}
	}

	/** Replace the whole content with one notification. */
	replace(values: Iterable<T>) {
		super.clear();
		for (const v of values) super.add(v);
		this.#version++;
	}

	override get size() {
		this.#read();
		return super.size;
	}

	override values() {
		this.#read();
		return super.values();
	}

	override keys() {
		this.#read();
		return super.keys();
	}

	override entries() {
		this.#read();
		return super.entries();
	}

	override forEach(cb: (value: T, value2: T, set: Set<T>) => void, thisArg?: unknown) {
		this.#read();
		super.forEach(cb, thisArg);
	}

	override [Symbol.iterator]() {
		this.#read();
		return super[Symbol.iterator]();
	}
}

export class KeyMap<K, V> extends Map<K, V> {
	#version = $state(0);

	constructor(entries?: Iterable<readonly [K, V]> | null) {
		super();
		if (entries) for (const [k, v] of entries) super.set(k, v);
	}

	#read() {
		void this.#version;
	}

	override get(key: K) {
		this.#read();
		return super.get(key);
	}

	override has(key: K) {
		this.#read();
		return super.has(key);
	}

	override set(key: K, value: V) {
		if (!super.has(key) || super.get(key) !== value) {
			super.set(key, value);
			this.#version++;
		}
		return this;
	}

	override delete(key: K) {
		const deleted = super.delete(key);
		if (deleted) this.#version++;
		return deleted;
	}

	override clear() {
		if (super.size) {
			super.clear();
			this.#version++;
		}
	}

	override get size() {
		this.#read();
		return super.size;
	}

	override values() {
		this.#read();
		return super.values();
	}

	override keys() {
		this.#read();
		return super.keys();
	}

	override entries() {
		this.#read();
		return super.entries();
	}

	override forEach(cb: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown) {
		this.#read();
		super.forEach(cb, thisArg);
	}

	override [Symbol.iterator]() {
		this.#read();
		return super[Symbol.iterator]();
	}
}

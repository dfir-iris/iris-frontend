/** `use:indeterminate={bool}` for a native checkbox (no attribute exists for it). */
export const indeterminate = (el: HTMLInputElement, value: boolean) => {
	el.indeterminate = value;
	return {
		update(next: boolean) {
			el.indeterminate = next;
		}
	};
};

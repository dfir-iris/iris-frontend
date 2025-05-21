import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import AddAssetButton from './add-asset-button.svelte';
import { page } from '$app/stores'; // Mock if navigation is involved
import { goto } from '$app/navigation'; // Mock if navigation is involved

// Mock $app/navigation if the button uses goto
vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

// Mock $app/stores if page store is used for case_id
vi.mock('$app/stores', async () => {
  const actual = await vi.importActual('$app/stores');
  return {
		...actual,
		page: {
			subscribe: vi.fn((run) => {
				run({ params: { case_id: 'test-case-id' } }); // Mock case_id
				return () => {}; // Unsubscribe function
			}),
		}
  };
});


describe('AddAssetButton', () => {
	it('renders the button with correct text or icon', () => {
		render(AddAssetButton, { props: { class: 'custom-class' } });
		// Example: Check for button by role and accessible name or text content
		// This depends on the actual content of AddAssetButton.svelte
		// For instance, if it uses <Button> from $lib/components/ui/button
		const button = screen.getByRole('button'); 
		expect(button).toBeInTheDocument();
		// expect(screen.getByText(/Add Asset/i)).toBeInTheDocument(); // If it has text
	});

	it('applies custom class', () => {
		const customClass = 'my-extra-class';
		render(AddAssetButton, { props: { class: customClass } });
		const button = screen.getByRole('button');
		expect(button.classList.contains(customClass)).toBe(true);
	});

	it('is enabled by default', () => {
		render(AddAssetButton);
		const button = screen.getByRole('button');
		expect(button).not.toBeDisabled();
	});

	it('can be disabled via prop', () => {
		render(AddAssetButton, { props: { disabled: true } });
		const button = screen.getByRole('button');
		expect(button).toBeDisabled();
	});

	it('navigates to add asset page on click (if that is its behavior)', async () => {
		render(AddAssetButton);
		const button = screen.getByRole('button');
		await fireEvent.click(button);
		
		// This assertion depends on the AddAssetButton's implementation.
		// If it uses goto('/case/[case_id]/assets/add')
		expect(goto).toHaveBeenCalledWith('/case/test-case-id/assets/add');
	});
	
	// Add more tests if the button has other specific behaviors or states.
});

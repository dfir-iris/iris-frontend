import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import AssetCard from './AssetCard.svelte';
import type { Asset } from '$lib/types/resources/asset'; // Adjust path as needed

describe('AssetCard', () => {
	const mockAsset: Asset = {
		asset_id: 123,
		asset_uuid: 'test-uuid-123',
		asset_name: 'Test Asset Name',
		asset_type: {
			asset_id: 1,
			asset_name: 'Server',
			asset_description: 'A server asset',
			asset_icon_compromised: 'ioc_server.png',
			asset_icon_not_compromised: 'server.png'
		},
		asset_ip: '192.168.1.100',
		asset_domain: 'example.com',
		asset_compromise_status_id: 2, // Not compromised
		analysis_status: { id: 2, name: 'To be done' },
		// Add other necessary fields based on Asset type and AssetCard usage
	};

	it('renders asset name', () => {
		render(AssetCard, { props: { asset: mockAsset, isSelected: false } });
		expect(screen.getByText(mockAsset.asset_name!)).toBeInTheDocument();
	});

	it('renders asset type name', () => {
		render(AssetCard, { props: { asset: mockAsset, isSelected: false } });
		expect(screen.getByText(mockAsset.asset_type!.asset_name)).toBeInTheDocument();
	});

	it('renders asset IP if available', () => {
		render(AssetCard, { props: { asset: mockAsset, isSelected: false } });
		expect(screen.getByText(mockAsset.asset_ip!)).toBeInTheDocument();
	});
	
	it('renders asset domain if available', () => {
		render(AssetCard, { props: { asset: mockAsset, isSelected: false } });
		// Assuming domain is displayed, adjust query if needed
		expect(screen.getByText(mockAsset.asset_domain!)).toBeInTheDocument();
	});

	// Add more tests for:
	// - isSelected prop behavior (e.g., specific class or ARIA attribute)
	// - display of compromise status icon/text
	// - display of analysis status
	// - handling of missing optional fields
});

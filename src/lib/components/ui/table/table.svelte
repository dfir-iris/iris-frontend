<script lang="ts">
	import AgGridSvelte from '$lib/components/ui/data-table/data-table.svelte';
	import 'ag-grid-community/styles/ag-grid.css';
	import 'ag-grid-community/styles/ag-theme-alpine.css';
	import type { ColDef } from 'ag-grid-community';
  
	type Data = { make: string; model: string; price: number };
  
	let rowData: Data[] = [
	  { make: 'Toyota', model: 'Celica', price: 35000 },
	  { make: 'Ford', model: 'Mondeo', price: 32000 },
	  { make: 'Porsche', model: 'Boxster', price: 72000 }
	];
  
	let columnDefs: ColDef<Data>[] = [{ field: 'make' }, { field: 'model' }, { field: 'price' }];
  
	function addRow() {
	  rowData = rowData.concat({
		make: 'Make-' + rowData.length,
		model: 'Model-' + rowData.length,
		price: Math.floor(Math.random() * 100000)
	  });
	}
  </script>
  
	<button on:click={addRow}>Add Row</button>
	<div class="ag-theme-alpine">
	  <AgGridSvelte {rowData} {columnDefs} />
	</div>

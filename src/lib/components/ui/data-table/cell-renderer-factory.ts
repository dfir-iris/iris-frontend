import type { ICellRendererParams } from "ag-grid-community";

/**
 * Utility function to create the base element for embedding Svelte components.
 * This replaces the class-based creation of eGui.
 */
function createBaseElement(tag: string = 'div'): HTMLElement {
  return document.createElement(tag);
}

/**
 * Function component to serve as the cell renderer for AG Grid.
 * @param svelteComponent - Function to create the Svelte component.
 * @returns Function to create AG Grid-compatible cell renderer.
 */
export function cellRendererFactory(svelteComponent: (target: HTMLElement, params: ICellRendererParams) => void) {
  if (typeof window === 'undefined') {
    // If we're running on the server, return a mock renderer
    return function () {
      const emptyElement = document.createElement('div');
      return { getGui: () => emptyElement, refresh: () => true };
    };
  }

  return function cellRenderer(params: ICellRendererParams) {
    const eGui = createBaseElement();

    // Mounting the Svelte component correctly using the DOM node (`eGui`)
    svelteComponent(eGui, params);

    // Returning an object that conforms to AG Grid ICellRendererComp.
    return eGui;
  }
}

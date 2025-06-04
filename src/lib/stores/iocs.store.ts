import { writable, get } from 'svelte/store';
import type { Ioc } from '$lib/types/resources/ioc';

interface IocStoreData {
  iocs: Record<string, Ioc>; 
  listRefreshNonce: number;
}

function createIocsStore() {
  const { subscribe, set, update } = writable<IocStoreData>({
    iocs: {},
    listRefreshNonce: 0
  });

  const storeMethods = {
    subscribe,
    
    // Set multiple iocs at once (typically from API response)
    setIocs: (iocs: Ioc[]) => {
      update(store => {
        const newStore = { ...store.iocs };
        iocs.forEach(ioc => {
          const iocId = ioc.ioc_id.toString();
          // If the ioc already exists in the store, merge it with the new data
          if (newStore[iocId]) {
            newStore[iocId] = { ...newStore[iocId], ...ioc };
          } else {
            newStore[iocId] = { ...ioc };
          }
        });
        return { ...store, iocs: newStore };
      });
    },
    
    // Update a single ioc
    updateIoc: (iocId: string | number, updatedIoc: Ioc) => {
      update(store => {
        // If the ioc already exists in the store, merge it with the new data
        const existingIoc = store.iocs[iocId];
        const mergedIoc = existingIoc 
          ? { ...existingIoc, ...updatedIoc }
          : { ...updatedIoc };
        
          console.log('mergedIoc', mergedIoc);
        return {
          ...store,
          iocs: {
            ...store.iocs,
            [iocId]: mergedIoc
          }
        };
      });
    },

    addIoc: (iocData: Ioc) => {
      update(store => {
        const iocId = iocData.ioc_id.toString();
        return {
          ...store,
          iocs: { ...store.iocs, [iocId]: { ...iocData } }
        };
      })
    },
    
    // Remove an ioc by ID
    removeIoc: (iocId: string | number) => {
      update(store => {
        const { [iocId]: removedIoc, ...newStore } = store.iocs;
        return { ...store, iocs: newStore };
      });
    },
    
    // Get an ioc by ID
    getIoc: (iocId: string) => {
      let ioc: Ioc | undefined;
      // Accessing a nested property of the store value
      subscribe((value) => {
        ioc = value.iocs[iocId];
      })(); 
      return ioc;
    },
    
    // Get all iocs as an array
    getIocsList: () => {
      const store = get({ subscribe });
      return Object.values(store.iocs).map(ioc => ({ ...ioc }));
    },
    
    // Clear the store
    clear: () => set({ iocs: {}, listRefreshNonce: 0 }),
    
    triggerListRefresh: () => {
      update((store) => {
        return { ...store, listRefreshNonce: store.listRefreshNonce + 1 };
      });
    },
  };
  return storeMethods;
}

export const iocsStore = createIocsStore();
// Export methods individually if you prefer direct import like { addIoc }
export const { addIoc, updateIoc, removeIoc, setIocs, getIoc, getIocsList, clear, triggerListRefresh } = iocsStore;

export const isLoadingIocsStore = writable(true);

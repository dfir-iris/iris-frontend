import { writable, get } from 'svelte/store';
import { ApiService } from '$lib/services/api.service';
import type { Paginated } from '$lib/services/api.service';
import { ENDPOINTS } from '$lib/constants/endpoints';

export interface Tag {
  tag_id: number;
  tag_title: string;
  tag_color?: string;
  created_at?: string;
  updated_at?: string;
}

export type TagInput = Tag[] | string;

interface TagsState {
  suggestions: Tag[];
  isLoading: boolean;
  error: string | null;
}

function createTagsStore() {
  const initialState: TagsState = {
    suggestions: [],
    isLoading: false,
    error: null
  };

  const { subscribe, set, update } = writable<TagsState>(initialState);

  return {
    subscribe,
    
    // Fetch tag suggestions based on search term
    fetchSuggestions: async (searchTerm: string = '', page: number = 1, perPage: number = 10) => {
      update(state => ({ ...state, isLoading: true, error: null }));
      
      try {
        // Build URL with query parameters directly
        let url = ENDPOINTS.tags.list + '?';
        const queryParams = new URLSearchParams();
        
        // Add standard pagination parameters
        queryParams.append('page', page.toString());
        queryParams.append('per_page', perPage.toString());
        queryParams.append('order_by', 'tag_title');
        queryParams.append('sort_dir', 'asc');
        
        // Add search term if provided
        if (searchTerm && searchTerm.trim()) {
          queryParams.append('tag_title', searchTerm.trim());
        } else {
          update(state => ({
            ...state,
            suggestions: response.data.data,
            isLoading: false
          }));
          return [];
        }
        
        // Append query parameters to URL
        url += queryParams.toString();
        
        console.log('Fetching tags from URL:', url);
        
        const response = await ApiService.get<Paginated<Tag>>(url);
        
        update(state => ({
          ...state,
          suggestions: response.data.data,
          isLoading: false
        }));
        
        return response.data.data;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch tag suggestions';
        console.error('Error fetching tag suggestions:', error);
        update(state => ({ ...state, isLoading: false, error: errorMessage }));
        return [];
      }
    },
    
    // Clear suggestions
    clearSuggestions: () => {
      update(state => ({ ...state, suggestions: [] }));
    },
    
    // Reset the store
    reset: () => {
      set(initialState);
    },
    
    // Utility functions to convert between formats
    stringToTags: (tagString: string): Tag[] => {
      if (!tagString) return [];
      
      return tagString.split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0)
        .map((title, index) => ({
          tag_id: -1000 - index, // Temporary negative IDs
          tag_title: title
        }));
    },
    
    tagsToString: (tags: Tag[]): string => {
      return tags.map(tag => tag.tag_title).join(',');
    },
    
    // Normalize input to Tag[] regardless of input format
    normalizeTags: (input: TagInput): Tag[] => {
      if (typeof input === 'string') {
        return tagsStore.stringToTags(input);
      }
      return input || [];
    }
  };
}

export const tagsStore = createTagsStore();
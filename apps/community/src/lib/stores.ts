import { writable } from 'svelte/store';
import type { Me } from './api';

export const meStore = writable<Me | null>(null);

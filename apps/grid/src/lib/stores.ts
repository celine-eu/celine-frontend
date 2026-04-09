import { writable } from 'svelte/store';
import type { Me } from './api';

export const meStore = writable<Me | null>(null);

// 'dark' | 'light' | null (null = follow system)
export const themeOverride = writable<'dark' | 'light' | null>(null);

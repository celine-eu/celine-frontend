import { writable } from 'svelte/store';
import type { Me, MeterDevice } from './api';

export const meStore = writable<Me | null>(null);
export const deviceStore = writable<MeterDevice[] | null>(null);

import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

const sections = ['devices', 'flexibility', 'gamification', 'data-flow', 'nudging', 'alerts'];

export const load: PageLoad = ({ params }) => {
  if (!sections.includes(params.section)) error(404, 'Section not found');
  return { section: params.section };
};

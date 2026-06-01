import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';

import { normalizeCategory, parseFonts } from '../src/server/providers/normalize.js';

describe('normalizeCategory', () => {
	it('slugifies known categories and falls back to "other"', () => {
		expect(normalizeCategory('Sans Serif')).toBe('sans-serif');
		expect(normalizeCategory('SERIF')).toBe('serif');
		expect(normalizeCategory('icons')).toBe('other');
	});
});

describe('parseFonts', () => {
	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(vi.fn());
	});

	it('keeps records that match the schema and drops the rest', () => {
		const schema = z.object({ id: z.number() });
		expect(parseFonts([{ id: 1 }, { id: 'x' }, { id: 2 }], schema, 'google')).toEqual([
			{ id: 1 },
			{ id: 2 },
		]);
	});
});

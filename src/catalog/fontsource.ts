import * as z from 'zod';

import type { CatalogFont } from '../types.js';

import { normalizeCategory, parseFonts } from './shared.js';

const fontsourceFontSchema = z.object({
	category: z.string(),
	family: z.string(),
	styles: z.array(z.string()),
	subsets: z.array(z.string()),
	variable: z.boolean(),
	weights: z.array(z.number()),
});

const fontsourceListSchema = z.array(z.unknown());

export async function fontsourceCatalog(): Promise<Array<CatalogFont>> {
	const response = await fetch('https://api.fontsource.org/v1/fonts');
	const list = fontsourceListSchema.parse(await response.json());

	return parseFonts(list, fontsourceFontSchema, 'fontsource')
		.filter((font) => font.subsets.includes('latin') && font.category !== 'icons')
		.map((font) => ({
			category: normalizeCategory(font.category),
			family: font.family,
			italic: font.styles.includes('italic'),
			providers: ['fontsource'],
			variable: font.variable,
			weights: font.weights,
		}));
}

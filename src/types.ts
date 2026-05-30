export interface CatalogFont {
	category: FontCategory;
	family: string;
	italic: boolean;
	/** Normalized rank, lower = more popular. Absent when unknown. */
	popularity?: number;
	providers: Array<ProviderName>;
	/** Normalized rank, lower = more trending. Absent when unknown. */
	trending?: number;
	variable: boolean;
	weights: Array<number>;
}

export const FONT_CATEGORIES = [
	'sans-serif',
	'serif',
	'monospace',
	'display',
	'handwriting',
	'other',
] as const;

export type FontCategory = (typeof FONT_CATEGORIES)[number];

export type ProviderName = 'bunny' | 'fontshare' | 'fontsource' | 'google';

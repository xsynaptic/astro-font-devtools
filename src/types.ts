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

export type FontCategory =
	| 'display'
	| 'handwriting'
	| 'monospace'
	| 'other'
	| 'sans-serif'
	| 'serif';

export type ProviderName = 'bunny' | 'fontshare' | 'fontsource' | 'google';

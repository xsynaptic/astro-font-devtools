import { defineToolbarApp } from 'astro/toolbar';
import * as z from 'zod';

import type { ComboboxOption, FontCombobox } from './client/combobox.js';
import type { FontScriptSelect } from './client/script-select.js';
import type { CatalogFont } from './shared/types.js';

import './client/combobox.js';
import './client/script-select.js';
import { rowHeight } from './client/combobox.js';
import { createElementPicker } from './client/element-picker.js';
import { sortedScripts, toBaseScripts } from './client/scripts.js';
import { icons } from './shared/icons.js';
import { fontCategories } from './shared/types.js';

const selectionSchema = z.object({
	family: z.string(),
	italic: z.boolean().optional(),
	weight: z.number().optional(),
});

// Working state in sessionStorage: the fonts applied per target, plus the targets the user added
// at runtime (pick / Add). Config targets re-seed on each load; these layer on top.
const stateSchema = z.object({
	added: z.array(z.string()),
	selections: z.record(z.string(), selectionSchema),
});

type Selection = z.infer<typeof selectionSchema>;
type State = z.infer<typeof stateSchema>;

const appId = 'astro-font-devtools';
const storageKey = 'astro-font-devtools:state';
const catalogUrl = '/__astro-font-devtools/catalog';
const resolveUrl = '/__astro-font-devtools/resolve';
const categories = ['all', ...fontCategories];
const genericFamilies = new Set([
	'cursive',
	'fantasy',
	'monospace',
	'sans-serif',
	'serif',
	'system-ui',
	'ui-monospace',
	'ui-rounded',
	'ui-sans-serif',
	'ui-serif',
]);

let activePicker: ReturnType<typeof createElementPicker> | undefined;
let catalog: Array<CatalogFont> | undefined;
let catalogPromise: Promise<Array<CatalogFont>> | undefined;
let rowCounter = 0;

interface RowHandle {
	element: HTMLElement;
	focusTarget(): void;
	restore(): void;
	setOptions(options: Array<ComboboxOption>): void;
}

function applyWindowPlacement(canvas: ShadowRoot, placement: string | undefined): void {
	if (!placement) return;
	canvas.querySelector('astro-dev-toolbar-window')?.setAttribute('placement', placement);
}

// A readable, broad selector for a picked element (class first so it matches siblings).
function defaultSelector(element: HTMLElement): string {
	const tag = element.tagName.toLowerCase();
	const className = element.classList[0];
	if (className) return `${tag}.${className}`;
	if (element.id) return `${tag}#${element.id}`;

	return tag;
}

function extractFallback(currentValue: string): string {
	const tokens = currentValue
		.split(',')
		.map((token) => token.trim().replaceAll(/^['"]|['"]$/g, ''));
	for (let index = tokens.length - 1; index >= 0; index -= 1) {
		const token = tokens[index];
		if (token && genericFamilies.has(token)) return token;
	}

	return 'sans-serif';
}

function findFont(family: string): CatalogFont | undefined {
	return catalog?.find((font) => font.family === family);
}

function forgetSelection(target: string): void {
	const state = loadState();
	if (!(target in state.selections)) return;
	state.selections = Object.fromEntries(
		Object.entries(state.selections).filter(([key]) => key !== target),
	);
	saveState(state);
}

// No public API exposes the toolbar's placement on load (only the change event fires later), so read
// it off Astro's own toolbar root to anchor our window on the correct side the first time.
function getToolbarPlacement(): string | undefined {
	const toolbar = document.querySelector('astro-dev-toolbar');
	if (!toolbar?.shadowRoot) return undefined;
	const root = toolbar.shadowRoot.querySelector<HTMLElement>('#dev-toolbar-root');

	return root?.dataset.placement;
}

function injectFontStyle(key: string, css: string): void {
	document.head.querySelector(`style[data-font-devtools="${key}"]`)?.remove();
	const style = document.createElement('style');
	style.dataset.fontDevtools = key;
	style.textContent = css;
	document.head.append(style);
}

function isVarTarget(target: string): boolean {
	return target.startsWith('--');
}

function loadCatalog(): Promise<Array<CatalogFont>> {
	if (catalog) return Promise.resolve(catalog);
	catalogPromise ??= fetch(catalogUrl)
		.then((response) => response.json() as Promise<Array<CatalogFont>>)
		.then((fonts) => {
			catalog = fonts;
			catalogPromise = undefined;

			return fonts;
		})
		.catch((error: unknown) => {
			catalogPromise = undefined; // let the next open retry instead of caching the failure
			throw error;
		});

	return catalogPromise;
}

function loadState(): State {
	const fallback: State = { added: [], selections: {} };
	const raw = sessionStorage.getItem(storageKey);
	if (!raw) return fallback;
	try {
		const parsed = stateSchema.safeParse(JSON.parse(raw));

		return parsed.success ? parsed.data : fallback;
	} catch {
		return fallback;
	}
}

function render(canvas: ShadowRoot, configTargets: Array<string>): void {
	activePicker?.stop();
	// Clear styles injected by the previous render; rows re-inject what they restore.
	for (const style of document.head.querySelectorAll('style[data-font-devtools]')) style.remove();

	canvas.innerHTML = `
		<astro-dev-toolbar-window>
			<style>
				.fdt-panel { font-family: system-ui, sans-serif; min-width: 34rem; }
				.fdt-status { font-size: 0.8125rem; color: rgba(255, 255, 255, 0.5); padding: 0.25rem 0; }
				.fdt-empty { color: rgba(255, 255, 255, 0.6); font-size: 0.875rem; }
				#fdt-rows { max-height: min(60vh, 28rem); overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.22) transparent; }
				.fdt-row { padding: 0.3rem 0; border-top: 1px solid rgba(255, 255, 255, 0.08); }
				.fdt-row:first-of-type { border-top: 0; padding-top: 0; }
				.fdt-row:last-of-type { padding-bottom: 0; }
				.fdt-rmain { display: grid; grid-template-columns: minmax(0, 1fr) 7rem minmax(0, 1fr) auto auto auto; gap: 0.4rem; align-items: center; }
				.fdt-rmain > * { min-width: 0; }
				.fdt-target { width: 100%; box-sizing: border-box; font-family: ui-monospace, monospace; font-size: 0.8125rem; background: rgba(255, 255, 255, 0.08); color: inherit; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 0.25rem; padding: 0.25rem 0.5rem; }
				.fdt-target:focus { outline: 2px solid rgba(113, 24, 226, 0.4); outline-offset: -1px; }
				.fdt-category { width: 100%; box-sizing: border-box; font: inherit; font-size: 0.8125rem; background: rgba(255, 255, 255, 0.08); color: inherit; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 0.25rem; padding: 0.25rem 0.4rem; }
				.fdt-iconbtn { display: inline-flex; align-items: center; justify-content: center; width: 1.4rem; height: 1.4rem; box-sizing: border-box; padding: 0; font-size: 0.9rem; cursor: pointer; border-radius: 0.25rem; border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.45); }
				.fdt-iconbtn:not([disabled]):hover { color: rgba(255, 255, 255, 0.8); }
				.fdt-italic[aria-pressed="true"] { background: rgba(113, 24, 226, 0.25); border-color: rgba(113, 24, 226, 0.5); color: #fff; }
				.fdt-iconbtn[disabled] { opacity: 0.4; cursor: default; }
				.fdt-iconbtn svg { width: 0.8em; height: 0.8em; }
				.fdt-select { width: 3.75rem; box-sizing: border-box; font: inherit; font-size: 0.8125rem; background: rgba(255, 255, 255, 0.08); color: inherit; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 0.25rem; padding: 0.2rem 0.3rem; }
				.fdt-select:disabled { opacity: 0.4; }
				.fdt-combobox { position: relative; }
				.fdt-combobox input { width: 100%; font: inherit; font-size: 0.8125rem; background: rgba(255, 255, 255, 0.08); color: inherit; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 0.25rem; padding: 0.25rem 1.5rem 0.25rem 0.5rem; box-sizing: border-box; }
				.fdt-combobox input:focus { outline: 2px solid rgba(113, 24, 226, 0.4); outline-offset: -1px; }
				.fdt-combo-clear { position: absolute; top: 50%; right: 0.3rem; transform: translateY(-50%); display: inline-flex; align-items: center; justify-content: center; width: 1.1rem; height: 1.1rem; padding: 0; border: 0; border-radius: 0.2rem; background: transparent; color: rgba(255, 255, 255, 0.4); cursor: pointer; }
				.fdt-combo-clear:hover { color: rgba(255, 255, 255, 0.85); }
				.fdt-combo-clear[hidden] { display: none; }
				.fdt-combo-clear svg { width: 0.75em; height: 0.75em; }
				.fdt-dropdown { position: fixed; z-index: 2147483647; margin: 0; padding: 0; list-style: none; overflow-y: auto; background: #1f1f24; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 0.25rem; font-family: system-ui, sans-serif; font-size: 0.8125rem; color: rgba(255, 255, 255, 0.86); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5); scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.22) transparent; }
				.fdt-dropdown::-webkit-scrollbar, #fdt-rows::-webkit-scrollbar { width: 10px; background: transparent; }
				.fdt-dropdown::-webkit-scrollbar-thumb, #fdt-rows::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.18); border-radius: 5px; border: 3px solid transparent; background-clip: padding-box; }
				.fdt-dropdown::-webkit-scrollbar-thumb:hover, #fdt-rows::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.32); background-clip: padding-box; }
				.fdt-sizer { position: relative; width: 100%; }
				.fdt-option { position: absolute; left: 0; right: 0; height: ${String(rowHeight)}px; box-sizing: border-box; padding: 0 0.5rem; display: flex; align-items: center; gap: 0.4rem; cursor: pointer; }
				.fdt-option:hover, .fdt-option.fdt-active { background: rgba(113, 24, 226, 0.2); }
				.fdt-fam { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
				.fdt-var { flex: none; font-size: 0.625rem; font-weight: 600; letter-spacing: 0.03em; padding: 0 0.3em; border-radius: 0.2rem; background: rgba(113, 24, 226, 0.25); color: rgba(255, 255, 255, 0.85); }
				.fdt-disabled { opacity: 0.4; pointer-events: none; }
				.fdt-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px solid rgba(255, 255, 255, 0.08); }
				#fdt-rows:empty + .fdt-foot { margin-top: 0; padding-top: 0; border-top: 0; }
				.fdt-providers { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; }
				.fdt-providers[hidden] { display: none; }
				.fdt-providers-label { font-size: 0.7rem; color: rgba(255, 255, 255, 0.4); margin-right: 0.1rem; }
				astro-dev-toolbar-button:hover { filter: brightness(1.15); background: rgba(255, 255, 255, 0.07); border-radius: 0.25rem; }
				.fdt-scripts { margin-left: auto; }
				.fdt-scripts[hidden] { display: none; }
				.fdt-scripts-panel { position: fixed; z-index: 2147483647; display: flex; flex-direction: column; min-width: 13rem; overflow: hidden; background: #1f1f24; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 0.25rem; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5); font-family: system-ui, sans-serif; font-size: 0.8125rem; color: rgba(255, 255, 255, 0.86); }
				.fdt-scripts-panel[hidden] { display: none; }
				.fdt-scripts-head { display: flex; gap: 0.3rem; padding: 0.4rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
				.fdt-scripts-search { flex: 1; min-width: 0; font: inherit; font-size: 0.8125rem; background: rgba(255, 255, 255, 0.08); color: inherit; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 0.25rem; padding: 0.2rem 0.4rem; box-sizing: border-box; }
				.fdt-scripts-clear { font: inherit; font-size: 0.7rem; cursor: pointer; padding: 0 0.45rem; border-radius: 0.25rem; border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.6); }
				.fdt-scripts-list { overflow-y: auto; padding: 0.25rem; scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.22) transparent; }
				.fdt-scripts-item { display: flex; align-items: center; gap: 0.4rem; padding: 0.2rem 0.35rem; border-radius: 0.2rem; cursor: pointer; }
				.fdt-scripts-item:hover { background: rgba(113, 24, 226, 0.2); }
			</style>
			<div class="fdt-panel">
				<div id="fdt-rows"></div>
				<div class="fdt-foot">
					<astro-dev-toolbar-button id="fdt-pick" button-style="purple" size="small">Pick Element</astro-dev-toolbar-button>
					<astro-dev-toolbar-button id="fdt-add" button-style="purple" size="small">Add Target</astro-dev-toolbar-button>
					<span id="fdt-status" class="fdt-status">Loading fonts...</span>
					<font-script-select id="fdt-scripts" class="fdt-scripts" hidden></font-script-select>
					<div id="fdt-providers" class="fdt-providers" hidden></div>
				</div>
			</div>
		</astro-dev-toolbar-window>
	`;

	// The dev-toolbar window hard-codes 24px padding on its :host; an inline style reclaims space.
	canvas
		.querySelector<HTMLElement>('astro-dev-toolbar-window')
		?.style.setProperty('padding', '0.5rem 0.75rem');

	const rows = canvas.querySelector('#fdt-rows');
	const status = canvas.querySelector('#fdt-status');
	const pickButton = canvas.querySelector('#fdt-pick');
	const addButton = canvas.querySelector('#fdt-add');
	const providersEl = canvas.querySelector<HTMLElement>('#fdt-providers');
	const scriptSelect = canvas.querySelector<FontScriptSelect>('#fdt-scripts');
	if (!rows || !status || !pickButton || !addButton) return;

	const active = new Set<string>();
	const activeScripts = new Set<string>(['latin']);
	const providerFor = (font: CatalogFont): string | undefined =>
		font.providers.find((provider) => active.has(provider));

	const rowHandles: Array<RowHandle> = [];
	let currentOptions: Array<ComboboxOption> = [];

	// Arrow (not a hoisted declaration) so the non-null narrowing of `rows` above carries in.
	const addRow = (target: string, isAdded: boolean): RowHandle => {
		const handle = renderRow(target, isAdded, providerFor);
		rows.append(handle.element);
		rowHandles.push(handle);

		return handle;
	};

	const state = loadState();
	const initialTargets = [...new Set([...configTargets, ...state.added])];
	for (const target of initialTargets) {
		addRow(target, !configTargets.includes(target));
	}

	const hint = document.createElement('p');
	hint.className = 'fdt-empty';
	hint.textContent = 'No targets yet. Pick an element or Add a target.';
	if (initialTargets.length === 0) rows.append(hint);

	addButton.addEventListener('click', () => {
		hint.remove();
		const handle = addRow('', true);
		handle.setOptions(currentOptions);
		handle.element.scrollIntoView({ block: 'nearest' });
		handle.focusTarget();
	});

	const picker = createElementPicker((element) => {
		hint.remove();
		const handle = addRow(defaultSelector(element), true);
		handle.setOptions(currentOptions);
		handle.element.scrollIntoView({ block: 'nearest' });
	});
	activePicker = picker;
	setDisabled(pickButton, true);
	setDisabled(addButton, true);
	pickButton.addEventListener('click', () => {
		picker.start();
	});

	void loadCatalog().then((fonts) => {
		status.remove();
		for (const provider of fonts.flatMap((font) => font.providers)) active.add(provider);
		const computeOptions = (): Array<ComboboxOption> =>
			fonts
				.filter((font) => font.providers.some((provider) => active.has(provider)))
				.filter(
					(font) =>
						activeScripts.size === 0 ||
						toBaseScripts(font.scripts).every((script) => activeScripts.has(script)),
				)
				.map((font) => ({ category: font.category, family: font.family, variable: font.variable }));

		function refreshOptions(): void {
			currentOptions = computeOptions();
			for (const handle of rowHandles) {
				handle.setOptions(currentOptions);
			}
		}

		currentOptions = computeOptions();
		for (const handle of rowHandles) {
			handle.setOptions(currentOptions);
			handle.restore();
		}

		setDisabled(pickButton, false);
		setDisabled(addButton, false);

		const available = [...active].toSorted();
		if (providersEl && available.length > 1) {
			renderProviderToggles(providersEl, available, active, refreshOptions);
		}

		const scriptVocab = sortedScripts(fonts);
		if (scriptSelect && scriptVocab.length > 1) {
			scriptSelect.hidden = false;
			scriptSelect.setAvailable(scriptVocab);
			scriptSelect.setSelected([...activeScripts]);
			scriptSelect.addEventListener('change', (event) => {
				const { selected } = (event as CustomEvent<{ selected: Array<string> }>).detail;
				activeScripts.clear();
				for (const script of selected) activeScripts.add(script);
				refreshOptions();
			});
		}
	});
}

// Global provider filter row: one tiny toggle per available provider. Toggling mutates the shared
// `active` set and recomputes the combined catalog. Keeps at least one provider on.
function renderProviderToggles(
	container: HTMLElement,
	providers: Array<string>,
	active: Set<string>,
	onChange: () => void,
): void {
	container.innerHTML = `<span class="fdt-providers-label">Providers</span>${providers
		.map(
			(provider) =>
				`<astro-dev-toolbar-button data-provider="${provider}" button-style="gray" size="small">${provider}</astro-dev-toolbar-button>`,
		)
		.join('')}`;
	container.hidden = false;
	for (const provider of providers) {
		const button = container.querySelector<HTMLElement>(`[data-provider="${provider}"]`);
		if (!button) continue;
		button.addEventListener('click', () => {
			const isActive = active.has(provider);
			if (isActive && active.size === 1) return; // never leave the catalog empty
			if (isActive) {
				active.delete(provider);
				button.setAttribute('button-style', 'ghost');
			} else {
				active.add(provider);
				button.setAttribute('button-style', 'gray');
			}

			onChange();
		});
	}
}

// One row. The target is an editable string applied as a CSS variable (--prefix → setProperty) or
// a selector (else → injected rule). Identity for persistence is the target string itself.
function renderRow(
	initialTarget: string,
	isAdded: boolean,
	providerFor: (font: CatalogFont) => string | undefined,
): RowHandle {
	rowCounter += 1;
	const rowId = `fdt-${String(rowCounter)}`;
	let target = initialTarget;
	let appliedTarget: string | undefined; // last target a font was applied under (var cleanup)
	let selectedFont: CatalogFont | undefined;
	let faceCss = '';

	const row = document.createElement('div');
	row.className = 'fdt-row';
	row.innerHTML = `
		<div class="fdt-rmain">
			<input class="fdt-target" spellcheck="false" autocomplete="off" placeholder="--font-var or .selector" aria-label="Target: CSS variable or selector" />
			<select class="fdt-category" id="fdt-category-${rowId}" aria-label="Filter by category">${categories.map((category) => `<option value="${category}">${category}</option>`).join('')}</select>
			<font-combobox></font-combobox>
			<select data-control="weight" class="fdt-select" aria-label="Font weight" disabled></select>
			<button data-control="italic" class="fdt-iconbtn fdt-italic" type="button" aria-pressed="false" aria-label="Toggle italic" disabled>${icons.italic}</button>
			<button data-action="delete" class="fdt-iconbtn" type="button" aria-label="Remove this row">${icons.close}</button>
		</div>
	`;

	const targetInputEl = row.querySelector<HTMLInputElement>('.fdt-target');
	const deleteButtonEl = row.querySelector<HTMLButtonElement>('[data-action="delete"]');
	const categorySelectEl = row.querySelector<HTMLSelectElement>('.fdt-category');
	const comboboxEl = row.querySelector<FontCombobox>('font-combobox');
	const weightSelectEl = row.querySelector<HTMLSelectElement>('[data-control="weight"]');
	const italicButtonEl = row.querySelector<HTMLButtonElement>('[data-control="italic"]');
	if (
		!targetInputEl ||
		!deleteButtonEl ||
		!categorySelectEl ||
		!comboboxEl ||
		!weightSelectEl ||
		!italicButtonEl
	) {
		throw new Error('astro-font-devtools: row template is missing its controls');
	}

	// Re-bind to non-null names; the guard above narrows these, which the hoisted closures below
	// (isItalic, freezeControls, ...) can't see through the original nullable declarations.
	const targetInput = targetInputEl;
	const deleteButton = deleteButtonEl;
	const categorySelect = categorySelectEl;
	const combobox = comboboxEl;
	const weightSelect = weightSelectEl;
	const italicButton = italicButtonEl;

	function isItalic(): boolean {
		return italicButton.getAttribute('aria-pressed') === 'true';
	}

	function setItalic(on: boolean): void {
		italicButton.setAttribute('aria-pressed', on ? 'true' : 'false');
	}

	function freezeControls(): void {
		weightSelect.innerHTML = '';
		weightSelect.disabled = true;
		italicButton.disabled = true;
		setItalic(false);
	}

	// Weight/italic can't affect a CSS variable (it only carries the family, and we don't control
	// where it's used), so they stay frozen for --var targets; only selector rows apply them.
	function syncControlAvailability(): void {
		if (!selectedFont) return;
		const variable = isVarTarget(target);
		weightSelect.disabled = variable || selectedFont.weights.length === 0;
		italicButton.disabled = variable || !selectedFont.italic;
		if (italicButton.disabled) setItalic(false);
	}

	targetInput.value = target;
	if (isAdded && target) syncAdded('', target);

	// First element a selector currently matches (for fallback font + weight/italic defaults).
	function refElement(): Element | undefined {
		if (!target || isVarTarget(target)) return undefined;
		try {
			return document.querySelector(target) ?? undefined;
		} catch {
			return undefined;
		}
	}

	function clearApplication(): void {
		if (appliedTarget && isVarTarget(appliedTarget)) {
			document.documentElement.style.removeProperty(appliedTarget);
		}

		document.head.querySelector(`style[data-font-devtools="${rowId}"]`)?.remove();
		appliedTarget = undefined;
	}

	// Apply the current font under the current target, reusing the loaded faces (no refetch).
	function applyNow(): void {
		clearApplication();
		if (!selectedFont || !faceCss || !target) return;
		const family = selectedFont.family;
		if (isVarTarget(target)) {
			const fallback = extractFallback(
				getComputedStyle(document.documentElement).getPropertyValue(target).trim(),
			);
			injectFontStyle(rowId, faceCss);
			document.documentElement.style.setProperty(target, `"${family}", ${fallback}`);
		} else {
			const refEl = refElement();
			const fallback = refEl ? getComputedStyle(refEl).fontFamily || 'sans-serif' : 'sans-serif';
			const decls = [`font-family: "${family}", ${fallback} !important`];
			if (weightSelect.value) decls.push(`font-weight: ${weightSelect.value} !important`);
			if (isItalic()) decls.push('font-style: italic !important');
			injectFontStyle(rowId, `${faceCss}\n${target} { ${decls.join('; ')}; }`);
		}

		appliedTarget = target;
	}

	function pickDefaultWeight(font: CatalogFont): number {
		const refEl = refElement();
		const wanted = refEl ? Number.parseInt(getComputedStyle(refEl).fontWeight, 10) || 400 : 400;
		if (font.weights.includes(wanted)) return wanted;
		if (font.weights.includes(400)) return 400;

		return font.weights[0] ?? 400;
	}

	function populatePanel(font: CatalogFont): void {
		selectedFont = font;
		const refEl = refElement();
		weightSelect.innerHTML = font.weights
			.map((weight) => `<option value="${String(weight)}">${String(weight)}</option>`)
			.join('');
		weightSelect.value = String(pickDefaultWeight(font));
		setItalic(!!refEl && /^(?:italic|oblique)/.test(getComputedStyle(refEl).fontStyle));
		syncControlAvailability();
	}

	function persist(): void {
		if (!target || !selectedFont) return;
		const selection: Selection = { family: selectedFont.family };
		const weight = Number(weightSelect.value);
		if (!Number.isNaN(weight)) selection.weight = weight;
		if (isItalic()) selection.italic = true;
		const state = loadState();
		state.selections[target] = selection;
		saveState(state);
	}

	async function chooseFont(family: string): Promise<void> {
		const font = findFont(family);
		if (!font) return;
		populatePanel(font);
		faceCss = await resolveCss(family, providerFor(font), font.weights.map(String), [
			'normal',
			'italic',
		]);
		applyNow();
		persist();
	}

	targetInput.addEventListener('input', () => {
		const next = targetInput.value.trim();
		if (next === target) return;
		if (isAdded) syncAdded(target, next);
		if (target) forgetSelection(target);
		clearApplication();
		target = next;
		applyNow();
		syncControlAvailability();
		persist();
	});

	categorySelect.addEventListener('change', () => {
		combobox.setSelectedFamily('');
		combobox.setCategory(categorySelect.value);
		selectedFont = undefined;
		freezeControls();
	});

	combobox.addEventListener('change', (event) => {
		void chooseFont((event as CustomEvent<ComboboxOption>).detail.family);
	});
	combobox.addEventListener('clear', () => {
		clearApplication();
		if (target) forgetSelection(target);
		selectedFont = undefined;
		faceCss = '';
		freezeControls();
	});

	weightSelect.addEventListener('change', () => {
		applyNow();
		persist();
	});
	italicButton.addEventListener('click', () => {
		if (italicButton.disabled) return;
		setItalic(!isItalic());
		applyNow();
		persist();
	});

	deleteButton.addEventListener('click', () => {
		clearApplication();
		if (isAdded) syncAdded(target, '');
		if (target) forgetSelection(target);
		row.remove();
	});

	return {
		element: row,
		focusTarget(): void {
			targetInput.focus();
		},
		restore(): void {
			if (!target) return;
			const saved = loadState().selections[target];
			if (!saved) return;
			combobox.setSelectedFamily(saved.family);
			const font = findFont(saved.family);
			if (!font) return;
			populatePanel(font);
			if (saved.weight !== undefined) weightSelect.value = String(saved.weight);
			setItalic(saved.italic ?? false);
			void resolveCss(saved.family, providerFor(font), font.weights.map(String), [
				'normal',
				'italic',
			]).then((css) => {
				faceCss = css;
				applyNow();
			});
		},
		setOptions(options: Array<ComboboxOption>): void {
			combobox.setOptions(options);
		},
	};
}

async function resolveCss(
	family: string,
	provider: string | undefined,
	weights: Array<string>,
	styles: Array<string>,
): Promise<string> {
	const params = new URLSearchParams({
		family,
		styles: styles.join(','),
		weights: weights.join(','),
	});
	if (provider) params.set('provider', provider);

	const response = await fetch(`${resolveUrl}?${params.toString()}`);

	return response.text();
}

function saveState(state: State): void {
	try {
		sessionStorage.setItem(storageKey, JSON.stringify(state));
	} catch {
		/* sessionStorage may be unavailable in some contexts */
	}
}

function setDisabled(button: Element, disabled: boolean): void {
	button.classList.toggle('fdt-disabled', disabled);
}

// Track user-added targets so picks/adds survive reload. Re-keys on edit, drops on delete.
function syncAdded(oldTarget: string, newTarget: string): void {
	const state = loadState();
	state.added = state.added.filter((entry) => entry !== oldTarget);
	if (newTarget && !state.added.includes(newTarget)) state.added.push(newTarget);
	saveState(state);
}

export default defineToolbarApp({
	beforeTogglingOff() {
		activePicker?.stop();

		return true;
	},
	init(canvas, app, server) {
		let configuredTargets: Array<string> | undefined;

		function setup(targets: Array<string>): void {
			render(canvas, targets);
			applyWindowPlacement(canvas, getToolbarPlacement());
		}

		server.on<{ targets?: Array<string> }>(`${appId}:config`, ({ targets = [] }) => {
			configuredTargets = targets;
			setup(targets);
		});
		app.onToolbarPlacementUpdated(({ placement }) => {
			applyWindowPlacement(canvas, placement);
		});

		document.addEventListener('astro:after-swap', () => {
			if (configuredTargets) setup(configuredTargets);
		});
	},
});

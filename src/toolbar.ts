import { defineToolbarApp } from 'astro/toolbar';

import type { ComboboxOption, FontCombobox } from './combobox.js';
import type { CatalogFont } from './types.js';

import './combobox.js';
import { createElementPicker } from './element-picker.js';

interface Selection {
	family: string;
	italic?: boolean;
	provider?: string;
	weight?: number;
}

type State = Record<string, Selection>;

// A row targets either a configured CSS variable or a picked DOM element (addressed by selector).
type Target = { element: HTMLElement; kind: 'element' } | { kind: 'var'; varName: string };

const APP_ID = 'astro-font-devtools';
const STORAGE_KEY = 'astro-font-devtools:state';
const CATALOG_URL = '/__astro-font-devtools/catalog';
const RESOLVE_URL = '/__astro-font-devtools/resolve';
const CATEGORIES = ['all', 'sans-serif', 'serif', 'monospace', 'display', 'handwriting', 'other'];
const GENERIC_FAMILIES = new Set([
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
let elementRowCounter = 0;

interface RowHandle {
	element: HTMLElement;
	restore(): void;
	setOptions(options: Array<ComboboxOption>): void;
}

interface Tooltip {
	hide(): void;
	show(target: HTMLElement, text: string): void;
}

async function applySelection(varName: string, selection: Selection): Promise<void> {
	const fallback = extractFallback(getCurrentValue(varName));
	const font = findFont(selection.family);
	const weights = font ? font.weights.map(String) : ['400', '700'];
	const css = await resolveCss(selection.family, selection.provider, weights, ['normal', 'italic']);
	injectFontStyle(varName, css);
	document.documentElement.style.setProperty(varName, `"${selection.family}", ${fallback}`);
}

function applyWindowPlacement(canvas: ShadowRoot, placement: null | string | undefined): void {
	if (!placement) return;
	canvas.querySelector('astro-dev-toolbar-window')?.setAttribute('placement', placement);
}

function defaultSelector(element: HTMLElement): string {
	const tag = element.tagName.toLowerCase();
	// Prefer a class (readable and broad — matches siblings), then id, else the bare tag.
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
		if (token && GENERIC_FAMILIES.has(token)) return token;
	}
	return 'sans-serif';
}

function findFont(family: string): CatalogFont | undefined {
	return catalog?.find((font) => font.family === family);
}

function getCurrentValue(varName: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

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

function loadCatalog(): Promise<Array<CatalogFont>> {
	if (catalog) return Promise.resolve(catalog);
	catalogPromise ??= fetch(CATALOG_URL)
		.then((response) => response.json() as Promise<Array<CatalogFont>>)
		.then((fonts) => {
			catalog = fonts;
			catalogPromise = undefined;
			return fonts;
		});
	return catalogPromise;
}

function loadState(): State {
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as State) : {};
	} catch {
		return {};
	}
}

async function reapplyAll(vars: Array<string>): Promise<void> {
	const state = loadState();
	if (vars.some((varName) => state[varName])) await loadCatalog();
	for (const varName of vars) {
		const selection = state[varName];
		if (selection) await applySelection(varName, selection);
	}
}

function render(canvas: ShadowRoot, vars: Array<string>): void {
	activePicker?.stop();
	canvas.innerHTML = `
		<astro-dev-toolbar-window>
			<style>
				.fdt-panel { font-family: system-ui, sans-serif; min-width: 34rem; position: relative; }
				.fdt-status { font-size: 0.8125rem; color: rgba(255, 255, 255, 0.5); padding: 0.25rem 0; }
				.fdt-empty { color: rgba(255, 255, 255, 0.6); font-size: 0.875rem; }
				#fdt-rows { max-height: min(60vh, 28rem); overflow-y: auto; }
				.fdt-row { padding: 0.5rem 0; border-top: 1px solid rgba(255, 255, 255, 0.08); }
				.fdt-row:first-of-type { border-top: 0; }
				.fdt-rhead { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.4rem; }
				.fdt-rmain { display: grid; grid-template-columns: 7rem 1fr auto; gap: 0.5rem; align-items: center; }
				.fdt-name { font-family: ui-monospace, monospace; font-size: 0.8125rem; cursor: help; }
				.fdt-selector { flex: 1; min-width: 0; box-sizing: border-box; font-family: ui-monospace, monospace; font-size: 0.8125rem; background: rgba(255, 255, 255, 0.08); color: inherit; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 0.25rem; padding: 0.25rem 0.5rem; }
				.fdt-selector:focus { outline: 2px solid rgba(125, 125, 255, 0.4); outline-offset: -1px; }
				.fdt-tip { display: none; position: absolute; z-index: 20; padding: 0.25rem 0.5rem; max-width: 24rem; background: #1f1f24; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 0.25rem; font-family: ui-monospace, monospace; font-size: 0.75rem; line-height: 1.4; color: rgba(255, 255, 255, 0.85); white-space: normal; word-break: break-word; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4); pointer-events: none; }
				.fdt-category { font: inherit; font-size: 0.8125rem; background: rgba(255, 255, 255, 0.08); color: inherit; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 0.25rem; padding: 0.25rem 0.4rem; }
				.fdt-detail { display: none; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin-top: 0.4rem; }
				.fdt-detail[data-open] { display: flex; }
				.fdt-field { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; color: rgba(255, 255, 255, 0.7); }
				.fdt-select { font: inherit; font-size: 0.8125rem; background: rgba(255, 255, 255, 0.08); color: inherit; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 0.25rem; padding: 0.2rem 0.3rem; }
				.fdt-preview { flex: 1; min-width: 14rem; font-size: 1.5rem; line-height: 1.2; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
				.fdt-combobox { position: relative; }
				.fdt-combobox input { width: 100%; font: inherit; font-size: 0.8125rem; background: rgba(255, 255, 255, 0.08); color: inherit; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 0.25rem; padding: 0.25rem 0.5rem; box-sizing: border-box; }
				.fdt-combobox input:focus { outline: 2px solid rgba(125, 125, 255, 0.4); outline-offset: -1px; }
				.fdt-dropdown { position: fixed; z-index: 2147483647; margin: 0; padding: 0; list-style: none; overflow-y: auto; background: #1f1f24; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 0.25rem; font-family: system-ui, sans-serif; font-size: 0.8125rem; color: rgba(255, 255, 255, 0.86); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5); }
				.fdt-dropdown li { padding: 0.25rem 0.5rem; cursor: pointer; }
				.fdt-dropdown li:hover, .fdt-dropdown li.fdt-active { background: rgba(125, 125, 255, 0.2); }
				.fdt-disabled { opacity: 0.4; pointer-events: none; }
				.fdt-bar { display: flex; align-items: center; gap: 0.5rem; padding-bottom: 0.4rem; }
				.fdt-providers { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(255, 255, 255, 0.08); }
				.fdt-providers[hidden] { display: none; }
				.fdt-providers-label { font-size: 0.7rem; color: rgba(255, 255, 255, 0.4); margin-right: 0.1rem; }
				.fdt-provider { font: inherit; font-size: 0.7rem; cursor: pointer; padding: 0.15rem 0.45rem; border-radius: 0.25rem; border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.45); }
				.fdt-provider[aria-pressed="true"] { background: rgba(125, 125, 255, 0.25); border-color: rgba(125, 125, 255, 0.5); color: #fff; }
			</style>
			<div class="fdt-panel">
				<div class="fdt-bar">
					<astro-dev-toolbar-button id="fdt-pick" button-style="outline" size="small">Pick an element</astro-dev-toolbar-button>
					<span id="fdt-status" class="fdt-status">Loading fonts...</span>
				</div>
				<div id="fdt-rows"></div>
				<div id="fdt-providers" class="fdt-providers" hidden></div>
				<span id="fdt-tip" class="fdt-tip"></span>
			</div>
		</astro-dev-toolbar-window>
	`;

	// The dev-toolbar window hard-codes 24px padding on its :host; an inline style
	// on the element overrides it to reclaim space.
	canvas
		.querySelector<HTMLElement>('astro-dev-toolbar-window')
		?.style.setProperty('padding', '0.75rem');

	const rows = canvas.querySelector('#fdt-rows');
	const status = canvas.querySelector('#fdt-status');
	const pickButton = canvas.querySelector('#fdt-pick');
	if (!rows || !status || !pickButton) return;

	const panel = canvas.querySelector<HTMLElement>('.fdt-panel')!;
	const tipEl = canvas.querySelector<HTMLElement>('#fdt-tip')!;
	const tooltip: Tooltip = {
		hide() {
			tipEl.style.display = 'none';
		},
		show(target, text) {
			tipEl.textContent = text;
			const panelRect = panel.getBoundingClientRect();
			const targetRect = target.getBoundingClientRect();
			tipEl.style.left = `${String(targetRect.left - panelRect.left)}px`;
			tipEl.style.bottom = `${String(panelRect.bottom - targetRect.top + 4)}px`;
			tipEl.style.display = 'block';
		},
	};

	const state = loadState();
	const rowHandles: Array<RowHandle> = [];

	// Providers active in the global filter (populated once the catalog loads). A row resolves a
	// font from the first active provider that offers it, so toggling a provider off steers
	// resolution too, not just discovery.
	const active = new Set<string>();
	const providerFor = (font: CatalogFont): string | undefined =>
		font.providers.find((provider) => active.has(provider));

	for (const varName of vars) {
		const handle = renderRow({ kind: 'var', varName }, state, tooltip, providerFor);
		rows.append(handle.element);
		rowHandles.push(handle);
	}

	if (vars.length === 0) {
		const hint = document.createElement('p');
		hint.className = 'fdt-empty';
		hint.innerHTML = `No <code>vars</code> configured. Use <strong>Pick an element</strong>, or pass <code>{ vars: ['--font-sans', ...] }</code> to target CSS variables.`;
		rows.append(hint);
	}

	const providersEl = canvas.querySelector<HTMLElement>('#fdt-providers');
	let currentOptions: Array<ComboboxOption> = [];
	const picker = createElementPicker((element) => {
		const handle = renderRow({ element, kind: 'element' }, state, tooltip, providerFor);
		// Append before setOptions: the combobox reads this.input in its filter, which only
		// exists after connectedCallback has run (i.e. once it is in the DOM).
		rows.append(handle.element);
		handle.setOptions(currentOptions);
		rowHandles.push(handle); // track so provider toggles refresh its options too
		handle.element.scrollIntoView({ block: 'nearest' });
	});
	activePicker = picker;
	setDisabled(pickButton, true);
	pickButton.addEventListener('click', () => {
		picker.start();
	});

	void loadCatalog().then((fonts) => {
		status.remove();
		// Every provider starts active; a font shows if any active provider offers it.
		for (const provider of fonts.flatMap((font) => font.providers)) active.add(provider);
		const computeOptions = (): Array<ComboboxOption> =>
			fonts
				.filter((font) => font.providers.some((provider) => active.has(provider)))
				.map((font) => ({ category: font.category, family: font.family }));

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

		// Global provider filter — only worth showing when there's more than one to toggle.
		const available = [...active].toSorted();
		if (providersEl && available.length > 1) {
			renderProviderToggles(providersEl, available, active, refreshOptions);
		}
	});
}

// Global provider filter row: one tiny toggle per available provider. Toggling mutates the
// shared `active` set and calls back to recompute the combined catalog. Keeps at least one
// provider on.
function renderProviderToggles(
	container: HTMLElement,
	providers: Array<string>,
	active: Set<string>,
	onChange: () => void,
): void {
	container.innerHTML = `<span class="fdt-providers-label">Providers</span>${providers
		.map(
			(provider) =>
				`<button class="fdt-provider" type="button" data-provider="${provider}" aria-pressed="true">${provider}</button>`,
		)
		.join('')}`;
	container.hidden = false;
	for (const provider of providers) {
		const button = container.querySelector<HTMLButtonElement>(`[data-provider="${provider}"]`);
		if (!button) continue;
		button.addEventListener('click', () => {
			const pressed = button.getAttribute('aria-pressed') === 'true';
			if (pressed && active.size === 1) return; // never leave the catalog empty
			if (pressed) {
				active.delete(provider);
				button.setAttribute('aria-pressed', 'false');
			} else {
				active.add(provider);
				button.setAttribute('aria-pressed', 'true');
			}
			onChange();
		});
	}
}

// One row, two target kinds: a configured CSS variable (--font-*) or a picked DOM element
// addressed by an editable CSS selector. The controls below the header (category, combobox,
// weight, italic) are identical for both; only the header, how the font is applied, and
// persistence differ. Var rows persist in sessionStorage; element rows are ephemeral (gone on
// the next render) and removable via the × button.
function renderRow(
	target: Target,
	state: State,
	tooltip: Tooltip,
	providerFor: (font: CatalogFont) => string | undefined,
): RowHandle {
	let key: string;
	if (target.kind === 'var') {
		key = target.varName;
	} else {
		elementRowCounter += 1;
		key = `__element-${String(elementRowCounter)}`;
	}
	const selectId = `fdt-category-${key.replace(/^[-_]+/, '')}`;

	// Element rows seed their selector + weight/italic defaults from the picked element, so
	// applying a font doesn't shift its current weight/style until the user changes them.
	let selector = '';
	let original = 'sans-serif';
	let originalWeight = 400;
	let originalItalic = false;
	if (target.kind === 'element') {
		const computed = getComputedStyle(target.element);
		selector = defaultSelector(target.element);
		original = computed.fontFamily || 'sans-serif';
		originalWeight = Number.parseInt(computed.fontWeight, 10) || 400;
		originalItalic = /^(?:italic|oblique)/.test(computed.fontStyle);
	}

	const header =
		target.kind === 'var'
			? `<code class="fdt-name">${target.varName}</code>`
			: `<input class="fdt-selector" spellcheck="false" autocomplete="off" aria-label="CSS selector to style" />
				<astro-dev-toolbar-button data-action="delete" button-style="outline" size="small" aria-label="Remove this row">✕</astro-dev-toolbar-button>`;

	const row = document.createElement('div');
	row.className = 'fdt-row';
	row.innerHTML = `
		<div class="fdt-rhead">${header}</div>
		<div class="fdt-rmain">
			<select class="fdt-category" id="${selectId}" name="${selectId}" aria-label="Filter by category">${CATEGORIES.map((category) => `<option value="${category}">${category}</option>`).join('')}</select>
			<font-combobox></font-combobox>
			<astro-dev-toolbar-button data-action="reset" button-style="outline" size="small">Reset</astro-dev-toolbar-button>
		</div>
		<div class="fdt-detail">
			<label class="fdt-field">Weight <select data-control="weight" class="fdt-select"></select></label>
			<label class="fdt-field"><input type="checkbox" data-control="italic" /> Italic</label>
			<!-- Inline preview commented out for now (too much vertical space); revive later:
			<div class="fdt-preview">The quick brown fox</div>
			-->
		</div>
	`;

	const categorySelect = row.querySelector<HTMLSelectElement>('.fdt-category')!;
	const combobox = row.querySelector<FontCombobox>('font-combobox')!;
	const resetButton = row.querySelector('[data-action="reset"]')!;
	const detail = row.querySelector<HTMLElement>('.fdt-detail')!;
	const weightSelect = row.querySelector<HTMLSelectElement>('[data-control="weight"]')!;
	const italicInput = row.querySelector<HTMLInputElement>('[data-control="italic"]')!;

	let selectedFont: CatalogFont | undefined;
	let faceCss = '';
	let appliedFamily = target.kind === 'var' ? state[target.varName]?.family : undefined;

	function updateButtons(): void {
		setDisabled(resetButton, !appliedFamily);
	}

	function pickDefaultWeight(font: CatalogFont): number {
		const wanted = target.kind === 'element' ? originalWeight : 400;
		if (font.weights.includes(wanted)) return wanted;
		if (font.weights.includes(400)) return 400;
		return font.weights[0] ?? 400;
	}

	function populatePanel(font: CatalogFont): void {
		selectedFont = font;
		weightSelect.innerHTML = font.weights
			.map((weight) => `<option value="${String(weight)}">${String(weight)}</option>`)
			.join('');
		weightSelect.value = String(pickDefaultWeight(font));
		italicInput.checked = target.kind === 'element' && originalItalic && font.italic;
		italicInput.disabled = !font.italic;
		detail.dataset.open = '';
	}

	function buildSelection(font: CatalogFont): Selection {
		const selection: Selection = { family: font.family };
		const weight = Number(weightSelect.value);
		if (!Number.isNaN(weight)) selection.weight = weight;
		if (italicInput.checked) selection.italic = true;
		return selection;
	}

	function persist(selection: Selection): void {
		if (target.kind !== 'var') return;
		const next = loadState();
		next[target.varName] = selection;
		saveState(next);
	}

	// Element rows apply as an injected rule: the selector plus the chosen family/weight/italic,
	// each !important so it wins over the site's own CSS. The @font-face and the rule share one
	// keyed <style>, recomposed on selector/weight/italic edits without re-fetching.
	function composeElementRule(): void {
		if (target.kind !== 'element' || !selectedFont) return;
		const decls = [`font-family: "${selectedFont.family}", ${original} !important`];
		if (weightSelect.value) decls.push(`font-weight: ${weightSelect.value} !important`);
		if (italicInput.checked) decls.push('font-style: italic !important');
		const rule = selector ? `${selector} { ${decls.join('; ')}; }` : '';
		injectFontStyle(key, `${faceCss}\n${rule}`);
	}

	// Resolve + apply the current selection. Refetches the @font-face (runs on family change);
	// weight/italic/selector edits reuse the loaded faces. The font resolves from the first
	// active provider that offers it (the global filter steers resolution).
	async function commit(): Promise<void> {
		if (!selectedFont) return;
		const provider = providerFor(selectedFont);
		const weights = selectedFont.weights.map(String);
		const css = await resolveCss(selectedFont.family, provider, weights, ['normal', 'italic']);
		if (target.kind === 'var') {
			const fallback = extractFallback(getCurrentValue(target.varName));
			injectFontStyle(key, css);
			document.documentElement.style.setProperty(
				target.varName,
				`"${selectedFont.family}", ${fallback}`,
			);
			persist(buildSelection(selectedFont));
		} else {
			faceCss = css;
			composeElementRule();
		}
		appliedFamily = selectedFont.family;
		updateButtons();
	}

	function reset(): void {
		if (target.kind === 'var') {
			resetOverride(target.varName);
			const { [target.varName]: _removed, ...rest } = loadState();
			saveState(rest);
		} else {
			document.head.querySelector(`style[data-font-devtools="${key}"]`)?.remove();
		}
		combobox.setSelectedFamily('');
		selectedFont = undefined;
		appliedFamily = undefined;
		delete detail.dataset.open;
		updateButtons();
	}

	if (target.kind === 'var') {
		const nameEl = row.querySelector<HTMLElement>('.fdt-name')!;
		const { varName } = target;
		nameEl.addEventListener('mouseenter', () => {
			tooltip.show(nameEl, getCurrentValue(varName) || '(unset)');
		});
		nameEl.addEventListener('mouseleave', () => {
			tooltip.hide();
		});
	} else {
		const selectorInput = row.querySelector<HTMLInputElement>('.fdt-selector')!;
		const deleteButton = row.querySelector('[data-action="delete"]')!;
		selectorInput.value = selector;
		selectorInput.addEventListener('input', () => {
			selector = selectorInput.value.trim();
			composeElementRule();
		});
		// Remove the row entirely: undo its applied font, then detach (the combobox cleans up its
		// floating dropdown via disconnectedCallback).
		deleteButton.addEventListener('click', () => {
			document.head.querySelector(`style[data-font-devtools="${key}"]`)?.remove();
			row.remove();
		});
	}

	categorySelect.addEventListener('change', () => {
		combobox.setSelectedFamily('');
		combobox.setCategory(categorySelect.value);
		selectedFont = undefined;
		delete detail.dataset.open;
		updateButtons();
	});

	combobox.addEventListener('change', (event) => {
		const font = findFont((event as CustomEvent<ComboboxOption>).detail.family);
		if (!font) return;
		populatePanel(font);
		void commit();
	});

	// Weight/italic: element rows write them into the rule; var rows can't carry them in a
	// font-family-only custom property, so they're just remembered for next time.
	weightSelect.addEventListener('change', () => {
		if (target.kind === 'element') composeElementRule();
		else if (selectedFont) persist(buildSelection(selectedFont));
	});
	italicInput.addEventListener('change', () => {
		if (target.kind === 'element') composeElementRule();
		else if (selectedFont) persist(buildSelection(selectedFont));
	});

	resetButton.addEventListener('click', () => {
		reset();
	});

	updateButtons();

	return {
		element: row,
		// Re-apply a var row's saved selection once the catalog is available. Runs on first load,
		// not on every provider-toggle refresh.
		restore(): void {
			if (target.kind !== 'var') return;
			const saved = loadState()[target.varName];
			if (!saved) return;
			combobox.setSelectedFamily(saved.family);
			const font = findFont(saved.family);
			if (!font) return;
			populatePanel(font);
			if (saved.weight !== undefined) weightSelect.value = String(saved.weight);
			italicInput.checked = saved.italic ?? false;
			appliedFamily = saved.family;
			updateButtons();
		},
		setOptions(options: Array<ComboboxOption>): void {
			combobox.setOptions(options);
		},
	};
}

function resetOverride(varName: string): void {
	document.documentElement.style.removeProperty(varName);
	document.head.querySelector(`style[data-font-devtools="${varName}"]`)?.remove();
}

function resolveCss(
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
	return fetch(`${RESOLVE_URL}?${params.toString()}`).then((response) => response.text());
}

function saveState(state: State): void {
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		/* sessionStorage may be unavailable in some contexts */
	}
}

function setDisabled(button: Element, disabled: boolean): void {
	button.classList.toggle('fdt-disabled', disabled);
}

export default defineToolbarApp({
	init(canvas, app, server) {
		let configuredVars: Array<string> | undefined;

		function setup(vars: Array<string>): void {
			render(canvas, vars);
			applyWindowPlacement(canvas, getToolbarPlacement());
			void reapplyAll(vars);
		}

		server.on<{ vars: Array<string> }>(`${APP_ID}:config`, ({ vars }) => {
			configuredVars = vars;
			setup(vars);
		});
		server.send(`${APP_ID}:init`, {});

		app.addEventListener('placement-updated', (event) => {
			applyWindowPlacement(canvas, (event as CustomEvent<{ placement: string }>).detail.placement);
		});

		document.addEventListener('astro:after-swap', () => {
			if (configuredVars) setup(configuredVars);
		});
	},
});

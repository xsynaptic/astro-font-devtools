import { defineToolbarApp } from 'astro/toolbar';

import type { ComboboxOption, FontCombobox } from './combobox.js';
import type { CatalogFont } from './types.js';

import './combobox.js';

interface Selection {
	family: string;
	italic?: boolean;
	provider?: string;
	weight?: number;
}

type State = Record<string, Selection>;

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

let catalog: Array<CatalogFont> | undefined;
let catalogPromise: Promise<Array<CatalogFont>> | undefined;

interface RowHandle {
	element: HTMLElement;
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

function injectFontStyle(varName: string, css: string): void {
	document.head.querySelector(`style[data-font-devtools="${varName}"]`)?.remove();
	const style = document.createElement('style');
	style.dataset.fontDevtools = varName;
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
	canvas.innerHTML = `
		<astro-dev-toolbar-window>
			<style>
				.fdt-panel { font-family: system-ui, sans-serif; min-width: 34rem; position: relative; }
				.fdt-status { font-size: 0.8125rem; color: rgba(255, 255, 255, 0.5); padding: 0.25rem 0; }
				.fdt-empty { color: rgba(255, 255, 255, 0.6); font-size: 0.875rem; }
				#fdt-rows { max-height: min(60vh, 28rem); overflow-y: auto; }
				.fdt-row { padding: 0.4rem 0; border-top: 1px solid rgba(255, 255, 255, 0.08); }
				.fdt-row:first-of-type { border-top: 0; }
				.fdt-row-main { display: grid; grid-template-columns: 12ch 7rem 1fr auto; gap: 0.5rem; align-items: center; }
				.fdt-name { font-family: ui-monospace, monospace; font-size: 0.8125rem; cursor: help; }
				.fdt-tip { display: none; position: absolute; z-index: 20; padding: 0.25rem 0.5rem; max-width: 24rem; background: #1f1f24; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 0.25rem; font-family: ui-monospace, monospace; font-size: 0.75rem; line-height: 1.4; color: rgba(255, 255, 255, 0.85); white-space: normal; word-break: break-word; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4); pointer-events: none; }
				.fdt-category { font: inherit; font-size: 0.8125rem; background: rgba(255, 255, 255, 0.08); color: inherit; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 0.25rem; padding: 0.25rem 0.4rem; }
				.fdt-detail { display: none; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin-top: 0.4rem; padding-left: 12ch; }
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
			</style>
			<div class="fdt-panel">
				<div id="fdt-status" class="fdt-status">Loading fonts...</div>
				<div id="fdt-rows"></div>
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
	if (!rows || !status) return;

	if (vars.length === 0) {
		rows.innerHTML = `<p class="fdt-empty">No <code>vars</code> configured. Pass <code>{ vars: ['--font-sans', ...] }</code> to the integration.</p>`;
		status.remove();
		return;
	}

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

	for (const varName of vars) {
		const handle = renderRow(varName, state, tooltip);
		rows.append(handle.element);
		rowHandles.push(handle);
	}

	void loadCatalog().then((fonts) => {
		status.remove();
		const options = fonts.map((font) => ({ category: font.category, family: font.family }));
		for (const handle of rowHandles) {
			handle.setOptions(options);
		}
	});
}

function renderRow(varName: string, state: State, tooltip: Tooltip): RowHandle {
	const selectId = `fdt-category-${varName.replace(/^-+/, '')}`;
	const row = document.createElement('div');
	row.className = 'fdt-row';
	row.innerHTML = `
		<div class="fdt-row-main">
			<code class="fdt-name">${varName}</code>
			<select class="fdt-category" id="${selectId}" name="${selectId}" aria-label="Filter ${varName} by category">${CATEGORIES.map((category) => `<option value="${category}">${category}</option>`).join('')}</select>
			<font-combobox></font-combobox>
			<astro-dev-toolbar-button data-action="reset" button-style="outline" size="small">Reset</astro-dev-toolbar-button>
		</div>
		<div class="fdt-detail">
			<label class="fdt-field">Provider <select data-control="provider" class="fdt-select"></select></label>
			<label class="fdt-field">Weight <select data-control="weight" class="fdt-select"></select></label>
			<label class="fdt-field"><input type="checkbox" data-control="italic" /> Italic</label>
			<div class="fdt-preview">The quick brown fox</div>
		</div>
	`;

	const categorySelect = row.querySelector<HTMLSelectElement>('.fdt-category')!;
	const combobox = row.querySelector<FontCombobox>('font-combobox')!;
	const resetButton = row.querySelector('[data-action="reset"]')!;
	const detail = row.querySelector<HTMLElement>('.fdt-detail')!;
	const providerSelect = row.querySelector<HTMLSelectElement>('[data-control="provider"]')!;
	const weightSelect = row.querySelector<HTMLSelectElement>('[data-control="weight"]')!;
	const italicInput = row.querySelector<HTMLInputElement>('[data-control="italic"]')!;
	const preview = row.querySelector<HTMLElement>('.fdt-preview')!;
	const nameEl = row.querySelector<HTMLElement>('.fdt-name')!;

	nameEl.addEventListener('mouseenter', () => {
		tooltip.show(nameEl, getCurrentValue(varName) || '(unset)');
	});
	nameEl.addEventListener('mouseleave', () => {
		tooltip.hide();
	});

	let selectedFont: CatalogFont | undefined;
	let appliedFamily = state[varName]?.family;

	function updateButtons(): void {
		setDisabled(resetButton, !appliedFamily);
	}

	function updatePreview(): void {
		if (!selectedFont) return;
		preview.style.fontFamily = `"${selectedFont.family}"`;
		preview.style.fontWeight = weightSelect.value;
		preview.style.fontStyle = italicInput.checked ? 'italic' : 'normal';
	}

	function buildSelection(font: CatalogFont): Selection {
		const selection: Selection = { family: font.family };
		if (providerSelect.value) selection.provider = providerSelect.value;
		const weight = Number(weightSelect.value);
		if (!Number.isNaN(weight)) selection.weight = weight;
		if (italicInput.checked) selection.italic = true;
		return selection;
	}

	function persist(selection: Selection): void {
		const next = loadState();
		next[varName] = selection;
		saveState(next);
	}

	function populatePanel(font: CatalogFont): void {
		selectedFont = font;
		providerSelect.innerHTML = font.providers
			.map((provider) => `<option value="${provider}">${provider}</option>`)
			.join('');
		weightSelect.innerHTML = font.weights
			.map((weight) => `<option value="${String(weight)}">${String(weight)}</option>`)
			.join('');
		if (font.weights.includes(400)) weightSelect.value = '400';
		italicInput.checked = false;
		italicInput.disabled = !font.italic;
		detail.dataset.open = '';
	}

	// Apply on selection — no separate "Apply" step. Loads the font onto the page
	// (sets the target var) and updates the preview sample.
	async function commit(): Promise<void> {
		if (!selectedFont) return;
		const selection = buildSelection(selectedFont);
		await applySelection(varName, selection);
		appliedFamily = selection.family;
		persist(selection);
		updatePreview();
		updateButtons();
	}

	function reset(): void {
		resetOverride(varName);
		combobox.setSelectedFamily('');
		selectedFont = undefined;
		appliedFamily = undefined;
		delete detail.dataset.open;
		updateButtons();
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

	// Switching provider re-resolves the same family from that provider.
	providerSelect.addEventListener('change', () => {
		void commit();
	});

	// Weight/italic only affect the preview sample (the page var is font-family only).
	weightSelect.addEventListener('change', () => {
		updatePreview();
		if (selectedFont) persist(buildSelection(selectedFont));
	});
	italicInput.addEventListener('change', () => {
		updatePreview();
		if (selectedFont) persist(buildSelection(selectedFont));
	});

	resetButton.addEventListener('click', () => {
		reset();
		const { [varName]: _removed, ...rest } = loadState();
		saveState(rest);
	});

	updateButtons();

	return {
		element: row,
		setOptions(options: Array<ComboboxOption>): void {
			combobox.setOptions(options);
			const saved = loadState()[varName];
			if (!saved) return;
			combobox.setSelectedFamily(saved.family);
			const font = findFont(saved.family);
			if (!font) return;
			populatePanel(font);
			if (saved.provider) providerSelect.value = saved.provider;
			if (saved.weight !== undefined) weightSelect.value = String(saved.weight);
			italicInput.checked = saved.italic ?? false;
			appliedFamily = saved.family;
			updatePreview();
			updateButtons();
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

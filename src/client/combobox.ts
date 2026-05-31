import { icons } from '../shared/icons.js';

export interface ComboboxOption {
	category: string;
	family: string;
	variable: boolean;
}

export const rowHeight = 26; // px per row; the .fdt-option CSS height in toolbar.ts derives from this

const bufferRows = 6; // extra rows rendered above and below the visible window
const minDropdownHeight = 120;

// Row markup, cloned per visible option. Filling via textContent keeps family names injection-safe.
const rowTemplate = document.createElement('template');
rowTemplate.innerHTML =
	'<div class="fdt-option" role="option"><span class="fdt-fam"></span><span class="fdt-var">VAR</span></div>';

export class FontCombobox extends HTMLElement {
	private activeIndex = -1;
	private allOptions: Array<ComboboxOption> = [];
	private category = 'all';
	private clearButton!: HTMLButtonElement;
	private filtered: Array<ComboboxOption> = [];
	private input!: HTMLInputElement;
	private list!: HTMLDivElement;
	private rafPending = false;
	private root!: ShadowRoot;
	private sizer!: HTMLDivElement;

	connectedCallback(): void {
		this.innerHTML = `
			<div class="fdt-combobox">
				<input type="text" placeholder="Type to filter..." autocomplete="off" spellcheck="false" />
				<button type="button" class="fdt-combo-clear" aria-label="Clear font" tabindex="-1" hidden>${icons.close}</button>
			</div>
		`;
		const input = this.querySelector<HTMLInputElement>('input');
		const clearButton = this.querySelector<HTMLButtonElement>('.fdt-combo-clear');
		if (!input || !clearButton) return;
		this.input = input;
		this.clearButton = clearButton;

		// The list floats free of the dev-toolbar window: it lives at the shadow-root level
		// (outside the window's clipped, transformed box) and is positioned with fixed coordinates
		// so it can open up or down and use the full viewport height.
		this.root = this.getRootNode() as ShadowRoot;
		this.list = document.createElement('div');
		this.list.className = 'fdt-dropdown';
		this.list.setAttribute('role', 'listbox');
		this.list.hidden = true;

		// Virtual scroll: the sizer is as tall as the whole filtered list so the scrollbar is real,
		// but only the rows inside the visible window are ever in the DOM (absolutely positioned).
		this.sizer = document.createElement('div');
		this.sizer.className = 'fdt-sizer';
		this.list.append(this.sizer);
		this.root.append(this.list);

		this.input.addEventListener('input', () => {
			this.openDropdown();
			this.applyFilter();
			this.updateClearVisibility();
		});
		this.clearButton.addEventListener('click', () => {
			this.clearSelection();
		});
		this.input.addEventListener('change', (event) => {
			// The input's native change event would otherwise bubble to the host and collide with
			// this component's own semantic `change` CustomEvent (whose listener reads event.detail).
			event.stopPropagation();
		});
		this.input.addEventListener('focus', () => {
			// Select the current family so re-focusing after a pick lets you type a fresh search.
			this.input.select();
			this.openDropdown();
		});
		this.input.addEventListener('blur', () => {
			setTimeout(() => {
				this.closeDropdown();
			}, 150);
		});
		this.input.addEventListener('keydown', (event) => {
			this.handleKey(event);
		});

		this.list.addEventListener('mousedown', (event) => {
			if (!(event.target instanceof HTMLElement)) return;
			const row = event.target.closest<HTMLElement>('[data-index]');
			if (!row) return;
			event.preventDefault(); // keep input focus so the blur handler doesn't close before select
			this.selectIndex(Number(row.dataset.index));
		});
		this.list.addEventListener('scroll', this.onScroll);

		globalThis.addEventListener('resize', this.reposition);
		this.root.addEventListener('scroll', this.reposition, true);
	}

	disconnectedCallback(): void {
		this.list.remove();
		globalThis.removeEventListener('resize', this.reposition);
		this.root.removeEventListener('scroll', this.reposition, true);
	}

	setCategory(category: string): void {
		this.category = category;
		this.applyFilter();
	}

	setOptions(options: Array<ComboboxOption>): void {
		this.allOptions = options;
		this.applyFilter();
	}

	setSelectedFamily(family: string): void {
		this.input.value = family;
		this.updateClearVisibility();
	}

	private applyFilter(): void {
		const query = this.input.value.toLowerCase().trim();
		this.filtered = this.allOptions
			.filter((option) => this.category === 'all' || option.category === this.category)
			.filter((option) => !query || option.family.toLowerCase().includes(query));
		this.activeIndex = -1;
		this.sizer.style.height = `${String(this.filtered.length * rowHeight)}px`;
		this.list.scrollTop = 0;
		this.renderWindow();
	}

	private clearSelection(): void {
		this.input.value = '';
		this.closeDropdown();
		this.updateClearVisibility();
		this.dispatchEvent(new CustomEvent('clear'));
		this.input.blur();
	}

	private closeDropdown(): void {
		this.list.hidden = true;
	}

	private ensureActiveVisible(): void {
		if (this.activeIndex < 0) return;
		const top = this.activeIndex * rowHeight;
		const bottom = top + rowHeight;
		if (top < this.list.scrollTop) {
			this.list.scrollTop = top;
		} else if (bottom > this.list.scrollTop + this.list.clientHeight) {
			this.list.scrollTop = bottom - this.list.clientHeight;
		}
	}

	private handleKey(event: KeyboardEvent): void {
		switch (event.key) {
			case 'ArrowDown': {
				event.preventDefault();
				this.activeIndex = Math.min(this.activeIndex + 1, this.filtered.length - 1);
				this.ensureActiveVisible();
				this.renderWindow();

				break;
			}

			case 'ArrowUp': {
				event.preventDefault();
				this.activeIndex = Math.max(this.activeIndex - 1, 0);
				this.ensureActiveVisible();
				this.renderWindow();

				break;
			}

			case 'Enter': {
				event.preventDefault();
				if (this.activeIndex >= 0) this.selectIndex(this.activeIndex);

				break;
			}

			case 'Escape': {
				event.preventDefault();
				this.closeDropdown();

				break;
			}
			// No default
		}
	}

	private readonly onScroll = (): void => {
		if (this.rafPending) return;
		this.rafPending = true;
		requestAnimationFrame(() => {
			this.rafPending = false;
			this.renderWindow();
		});
	};

	private openDropdown(): void {
		this.list.hidden = false;
		this.positionList();
		this.renderWindow();
	}

	private positionList(): void {
		const rect = this.input.getBoundingClientRect();
		const spaceBelow = globalThis.innerHeight - rect.bottom;
		const spaceAbove = rect.top;
		const openDown = spaceBelow >= spaceAbove;
		const maxHeight = Math.max(minDropdownHeight, (openDown ? spaceBelow : spaceAbove) - 12);
		const style = this.list.style;

		style.left = `${String(Math.round(rect.left))}px`;
		style.width = `${String(Math.round(rect.width))}px`;
		style.maxHeight = `${String(Math.round(maxHeight))}px`;
		if (openDown) {
			style.top = `${String(Math.round(rect.bottom + 4))}px`;
			style.bottom = 'auto';
		} else {
			style.top = 'auto';
			style.bottom = `${String(Math.round(globalThis.innerHeight - rect.top + 4))}px`;
		}
	}

	private renderWindow(): void {
		const viewportHeight = this.list.clientHeight || minDropdownHeight;
		const start = Math.max(0, Math.floor(this.list.scrollTop / rowHeight) - bufferRows);
		const end = Math.min(
			this.filtered.length,
			start + Math.ceil(viewportHeight / rowHeight) + bufferRows * 2,
		);
		const fragment = document.createDocumentFragment();

		for (let index = start; index < end; index += 1) {
			const option = this.filtered[index];
			const template = rowTemplate.content.firstElementChild;
			if (!option || !template) continue;
			const row = template.cloneNode(true) as HTMLElement;
			row.dataset.index = String(index);
			row.style.top = `${String(index * rowHeight)}px`;
			row.classList.toggle('fdt-active', index === this.activeIndex);
			const familyLabel = row.querySelector<HTMLSpanElement>('.fdt-fam');
			if (familyLabel) familyLabel.textContent = option.family;
			if (!option.variable) row.querySelector('.fdt-var')?.remove();
			fragment.append(row);
		}

		this.sizer.replaceChildren(fragment);
	}

	private readonly reposition = (): void => {
		if (!this.list.hidden) this.positionList();
	};

	private selectIndex(index: number): void {
		const option = this.filtered[index];

		if (!option) return;

		this.input.value = option.family;
		this.updateClearVisibility();
		this.closeDropdown();
		this.dispatchEvent(new CustomEvent<ComboboxOption>('change', { detail: option }));

		// Drop focus so the next click on the input re-opens the dropdown to pick another font.
		this.input.blur();
	}

	private updateClearVisibility(): void {
		this.clearButton.hidden = this.input.value === '';
	}
}

if (!customElements.get('font-combobox')) {
	customElements.define('font-combobox', FontCombobox);
}

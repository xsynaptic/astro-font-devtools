export interface ComboboxOption {
	category: string;
	family: string;
}

const MAX_VISIBLE = 100;
const MIN_DROPDOWN = 120;

export class FontCombobox extends HTMLElement {
	private activeIndex = -1;
	private allOptions: Array<ComboboxOption> = [];
	private category = 'all';
	private filtered: Array<ComboboxOption> = [];
	private input!: HTMLInputElement;
	private list!: HTMLUListElement;
	private root!: ShadowRoot;
	connectedCallback(): void {
		this.innerHTML = `
			<div class="fdt-combobox">
				<input type="text" placeholder="Type to filter..." autocomplete="off" spellcheck="false" />
			</div>
		`;
		this.input = this.querySelector('input')!;

		// The list floats free of the dev-toolbar window: it lives at the shadow-root
		// level (outside the window's clipped, transformed box) and is positioned with
		// fixed coordinates so it can open up or down and use the full viewport height.
		this.root = this.getRootNode() as ShadowRoot;
		this.list = document.createElement('ul');
		this.list.className = 'fdt-dropdown';
		this.list.hidden = true;
		this.root.append(this.list);

		this.input.addEventListener('input', () => {
			this.openDropdown();
			this.applyFilter();
		});
		this.input.addEventListener('change', (event) => {
			// The input's native change event would otherwise bubble to the host and
			// collide with this component's own semantic `change` CustomEvent (whose
			// listener reads event.detail). Stop it here so only our event escapes.
			event.stopPropagation();
		});
		this.input.addEventListener('focus', () => {
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
	}

	private applyFilter(): void {
		const query = this.input.value.toLowerCase().trim();
		this.filtered = this.allOptions
			.filter((option) => this.category === 'all' || option.category === this.category)
			.filter((option) => !query || option.family.toLowerCase().includes(query))
			.slice(0, MAX_VISIBLE);
		this.activeIndex = -1;
		this.renderList();
	}

	private closeDropdown(): void {
		this.list.hidden = true;
	}

	private handleKey(event: KeyboardEvent): void {
		switch (event.key) {
			case 'ArrowDown': {
				event.preventDefault();
				this.activeIndex = Math.min(this.activeIndex + 1, this.filtered.length - 1);
				this.renderList();

				break;
			}
			case 'ArrowUp': {
				event.preventDefault();
				this.activeIndex = Math.max(this.activeIndex - 1, 0);
				this.renderList();

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

	private openDropdown(): void {
		this.list.hidden = false;
		this.positionList();
	}

	private positionList(): void {
		const rect = this.input.getBoundingClientRect();
		const spaceBelow = globalThis.innerHeight - rect.bottom;
		const spaceAbove = rect.top;
		const openDown = spaceBelow >= spaceAbove;
		const maxHeight = Math.max(MIN_DROPDOWN, (openDown ? spaceBelow : spaceAbove) - 12);
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

	private renderList(): void {
		this.list.innerHTML = this.filtered
			.map(
				(option, index) =>
					`<li data-index="${String(index)}" class="${index === this.activeIndex ? 'fdt-active' : ''}">${option.family}</li>`,
			)
			.join('');
		for (const li of this.list.querySelectorAll('li')) {
			li.addEventListener('mousedown', (event) => {
				event.preventDefault();
				const index = Number(li.dataset.index);
				this.selectIndex(index);
			});
		}
	}

	// Reposition the floating list when its surroundings move (rows scroll, resize).
	private readonly reposition = (): void => {
		if (!this.list.hidden) this.positionList();
	};

	private selectIndex(index: number): void {
		const option = this.filtered[index];
		if (!option) return;
		this.input.value = option.family;
		this.closeDropdown();
		this.dispatchEvent(new CustomEvent<ComboboxOption>('change', { detail: option }));
	}
}

if (!customElements.get('font-combobox')) {
	customElements.define('font-combobox', FontCombobox);
}

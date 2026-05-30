import { scriptLabel } from './scripts.js';

const minPanelHeight = 140;

// A multi-select checkbox dropdown for scripts. Lives in the toolbar's bottom bar; its panel
// floats free at the shadow-root level (like the combobox) so it escapes the window's clipped box
// and opens upward. Emits a `change` CustomEvent ({ selected: string[] }) when the selection moves.
export class FontScriptSelect extends HTMLElement {
	private available: Array<string> = [];
	private list!: HTMLDivElement;
	private panel!: HTMLDivElement;
	private root!: ShadowRoot;
	private search!: HTMLInputElement;
	private selected = new Set<string>();
	private trigger!: HTMLElement;

	connectedCallback(): void {
		this.innerHTML = `<astro-dev-toolbar-button button-style="gray" size="small" aria-haspopup="true" aria-expanded="false"></astro-dev-toolbar-button>`;
		this.trigger = this.querySelector('astro-dev-toolbar-button')!;

		this.root = this.getRootNode() as ShadowRoot;
		this.panel = document.createElement('div');
		this.panel.className = 'fdt-scripts-panel';
		this.panel.hidden = true;
		this.panel.innerHTML = `
			<div class="fdt-scripts-head">
				<input type="text" class="fdt-scripts-search" placeholder="Filter scripts..." autocomplete="off" spellcheck="false" />
				<button type="button" class="fdt-scripts-clear">Clear</button>
			</div>
			<div class="fdt-scripts-list" role="listbox" aria-multiselectable="true"></div>
		`;
		this.search = this.panel.querySelector('.fdt-scripts-search')!;
		this.list = this.panel.querySelector('.fdt-scripts-list')!;
		this.root.append(this.panel);

		this.trigger.addEventListener('click', () => {
			if (this.panel.hidden) this.open();
			else this.close();
		});
		this.search.addEventListener('input', () => {
			this.renderList();
		});
		this.panel.querySelector('.fdt-scripts-clear')!.addEventListener('click', () => {
			this.selected.clear();
			this.renderList();
			this.updateTrigger();
			this.emit();
		});
		this.list.addEventListener('change', (event) => {
			const checkbox = event.target as HTMLInputElement;
			const script = checkbox.dataset.script;
			if (!script) return;
			if (checkbox.checked) this.selected.add(script);
			else this.selected.delete(script);
			this.updateTrigger();
			this.emit();
		});

		document.addEventListener('click', this.onDocumentClick, { capture: true });
		globalThis.addEventListener('resize', this.reposition);
		this.root.addEventListener('scroll', this.reposition, true);
		this.updateTrigger();
	}

	disconnectedCallback(): void {
		this.panel.remove();
		document.removeEventListener('click', this.onDocumentClick, { capture: true });
		globalThis.removeEventListener('resize', this.reposition);
		this.root.removeEventListener('scroll', this.reposition, true);
	}

	getSelected(): Array<string> {
		return [...this.selected];
	}

	setAvailable(scripts: Array<string>): void {
		this.available = scripts;
		this.renderList();
		this.updateTrigger();
	}

	setSelected(scripts: Array<string>): void {
		this.selected = new Set(scripts);
		this.renderList();
		this.updateTrigger();
	}

	private close(): void {
		this.panel.hidden = true;
		this.trigger.setAttribute('aria-expanded', 'false');
	}

	private emit(): void {
		this.dispatchEvent(new CustomEvent('change', { detail: { selected: this.getSelected() } }));
	}

	private readonly onDocumentClick = (event: Event): void => {
		if (this.panel.hidden) return;
		const path = event.composedPath();
		if (!path.includes(this.panel) && !path.includes(this)) this.close();
	};

	private open(): void {
		this.panel.hidden = false;
		this.trigger.setAttribute('aria-expanded', 'true');
		this.position();
		this.renderList();
		this.search.focus();
	}

	private position(): void {
		const rect = this.trigger.getBoundingClientRect();
		const style = this.panel.style;
		// Opens upward; the control sits in the bottom bar.
		style.left = `${String(Math.round(rect.left))}px`;
		style.top = 'auto';
		style.bottom = `${String(Math.round(globalThis.innerHeight - rect.top + 4))}px`;
		style.maxHeight = `${String(Math.round(Math.max(minPanelHeight, rect.top - 12)))}px`;
	}

	private renderList(): void {
		const query = this.search.value.toLowerCase().trim();
		this.list.innerHTML = this.available
			.filter(
				(script) =>
					!query || scriptLabel(script).toLowerCase().includes(query) || script.includes(query),
			)
			.map((script) => {
				const checked = this.selected.has(script) ? ' checked' : '';
				return `<label class="fdt-scripts-item"><input type="checkbox" data-script="${script}"${checked} />${scriptLabel(script)}</label>`;
			})
			.join('');
	}

	private readonly reposition = (): void => {
		if (!this.panel.hidden) this.position();
	};

	private updateTrigger(): void {
		const count = this.selected.size;
		if (count === 0) {
			this.trigger.textContent = 'All scripts';
			return;
		}
		const [first] = this.getSelected();
		this.trigger.textContent =
			count > 1 ? `${scriptLabel(first!)} +${String(count - 1)}` : scriptLabel(first!);
	}
}

if (!customElements.get('font-script-select')) {
	customElements.define('font-script-select', FontScriptSelect);
}

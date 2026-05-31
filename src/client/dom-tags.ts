// Passthrough tagged templates. The `css` / `html` tag names are what trigger Prettier's embedded
// formatting and editor syntax highlighting; they don't transform the string. A real .css/.html
// file isn't viable: styles must reach the toolbar's shadow root (a plain CSS import targets
// document.head), and tsdown can't parse Vite's `?raw`/`?inline` query suffixes for the build.
export const css = (strings: TemplateStringsArray, ...values: Array<number | string>): string =>
	String.raw({ raw: strings }, ...values);

export const html = (strings: TemplateStringsArray, ...values: Array<number | string>): string =>
	String.raw({ raw: strings }, ...values);

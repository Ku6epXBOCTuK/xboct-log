const MARKDOWN_EXTENSIONS = [".md", ".markdown"];
const MARKDOWN_TYPES = ["text/markdown", "text/x-markdown"];

export function isMarkdownFile(file: File): boolean {
	const name = file.name.toLowerCase();
	if (MARKDOWN_EXTENSIONS.some((extension) => name.endsWith(extension))) {
		return true;
	}
	return MARKDOWN_TYPES.includes(file.type.toLowerCase());
}

export function appendMarkdown(current: string, incoming: string): string {
	const added = incoming.trim();
	if (added === "") return current;
	const head = current.trimEnd();
	if (head === "") return added;
	return `${head}\n\n${added}`;
}

export function joinMarkdown(texts: string[]): string {
	return texts.reduce(appendMarkdown, "");
}

export async function readMarkdown(files: File[]): Promise<string> {
	const texts = await Promise.all(
		files.filter(isMarkdownFile).map((file) => file.text()),
	);
	return joinMarkdown(texts);
}

export interface MarkdownDropOptions {
	ontext: (markdown: string) => void;
}

export function markdownDrop(node: HTMLElement, options: MarkdownDropOptions) {
	let current = options;

	function over(event: DragEvent) {
		if (event.dataTransfer?.types.includes("Files") !== true) return;
		event.preventDefault();
		event.stopPropagation();
	}

	async function drop(event: DragEvent) {
		const files = [...(event.dataTransfer?.files ?? [])];
		if (!files.some(isMarkdownFile)) return;
		event.preventDefault();
		event.stopPropagation();
		const markdown = await readMarkdown(files);
		if (markdown.trim() === "") return;
		current.ontext(markdown);
	}

	node.addEventListener("dragover", over);
	node.addEventListener("drop", drop);

	return {
		update(next: MarkdownDropOptions) {
			current = next;
		},
		destroy() {
			node.removeEventListener("dragover", over);
			node.removeEventListener("drop", drop);
		},
	};
}

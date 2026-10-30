export interface FileDropOptions {
	onfiles: (files: File[]) => void;
	ondragchange?: (dragging: boolean) => void;
}

export function fileDrop(node: HTMLElement, options: FileDropOptions) {
	let current = options;

	function over(event: DragEvent) {
		if (event.dataTransfer?.types.includes("Files") !== true) return;
		event.preventDefault();
		current.ondragchange?.(true);
	}

	function leave(event: DragEvent) {
		const related = event.relatedTarget;
		if (related instanceof Node && node.contains(related)) return;
		current.ondragchange?.(false);
	}

	function drop(event: DragEvent) {
		event.preventDefault();
		current.ondragchange?.(false);
		const files = [...(event.dataTransfer?.files ?? [])];
		if (files.length === 0) return;
		current.onfiles(files);
	}

	node.addEventListener("dragover", over);
	node.addEventListener("dragleave", leave);
	node.addEventListener("drop", drop);

	return {
		update(next: FileDropOptions) {
			current = next;
		},
		destroy() {
			node.removeEventListener("dragover", over);
			node.removeEventListener("dragleave", leave);
			node.removeEventListener("drop", drop);
		},
	};
}

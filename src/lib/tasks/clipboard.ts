export function taskText(title: string, description: string): string {
	const body = description.trim();
	return body === "" ? title : `${title}\n\n${body}`;
}

export async function copyText(text: string): Promise<boolean> {
	if (text === "") return false;
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		// NOTE: the clipboard API needs a secure context, the fallback works without it.
	}
	return copyWithSelection(text);
}

function copyWithSelection(text: string): boolean {
	const area = document.createElement("textarea");
	area.value = text;
	area.setAttribute("readonly", "");
	area.style.position = "fixed";
	area.style.opacity = "0";
	document.body.appendChild(area);
	area.select();
	const copied = document.execCommand("copy");
	area.remove();
	return copied;
}

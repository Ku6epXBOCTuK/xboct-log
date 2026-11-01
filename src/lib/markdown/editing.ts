const INDENT = "  ";

export interface SelectionEdit {
	value: string;
	start: number;
	end: number;
}

function lineStart(source: string, index: number): number {
	return source.lastIndexOf("\n", index - 1) + 1;
}

function lineEnd(source: string, index: number): number {
	const next = source.indexOf("\n", index);
	return next === -1 ? source.length : next;
}

function withoutIndent(line: string): { line: string; removed: number } {
	const match = /^(?: {1,2}|\t)/.exec(line);
	if (match === null) return { line, removed: 0 };
	return { line: line.slice(match[0].length), removed: match[0].length };
}

export function indentSelection(
	source: string,
	start: number,
	end: number,
	shift: boolean,
): SelectionEdit | null {
	const from = Math.min(start, end);
	const to = Math.max(start, end);

	if (!shift && !source.slice(from, to).includes("\n")) {
		const caret = from + INDENT.length;
		return {
			value: source.slice(0, from) + INDENT + source.slice(to),
			start: caret,
			end: caret,
		};
	}

	const blockStart = lineStart(source, from);
	const lastIndex = to > from && source[to - 1] === "\n" ? to - 1 : to;
	const blockEnd = lineEnd(source, lastIndex);
	const lines = source.slice(blockStart, blockEnd).split("\n");

	if (!shift) {
		const next = lines.map((line) => INDENT + line).join("\n");
		const grown = lines.length * INDENT.length;
		return {
			value: source.slice(0, blockStart) + next + source.slice(blockEnd),
			start: from === blockStart ? from : from + INDENT.length,
			end: to + grown,
		};
	}

	let firstRemoved = 0;
	let totalRemoved = 0;
	const next = lines.map((line, index) => {
		const stripped = withoutIndent(line);
		if (index === 0) firstRemoved = stripped.removed;
		totalRemoved += stripped.removed;
		return stripped.line;
	});

	if (totalRemoved === 0) return null;

	const nextStart = Math.max(blockStart, from - firstRemoved);

	return {
		value:
			source.slice(0, blockStart) + next.join("\n") + source.slice(blockEnd),
		start: nextStart,
		end: Math.max(nextStart, to - totalRemoved),
	};
}

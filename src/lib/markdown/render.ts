import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
	html: false,
	linkify: true,
	breaks: false,
	typographer: false,
});

md.renderer.rules.link_open = (tokens, index, options, _env, self) => {
	const token = tokens[index];
	const href = String(token.attrGet("href") ?? "");

	if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
		token.attrSet("target", "_blank");
		token.attrSet("rel", "noopener noreferrer");
	}

	return self.renderToken(tokens, index, options);
};

export function renderMarkdown(source: string): string {
	const text = source.trim();
	if (text === "") return "";
	return md.render(text);
}

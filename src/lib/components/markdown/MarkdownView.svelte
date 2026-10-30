<script lang="ts">
	import { goto } from "$app/navigation";
	import type { Attachment } from "svelte/attachments";
	import ImageViewer from "#lib/components/ui/ImageViewer.svelte";
	import { openExternal, openRepoFile } from "#lib/host/embed.ts";
	import { appHref } from "#lib/navigation/href.ts";
	import { classifyLink, repoPath } from "#lib/markdown/links.ts";
	import { renderMarkdown } from "#lib/markdown/render.ts";

	interface Props {
		text: string;
		class?: string;
		repo?: string | null;
	}

	let { text, class: className = "", repo = null }: Props = $props();

	let html = $derived(renderMarkdown(text));
	let viewing = $state<{ src: string; alt: string }>();

	function onClick(event: MouseEvent) {
		const target = event.target;
		if (!(target instanceof Element)) return;

		const anchor = target.closest("a");
		if (anchor !== null) {
			const href = anchor.getAttribute("href") ?? "";
			const kind = classifyLink(href, location.href);
			if (kind === "ignore") return;
			if (kind === "task") return;

			event.preventDefault();
			if (kind === "media") {
				view(anchor.href, anchor.getAttribute("title") ?? "");
				return;
			}

			if (kind === "app") {
				void goto(appHref(new URL(anchor.href)));
				return;
			}

			if (kind === "file") {
				const path = repoPath(href);
				if (path !== null) openRepoFile(repo ?? "", path, anchor.href);
				return;
			}

			openExternal(anchor.href);
			return;
		}

		const image = target.closest("img");
		if (image === null) return;

		event.preventDefault();
		view(image.src, image.alt);
	}

	function view(src: string, alt: string) {
		viewing = { src, alt };
	}

	const follow: Attachment<HTMLElement> = (node) => {
		node.addEventListener("click", onClick);
		return () => node.removeEventListener("click", onClick);
	};
</script>

{#if html !== ""}
	<div class="markdown-body {className}" {@attach follow}>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMarkdown escapes raw html and rejects unsafe links -->
		{@html html}
	</div>
{/if}

{#if viewing !== undefined}
	<ImageViewer
		src={viewing.src}
		alt={viewing.alt}
		title={viewing.alt || "Image"}
		onclose={() => (viewing = undefined)}
	/>
{/if}

<style>
	.markdown-body {
		font-size: var(--text-sm);
		line-height: 1.55;
		color: var(--text-secondary);
		overflow-wrap: anywhere;
	}

	.markdown-body :global(> :first-child) {
		margin-top: 0;
	}

	.markdown-body :global(> :last-child) {
		margin-bottom: 0;
	}

	.markdown-body :global(p) {
		margin: 0 0 var(--space-3);
	}

	.markdown-body :global(h1),
	.markdown-body :global(h2),
	.markdown-body :global(h3),
	.markdown-body :global(h4) {
		margin: var(--space-4) 0 var(--space-2);
		color: var(--foreground);
		font-weight: 600;
		line-height: 1.25;
	}

	.markdown-body :global(h1) {
		font-size: var(--text-xl);
	}

	.markdown-body :global(h2) {
		font-size: var(--text-lg);
	}

	.markdown-body :global(h3),
	.markdown-body :global(h4) {
		font-size: var(--text-md);
	}

	.markdown-body :global(ul),
	.markdown-body :global(ol) {
		margin: 0 0 var(--space-3);
		padding-left: var(--space-5);
	}

	.markdown-body :global(li) {
		margin: 0 0 var(--space-1);
	}

	.markdown-body :global(li > p) {
		margin: 0;
	}

	.markdown-body :global(code) {
		background: var(--hover);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-1);
		font-family: var(--font-mono);
		font-size: 0.92em;
	}

	.markdown-body :global(pre) {
		margin: 0 0 var(--space-3);
		background: var(--hover);
		border-radius: var(--radius);
		padding: var(--space-3);
		overflow-x: auto;
	}

	.markdown-body :global(pre code) {
		background: none;
		padding: 0;
		font-size: var(--text-xs);
		line-height: 1.5;
	}

	.markdown-body :global(blockquote) {
		margin: 0 0 var(--space-3);
		border-left: 2px solid var(--border-strong);
		padding-left: var(--space-3);
		color: var(--text-muted);
	}

	.markdown-body :global(a) {
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 0.15em;
		cursor: pointer;
	}

	.markdown-body :global(hr) {
		margin: var(--space-4) 0;
		border: 0;
		border-top: 1px solid var(--border);
	}

	.markdown-body :global(img) {
		max-width: 100%;
		border-radius: var(--radius-sm);
		cursor: zoom-in;
	}

	.markdown-body :global(table) {
		border-collapse: collapse;
		margin: 0 0 var(--space-3);
	}

	.markdown-body :global(th),
	.markdown-body :global(td) {
		border: 1px solid var(--border);
		padding: var(--space-1) var(--space-2);
		text-align: left;
		white-space: nowrap;
	}
</style>

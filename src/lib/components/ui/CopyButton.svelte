<script lang="ts">
	import { copyText } from "#lib/tasks/clipboard.ts";
	import CircleCheck from "~icons/lucide/circle-check";
	import CircleX from "~icons/lucide/circle-x";
	import Copy from "~icons/lucide/copy";
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton";

	interface Props {
		text: string;
		label: string;
		title?: string;
		size?: "sm" | "md" | "lg";
		onclick?: (event: MouseEvent) => void;
	}

	let { text, label, title, size, onclick }: Props = $props();

	let phase = $state<"idle" | "done" | "error">("idle");
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => () => clearTimeout(timer));

	async function run() {
		const copied = await copyText(text);
		phase = copied ? "done" : "error";
		clearTimeout(timer);
		timer = setTimeout(() => (phase = "idle"), 1500);
	}
</script>

<IconButton
	{label}
	title={title ?? label}
	{size}
	onclick={(event) => {
		onclick?.(event);
		void run();
	}}
>
	{#if phase === "done"}
		<CircleCheck />
	{:else if phase === "error"}
		<CircleX />
	{:else}
		<Copy />
	{/if}
</IconButton>

<script lang="ts">
	import { copyImage } from "#lib/tasks/clipboard.ts";
	import CircleCheck from "~icons/lucide/circle-check";
	import CircleX from "~icons/lucide/circle-x";
	import Copy from "~icons/lucide/copy";
	import LoaderCircle from "~icons/lucide/loader-circle";
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton";

	interface Props {
		image: HTMLImageElement | undefined;
		label: string;
		title?: string;
		size?: "sm" | "md" | "lg";
		onfail?: () => void;
	}

	let { image, label, title, size, onfail }: Props = $props();

	let phase = $state<"idle" | "busy" | "done" | "error">("idle");
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => () => clearTimeout(timer));

	async function run() {
		if (phase === "busy") return;
		clearTimeout(timer);
		phase = "busy";
		const copied = image !== undefined && (await copyImage(image));
		phase = copied ? "done" : "error";
		if (!copied) onfail?.();
		timer = setTimeout(() => (phase = "idle"), 1500);
	}
</script>

<IconButton
	{label}
	title={phase === "busy" ? "Copying the image" : (title ?? label)}
	{size}
	disabled={phase === "busy"}
	onclick={() => void run()}
>
	{#if phase === "busy"}
		<span class="spin"><LoaderCircle /></span>
	{:else if phase === "done"}
		<CircleCheck />
	{:else if phase === "error"}
		<CircleX />
	{:else}
		<Copy />
	{/if}
</IconButton>

<style>
	.spin {
		display: inline-flex;
		animation: spin 0.9s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>

<script lang="ts">
	import type { Snippet } from "svelte";
	import ControlRow from "@ku6epxboctuk/ui-kit/components/ControlRow.svelte";
	import TextInput from "@ku6epxboctuk/ui-kit/components/TextInput.svelte";

	interface Props {
		value: string;
		id?: string;
		placeholder?: string;
		oncommit?: (value: string) => void;
		onfocus?: () => void;
		trailing?: Snippet;
	}

	let {
		value = $bindable(""),
		id = "task-title",
		placeholder = "What needs to be done",
		oncommit,
		onfocus,
		trailing,
	}: Props = $props();
</script>

<label class="field detail-field title-field" for={id}>
	Title
	<ControlRow>
		<div class="title-control">
			<TextInput
				{id}
				bind:value
				{placeholder}
				{onfocus}
				onchange={() => oncommit?.(value)}
			/>
		</div>
		{@render trailing?.()}
	</ControlRow>
</label>

<style>
	.title-control {
		flex: 1 1 auto;
		min-width: 0;
	}
</style>

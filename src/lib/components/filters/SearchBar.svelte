<script lang="ts">
	import Search from "~icons/lucide/search";

	interface Props {
		value: string;
		oninput: (value: string) => void;
	}

	let { value, oninput }: Props = $props();
</script>

<div class="search-wrap">
	<Search />
	<input
		{value}
		oninput={(event) => oninput(event.currentTarget.value)}
		placeholder="Search by title, description, and ID"
		aria-label="Search tasks"
	/>
	<kbd>/</kbd>
</div>

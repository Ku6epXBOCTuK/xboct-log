<script lang="ts">
	import DocumentsPage from "#lib/components/pages/DocumentsPage.svelte";
	import { page } from "$app/state";
</script>

<DocumentsPage initialDocumentId={page.params.id} />

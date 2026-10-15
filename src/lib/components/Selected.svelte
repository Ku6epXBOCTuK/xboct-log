<script lang="ts">
	import type { Task } from "#lib/tasks/mocks.ts";
	import X from "~icons/lucide/x";
	import StatusDot from "./StatusDot.svelte";

	interface Props {
		selected: Task | null;
	}

	let { selected = $bindable() }: Props = $props();

	function setSelected(task: Task | null) {
		selected = task;
	}
</script>

{#if selected}
	<aside class="detail-panel" aria-label="Task details">
		<div class="detail-top">
			<span class="epic-badge">{selected.id}</span>
			<button
				class="close-detail"
				onclick={() => setSelected(null)}
				aria-label="Close task details"
			>
				<X />
			</button>
		</div>
		<p class="detail-kicker">TASK DETAIL / {selected.project.toUpperCase()}</p>
		<h2>{selected.title}</h2>
		<div class="detail-grid">
			<label>
				Status
				<select value={selected.status}>
					<option>in progress</option>
					<option>backlog</option>
					<option>blocked</option>
					<option>done</option>
				</select>
			</label>
			<label>
				Priority
				<select value={selected.priority}>
					<option>high</option>
					<option>medium</option>
					<option>low</option>
					<option>critical</option>
				</select>
			</label>
		</div>
		<div class="detail-grid">
			<label>
				Category
				<select>
					<option>Bug</option>
					<option>Feature</option>
					<option>Chore</option>
				</select>
			</label>
			<label>
				Type
				<select>
					<option>task</option>
					<option>epic</option>
				</select>
			</label>
		</div>
		<label class="detail-field">
			Epic
			<input value="SHOP-13" readOnly />
		</label>
		<label class="detail-field">
			Comma-separated tags
			<input value={selected.tags.join(", ")} readOnly />
		</label>
		<div class="progress-meta">
			<StatusDot status={selected.status} />
			<span>{selected.status}</span>
			<div class="progress-bar">
				<span style={`width: ${selected.progress ?? 0}%`}></span>
			</div>
			<span>{selected.progress ?? 0}%</span>
			<span class="muted">created {selected.date}/2026</span>
		</div>
		<code class="source-line">src/{selected.project}/PaymentForm.tsx:112</code>
		<div class="description">
			<p>{selected.description}</p>
			<p>
				The implementation should preserve state across redirects and remain
				safe to retry.
			</p>
			<label class="check-row">
				<input type="checkbox" defaultChecked />
				<span>Reproduce with the 3-D Secure test card</span>
			</label>
			<label class="check-row">
				<input type="checkbox" defaultChecked />
				<span>Find where the state is lost</span>
			</label>
			<label class="check-row">
				<input type="checkbox" />
				<span>Keep the draft in session storage until payment is confirmed</span
				>
			</label>
		</div>
		<button class="edit-button">Edit description</button>
		<div class="related-section">
			<p>BLOCKED BY</p>
			<div class="related-item">
				<span class="epic-badge">SHOP-24</span>
				<span>Storage wrapper swallows quota errors</span>
				<StatusDot status="done" />
				<X />
			</div>
			<div class="related-add">
				<input placeholder="Task ID" />
				<button>Add</button>
			</div>
		</div>
	</aside>
{/if}

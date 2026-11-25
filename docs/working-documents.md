# Working documents in the tracker

The tracker is the source of truth for working documents. Moving the existing
markdown is a one-time migration per project, not an ongoing import.

## What moves

- Plans and planning notes, including markdown plans and the files under
  `.opencode/plan/`.
- PRD, architecture, ADR, research, specs and other working notes.

A plan becomes a global `plan`: it has no `project_id`, and its name need not be
unique. Its items are tasks or epics from any project: the item keeps the task's
internal id, so a task move changes only the displayed `PREFIX-NNN` key. Item
order is explicit; use `plans_reorder` with the full key list after all items
exist. Notes on items are kept in the tracker with their own history.

A document stays project-owned and gets its own `PREFIX-DOC-NNN` key (e.g.
`BRUL-DOC-1`). The `DOC` marker keeps document keys disjoint from task keys: a
task stays `PREFIX-NNN`, so a bare key from prose can only address one kind of
entity. Set `source_file` to the original path for provenance only: it is not an
import identity, several documents may share it, and there is no re-import or
upsert. Plans may link documents from any project with `plans_documents_link`.

Migrations rewrite existing keys to this format. A database backup taken before
that migration still holds the old keys; restoring it brings them back until the
migration runs again.

## What stays in the repository

- `AGENTS.md`, every `README.md` and `CHANGELOG.md`, including nested ones.
- `fixtures/*.md` and other test or example data.
- Generated files, build output and source code (including code comments).

These are part of the checkout, not working documents. Do not create tracker
documents for them.

## How to transfer

Use the existing tools one item at a time; 80 single calls are acceptable. No
batch, importer or upsert operation is needed.

1. Create documents with
   `documents_create {project_id, kind, title, body,    source_file}`. Pick
   `kind` from `adr`, `prd`, `architecture`, `research`, `workflow`, `guide`,
   `spec`; the initial status is `draft`.
2. Create plans with `plans_create {name, description, status}`. Status is
   manual and is never derived from the statuses of the tasks in the plan.
3. Add items with `plans_items_add {plan_id, task_id}`, where `task_id` is the
   task's current `PREFIX-NNN` key. Reorder once with `plans_reorder` using the
   full ordered list of keys.
4. Add item notes with `plans_notes_add {plan_id, task_id, body}` and link
   documents with `plans_documents_link {plan_id, document_id}`. A document may
   be addressed by key or internal id.
5. Verify keys, item order, document links, notes and soft-delete flags. The
   original markdown files are removed only after the transfer is verified.

Soft delete keeps the composition: deleting a task or a plan hides it but keeps
its position, notes and links. `tasks_restore` and `plans_restore` bring it all
back. Previous note and document text is available through
`plans_notes_revisions_list` and `documents_revisions_list`.

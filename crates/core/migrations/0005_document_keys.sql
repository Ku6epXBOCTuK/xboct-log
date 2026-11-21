UPDATE documents
SET key = UPPER((SELECT prefix FROM projects WHERE id = project_id)) || '-DOC-' || number
WHERE instr(lower(key), '-doc-') = 0;

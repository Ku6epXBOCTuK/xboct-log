export const ID_DESCRIPTION =
	"Task id. The full 'PREFIX-NUMBER' form (e.g. 'LOG-82') always resolves; the prefix is matched case-insensitively, so 'log-82' works too. A bare task number (e.g. '82') is resolved inside in_project when it is given, otherwise it must be unique across the whole backlog, else the call fails and lists the candidate full ids. When nothing matches, the error suggests close ids.";

export const IN_PROJECT_DESCRIPTION =
	"Optional project id (e.g. 'eit') that scopes the id lookup: a bare task number is then looked up inside that project. The project prefix (e.g. 'EIT') works as well. With a full id, the project must match, else the call fails.";

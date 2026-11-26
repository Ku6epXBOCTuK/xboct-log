# Changelog
All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/) for commit guidelines.

- - -
## [v0.18.0](https://github.com/Ku6epXBOCTuK/xboct-log/compare/4b4fce4b360db70aae8cb3ebe21fc88f5558ff45..v0.18.0) - 2026-11-26
#### Features
- (**core**) hide closed plan items in tasks_list by default - ([0162523](https://github.com/Ku6epXBOCTuK/xboct-log/commit/01625238fc7265471c552f84057b9df4475966a9)) - Ku6epXBOCTuK
- (**plans**) show active plans by default - ([74313d8](https://github.com/Ku6epXBOCTuK/xboct-log/commit/74313d821adc8b79aed6425cd8c0eedd26f2c93e)) - Ku6epXBOCTuK
- (**plans**) add search by name and key - ([4b4fce4](https://github.com/Ku6epXBOCTuK/xboct-log/commit/4b4fce4b360db70aae8cb3ebe21fc88f5558ff45)) - Ku6epXBOCTuK
- add plan deletion and restoration from plans page - ([138ed34](https://github.com/Ku6epXBOCTuK/xboct-log/commit/138ed34096334d9945d6801f1fedcf360571d9f6)) - Ku6epXBOCTuK
#### Bug Fixes
- (**core**) escape LIKE metacharacters in document and task search - ([de8fca8](https://github.com/Ku6epXBOCTuK/xboct-log/commit/de8fca8ed06cdc19d6575fb36d70c1086bd6dc51)) - Ku6epXBOCTuK
- (**core**) generate all entity ids as UUIDv7 through typed newtypes - ([04e0677](https://github.com/Ku6epXBOCTuK/xboct-log/commit/04e06777f1a398f631126403c0a21effc04b47a1)) - Ku6epXBOCTuK
- (**core**) resolve scope names with unicode case folding - ([c03dcb6](https://github.com/Ku6epXBOCTuK/xboct-log/commit/c03dcb60d7c26e919c4cb4a6c99535100c36238f)) - Ku6epXBOCTuK
- (**server**) resync lagged SSE clients instead of reloading the app - ([1f5905b](https://github.com/Ku6epXBOCTuK/xboct-log/commit/1f5905b8f3428697d6732a41450150c755af05b3)) - Ku6epXBOCTuK
#### Refactoring
- (**plans**) route store mutations through onMutate - ([0e5da73](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0e5da732ca0a397a55510ae5de354f48b533eee5)) - Ku6epXBOCTuK
- (**tests**) share one scratch directory helper across crates - ([f35552b](https://github.com/Ku6epXBOCTuK/xboct-log/commit/f35552b31abec5745341fe4ef95f9d4a643ac308)) - Ku6epXBOCTuK

- - -

## [v0.17.0](https://github.com/Ku6epXBOCTuK/xboct-log/compare/edbc251504c013d1c9cffa7fee2245d6689a4af6..v0.17.0) - 2026-11-24
#### Features
- (**plans**) add editable plan name, description and key fields - ([edbc251](https://github.com/Ku6epXBOCTuK/xboct-log/commit/edbc251504c013d1c9cffa7fee2245d6689a4af6)) - Ku6epXBOCTuK
- (**tasks**) add XL estimate and generate enum constants from contract - ([53ffd88](https://github.com/Ku6epXBOCTuK/xboct-log/commit/53ffd88ffd65a3b531e4d3cd226a83b31f6d91d1)) - Ku6epXBOCTuK
#### Bug Fixes
- (**ops**) give export its own limit policy - ([8c6010e](https://github.com/Ku6epXBOCTuK/xboct-log/commit/8c6010e94b9216c44c396bec1257d8e37063e145)) - Ku6epXBOCTuK
- (**plans**) point plans_notes_add caller to plans_items_add - ([f16f790](https://github.com/Ku6epXBOCTuK/xboct-log/commit/f16f79020108bc33fa2a41663327dc6d035b1906)) - Ku6epXBOCTuK
- (**server**) reduce MCP session reconnects and clarify retry message - ([4bae38f](https://github.com/Ku6epXBOCTuK/xboct-log/commit/4bae38f7c20a4d869280f43b7aabfe45d954a94b)) - Ku6epXBOCTuK
- (**tags**) show active dictionary before task writes and guide tag creation - ([3d89fed](https://github.com/Ku6epXBOCTuK/xboct-log/commit/3d89fed73ba16f3d6664b3f1b4a7d1cd76e8cda3)) - Ku6epXBOCTuK
- (**tasks**) report the new id when a stale task id was moved - ([c44f4b4](https://github.com/Ku6epXBOCTuK/xboct-log/commit/c44f4b4f365ce144f539b990c7db6e04ca33e978)) - Ku6epXBOCTuK
- (**ui**) type nav item hrefs as ResolvedPathname - ([36e5098](https://github.com/Ku6epXBOCTuK/xboct-log/commit/36e50981c8b3a99c9ab31cd0980f433727bd5cc8)) - Ku6epXBOCTuK

- - -

## [v0.16.0](https://github.com/Ku6epXBOCTuK/xboct-log/compare/9a2828cd710c99db149dcf6f74862bcdde706436..v0.16.0) - 2026-11-23
#### Features
- (**ui**) persist pinned navigation pages - ([9a2828c](https://github.com/Ku6epXBOCTuK/xboct-log/commit/9a2828cd710c99db149dcf6f74862bcdde706436)) - Ku6epXBOCTuK

- - -

## [v0.15.1](https://github.com/Ku6epXBOCTuK/xboct-log/compare/650032f3849a50d647b91ecec008adb544f51913..v0.15.1) - 2026-11-22
#### Bug Fixes
- (**plans**) keep status filter visible when no plans match - ([960ed11](https://github.com/Ku6epXBOCTuK/xboct-log/commit/960ed112d68f33f659a237fac0691fc915048b14)) - Ku6epXBOCTuK
- (**plans**) align plans list cards with design mockup - ([1445d78](https://github.com/Ku6epXBOCTuK/xboct-log/commit/1445d78501869dcd44b32777fee02e213bfc54b7)) - Ku6epXBOCTuK
- (**plans**) align task cards and notes with the design mockup - ([650032f](https://github.com/Ku6epXBOCTuK/xboct-log/commit/650032f3849a50d647b91ecec008adb544f51913)) - Ku6epXBOCTuK

- - -

## [v0.15.0](https://github.com/Ku6epXBOCTuK/xboct-log/compare/8bf4135adaad69c07b9c6d70c4a01e7eabd59181..v0.15.0) - 2026-11-22
#### Features
- (**plans**) add status filter and status control - ([04c926c](https://github.com/Ku6epXBOCTuK/xboct-log/commit/04c926c2cde8c49e2e380361e57f5a8636fdeff5)) - Ku6epXBOCTuK
- (**plans**) show completion from closed tasks - ([5027885](https://github.com/Ku6epXBOCTuK/xboct-log/commit/5027885e4779a1fb19841eb9555d7679178a42c7)) - Ku6epXBOCTuK
- (**plans**) add direct navigation to attached documents - ([b9d93f1](https://github.com/Ku6epXBOCTuK/xboct-log/commit/b9d93f127b26397053e239cb019214f619876512)) - Ku6epXBOCTuK
- (**plans**) rework task adding and removal with blockers - ([8ff8700](https://github.com/Ku6epXBOCTuK/xboct-log/commit/8ff870090982b3e63e4410dab61747e1717e35e1)) - Ku6epXBOCTuK
#### Refactoring
- (**plans**) split page stat and markup into state and components - ([fc82dcc](https://github.com/Ku6epXBOCTuK/xboct-log/commit/fc82dccc7380783c145c38e4c891ce7f69ffe83e)) - Ku6epXBOCTuK

- - -

## [v0.14.1](https://github.com/Ku6epXBOCTuK/xboct-log/compare/0b7bd038702199c4be3d5000747b1791c55e13a8..v0.14.1) - 2026-11-21
#### Bug Fixes
- (**activity**) derive operation labels for any entity - ([0b7bd03](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0b7bd038702199c4be3d5000747b1791c55e13a8)) - Ku6epXBOCTuK

- - -

## [v0.14.0](https://github.com/Ku6epXBOCTuK/xboct-log/compare/a7b4e8d57e8696dd3a9ea889e5f20e7dec9b5385..v0.14.0) - 2026-11-21
#### Features
- (**documents**) use disjoint PERFIX-DOC-N keys - ([d24016c](https://github.com/Ku6epXBOCTuK/xboct-log/commit/d24016cc8f6a3384929532008cdb3afebb5ef78b)) - Ku6epXBOCTuK
- (**mcp**) generate tool instructions from the operation registry - ([a7b4e8d](https://github.com/Ku6epXBOCTuK/xboct-log/commit/a7b4e8d57e8696dd3a9ea889e5f20e7dec9b5385)) - Ku6epXBOCTuK
- (**plans**) add copy button for plan keys - ([b72fc75](https://github.com/Ku6epXBOCTuK/xboct-log/commit/b72fc7546cc6d570f994f0582ba9a8bb2f720bd8)) - Ku6epXBOCTuK
- (**plans**) add short plan ids and reserve PL prefix - ([7c52df7](https://github.com/Ku6epXBOCTuK/xboct-log/commit/7c52df72926da6f125277f005aa3bed161833b75)) - Ku6epXBOCTuK
- (**tasks**) auto-blocks tasks with open blockers - ([ffa30af](https://github.com/Ku6epXBOCTuK/xboct-log/commit/ffa30afe792a45df487de692ccb9a7bdbf007d37)) - Ku6epXBOCTuK
- (**ui**) deafult markdown fields to preview for existing content - ([480e24c](https://github.com/Ku6epXBOCTuK/xboct-log/commit/480e24c6c431400ae25861a74b6e630dd98c222b)) - Ku6epXBOCTuK
#### Bug Fixes
- (**activity**) include document events in project filter - ([5b41c30](https://github.com/Ku6epXBOCTuK/xboct-log/commit/5b41c304aee6f17e746a7e947adb7d023b401785)) - Ku6epXBOCTuK
- (**core**) project id lookup and filters ignore case - ([0c38003](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0c38003021dcee66bb516ce2262fe928ee3d7572)) - Ku6epXBOCTuK
- (**documents**) derive dirty state from saved document body - ([981d66d](https://github.com/Ku6epXBOCTuK/xboct-log/commit/981d66d30a83486175745d83664e9d7c7bc97700)) - Ku6epXBOCTuK
- (**documents**) add project-less route and list all documents - ([8cec5ef](https://github.com/Ku6epXBOCTuK/xboct-log/commit/8cec5efac6a8f915f0f50e50a87586e40d6bf465)) - Ku6epXBOCTuK
- (**mcp**) prevent task-list truncation with bounded pages and previews - ([ce6e1d3](https://github.com/Ku6epXBOCTuK/xboct-log/commit/ce6e1d393efe8704ca85abb98fc3a526106e90c9)) - Ku6epXBOCTuK
- (**mcp**) align update description and e2e calls with nested patch schema - ([b850781](https://github.com/Ku6epXBOCTuK/xboct-log/commit/b850781d17d831c6ab9b8df591fadf4861978c71)) - Ku6epXBOCTuK
- (**ops**) reject unknown fields in batched task updates - ([2aa8c65](https://github.com/Ku6epXBOCTuK/xboct-log/commit/2aa8c65edb68bdf605c6e1b9dde5d18282a0f83e)) - Ku6epXBOCTuK
- (**server**) map expired MCP sessions to a clear 404 - ([d295a67](https://github.com/Ku6epXBOCTuK/xboct-log/commit/d295a674c408eec093d018cb138e706e4faf590a)) - Ku6epXBOCTuK
- (**tasks**) use server counts for epic close warnings - ([bd990c0](https://github.com/Ku6epXBOCTuK/xboct-log/commit/bd990c0a4439c6853bdc29e097ac4b8be630971a)) - Ku6epXBOCTuK
- clippy warnings - ([c73f979](https://github.com/Ku6epXBOCTuK/xboct-log/commit/c73f97940c00d5481d06851b97541de0b9b37cdf)) - Ku6epXBOCTuK
#### Refactoring
- (**layout**) share app bar with service buttons across pages - ([dd1ca71](https://github.com/Ku6epXBOCTuK/xboct-log/commit/dd1ca714deb00713a6c97d4a0a7a6fa243c4d849)) - Ku6epXBOCTuK

- - -

## [v0.13.0](https://github.com/Ku6epXBOCTuK/xboct-log/compare/f235f756e3513782c9c1edd7a92714db441f42d3..v0.13.0) - 2026-11-20
#### Features
- (**mcp**) list every tool with brief rare descriptions and on-demand schemas - ([66e9a3e](https://github.com/Ku6epXBOCTuK/xboct-log/commit/66e9a3e3ac567601baf8860e98b897307d950fc2)) - Ku6epXBOCTuK
- (**mcp**) expose a tiered tool surface with on-demand tool discovery - ([f235f75](https://github.com/Ku6epXBOCTuK/xboct-log/commit/f235f756e3513782c9c1edd7a92714db441f42d3)) - Ku6epXBOCTuK

- - -

## [v0.12.0](https://github.com/Ku6epXBOCTuK/xboct-log/compare/8ae3ddad111188053da1117e136d1df6cb26c4d0..v0.12.0) - 2026-11-20
#### Features
- (**core**) add plans schema migrations - ([8ae3dda](https://github.com/Ku6epXBOCTuK/xboct-log/commit/8ae3ddad111188053da1117e136d1df6cb26c4d0)) - Ku6epXBOCTuK
- (**documents**) add full filters and sor to document lists - ([689bb23](https://github.com/Ku6epXBOCTuK/xboct-log/commit/689bb23731ad9944b0268b31796da1a87e3b78d5)) - Ku6epXBOCTuK
- (**documents**) add documents UI and plan notes - ([d14fcd6](https://github.com/Ku6epXBOCTuK/xboct-log/commit/d14fcd6736168c1a0787b97d76adb8790b89c3f8)) - Ku6epXBOCTuK
- (**documents**) add document opeations and plan links - ([856bb65](https://github.com/Ku6epXBOCTuK/xboct-log/commit/856bb65fa2875eb8266a9298a50bb891a7225a86)) - Ku6epXBOCTuK
- (**documents**) add document domain, revisions and plan links - ([c7bdbfb](https://github.com/Ku6epXBOCTuK/xboct-log/commit/c7bdbfb76ffb1cad12a67b79a34cdf804cc0e1be)) - Ku6epXBOCTuK
- (**mcp**) expose document text as an MCP resource - ([102cef8](https://github.com/Ku6epXBOCTuK/xboct-log/commit/102cef828f21db8639d95e48d06cb9e042219dda)) - Ku6epXBOCTuK
- (**ops**) document readable plan refs on every task response - ([250343e](https://github.com/Ku6epXBOCTuK/xboct-log/commit/250343e3896e849228fd4d9e855fe5c5af08f548)) - Ku6epXBOCTuK
- (**ops**) return compact document lists and named plans - ([9c43025](https://github.com/Ku6epXBOCTuK/xboct-log/commit/9c4302550f59d26c86d1c536b0a75e3b82e15eab)) - Ku6epXBOCTuK
- (**plans**) add deleted_only to plan lists - ([96f88cf](https://github.com/Ku6epXBOCTuK/xboct-log/commit/96f88cfbcbe10c4d7ad8c0611b73c620868684dd)) - Ku6epXBOCTuK
- (**plans**) add note history, restore and stale-edit checks - ([22eb678](https://github.com/Ku6epXBOCTuK/xboct-log/commit/22eb678ae9aef8a3cf97954b807e0ec6661ff2d4)) - Ku6epXBOCTuK
- (**plans**) add plan components - add plan, add tasks - ([0ccb846](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0ccb846ff2a3751b9e3b2dd715c123d2dc07117b)) - Ku6epXBOCTuK
- (**plans**) add global plans page - ([4a636b6](https://github.com/Ku6epXBOCTuK/xboct-log/commit/4a636b66ad6f5e40da8a7fc3a97356cfcc0bdd7b)) - Ku6epXBOCTuK
- (**plans**) add plan operations for CRUD, items, reorder and notes - ([48c2bb9](https://github.com/Ku6epXBOCTuK/xboct-log/commit/48c2bb930cfa93c009dee35373a689b7dc31024c)) - Ku6epXBOCTuK
- (**plans**) add plan domain and SSE entities - ([bd4826a](https://github.com/Ku6epXBOCTuK/xboct-log/commit/bd4826a621608487e8845f042f04d7796bccfd45)) - Ku6epXBOCTuK
- (**ui**) add plan note history and restore - ([48c3727](https://github.com/Ku6epXBOCTuK/xboct-log/commit/48c3727360614d1ada315b998a47f9686285893e)) - Ku6epXBOCTuK
- expose plan membershop on task reads - ([424b8b3](https://github.com/Ku6epXBOCTuK/xboct-log/commit/424b8b34cfcd48edefdcdc03478ddcaa35aa6559)) - Ku6epXBOCTuK
#### Bug Fixes
- (**documents**) make update and revision atomic - ([50587e5](https://github.com/Ku6epXBOCTuK/xboct-log/commit/50587e5b13054545fdfc4d96866597bb051aa96f)) - Ku6epXBOCTuK
- (**documents**) accept human readable keys in document operations - ([3b7fac4](https://github.com/Ku6epXBOCTuK/xboct-log/commit/3b7fac49e20176648183040b7d6cc904fcb48c0b)) - Ku6epXBOCTuK
- (**mcp**) make tasks_create_many item requirements discoverable - ([a7b3ee8](https://github.com/Ku6epXBOCTuK/xboct-log/commit/a7b3ee880fd91195f3fea0920b30df60a3196dd7)) - Ku6epXBOCTuK
- (**plans**) correct plan item read instructions - ([e1c547b](https://github.com/Ku6epXBOCTuK/xboct-log/commit/e1c547bf69c127ab566da517b01011a4a5a1641c)) - Ku6epXBOCTuK
#### Refactoring
- (**core**) share push_in_text helper across query builders - ([ac023a6](https://github.com/Ku6epXBOCTuK/xboct-log/commit/ac023a689c07b5067732ff37735b6552ad986c21)) - Ku6epXBOCTuK
- (**core**) extract shared like_pattern helper - ([59284bc](https://github.com/Ku6epXBOCTuK/xboct-log/commit/59284bc1f6da6b3debba9b79fa9b8b72e39c76a8)) - Ku6epXBOCTuK
- (**core**) unify pagination validation with Limit and Offset newtypes - ([ab32abb](https://github.com/Ku6epXBOCTuK/xboct-log/commit/ab32abb18e10d3394ddaabaef4795c1ea6809f57)) - Ku6epXBOCTuK
- (**core**) add fetch helpers with FromRow mapping - ([6edf123](https://github.com/Ku6epXBOCTuK/xboct-log/commit/6edf123b445e54a6d3be5ce9da774d572bda6780)) - Ku6epXBOCTuK
- (**core**) db implement table_exist helper - ([47dd83c](https://github.com/Ku6epXBOCTuK/xboct-log/commit/47dd83c4edd4947ac5004948c7fb361c5f0e3cd9)) - Ku6epXBOCTuK
- (**ops**) unify empty input types into ops:EmptyInput - ([3ba1de6](https://github.com/Ku6epXBOCTuK/xboct-log/commit/3ba1de6058e211bee983bf64ae80490b8d8a50f3)) - Ku6epXBOCTuK
- (**ui**) make document update atomic with its text revision - ([68798ba](https://github.com/Ku6epXBOCTuK/xboct-log/commit/68798babc11a5b91f2f1b05d10dd215b4e110ba0)) - Ku6epXBOCTuK

- - -

## [v0.11.1](https://github.com/Ku6epXBOCTuK/xboct-log/compare/6609da1ab61f242d47fd0619740469bd16508ca9..v0.11.1) - 2026-11-18
#### Bug Fixes
- (**core**) make tasks_list projections schema match its response - ([a902900](https://github.com/Ku6epXBOCTuK/xboct-log/commit/a902900846ce9dd19382ebead7913cd54f74deea)) - Ku6epXBOCTuK
- (**ops**) publish resolvable schemas for list outputs - ([6609da1](https://github.com/Ku6epXBOCTuK/xboct-log/commit/6609da1ab61f242d47fd0619740469bd16508ca9)) - Ku6epXBOCTuK

- - -

## [v0.11.0](https://github.com/Ku6epXBOCTuK/xboct-log/compare/f02662eb2538d3df509e36b4eb37d9a85761a820..v0.11.0) - 2026-11-17
#### Features
- (**cli**) restore a database snapshot from command line - ([b7e3fdf](https://github.com/Ku6epXBOCTuK/xboct-log/commit/b7e3fdfbdf6cc98fe708e7a43f37b7a440379cdf)) - Ku6epXBOCTuK
- (**mcp**) record MCP tool calls and expose log ops - ([7e71c9f](https://github.com/Ku6epXBOCTuK/xboct-log/commit/7e71c9fd7cc9a6a2a87902baddf808e8334e2c5b)) - Ku6epXBOCTuK
- (**repo**) keep the dev instance out of production data - ([a6990c5](https://github.com/Ku6epXBOCTuK/xboct-log/commit/a6990c5404344d10e06efccab104aaf71951f7c2)) - Ku6epXBOCTuK
- (**scripts**) deploy a named instance from an untracked config - ([1645bd7](https://github.com/Ku6epXBOCTuK/xboct-log/commit/1645bd75843b1b6c914f6683708a5105a20b2af0)) - Ku6epXBOCTuK
- (**ui**) show the backend status and warn then it is unreachable - ([8589c1c](https://github.com/Ku6epXBOCTuK/xboct-log/commit/8589c1c88e0296daf82ca9d47509a690663d20e9)) - Ku6epXBOCTuK
#### Bug Fixes
- (**core**) keep an explicit null in the scope and epic filters - ([a4209c7](https://github.com/Ku6epXBOCTuK/xboct-log/commit/a4209c7289f44272174de948b5f2efec0466eea7)) - Ku6epXBOCTuK
- (**core**) filter exact task ids then the query has no text terms - ([f02662e](https://github.com/Ku6epXBOCTuK/xboct-log/commit/f02662eb2538d3df509e36b4eb37d9a85761a820)) - Ku6epXBOCTuK
- (**ui**) keep search inpur padding clear of its icon - ([1bf6d81](https://github.com/Ku6epXBOCTuK/xboct-log/commit/1bf6d812f39a39c99dfa54d9827a7d940e9ba966)) - Ku6epXBOCTuK
#### Refactoring
- (**cli**) parse arguments with clap crate - ([08870c4](https://github.com/Ku6epXBOCTuK/xboct-log/commit/08870c4fd164f9bb07c6471353d286fd03daf242)) - Ku6epXBOCTuK
- (**core**) type the task write outputs instead of json values - ([591f842](https://github.com/Ku6epXBOCTuK/xboct-log/commit/591f8422f93cefcec3b30f30578d249afae814ba)) - Ku6epXBOCTuK
- (**node-backend**) remove the node backend and its legacy scripts - ([9cc4e71](https://github.com/Ku6epXBOCTuK/xboct-log/commit/9cc4e71f4bed49d5edbd5c0640e4ffea7e0e5ef3)) - Ku6epXBOCTuK
- (**ops**) generate operation and tool schemas from the types - ([4a4e6b6](https://github.com/Ku6epXBOCTuK/xboct-log/commit/4a4e6b6e135696f13a936e0284d5b35221d7b6a1)) - Ku6epXBOCTuK
- (**ops**) type operation names as one enum - ([de4b049](https://github.com/Ku6epXBOCTuK/xboct-log/commit/de4b0496a18245242d0b8de3a68c9ca0fd310637)) - Ku6epXBOCTuK

- - -

## [v0.10.0](https://github.com/Ku6epXBOCTuK/xboct-log/compare/490b321882e5b52f708eeddf86c6d4c6fd9aa3ec..v0.10.0) - 2026-11-15
#### Features
- (**rust-backend**) serve every operation over rest - ([2b2bdd4](https://github.com/Ku6epXBOCTuK/xboct-log/commit/2b2bdd49a5581e1a497d853f82b2dab3237540a4)) - Ku6epXBOCTuK
- (**rust-backend**) serve mcp from the operation registy - ([ea0f66a](https://github.com/Ku6epXBOCTuK/xboct-log/commit/ea0f66a863a016d931013386cd25f830e22bde3a)) - Ku6epXBOCTuK
- (**rust-backend**) serve the tool schemas of the operation registry - ([86c19b3](https://github.com/Ku6epXBOCTuK/xboct-log/commit/86c19b3e15d48ceaf04ac46a7b0f23f7755c5f60)) - Ku6epXBOCTuK
- (**rust-backend**) port the backup operations - ([cfde272](https://github.com/Ku6epXBOCTuK/xboct-log/commit/cfde272f438ef16e5413df3b1e20f408e34c9bb0)) - Ku6epXBOCTuK
- (**rust-backend**) port the attachment operations - ([05c4afe](https://github.com/Ku6epXBOCTuK/xboct-log/commit/05c4afea398a5cdcc87608f76963b32277d29e6c)) - Ku6epXBOCTuK
- (**rust-backend**) port the comment operations - ([2a3a681](https://github.com/Ku6epXBOCTuK/xboct-log/commit/2a3a6810f2812eceef0695620656f902887ef41e)) - Ku6epXBOCTuK
- (**rust-backend**) port the tag operations - ([7355267](https://github.com/Ku6epXBOCTuK/xboct-log/commit/7355267abb248f40a943da8f6fc45a777f4104cb)) - Ku6epXBOCTuK
- (**rust-backend**) port the project and scope operations - ([97cab78](https://github.com/Ku6epXBOCTuK/xboct-log/commit/97cab78517ea63f4d8e39d2b3b5a0b80a1a16394)) - Ku6epXBOCTuK
- (**rust-backend**) record activity and publish changes from the operation dispatcher - ([4a69556](https://github.com/Ku6epXBOCTuK/xboct-log/commit/4a69556ae468722dd06d1e2eb092a116365c2c8b)) - Ku6epXBOCTuK
- (**rust-backend**) read task history, revisions and stats - ([754092d](https://github.com/Ku6epXBOCTuK/xboct-log/commit/754092d1f21dca00b6d73f06cfe183d975fb2e85)) - Ku6epXBOCTuK
- (**rust-backend**) link and block tasks - ([744eac9](https://github.com/Ku6epXBOCTuK/xboct-log/commit/744eac9dc42103e443b724a7b5efb23e7fb5f153)) - Ku6epXBOCTuK
- (**rust-backend**) delete, restore, move and batch tasks - ([9016a5c](https://github.com/Ku6epXBOCTuK/xboct-log/commit/9016a5c1d1ad0388edad086b2fd9e736813b9c20)) - Ku6epXBOCTuK
- (**rust-backend**) add the task write operations - ([7c6ca59](https://github.com/Ku6epXBOCTuK/xboct-log/commit/7c6ca596859a5279cd8e85f8c5bbe6c410a7a858)) - Ku6epXBOCTuK
- (**rust-backend**) add the operation registry and task reads - ([376d25c](https://github.com/Ku6epXBOCTuK/xboct-log/commit/376d25c6d65cf5eca02eba8f489af60e01283082)) - Ku6epXBOCTuK
- (**rust-backend**) launch the server from the cli - ([acc4b0d](https://github.com/Ku6epXBOCTuK/xboct-log/commit/acc4b0d35c30f512ef7a680c63612fce34b51047)) - Ku6epXBOCTuK
- (**rust-backend**) schedule backups and prune the activity log - ([e439b0b](https://github.com/Ku6epXBOCTuK/xboct-log/commit/e439b0b9ebf56692c310c941b0144f9631649000)) - Ku6epXBOCTuK
- (**rust-backend**) broadcast changes over the sse stream - ([3cd2176](https://github.com/Ku6epXBOCTuK/xboct-log/commit/3cd21766051ad9ade84758f1698752fe1dad6fb0)) - Ku6epXBOCTuK
- (**rust-backend**) serve health, media and manual backups - ([8c5c99d](https://github.com/Ku6epXBOCTuK/xboct-log/commit/8c5c99d3fce4d164fff3dd1faa789340d6df3eff)) - Ku6epXBOCTuK
- (**rust-backend**) collapse node migrations into single migration - ([51447f4](https://github.com/Ku6epXBOCTuK/xboct-log/commit/51447f46abf32da26422833c0218bc6ec499f266)) - Ku6epXBOCTuK
- (**rust-backend**) add core config, pool and transaction guard - ([fc31b63](https://github.com/Ku6epXBOCTuK/xboct-log/commit/fc31b63f6a83cc6ff9353f29438aeb7fcfc04e9c)) - Ku6epXBOCTuK
- (**rust-contract**) generate the openapi document and the frontend types - ([68e2b48](https://github.com/Ku6epXBOCTuK/xboct-log/commit/68e2b48c0f1add80dede6e6be62949f05395c37e)) - Ku6epXBOCTuK
- (**rust-frontend**) load data through the generated rest api - ([11b3abb](https://github.com/Ku6epXBOCTuK/xboct-log/commit/11b3abb4d393b9679d5f475c5abb2c9f1738ce73)) - Ku6epXBOCTuK
- (**server**) serve the spa from a directory on disk - ([208999a](https://github.com/Ku6epXBOCTuK/xboct-log/commit/208999a80fe8f0645a7e865527d6d0a44ff2e6f5)) - Ku6epXBOCTuK
#### Bug Fixes
- (**mcp**) persist http sessions in a file so their ids survive a restart - ([6cfe2e8](https://github.com/Ku6epXBOCTuK/xboct-log/commit/6cfe2e80824f6b490c48aba45eaa8eb9464ccccd)) - Ku6epXBOCTuK
- (**rust-backend**) repair the migration history - ([aff3bb9](https://github.com/Ku6epXBOCTuK/xboct-log/commit/aff3bb97a031c0709fb7c1e4e658e6e929a8add0)) - Ku6epXBOCTuK
- (**rust-backend**) answer mccp validation errors like node - ([abd4270](https://github.com/Ku6epXBOCTuK/xboct-log/commit/abd4270558adcd4005222a1a4639606053a387fe)) - Ku6epXBOCTuK
- (**rust-backend**) creat the inbox on a fresh database - ([111249b](https://github.com/Ku6epXBOCTuK/xboct-log/commit/111249b49b28833d6fadd122e37f7a754bc01424)) - Ku6epXBOCTuK
#### Refactoring
- (**rust-backend**) use typed ids instead of strings - ([bfa7487](https://github.com/Ku6epXBOCTuK/xboct-log/commit/bfa7487a87e6e61fcc08af51d557adcf0a5aa362)) - Ku6epXBOCTuK
- type the activity source and entity filters - ([f18fbe9](https://github.com/Ku6epXBOCTuK/xboct-log/commit/f18fbe98f93e49d896d3ec2a91aa15c7e109e87e)) - Ku6epXBOCTuK

- - -

## [v0.9.0](https://github.com/Ku6epXBOCTuK/xboct-log/compare/7f3af8b45955c6cec11c0add0adaf8f8d0049f73..v0.9.0) - 2026-11-06
#### Features
- move attachments flow - ([6543e16](https://github.com/Ku6epXBOCTuK/xboct-log/commit/6543e166acddf7061292b7ea144f080191ab9683)) - Ku6epXBOCTuK
#### Refactoring
- move to ui-kit InfoPopover components - ([130fa42](https://github.com/Ku6epXBOCTuK/xboct-log/commit/130fa42348178c1660496c66bf6285a140538461)) - Ku6epXBOCTuK
- fields use ui-kit components - ([5bf905e](https://github.com/Ku6epXBOCTuK/xboct-log/commit/5bf905e68b0b85cc5e9ad49a06fea0e66fb0bcce)) - Ku6epXBOCTuK

- - -

## [v0.8.0](https://github.com/Ku6epXBOCTuK/xboct-log/compare/8961a3dc646ee5deb29f95b0624ef62fc4c73bf2..v0.8.0) - 2026-11-06
#### Features
- add auto open epic flow - if auto-closed - ([18d611a](https://github.com/Ku6epXBOCTuK/xboct-log/commit/18d611a3f70ef1ce18f234473c4178e391d8d54e)) - Ku6epXBOCTuK
- add epics progress in details page - ([47fa177](https://github.com/Ku6epXBOCTuK/xboct-log/commit/47fa1775866dddaa6db8052faf52f42736680d8d)) - Ku6epXBOCTuK
#### Bug Fixes
- closing child task also auto-close epic - ([58845a2](https://github.com/Ku6epXBOCTuK/xboct-log/commit/58845a224c8b76b8a9c3e0021e2a16e02cdb571d)) - Ku6epXBOCTuK
- epic shown as opened, while have opened chidren - ([35565e1](https://github.com/Ku6epXBOCTuK/xboct-log/commit/35565e166deaec73d0d0a3ba804ac0a03e332da6)) - Ku6epXBOCTuK

- - -

## [v0.7.1](https://github.com/Ku6epXBOCTuK/xboct-log/compare/1c500fee11ec3548a3b9bcee10026bfeadee1cf1..v0.7.1) - 2026-11-06
#### Bug Fixes
- limit max coalesce timer - ([9198a84](https://github.com/Ku6epXBOCTuK/xboct-log/commit/9198a845a8b5ae8925ad0343e3aba48a80e5b6c0)) - Ku6epXBOCTuK
- creating new project update layout data - ([1c500fe](https://github.com/Ku6epXBOCTuK/xboct-log/commit/1c500fee11ec3548a3b9bcee10026bfeadee1cf1)) - Ku6epXBOCTuK

- - -

## [v0.7.0](https://github.com/Ku6epXBOCTuK/xboct-log/compare/1545e0a00a38322342c83eefa1e19bfd0ad26213..v0.7.0) - 2026-11-06
#### Features
- move activity to new task constant id id - ([0a7b05c](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0a7b05cc2b0e3be4946374053dd6a56c98ef8cfc)) - Ku6epXBOCTuK
- migrate tasks to new PK, add constant id - ([3ed83e2](https://github.com/Ku6epXBOCTuK/xboct-log/commit/3ed83e2544bc67107cde932291e4a7147aaeeee3)) - Ku6epXBOCTuK
#### Bug Fixes
- drop old_id in activity - ([4c382ee](https://github.com/Ku6epXBOCTuK/xboct-log/commit/4c382eefab0ee09d0895524ba6f2f66debc3e0dc)) - Ku6epXBOCTuK
- add app folder hash for multiple instances workflow - ([f06ddc7](https://github.com/Ku6epXBOCTuK/xboct-log/commit/f06ddc7c0c0a5a50ba935b2b3793a7484c54ac89)) - Ku6epXBOCTuK
- app run on specific port, error handling - ([481654a](https://github.com/Ku6epXBOCTuK/xboct-log/commit/481654a4d98b8b04eaa4d36ff751d22035b6eb14)) - Ku6epXBOCTuK
- version return valid value instead of unknown - ([0b6810f](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0b6810f7f226bb95e1ecfa89bb327e48f5a35cd1)) - Ku6epXBOCTuK
- reuqests headers for auth - ([1545e0a](https://github.com/Ku6epXBOCTuK/xboct-log/commit/1545e0a00a38322342c83eefa1e19bfd0ad26213)) - Ku6epXBOCTuK

- - -

## [v0.6.3](https://github.com/Ku6epXBOCTuK/xboct-log/compare/b41ef8b8d44bcd5fc5fdf5f4a49a147f65a78cf9..v0.6.3) - 2026-11-02
#### Bug Fixes
- add scope by name flow - ([b41ef8b](https://github.com/Ku6epXBOCTuK/xboct-log/commit/b41ef8b8d44bcd5fc5fdf5f4a49a147f65a78cf9)) - Ku6epXBOCTuK

- - -

## [v0.6.2](https://github.com/Ku6epXBOCTuK/xboct-log/compare/784a83b7d3ddf5fcde8e7a7e487207b162ae642f..v0.6.2) - 2026-11-02
#### Bug Fixes
- update descriptions about use markdonw, expand attachments file types - ([46e2664](https://github.com/Ku6epXBOCTuK/xboct-log/commit/46e26648932e36effa05bc9693cbb6a779136b0e)) - Ku6epXBOCTuK
- update to new ui-kit - ([784a83b](https://github.com/Ku6epXBOCTuK/xboct-log/commit/784a83b7d3ddf5fcde8e7a7e487207b162ae642f)) - Ku6epXBOCTuK

- - -

## [v0.6.1](https://github.com/Ku6epXBOCTuK/xboct-log/compare/4371fea1da0bf5f9a6d3d49ceeeba141d673df00..v0.6.1) - 2026-11-01
#### Bug Fixes
- add activity record to task attachments, update tools for required activity - ([4371fea](https://github.com/Ku6epXBOCTuK/xboct-log/commit/4371fea1da0bf5f9a6d3d49ceeeba141d673df00)) - Ku6epXBOCTuK

- - -

## [v0.6.0](https://github.com/Ku6epXBOCTuK/xboct-log/compare/addedbbbbc869f2ede3c85c87f74f82c3262d0e4..v0.6.0) - 2026-11-01
#### Features
- add soft delete and restore attachments flow - ([6b0f202](https://github.com/Ku6epXBOCTuK/xboct-log/commit/6b0f2028e73b40eaf803eb48f1d3dc32a2a04592)) - Ku6epXBOCTuK
- update status flow, refactor filters - ([4047759](https://github.com/Ku6epXBOCTuK/xboct-log/commit/40477595e92ecec15d327a2b1ca688111ab3bf9b)) - Ku6epXBOCTuK
- add links from tags page for search tasks - ([addedbb](https://github.com/Ku6epXBOCTuK/xboct-log/commit/addedbbbbc869f2ede3c85c87f74f82c3262d0e4)) - Ku6epXBOCTuK
#### Refactoring
- reduce props - use context, state - ([b89168e](https://github.com/Ku6epXBOCTuK/xboct-log/commit/b89168e72549b3f1bf53c7f3a186581505f593b8)) - Ku6epXBOCTuK

- - -

## [v0.5.0](https://github.com/Ku6epXBOCTuK/xboct-log/compare/b4ab09406db9742b6eaade9a8b2fbd1ecb3eaddf..v0.5.0) - 2026-11-01
#### Features
- add tags page - ([03f60d8](https://github.com/Ku6epXBOCTuK/xboct-log/commit/03f60d88cf44eca9fe4a7dffcd9aec0493b71653)) - Ku6epXBOCTuK
- add markdown to comments - ([0242dc7](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0242dc7d2a5a91414a6871996905d2238ba53ea5)) - Ku6epXBOCTuK
- add attachment count badge and insert event highlight - ([6899e60](https://github.com/Ku6epXBOCTuK/xboct-log/commit/6899e6052b9a88aede7a3877afdaa1e5717d76c8)) - Ku6epXBOCTuK
#### Bug Fixes
- use mime type from extension - ([0654f1c](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0654f1ccd71ce83cba8c3abd61ea34b380d56dbf)) - Ku6epXBOCTuK
- delete attachments confirmation - ([0908a62](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0908a620bbaf1d6972df695e10a2dbf678b73983)) - Ku6epXBOCTuK
- error handling on create task and add task links - ([d3a2977](https://github.com/Ku6epXBOCTuK/xboct-log/commit/d3a297789a8680f67f180ecbe75d1e05a40527c0)) - Ku6epXBOCTuK
- error handling on create task and attach files - ([fab03a1](https://github.com/Ku6epXBOCTuK/xboct-log/commit/fab03a1293e2548fe7fee985458b15ad1fd86c2f)) - Ku6epXBOCTuK
- attachments flow - whitelist, discard event - ([00e7863](https://github.com/Ku6epXBOCTuK/xboct-log/commit/00e78630201b19a06b3c447226f35ea6d2a9787a)) - Ku6epXBOCTuK
- task can be patched via flat fields - ([66d8b3e](https://github.com/Ku6epXBOCTuK/xboct-log/commit/66d8b3e1540257989d3cb7da08d6fd41b5d0d345)) - Ku6epXBOCTuK
- overdue highlight use local day - ([af669ea](https://github.com/Ku6epXBOCTuK/xboct-log/commit/af669eaacc63745969cea97ded4edd94d4a15a75)) - Ku6epXBOCTuK
- search and sort tags - ([7bbdef8](https://github.com/Ku6epXBOCTuK/xboct-log/commit/7bbdef8fc65bea8c0d6aa3e34b227ad168e886f8)) - Ku6epXBOCTuK
- reset description on new task - ([b4ab094](https://github.com/Ku6epXBOCTuK/xboct-log/commit/b4ab09406db9742b6eaade9a8b2fbd1ecb3eaddf)) - Ku6epXBOCTuK
#### Refactoring
- attachments - use single state for new task and edit task - ([9be8416](https://github.com/Ku6epXBOCTuK/xboct-log/commit/9be84164e3844d4f81c1ae4c16848e7e655b981f)) - Ku6epXBOCTuK
- reduce doubling for create new task and edit task forms - ([a446020](https://github.com/Ku6epXBOCTuK/xboct-log/commit/a44602034f786fe3209be733f6e0ede6f06f2ec0)) - Ku6epXBOCTuK

- - -

## [v0.4.0](https://github.com/Ku6epXBOCTuK/xboct-log/compare/630518633b6cc36374ca62d06dc3cca3f54d8d80..v0.4.0) - 2026-10-30
#### Features
- update task chips to use links - ([d77b295](https://github.com/Ku6epXBOCTuK/xboct-log/commit/d77b2956b7dabe95aa31f908994c4d07ddffd040)) - Ku6epXBOCTuK
- update app routing - ([6305186](https://github.com/Ku6epXBOCTuK/xboct-log/commit/630518633b6cc36374ca62d06dc3cca3f54d8d80)) - Ku6epXBOCTuK
#### Bug Fixes
- app links works in markdown - ([2948748](https://github.com/Ku6epXBOCTuK/xboct-log/commit/29487483a2e49876c834ba60c1d6ea4157dec194)) - Ku6epXBOCTuK

- - -

## [v0.3.0](https://github.com/Ku6epXBOCTuK/xboct-log/compare/183d7b9e239654cd501a1c0755e7cdb426f10dfb..v0.3.0) - 2026-10-30
#### Features
- open links from markdown files - ([fd6a498](https://github.com/Ku6epXBOCTuK/xboct-log/commit/fd6a498d699234122fce3e8d8a8d44634e5ab953)) - Ku6epXBOCTuK
- add wrap lines to edit description - ([96405d0](https://github.com/Ku6epXBOCTuK/xboct-log/commit/96405d048783599e79613908d8071f257232e4ee)) - Ku6epXBOCTuK
- add copybutton for task id in sidebar panel - ([0809cbd](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0809cbde4d2eb3b6da2dc8ba7a29dc885f89500e)) - Ku6epXBOCTuK
- add clickable links and image preview in markdown - ([d7e6ec2](https://github.com/Ku6epXBOCTuK/xboct-log/commit/d7e6ec25c285a56c48e625a4693a6a68a7e2b052)) - Ku6epXBOCTuK
- add markdown viewer - ([11ac776](https://github.com/Ku6epXBOCTuK/xboct-log/commit/11ac776b797f1f53c72c914759ec96b7961d7c97)) - Ku6epXBOCTuK
- add restore backup flow - ([183d7b9](https://github.com/Ku6epXBOCTuK/xboct-log/commit/183d7b9e239654cd501a1c0755e7cdb426f10dfb)) - Ku6epXBOCTuK
#### Bug Fixes
- update blocked_by descriptions - ([f5dae91](https://github.com/Ku6epXBOCTuK/xboct-log/commit/f5dae91bfbd65fe2e3fa8eff9db9d1e715ef4c65)) - Ku6epXBOCTuK
- update fields and revisions with timeout flush, coalesce revisions - ([1953f35](https://github.com/Ku6epXBOCTuK/xboct-log/commit/1953f352ab6a4b53b27e3c120b6a7cd21fd5796d)) - Ku6epXBOCTuK
#### Refactoring
- split DetailPanel.svelte - ([87c529f](https://github.com/Ku6epXBOCTuK/xboct-log/commit/87c529f0d61925002170b05f7d3b47136d4ac215)) - Ku6epXBOCTuK

- - -

## [v0.2.0](https://github.com/Ku6epXBOCTuK/xboct-log/compare/d97d2d7d78043479a468e8e916d72a38053e827c..v0.2.0) - 2026-10-29
#### Features
- add source\client id - ([a177f59](https://github.com/Ku6epXBOCTuK/xboct-log/commit/a177f5932b69fbe306c28f319029704de4803a09)) - Ku6epXBOCTuK
- upgrade remote fetch - timeout and retry - ([a362af1](https://github.com/Ku6epXBOCTuK/xboct-log/commit/a362af1b2f6b42076953184d0a8041084c37bac0)) - Ku6epXBOCTuK
- add freshness system - ([8d5b29f](https://github.com/Ku6epXBOCTuK/xboct-log/commit/8d5b29f4947b3faa0d0da4cceb55ad8d6cd9690b)) - Ku6epXBOCTuK
- update project task counts - ([f3beed4](https://github.com/Ku6epXBOCTuK/xboct-log/commit/f3beed469e66f3763645ed8b17ed2d7305628c6e)) - Ku6epXBOCTuK
- add copy image button - ([a15981e](https://github.com/Ku6epXBOCTuK/xboct-log/commit/a15981e141b6b684eb04bd03ae04f204f40278b3)) - Ku6epXBOCTuK
- add copy button for task id - ([cdecaac](https://github.com/Ku6epXBOCTuK/xboct-log/commit/cdecaacc8b956150f2cc9472b05e738bc3b92dc6)) - Ku6epXBOCTuK
#### Bug Fixes
- update tasks_create description - ([24f6199](https://github.com/Ku6epXBOCTuK/xboct-log/commit/24f619938cae5d6cc04c53b7fe9e7c1c7d7fa56d)) - Ku6epXBOCTuK
- update activity and deleted pages for use new flow - ([b6b42c0](https://github.com/Ku6epXBOCTuK/xboct-log/commit/b6b42c086925dbc936180460e4015833ef2209c2)) - Ku6epXBOCTuK
- add tags and comments in events and live state - ([c3e7502](https://github.com/Ku6epXBOCTuK/xboct-log/commit/c3e75020e5ffeb7f604c98f0ddf03d33f8460bcd)) - Ku6epXBOCTuK
- move to new ui-kit's chip component - ([6907129](https://github.com/Ku6epXBOCTuK/xboct-log/commit/6907129611363e7ca383cc364fed2f1439acafa8)) - Ku6epXBOCTuK
- update new task and edit task forms - ([d97d2d7](https://github.com/Ku6epXBOCTuK/xboct-log/commit/d97d2d7d78043479a468e8e916d72a38053e827c)) - Ku6epXBOCTuK

- - -

## [v0.1.0](https://github.com/Ku6epXBOCTuK/xboct-log/compare/0734232a3071d6fcc79ae1685b12252176d58f48..v0.1.0) - 2026-10-29
#### Features
- update to ci\release\deploy - ([3cec21a](https://github.com/Ku6epXBOCTuK/xboct-log/commit/3cec21a8e2f47d5af61d5b41f2c7868cbbc6223c)) - Ku6epXBOCTuK
- add attachments_read mcp tool - ([0ebe010](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0ebe0103a983b76c599b423bde8f7da5daee8e3b)) - Ku6epXBOCTuK
- add attachments resources - ([9632d32](https://github.com/Ku6epXBOCTuK/xboct-log/commit/9632d32bcc892411d463519ea10783346989c843)) - Ku6epXBOCTuK
- update theme from ui-kit - ([eb95365](https://github.com/Ku6epXBOCTuK/xboct-log/commit/eb95365996999af07fd7f49a7be2c51a9e5af4b5)) - Ku6epXBOCTuK
- update after move to node v26 - ([d9c5a1e](https://github.com/Ku6epXBOCTuK/xboct-log/commit/d9c5a1e7a5696c017b2b2fe89dc1e846f3760bff)) - Ku6epXBOCTuK
- migrate to task_tags table - ([bcdd69b](https://github.com/Ku6epXBOCTuK/xboct-log/commit/bcdd69bccf4e20897ff66c3d08d783b4fe9783be)) - Ku6epXBOCTuK
- update tags flow - separate table, create and archive tags - ([6061831](https://github.com/Ku6epXBOCTuK/xboct-log/commit/6061831834b0c3c0caaff5f1da3c3508ef3feeb9)) - Ku6epXBOCTuK
- add backlog status - ([13d7958](https://github.com/Ku6epXBOCTuK/xboct-log/commit/13d7958aa8fddfcd074ad816250bc98dfee44799)) - Ku6epXBOCTuK
- move task search for links to server - ([3877086](https://github.com/Ku6epXBOCTuK/xboct-log/commit/38770869d6f7244f27a15246a6e23f58f4f890a3)) - Ku6epXBOCTuK
- move filter by status to server side - ([a37d5a8](https://github.com/Ku6epXBOCTuK/xboct-log/commit/a37d5a8b8024b9dfce33b35a692f0c13883fae2e)) - Ku6epXBOCTuK
- use server side search - ([200c307](https://github.com/Ku6epXBOCTuK/xboct-log/commit/200c307143dc7f8563be766ef2dac475c296d5be)) - Ku6epXBOCTuK
- use counts from server data - ([f47ac4c](https://github.com/Ku6epXBOCTuK/xboct-log/commit/f47ac4c3e2bc774bf73dfcfd06017683499632d0)) - Ku6epXBOCTuK
- update pager component - ([c760dc8](https://github.com/Ku6epXBOCTuK/xboct-log/commit/c760dc81b3310d8e4bed263dffe9b69f655c58b2)) - Ku6epXBOCTuK
- update tasks loading workflow - paging, filters - ([4cb412d](https://github.com/Ku6epXBOCTuK/xboct-log/commit/4cb412d217b177c901ac4584f08e3f0578127a8a)) - Ku6epXBOCTuK
- load tasks if its referenced in details - ([7d09168](https://github.com/Ku6epXBOCTuK/xboct-log/commit/7d0916840b63a8bfcb18c9704908c48167898b4d)) - Ku6epXBOCTuK
- add task blocks other badge - ([5163182](https://github.com/Ku6epXBOCTuK/xboct-log/commit/51631826b0e704b2f3769740b60f28e74187fe31)) - Ku6epXBOCTuK
- update web ui search - ([62e341d](https://github.com/Ku6epXBOCTuK/xboct-log/commit/62e341d7922aa47c70472c8f0ccb4d84e4278be3)) - Ku6epXBOCTuK
- show linked tasks on click - ([f92431b](https://github.com/Ku6epXBOCTuK/xboct-log/commit/f92431ba8a3970686af94bc43fe2119f150904a8)) - Ku6epXBOCTuK
- close new task dialog saves draft - ([d62f503](https://github.com/Ku6epXBOCTuK/xboct-log/commit/d62f5038d8dbb0ce794647270b515a6ba786039b)) - Ku6epXBOCTuK
- add mcp client info - ([ebdc076](https://github.com/Ku6epXBOCTuK/xboct-log/commit/ebdc0763251ffc5273c5aca2bc47afbfbc0b2004)) - Ku6epXBOCTuK
- add repo field to project settings - ([a6236ac](https://github.com/Ku6epXBOCTuK/xboct-log/commit/a6236ac8f107dff0895aab114c80d39a3f886ea5)) - Ku6epXBOCTuK
- add epic progress indicator on badge - ([1438a19](https://github.com/Ku6epXBOCTuK/xboct-log/commit/1438a19d1ec58dfddce1b206a7588e0bad71bf34)) - Ku6epXBOCTuK
- add blocked reason field - ([2602880](https://github.com/Ku6epXBOCTuK/xboct-log/commit/2602880d17f0462323d507cec3d368bfd980a381)) - Ku6epXBOCTuK
- add output schema to all tools - ([3904bbb](https://github.com/Ku6epXBOCTuK/xboct-log/commit/3904bbb3bda7512cd70c8d93aff8de0d1bd0a5c1)) - Ku6epXBOCTuK
- output schema infra and pilot on tasks_create - ([51d35f6](https://github.com/Ku6epXBOCTuK/xboct-log/commit/51d35f6227e9a465889205d05fcca2e5ea72c739)) - Ku6epXBOCTuK
- add ui for new task links - ([0f67f58](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0f67f588215b77c31d8f15aa910b851830fa404b)) - Ku6epXBOCTuK
- mcp tools for new task links - ([d36f5d8](https://github.com/Ku6epXBOCTuK/xboct-log/commit/d36f5d80327c51e1d0ade0f75c6d11cff2ee3172)) - Ku6epXBOCTuK
- update old migration - checks, add relates, dublicates types - ([20b877d](https://github.com/Ku6epXBOCTuK/xboct-log/commit/20b877d727d60e0237d2c83e2faad57e74d122ff)) - Ku6epXBOCTuK
- update links server flow - ([c76685b](https://github.com/Ku6epXBOCTuK/xboct-log/commit/c76685b795aec9eb1cf601a6ef5188712a248aac)) - Ku6epXBOCTuK
- add migration blocked_by to task_links - ([495eff2](https://github.com/Ku6epXBOCTuK/xboct-log/commit/495eff29c1c0dad8fdc5fe2ad550fed53b52831e)) - Ku6epXBOCTuK
- add attachments view lightbox - ([f94f069](https://github.com/Ku6epXBOCTuK/xboct-log/commit/f94f0694dfade1d0bbcfb2b846bbe44aaed1a010)) - Ku6epXBOCTuK
- add drag-n-drop and paste image in new task form - ([5ab1424](https://github.com/Ku6epXBOCTuK/xboct-log/commit/5ab142480adfa4c28f4ee78a6eefea452c83004d)) - Ku6epXBOCTuK
- add drag-n-drop on details sidebar - ([fe59d79](https://github.com/Ku6epXBOCTuK/xboct-log/commit/fe59d7954b1bd1d2b53f6316c9de7e9ecf35f629)) - Ku6epXBOCTuK
- add files on paste - ([e1976c7](https://github.com/Ku6epXBOCTuK/xboct-log/commit/e1976c7dd34eddb80f055511db489b68e8f71d95)) - Ku6epXBOCTuK
- update query, add task and epic counts in projects list - ([6153101](https://github.com/Ku6epXBOCTuK/xboct-log/commit/615310154f49ad253892f9b1cdeeeb8371f4aed1)) - Ku6epXBOCTuK
- add children count in epic tasks get - ([e24fb3d](https://github.com/Ku6epXBOCTuK/xboct-log/commit/e24fb3dfdf6440b22f7b9d1df84de91ff0187ee7)) - Ku6epXBOCTuK
- add has_tags filter condition - ([142701c](https://github.com/Ku6epXBOCTuK/xboct-log/commit/142701c6702c03564b030e84167b884ebc6bc138)) - Ku6epXBOCTuK
- update tags flow - ([7bc732d](https://github.com/Ku6epXBOCTuK/xboct-log/commit/7bc732d3f5f0a1091a2dc334b9f4b2034daf1bbd)) - Ku6epXBOCTuK
- compact mode for nav sidebar - ([f9960b2](https://github.com/Ku6epXBOCTuK/xboct-log/commit/f9960b25e707b6b4ba70025379d4503e5e20e4aa)) - Ku6epXBOCTuK
- validate patch, dont silently skip errors - ([ed4692f](https://github.com/Ku6epXBOCTuK/xboct-log/commit/ed4692f778221da502f7aaf31f9a47f00af66e5c)) - Ku6epXBOCTuK
- update create tasks form, common\all fields - ([d5ec591](https://github.com/Ku6epXBOCTuK/xboct-log/commit/d5ec591927fdb42b6cee1ae5caa0f138f5fce866)) - Ku6epXBOCTuK
- add attachments workflow - ([b17d7a7](https://github.com/Ku6epXBOCTuK/xboct-log/commit/b17d7a7240fbb0161dea67e705d44d0826d80d39)) - Ku6epXBOCTuK
- return to last task chip button - ([33e5e81](https://github.com/Ku6epXBOCTuK/xboct-log/commit/33e5e8125cebf383a6433e4ceb6440fbdcc0f540)) - Ku6epXBOCTuK
- add enter field navigation - ([7e3836b](https://github.com/Ku6epXBOCTuK/xboct-log/commit/7e3836bd4e79288d23226fef9ac0108f34c51919)) - Ku6epXBOCTuK
- add modal, update create project - ([44a3ce6](https://github.com/Ku6epXBOCTuK/xboct-log/commit/44a3ce6509972e9bab2b251917d9d19793339310)) - Ku6epXBOCTuK
- add copy to clipboard buttons - ([6349edc](https://github.com/Ku6epXBOCTuK/xboct-log/commit/6349edc8d177ecfec42d0f601fd8b607775834e4)) - Ku6epXBOCTuK
- add kbd shortcuts - ([655cf02](https://github.com/Ku6epXBOCTuK/xboct-log/commit/655cf0264fe7a2cbc29e360e3dfc79bb6ff9b95c)) - Ku6epXBOCTuK
- add deleted tasks page - ([591ca31](https://github.com/Ku6epXBOCTuK/xboct-log/commit/591ca31ff4e040c90841c4294d2423731a0d6d63)) - Ku6epXBOCTuK
- add active\total tasks into epic\scope\tags filters - ([1b44850](https://github.com/Ku6epXBOCTuK/xboct-log/commit/1b4485057a8f09534b67de24cb7c7049d9b34cd2)) - Ku6epXBOCTuK
- add closed at column in table, small fixes - ([d166403](https://github.com/Ku6epXBOCTuK/xboct-log/commit/d1664033b29f1b0df832699f21fa0ce546c4db79)) - Ku6epXBOCTuK
- create new scope on task add form - ([aa8d3bc](https://github.com/Ku6epXBOCTuK/xboct-log/commit/aa8d3bcfbee198114d23c837da7543d203c9c900)) - Ku6epXBOCTuK
- add structured content on error - ([eb40a33](https://github.com/Ku6epXBOCTuK/xboct-log/commit/eb40a33343cc25d301b99c5ac27b2669721c1d71)) - Ku6epXBOCTuK
- add assignee and due at fields - ([d00a625](https://github.com/Ku6epXBOCTuK/xboct-log/commit/d00a6254921d85f5d167bd0fc151aa6a73e0979f)) - Ku6epXBOCTuK
- add estimate field - ([1ffdf08](https://github.com/Ku6epXBOCTuK/xboct-log/commit/1ffdf0843cafa676cb1e9ffd212116e2257d3fb9)) - Ku6epXBOCTuK
- add blocked from status column, return to this status then unblocks - ([0eba0be](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0eba0be9ca72aa488337e5dfff2624f9404afae8)) - Ku6epXBOCTuK
- remove source line column - ([0d7bc39](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0d7bc398165759babe519488aeeae16380649541)) - Ku6epXBOCTuK
- add task_boards mcp tool - ([aa6db19](https://github.com/Ku6epXBOCTuK/xboct-log/commit/aa6db1906d1ffc434a78892db9d1d1f2992c5b44)) - Ku6epXBOCTuK
- add task description history - ([7f2c054](https://github.com/Ku6epXBOCTuK/xboct-log/commit/7f2c054942c32e974afe569865c184bea72a136f)) - Ku6epXBOCTuK
- add filter by source file - ([85d45c8](https://github.com/Ku6epXBOCTuK/xboct-log/commit/85d45c87be90b80f1bd02c590bce9c9400aa50fb)) - Ku6epXBOCTuK
- add source location conflict helper - ([0f6e0be](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0f6e0bed799b3a99a0a297690754a4205875cd02)) - Ku6epXBOCTuK
- add filter by epic id - ([65f33fd](https://github.com/Ku6epXBOCTuK/xboct-log/commit/65f33fdd48196b603eed31ecf886f3f013625511)) - Ku6epXBOCTuK
- add tags_list mcp tool - ([3d5ef8b](https://github.com/Ku6epXBOCTuK/xboct-log/commit/3d5ef8bec4f1a9a50ad36d48c3c5e30550a46f4d)) - Ku6epXBOCTuK
- epic counts closed tasks instead of done - ([95fd37b](https://github.com/Ku6epXBOCTuK/xboct-log/commit/95fd37b75f64ae2282bcc8fc68d65c45ce0f983f)) - Ku6epXBOCTuK
- add list fields to task list mcp tool - ([0818df9](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0818df9ea166e1b796dd5afe1b2d64434a80b880)) - Ku6epXBOCTuK
- dev scripts and env vars - ([03ceab0](https://github.com/Ku6epXBOCTuK/xboct-log/commit/03ceab00b960abdbd74252d9a7b40ce9fe5c6532)) - Ku6epXBOCTuK
- remove find by short id - ([a796fb1](https://github.com/Ku6epXBOCTuK/xboct-log/commit/a796fb16d7c6ad0bfcb54c2d0658fb3336d55cba)) - Ku6epXBOCTuK
- scope delete dry run preview - ([ea0b911](https://github.com/Ku6epXBOCTuK/xboct-log/commit/ea0b911b8d0a6195d5d1537b88f2bfeb5d706da2)) - Ku6epXBOCTuK
- activity log when closed tasks clears blocks - ([033f4a4](https://github.com/Ku6epXBOCTuK/xboct-log/commit/033f4a4f9374edba4e693ef355c1356f71460842)) - Ku6epXBOCTuK
- add activity logs for blockers - ([391bd3e](https://github.com/Ku6epXBOCTuK/xboct-log/commit/391bd3e1f994d8bd1dc6683fd4d56919ae0855f7)) - Ku6epXBOCTuK
- add scope warnings - ([cb49e2c](https://github.com/Ku6epXBOCTuK/xboct-log/commit/cb49e2c251edd97e4184579832d7f3045083aa84)) - Ku6epXBOCTuK
- add restore deleted task - ([1c069a1](https://github.com/Ku6epXBOCTuK/xboct-log/commit/1c069a196415da683dffc368d22239b4503ce882)) - Ku6epXBOCTuK
- add task search fields to mcp - ([e8da988](https://github.com/Ku6epXBOCTuK/xboct-log/commit/e8da988a64332f4ec16a39d44fae0a2c9c8e623e)) - Ku6epXBOCTuK
- unknow parameters throw error instead of silently drop them - ([8562795](https://github.com/Ku6epXBOCTuK/xboct-log/commit/8562795057ee47ec6b6155bcff54a8d4164b1a18)) - Ku6epXBOCTuK
- add ui for activity changes - ([b80129f](https://github.com/Ku6epXBOCTuK/xboct-log/commit/b80129f19f58b1fb6094198f8ccfdf885fe557a0)) - Ku6epXBOCTuK
- add comments ui (refetch, load, comments count) - ([51b27c2](https://github.com/Ku6epXBOCTuK/xboct-log/commit/51b27c22aa713b0fd9bc3d03e21713c50a743b1b)) - Ku6epXBOCTuK
- add purge soft deleted task scheduler - ([d715682](https://github.com/Ku6epXBOCTuK/xboct-log/commit/d71568227ef34d4e59a30fc466a0123fe25f0b3c)) - Ku6epXBOCTuK
- add activity changes for short fields - ([e583edb](https://github.com/Ku6epXBOCTuK/xboct-log/commit/e583edb44ad16edb2c5703b704ec1fc627eac5be)) - Ku6epXBOCTuK
- add revisions to tasks on update description - ([c25a299](https://github.com/Ku6epXBOCTuK/xboct-log/commit/c25a29901e249dd41a1d7f246f54aad6cd20f771)) - Ku6epXBOCTuK
- add comments and revisions backend flow - ([920a333](https://github.com/Ku6epXBOCTuK/xboct-log/commit/920a33338dfb1d35b5eca6aee973c171f9dc624a)) - Ku6epXBOCTuK
- add db migrations - ([76163cb](https://github.com/Ku6epXBOCTuK/xboct-log/commit/76163cbf5b1de79913ed65686ec8a76d032e4306)) - Ku6epXBOCTuK
- project prefix in uppercase - ([97860c8](https://github.com/Ku6epXBOCTuK/xboct-log/commit/97860c8246336ce2deb98c0be8b9910fde6cd886)) - Ku6epXBOCTuK
- add global activity page - ([a9692e1](https://github.com/Ku6epXBOCTuK/xboct-log/commit/a9692e1649a7e332367104a308901f759ff49696)) - Ku6epXBOCTuK
- add task history into task details - ([40d4fea](https://github.com/Ku6epXBOCTuK/xboct-log/commit/40d4fea138a396e4de6af7af0053c5d946490313)) - Ku6epXBOCTuK
- add activity flow - write to db, remote functions - ([b9c0261](https://github.com/Ku6epXBOCTuK/xboct-log/commit/b9c0261f05f80d499d924e161529ffe8d4a099f7)) - Ku6epXBOCTuK
- update deploy to use env vars - ([9302dea](https://github.com/Ku6epXBOCTuK/xboct-log/commit/9302deae6ba14c38ad13b9fb0e291538e529980d)) - Ku6epXBOCTuK
- add activity functions, migration - ([565c6bd](https://github.com/Ku6epXBOCTuK/xboct-log/commit/565c6bd73cbb0f3214d614f461dcc4564ad26b00)) - Ku6epXBOCTuK
- add ui for blocking tasks - ([0c48f23](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0c48f23e2d3e9c895871b1243fab4c9deb57dfc5)) - Ku6epXBOCTuK
- add mcp layer for blocked_by\blocks tasks - ([98dab47](https://github.com/Ku6epXBOCTuK/xboct-log/commit/98dab47ca9a965cb078808cf62397bc043e3f379)) - Ku6epXBOCTuK
- add blocked tasks on db\backend side - ([a3bbede](https://github.com/Ku6epXBOCTuK/xboct-log/commit/a3bbede3663698c8340007066a4bdc644932a120)) - Ku6epXBOCTuK
- add create many tasks - ([543d8f7](https://github.com/Ku6epXBOCTuK/xboct-log/commit/543d8f71946617ada4af704c72145a90e19a38df)) - Ku6epXBOCTuK
- find tasks and epics by short id - ([8e670d8](https://github.com/Ku6epXBOCTuK/xboct-log/commit/8e670d874053ae9c80fae765c2d6cb586f1671a3)) - Ku6epXBOCTuK
- add manual backup - ([1037b7a](https://github.com/Ku6epXBOCTuK/xboct-log/commit/1037b7a2d349d083265221bf11b4e543a7ca0d0b)) - Ku6epXBOCTuK
- update add and edit task forms - ([ede7d4f](https://github.com/Ku6epXBOCTuK/xboct-log/commit/ede7d4f260b431872e6dd3d00d493c643e269e5d)) - Ku6epXBOCTuK
- filter selects - ([53c54f1](https://github.com/Ku6epXBOCTuK/xboct-log/commit/53c54f1f795acc672e080e0c60672a6cb5e65923)) - Ku6epXBOCTuK
- add single select and tag inner components - ([f867647](https://github.com/Ku6epXBOCTuK/xboct-log/commit/f8676476a0c06d2fd3f54d50a058c5cfa0a04a04)) - Ku6epXBOCTuK
- add ui select component - ([d5aa4c5](https://github.com/Ku6epXBOCTuK/xboct-log/commit/d5aa4c579899c5a571fb5bdf35237818e1579eca)) - Ku6epXBOCTuK
- add ui select core logic - ([49960d3](https://github.com/Ku6epXBOCTuK/xboct-log/commit/49960d353eed2e5b9dbbc4bff51de60ee90cdca3)) - Ku6epXBOCTuK
- add missing field in get many tasks query - ([71e4d1d](https://github.com/Ku6epXBOCTuK/xboct-log/commit/71e4d1d0331f64dcd40e4ae6473a22730436ca5b)) - Ku6epXBOCTuK
- add batch close and update tasks - ([14e276d](https://github.com/Ku6epXBOCTuK/xboct-log/commit/14e276da24ccf1c2c6a8de4b9de62bf1ae500e9d)) - Ku6epXBOCTuK
- add include scope with scope name - ([d953d00](https://github.com/Ku6epXBOCTuK/xboct-log/commit/d953d00075e071a635aa86eb866e640efdfd9e95)) - Ku6epXBOCTuK
- short description by default - ([0cbd3e7](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0cbd3e7f1d93672d5dbf0c72e67632d3071ba17b)) - Ku6epXBOCTuK
- tasks query now can search by tags - ([319cc50](https://github.com/Ku6epXBOCTuK/xboct-log/commit/319cc50a1c40e8c48682f87b37b98e4ae58468a4)) - Ku6epXBOCTuK
- add total tasks to query response - ([bec5307](https://github.com/Ku6epXBOCTuK/xboct-log/commit/bec530713b51fccc6fa026bb7a75490152af5b6a)) - Ku6epXBOCTuK
- add force reload button - ([07713bf](https://github.com/Ku6epXBOCTuK/xboct-log/commit/07713bf61f19d9cd3edfb78c7cd15ce8dcc8f889)) - Ku6epXBOCTuK
- add empty kanban page, move nav to layout - ([05d6553](https://github.com/Ku6epXBOCTuK/xboct-log/commit/05d6553427720eaf0d460ee1016ecf5151b6a7fe)) - Ku6epXBOCTuK
- add sse for update tasks on change - ([4f56552](https://github.com/Ku6epXBOCTuK/xboct-log/commit/4f565528b76947c0941f17ff4538f8c5ab08d010)) - Ku6epXBOCTuK
- add mcp server handlers - ([d5d2ae4](https://github.com/Ku6epXBOCTuK/xboct-log/commit/d5d2ae449495e8921af4dba2273b811992f25b57)) - Ku6epXBOCTuK
- redefine operations - ([c9ed92b](https://github.com/Ku6epXBOCTuK/xboct-log/commit/c9ed92b5c0ada1d80d24f747c7dd5813aced8887)) - Ku6epXBOCTuK
- add define\run operations - ([2987ca3](https://github.com/Ku6epXBOCTuK/xboct-log/commit/2987ca346f4f75455fc4c8e0a9dc78932665bb6f)) - Ku6epXBOCTuK
- add registry for operations - ([15cb8e0](https://github.com/Ku6epXBOCTuK/xboct-log/commit/15cb8e00c3a470b8adde6dc1350668821e0b9e58)) - Ku6epXBOCTuK
- add all projects, fix sidebar design - ([ee16e28](https://github.com/Ku6epXBOCTuK/xboct-log/commit/ee16e287e8c80b7ab17855f93ae559d12650d64f)) - Ku6epXBOCTuK
- update banner, detect new version - ([fe2fb7a](https://github.com/Ku6epXBOCTuK/xboct-log/commit/fe2fb7a74eba9c2e7e6892bd93bcf15c921a3ece)) - Ku6epXBOCTuK
- add epic badge and counts - ([57e5422](https://github.com/Ku6epXBOCTuK/xboct-log/commit/57e54221ca513142a09cd7d0d76d6046373b4bce)) - Ku6epXBOCTuK
- add sort to table - ([15f7e48](https://github.com/Ku6epXBOCTuK/xboct-log/commit/15f7e488ae8f5fd81faf7d27937c6cd6566b636a)) - Ku6epXBOCTuK
- add 'hide closed' status chip - ([152f8b6](https://github.com/Ku6epXBOCTuK/xboct-log/commit/152f8b655f77140569a1dd455081f29e0e74ccbd)) - Ku6epXBOCTuK
- delete now soft delete - ([daf998a](https://github.com/Ku6epXBOCTuK/xboct-log/commit/daf998a8a2ccd1f71f6b6f4e83c3e4dd896922d3)) - Ku6epXBOCTuK
- create task on ctrl+enter - ([6d8a946](https://github.com/Ku6epXBOCTuK/xboct-log/commit/6d8a946706c9d202e4a18bfce9226940b89f2f8a)) - Ku6epXBOCTuK
- update components to use single form - ([0e8c303](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0e8c303af0e98cd978e065ae3e2bd6be04800e8a)) - Ku6epXBOCTuK
- update task fields components - ([140b32a](https://github.com/Ku6epXBOCTuK/xboct-log/commit/140b32aa655d2734c8db7fbe360d047d13307261)) - Ku6epXBOCTuK
- split fields logic - ([b87455c](https://github.com/Ku6epXBOCTuK/xboct-log/commit/b87455c89b3311f932d3081ef5dbad9e1f920f88)) - Ku6epXBOCTuK
- unify form elements css - ([7ef2b67](https://github.com/Ku6epXBOCTuK/xboct-log/commit/7ef2b671d09f1b6d6f5b0e00260666f2d3179c63)) - Ku6epXBOCTuK
- add scope filter, scopes in ui - ([a444f27](https://github.com/Ku6epXBOCTuK/xboct-log/commit/a444f2750eb11fcf6027be93d2e28b44e23a5ebd)) - Ku6epXBOCTuK
- add project settings dialog - ([7d7453f](https://github.com/Ku6epXBOCTuK/xboct-log/commit/7d7453fd163bdd3aa2ba039bd18ee9aa451f1b6b)) - Ku6epXBOCTuK
- add scope ui - ([e88684b](https://github.com/Ku6epXBOCTuK/xboct-log/commit/e88684b402cf6f7d5551bf839e230ec0c33a4d9a)) - Ku6epXBOCTuK
- add scope remote functions - ([03a7a80](https://github.com/Ku6epXBOCTuK/xboct-log/commit/03a7a80c15403522731617a174b32d3971a40c54)) - Ku6epXBOCTuK
- add scope schema - ([366461d](https://github.com/Ku6epXBOCTuK/xboct-log/commit/366461d64665a1ee44ffe88f70039cbcc8993706)) - Ku6epXBOCTuK
- move to sqlite migrations - ([1bc510e](https://github.com/Ku6epXBOCTuK/xboct-log/commit/1bc510e49016f215c9cc2ae6bfb398794fbb4b6d)) - Ku6epXBOCTuK
- add check health and offline page - ([37bc5a0](https://github.com/Ku6epXBOCTuK/xboct-log/commit/37bc5a0c8b90554f4a60ae17ac0059816622f27a)) - Ku6epXBOCTuK
- add extension webview - ([ce29506](https://github.com/Ku6epXBOCTuK/xboct-log/commit/ce29506e0d8b757b4e3db24075d6bea1b01f52f6)) - Ku6epXBOCTuK
- add theme flow and health endpoint - ([c53bdf0](https://github.com/Ku6epXBOCTuK/xboct-log/commit/c53bdf075b3263a74a73216acc6e4d16e90b9abc)) - Ku6epXBOCTuK
- inbox ui - first in list, cant be archived - ([cb00a60](https://github.com/Ku6epXBOCTuK/xboct-log/commit/cb00a60ab80ec9a87153ab7a72d4db19d3fd0559)) - Ku6epXBOCTuK
- add move task to ui - ([d428583](https://github.com/Ku6epXBOCTuK/xboct-log/commit/d42858325811e50661c50c01caf1cbbfc2a1b93c)) - Ku6epXBOCTuK
- add move tasks and epic tree - ([1ee686e](https://github.com/Ku6epXBOCTuK/xboct-log/commit/1ee686e6c792e37d68123ccf35c21fc2f5c7c276)) - Ku6epXBOCTuK
- add allocate numbers for tasks - ([1d42096](https://github.com/Ku6epXBOCTuK/xboct-log/commit/1d42096b4332b18e00e04e024afd673e56690ec7)) - Ku6epXBOCTuK
- add inbox, and ensure at start - ([8da3243](https://github.com/Ku6epXBOCTuK/xboct-log/commit/8da32439b0c080e5915521c65d72c6ff3be83586)) - Ku6epXBOCTuK
- add backup scheduler - ([0cfb95d](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0cfb95d5982135e06e9241743b9a24ba27b5eac4)) - Ku6epXBOCTuK
- add tags selector - ([411a65a](https://github.com/Ku6epXBOCTuK/xboct-log/commit/411a65a4481649add9492d91d263e3b03c6a8718)) - Ku6epXBOCTuK
- add close and delete task flow - ([91a5dcb](https://github.com/Ku6epXBOCTuK/xboct-log/commit/91a5dcb862b95f7fb8df9a12639d15df7b91ace7)) - Ku6epXBOCTuK
- projects flow - edit, archive - ([c9c6f4e](https://github.com/Ku6epXBOCTuK/xboct-log/commit/c9c6f4e8901a5b6a414aedca561472e8ea62075e)) - Ku6epXBOCTuK
- add epic flow - ([92208ec](https://github.com/Ku6epXBOCTuK/xboct-log/commit/92208ec2fae8ad7252e694a1f7b009cda8710248)) - Ku6epXBOCTuK
- add ui - edit task and add task - ([5b9b25f](https://github.com/Ku6epXBOCTuK/xboct-log/commit/5b9b25f180efb2b8feb1b5d93766b0bbee43ef3e)) - Ku6epXBOCTuK
- update ui to use real data - ([441cae8](https://github.com/Ku6epXBOCTuK/xboct-log/commit/441cae80817a7c1cffb208a4cb8394c890420078)) - Ku6epXBOCTuK
- add remote functions - ([b3bec53](https://github.com/Ku6epXBOCTuK/xboct-log/commit/b3bec53c34078eeb0d915efff39b1f2ae15de940)) - Ku6epXBOCTuK
- add logic, db layer - ([2864fb1](https://github.com/Ku6epXBOCTuK/xboct-log/commit/2864fb1ee02f8a07a07c05b6c839998abf82df8f)) - Ku6epXBOCTuK
- initial layout from refs - ([06f5972](https://github.com/Ku6epXBOCTuK/xboct-log/commit/06f5972eab08f1d83e4dad7a23595c6e69a5ca2d)) - Ku6epXBOCTuK
#### Bug Fixes
- status filter - hover on closed chip - ([4fccd01](https://github.com/Ku6epXBOCTuK/xboct-log/commit/4fccd01f43cf28a6fa14c8ca95643b9b19844353)) - Ku6epXBOCTuK
- update use of ui-kit - ([a345a59](https://github.com/Ku6epXBOCTuK/xboct-log/commit/a345a594aa19d44249017ce59072ce4d8f369cec)) - Ku6epXBOCTuK
- update id fields to use more consistency naming - ([3c1d3a8](https://github.com/Ku6epXBOCTuK/xboct-log/commit/3c1d3a80c69121af2ac5b75a0be983f42aca13d0)) - Ku6epXBOCTuK
- update attachments flow - ([3d0e20e](https://github.com/Ku6epXBOCTuK/xboct-log/commit/3d0e20e0db70d34494264049bfb7a4b98e9e1b7f)) - Ku6epXBOCTuK
- nav counts - ([0db2eee](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0db2eee633b7b196c208ffe8db6f94d939c7fcca)) - Ku6epXBOCTuK
- use uuid v7 instead of custom comment id - ([5275c09](https://github.com/Ku6epXBOCTuK/xboct-log/commit/5275c0930808d2d767384c26b395f972baedea98)) - Ku6epXBOCTuK
- migrations - ([aa1d53e](https://github.com/Ku6epXBOCTuK/xboct-log/commit/aa1d53e11a4b76a0958f49f16171355808fb85cb)) - Ku6epXBOCTuK
- update edit\create task fields orders - ([b0030a6](https://github.com/Ku6epXBOCTuK/xboct-log/commit/b0030a65a248eaf980a38fb06aa547395b252376)) - Ku6epXBOCTuK
- update mcp warnings about scope\tags - ([6d8e10f](https://github.com/Ku6epXBOCTuK/xboct-log/commit/6d8e10f4b317967bf9d036cac9f0568c98b6298f)) - Ku6epXBOCTuK
- warns about no tags set - ([2b184b5](https://github.com/Ku6epXBOCTuK/xboct-log/commit/2b184b554943ad67a25488c07e55260b4dbc0748)) - Ku6epXBOCTuK
- no scope badge - ([b012990](https://github.com/Ku6epXBOCTuK/xboct-log/commit/b0129902ea4db004f0700d2e62616d48245e6422)) - Ku6epXBOCTuK
- epic badge counts - ([2b90264](https://github.com/Ku6epXBOCTuK/xboct-log/commit/2b902640a53d1af5e09871237f326f8bb7cbd461)) - Ku6epXBOCTuK
- search by exact id - ([33ce9ba](https://github.com/Ku6epXBOCTuK/xboct-log/commit/33ce9badebcc44cf8db731a159428b3c5c12ba74)) - Ku6epXBOCTuK
- task snapshot limit, single source of truth - ([44d710f](https://github.com/Ku6epXBOCTuK/xboct-log/commit/44d710f474641ed0a5b1a94a1a0ec36f8a072164)) - Ku6epXBOCTuK
- remove tasks_boards tool - ([ce1b426](https://github.com/Ku6epXBOCTuK/xboct-log/commit/ce1b426e2b9ab0f6e8392b840f58e87333dab467)) - Ku6epXBOCTuK
- show selected task and other project - ([36fbd55](https://github.com/Ku6epXBOCTuK/xboct-log/commit/36fbd552506439c25eefba17919d33f439a641e6)) - Ku6epXBOCTuK
- better tag input - ([088982c](https://github.com/Ku6epXBOCTuK/xboct-log/commit/088982c11cfa2fea4e4a4c8ca084350f783e2eb1)) - Ku6epXBOCTuK
- update blocked no reason icon - ([e5b0833](https://github.com/Ku6epXBOCTuK/xboct-log/commit/e5b0833fc736f811abfc2b215eb386880780a6ed)) - Ku6epXBOCTuK
- update description - ([52976a5](https://github.com/Ku6epXBOCTuK/xboct-log/commit/52976a5c5d2d0ea2e89a52a86b0c713accc74217)) - Ku6epXBOCTuK
- tasks in list always get id\project\title\status - ([c1cb345](https://github.com/Ku6epXBOCTuK/xboct-log/commit/c1cb34512d9626ced3b5dba3f9889f3b26212d3d)) - Ku6epXBOCTuK
- normalize repo url - ([684e7c7](https://github.com/Ku6epXBOCTuK/xboct-log/commit/684e7c7220f134b9308f9d0939d0ee612b09a400)) - Ku6epXBOCTuK
- return migration to old version, now 006 dont need to know about older migrations - ([addc302](https://github.com/Ku6epXBOCTuK/xboct-log/commit/addc302aba22e18f201e9b98be5fd1cd3ecd6647)) - Ku6epXBOCTuK
- epics now hardcoded as flat - ([74e4ff1](https://github.com/Ku6epXBOCTuK/xboct-log/commit/74e4ff15617d8cad37084bfc22e4e962828474ad)) - Ku6epXBOCTuK
- update blocked badge - ([2297054](https://github.com/Ku6epXBOCTuK/xboct-log/commit/2297054040e4333f215f3f143e14f46e75f09e4c)) - Ku6epXBOCTuK
- update objects schema to zod descriptions - ([aa36723](https://github.com/Ku6epXBOCTuK/xboct-log/commit/aa3672327f05b3cb753c0fa98cbc9aff9029a8fb)) - Ku6epXBOCTuK
- filter use new table - ([e8d4db4](https://github.com/Ku6epXBOCTuK/xboct-log/commit/e8d4db473d6d07987f5e34644eae0870d2d301ba)) - Ku6epXBOCTuK
- epics demote and epic cycle - ([fb7ca78](https://github.com/Ku6epXBOCTuK/xboct-log/commit/fb7ca78407c351066770354e84809dd4b12f3e8c)) - Ku6epXBOCTuK
- update move task flow - ([6c4221c](https://github.com/Ku6epXBOCTuK/xboct-log/commit/6c4221c4ea8916a07d17b1f684f57a86bf27e542)) - Ku6epXBOCTuK
- ctrl+v paste only works for images - ([022b6bf](https://github.com/Ku6epXBOCTuK/xboct-log/commit/022b6bf636c5be00ad488377d99e96f499e31f19)) - Ku6epXBOCTuK
- reactive client side attachments count - ([ead994d](https://github.com/Ku6epXBOCTuK/xboct-log/commit/ead994d074892e8fbf79affd3ba04c1bad9b0558)) - Ku6epXBOCTuK
- add attachments count to tasks - ([2a2b4c1](https://github.com/Ku6epXBOCTuK/xboct-log/commit/2a2b4c1c8b1fa8d5d179c5dfba401fa8d88ca605)) - Ku6epXBOCTuK
- search icon border - ([8621d56](https://github.com/Ku6epXBOCTuK/xboct-log/commit/8621d56c4f9295a705741b2f826ac1c542a868ca)) - Ku6epXBOCTuK
- use custom db function ULOWER for compare strings - ([1431185](https://github.com/Ku6epXBOCTuK/xboct-log/commit/14311852467ac35c4f11be1a61a08a891f4defc5)) - Ku6epXBOCTuK
- tags now case insensitive - ([ba87f86](https://github.com/Ku6epXBOCTuK/xboct-log/commit/ba87f86d72a50e98f5dd8abc4191d12c4a4cb7be)) - Ku6epXBOCTuK
- tags search can use status and projects one or list - ([8d70687](https://github.com/Ku6epXBOCTuK/xboct-log/commit/8d7068750bf083a475a4204385e2b998ff0da536)) - Ku6epXBOCTuK
- search with array, project list, tag, epic - ([30a9e60](https://github.com/Ku6epXBOCTuK/xboct-log/commit/30a9e60599de23bbdb7ff91b7fc6315b6ae7fa97)) - Ku6epXBOCTuK
- all tools return consistent results - ([7628a20](https://github.com/Ku6epXBOCTuK/xboct-log/commit/7628a20991e5b6a523b2879624073949b7df9dd6)) - Ku6epXBOCTuK
- better filters ux - ([55e6f12](https://github.com/Ku6epXBOCTuK/xboct-log/commit/55e6f12e885449b9cdf5afe0ec92fb9d4279678e)) - Ku6epXBOCTuK
- table rows in tags - ([21f969e](https://github.com/Ku6epXBOCTuK/xboct-log/commit/21f969ea5b833f99bda8bfc4e3f7188b55d12d9b)) - Ku6epXBOCTuK
- table columns - ([4e3d139](https://github.com/Ku6epXBOCTuK/xboct-log/commit/4e3d1395d38fa30c76325ec6e995b0542265d93d)) - Ku6epXBOCTuK
- dev empty db flow - ([465d0c7](https://github.com/Ku6epXBOCTuK/xboct-log/commit/465d0c765d1facf22415f265595957c4427618ae)) - Ku6epXBOCTuK
- tags filter shows only projects tags - ([0d41381](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0d413814ca2990be2bea298bd7f70cdd263ebce2)) - Ku6epXBOCTuK
- update sidebar - nav, backup button - ([5d460b9](https://github.com/Ku6epXBOCTuK/xboct-log/commit/5d460b9bd956e072859d3d01fd5cce3d8352d74e)) - Ku6epXBOCTuK
- update task creation log - ([907d124](https://github.com/Ku6epXBOCTuK/xboct-log/commit/907d12497cacd862b7a1c9e65a3f066737e294da)) - Ku6epXBOCTuK
- update mcp and comments descriptions - ([e6a19ae](https://github.com/Ku6epXBOCTuK/xboct-log/commit/e6a19ae8f042b80375ce7a5dcc5573ab3ffb8bb4)) - Ku6epXBOCTuK
- include descriptions remove short descriptions from output - ([81c19d4](https://github.com/Ku6epXBOCTuK/xboct-log/commit/81c19d4cf86e73a458bd9b00db4cf44a6bcd62b9)) - Ku6epXBOCTuK
- make env vars static - ([c62590c](https://github.com/Ku6epXBOCTuK/xboct-log/commit/c62590cf40ea23752a99322dec833bb704a09a97)) - Ku6epXBOCTuK
- search projects find case insensitive - ([eea6276](https://github.com/Ku6epXBOCTuK/xboct-log/commit/eea62760f29a6edfcecd663cd8d55295cd2665f9)) - Ku6epXBOCTuK
- update close task button - ([ffe655b](https://github.com/Ku6epXBOCTuK/xboct-log/commit/ffe655b34ca9ab489ca68918793c90b1d8aaf693)) - Ku6epXBOCTuK
- update details task view - ([dc61f58](https://github.com/Ku6epXBOCTuK/xboct-log/commit/dc61f5835727e7d7f008b760b2593a328f9c6e21)) - Ku6epXBOCTuK
- add project filter on activity page - ([47885a6](https://github.com/Ku6epXBOCTuK/xboct-log/commit/47885a6e9602b8cb8a9a2bbbcd63aab1d6451ed9)) - Ku6epXBOCTuK
- update tool description - ([99ec0aa](https://github.com/Ku6epXBOCTuK/xboct-log/commit/99ec0aa25b6a7718f60ce6c0698208599f478223)) - Ku6epXBOCTuK
- find epics by short id in projects - ([acb29b5](https://github.com/Ku6epXBOCTuK/xboct-log/commit/acb29b56f1ff3bd60d7baa330c214ac07332f0dd)) - Ku6epXBOCTuK
- find tasks by short id in projects - ([1d64fce](https://github.com/Ku6epXBOCTuK/xboct-log/commit/1d64fce40d29a484f97ed4625dd5569a847a37ff)) - Ku6epXBOCTuK
- add non-reproduced reason - ([8db6a29](https://github.com/Ku6epXBOCTuK/xboct-log/commit/8db6a2997844fcf2cca2f922bfde513992bc2bd3)) - Ku6epXBOCTuK
- task count when find by scope - ([38994c0](https://github.com/Ku6epXBOCTuK/xboct-log/commit/38994c056c64dc7cbbc12f76727d4032c794ba31)) - Ku6epXBOCTuK
- keep filters unambiguous - ([3ac5eec](https://github.com/Ku6epXBOCTuK/xboct-log/commit/3ac5eecf0fed5b62c06843258284061b8ba3ab02)) - Ku6epXBOCTuK
- add include deleted in mcp - ([23d3c7d](https://github.com/Ku6epXBOCTuK/xboct-log/commit/23d3c7df433ff5f9aae9a87ee2827f3da2e6100e)) - Ku6epXBOCTuK
- add find scope to mcp - ([23c03e0](https://github.com/Ku6epXBOCTuK/xboct-log/commit/23c03e0fe752dc69a8328d8ede6479fe6b00bd1b)) - Ku6epXBOCTuK
- remove doubled tool - ([89aa875](https://github.com/Ku6epXBOCTuK/xboct-log/commit/89aa875048aa694e867aec4f101758c76b746782)) - Ku6epXBOCTuK
- add tasks_list default limit 100 - ([ed2dd88](https://github.com/Ku6epXBOCTuK/xboct-log/commit/ed2dd888d3cdd04f8acb4f8458f4539356f08c80)) - Ku6epXBOCTuK
- add closed reasons, update mcp texts - ([474f3a8](https://github.com/Ku6epXBOCTuK/xboct-log/commit/474f3a8abd187c9385544598560869f244768564)) - Ku6epXBOCTuK
- add project_archived flag - ([56bc0bf](https://github.com/Ku6epXBOCTuK/xboct-log/commit/56bc0bf3f1264e091f382b2ee5393b0fc5c9238f)) - Ku6epXBOCTuK
- validate fields - ([541acba](https://github.com/Ku6epXBOCTuK/xboct-log/commit/541acba7c5a3a0995e50cd18a5ec1491ab6be647)) - Ku6epXBOCTuK
- project archived_at field instead of deleted_at - ([71a546a](https://github.com/Ku6epXBOCTuK/xboct-log/commit/71a546aa55bb96c0b15f7f20e6cbe5cd64252917)) - Ku6epXBOCTuK
- update mcp find flow - structured content and status string - ([a1b8acf](https://github.com/Ku6epXBOCTuK/xboct-log/commit/a1b8acf9d5cf9eb62f5fd6ceaf40968e4756c7fc)) - Ku6epXBOCTuK
- update mcp definitions - better find - ([c9773ee](https://github.com/Ku6epXBOCTuK/xboct-log/commit/c9773ee3d9e92ab0da351e52a45f48cb5b5e055e)) - Ku6epXBOCTuK
- priority order on edit\create task - ([b256dbb](https://github.com/Ku6epXBOCTuK/xboct-log/commit/b256dbb09ff73865ebdb72dad4bdadeff4f2bcce)) - Ku6epXBOCTuK
- header shows project name - ([596de23](https://github.com/Ku6epXBOCTuK/xboct-log/commit/596de236bc678a246c4d0f2aff964a809efb881f)) - Ku6epXBOCTuK
- force refetch without cache - ([5570591](https://github.com/Ku6epXBOCTuK/xboct-log/commit/55705911a8e16d83d4ea846666146edd41dd8375)) - Ku6epXBOCTuK
- sidebar project buttons - ([b96a8a0](https://github.com/Ku6epXBOCTuK/xboct-log/commit/b96a8a025207861e70c0c90fe9f7d037575eb4ce)) - Ku6epXBOCTuK
- select epics for project, refactor filters - ([a9b5690](https://github.com/Ku6epXBOCTuK/xboct-log/commit/a9b5690d1062db93ae8e1dbba82d44598d1822eb)) - Ku6epXBOCTuK
- update count tasks - ([e754bff](https://github.com/Ku6epXBOCTuK/xboct-log/commit/e754bff1593dfcc24046b635d9b98ab800800cf6)) - Ku6epXBOCTuK
- ctrl+tab switch tabs - ([8baf8af](https://github.com/Ku6epXBOCTuK/xboct-log/commit/8baf8affaec08141caaf9861c2898e99a56510e9)) - Ku6epXBOCTuK
- sidepanel over select - ([6037338](https://github.com/Ku6epXBOCTuK/xboct-log/commit/6037338b8c3393cad5e7d8fa2db9822c348e96b6)) - Ku6epXBOCTuK
- esc blurs select field in edit task form - ([21215f9](https://github.com/Ku6epXBOCTuK/xboct-log/commit/21215f9177427cb2099f89ada1cb880217f816c5)) - Ku6epXBOCTuK
- empty epic shows as outline, tasks in epic - green badge - ([a02c817](https://github.com/Ku6epXBOCTuK/xboct-log/commit/a02c8176ed5a41a8eb8fc21815a655cefe5a1907)) - Ku6epXBOCTuK
- filter closed epics from select - ([f37ccc0](https://github.com/Ku6epXBOCTuK/xboct-log/commit/f37ccc0d67ab160a15d75f4e7f37d83bfc6e1089)) - Ku6epXBOCTuK
- update status\priority colors - ([6beb218](https://github.com/Ku6epXBOCTuK/xboct-log/commit/6beb218cee91598c61343ce91ba98db52316e792)) - Ku6epXBOCTuK
- warn about comparing proxy - ([94834dd](https://github.com/Ku6epXBOCTuK/xboct-log/commit/94834dd7c1db27ff02247dee1d5a4be68fc197b0)) - Ku6epXBOCTuK
- blur textarea before save - ([8e8c958](https://github.com/Ku6epXBOCTuK/xboct-log/commit/8e8c95810b7406972af7923b6586d476fcb10c4b)) - Ku6epXBOCTuK
- create task - select default project and scope - ([b20c3fc](https://github.com/Ku6epXBOCTuK/xboct-log/commit/b20c3fc599e0c50c47956e9c1fe37e7a94fa76f9)) - Ku6epXBOCTuK
- remove select task after create - ([59be59b](https://github.com/Ku6epXBOCTuK/xboct-log/commit/59be59b8cdad6c1cf5b62ead75172d7dffdcd6fa)) - Ku6epXBOCTuK
- update icon button component - ([6261068](https://github.com/Ku6epXBOCTuK/xboct-log/commit/6261068a1b60e188786a9c3750e72489adba7b52)) - Ku6epXBOCTuK
- detail panel: close on esc, update ui - ([dba042c](https://github.com/Ku6epXBOCTuK/xboct-log/commit/dba042cc690a65b9b1a59222870d9abcc2dbbf2f)) - Ku6epXBOCTuK
- reduce edge paddings - ([b778639](https://github.com/Ku6epXBOCTuK/xboct-log/commit/b7786398be96f61c3b5353bafabc44c0c39615eb)) - Ku6epXBOCTuK
- scope shown as empty - ([c62df32](https://github.com/Ku6epXBOCTuK/xboct-log/commit/c62df32ac8502af3865ab0183467ec4abc6d3511)) - Ku6epXBOCTuK
- lint \ check issue - ([bf8cf01](https://github.com/Ku6epXBOCTuK/xboct-log/commit/bf8cf01aeb50416fdc834e6021e7f2468144a011)) - Ku6epXBOCTuK
- remove unused components, use sveltemap - ([0910c67](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0910c67bcf1b6c624b1a809191f4e94cc6b46111)) - Ku6epXBOCTuK
- update ui design - ([3927a77](https://github.com/Ku6epXBOCTuK/xboct-log/commit/3927a77f6c2896d0c13437969402110b96b2bc43)) - Ku6epXBOCTuK
#### Refactoring
- update - use badges from ui - ([c6b5b87](https://github.com/Ku6epXBOCTuK/xboct-log/commit/c6b5b87250ad542512337d47e6a48979f4f2c422)) - Ku6epXBOCTuK
- use more ui-kit modal - ([a0ede51](https://github.com/Ku6epXBOCTuK/xboct-log/commit/a0ede51100540bf799f492af0534d056bc11de6d)) - Ku6epXBOCTuK
- use ui-kit icon-button and modal - ([e3ff15d](https://github.com/Ku6epXBOCTuK/xboct-log/commit/e3ff15d65c83c3025ef91993fc4a7709adf2c7b0)) - Ku6epXBOCTuK
- move select to ui-kit components - ([48294cf](https://github.com/Ku6epXBOCTuK/xboct-log/commit/48294cfa9a011c9221a7a732bf2256195d60b4af)) - Ku6epXBOCTuK
- move to ui-kit, add ui-compat css - ([0335025](https://github.com/Ku6epXBOCTuK/xboct-log/commit/033502503db3f7a74ffa0e83e7c17e717bf65088)) - Ku6epXBOCTuK
- use single components for tooltips\popovers - ([13ee0c4](https://github.com/Ku6epXBOCTuK/xboct-log/commit/13ee0c4c35e0cf8817f782edc74e6caf553cc4b2)) - Ku6epXBOCTuK
- split activity page by components - ([29655d2](https://github.com/Ku6epXBOCTuK/xboct-log/commit/29655d2b2c709dd74fcf7386dd86a82a051104e7)) - Ku6epXBOCTuK
- attachments list and item components - ([5bf6b18](https://github.com/Ku6epXBOCTuK/xboct-log/commit/5bf6b18045b41731fab590d256d8b6cb240baa68)) - Ku6epXBOCTuK
- single entry for add files - ([32201cf](https://github.com/Ku6epXBOCTuK/xboct-log/commit/32201cf84323e72c7d22829d2dfb6a3d10c49af9)) - Ku6epXBOCTuK
- remove doubling pager, split detail and overlay - ([6174938](https://github.com/Ku6epXBOCTuK/xboct-log/commit/61749385631471006b44509b381b34ab718547b1)) - Ku6epXBOCTuK
- remove doubles: count scope and tasks, scheduler - ([acf3343](https://github.com/Ku6epXBOCTuK/xboct-log/commit/acf334376f99490d58e93c05b4d571355469f760)) - Ku6epXBOCTuK
- resolveTaskOrThrow helper, tasks filter - ([e3a3023](https://github.com/Ku6epXBOCTuK/xboct-log/commit/e3a3023a210f1e92b012e598cc309e7ad8094eda)) - Ku6epXBOCTuK
- withTransaction function - ([b840a03](https://github.com/Ku6epXBOCTuK/xboct-log/commit/b840a03f4272537b426d0dc77e66ee1df2da788a)) - Ku6epXBOCTuK
- use modal component - ([c7a821c](https://github.com/Ku6epXBOCTuK/xboct-log/commit/c7a821ca9397f0942e32dc25dda799121c66b94d)) - Ku6epXBOCTuK
- split tasks.ts file - ([e47512b](https://github.com/Ku6epXBOCTuK/xboct-log/commit/e47512bbf5721547783a237c177c831bca479bdd)) - Ku6epXBOCTuK
- split css, move to components - ([31ba244](https://github.com/Ku6epXBOCTuK/xboct-log/commit/31ba2447d6a70a84241cff3f8ced57965deda9ba)) - Ku6epXBOCTuK
- split to srp components - ([9b988c6](https://github.com/Ku6epXBOCTuK/xboct-log/commit/9b988c6304c73b8f4ddb0aeac0fc9d63b49b7c0a)) - Ku6epXBOCTuK
- split components - ([0071b22](https://github.com/Ku6epXBOCTuK/xboct-log/commit/0071b227d54c49a5547fd651479bb6252e0f326e)) - Ku6epXBOCTuK

- - -

Changelog generated by [cocogitto](https://github.com/cocogitto/cocogitto).
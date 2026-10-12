# DeepSeek Harness plugin map (generated)

Generated from the installed `@deepseek-ai/*` package READMEs (287 packages, harness 0.2.0-rc.2, 2026-10-13).
Machine-readable twin: `plugin-map.json` (group / desc / summary / kv / tok).
**Key column**: `cache` = ⚠️ when the package can invalidate provider prefix reuse from the first changed token.

| group | packages |
|---|---|
| ? | 115 |
| session | 19 |
| util | 12 |
| shell | 10 |
| llm | 9 |
| core | 8 |
| fs | 7 |
| experimental | 7 |
| bundle | 6 |
| context | 6 |
| credentials | 5 |
| compaction | 5 |
| interaction | 5 |
| skill | 5 |
| subagent | 5 |
| boot | 4 |
| goal | 4 |
| sandbox | 4 |
| web | 4 |
| preset | 3 |
| extensions | 3 |
| jobs | 3 |
| session-query | 3 |
| spill | 3 |
| storage | 3 |
| subprocess | 3 |
| workflow | 3 |
| attachment | 2 |
| feedback | 2 |
| mcp | 2 |
| ptc-runtime | 2 |
| terminal | 2 |
| deliverables | 2 |
| acp | 1 |
| identity | 1 |
| client | 1 |
| document | 1 |
| telemetry | 1 |
| plan | 1 |
| guard | 1 |
| schedule | 1 |
| settings | 1 |
| todo | 1 |
| workspace | 1 |

## ? (115)

- **cordis** — 
- **cordis-plugin-group** — 
- **cordis-plugin-include** — 
- **cordis-plugin-loader** — 
- **cordis-plugin-timer** — 
- **cosmokit** — 
- **dsh** — 
- **dsh-api-account-controller** — Account screens use authenticated Remote commands and a snapshot stream. The controller exposes login state without returning tokens or PKCE secrets.
- **dsh-api-gateway** — Typed Client-to-Host calls and streams: dispatch, validation, cancellation, reconnection, and forwarded Host events.
- **dsh-api-job-controller** — Host and Client job control: the roster one session can see and one job's retained output, mirrored to the browser without touching the model's consum
- **dsh-api-remotes** — Application Remote assembly: selects typed Host capabilities and forwarded events for Client consumers.
- **dsh-api-session-controller** — Host and Client session control: create, resume, prompt, follow history, and project live session state.
- **dsh-api-settings-controller** — Host Remote owner for settings and credential configuration surfaces, including redacted reads, writes, credential references, and native document ope
- **dsh-api-terminal-controller** — Interactive user terminals with execution-environment shell defaults, bounded screen recovery and typed Remote control.
- **dsh-api-workspace-controller** — Host and Client workspace control: mutate workspace navigation and follow its complete projection.
- **dsh-api-workspace-files** — Workspace file service for the web GUI: bounded reads and target-scoped filesystem watches, plus directory listing inside the Session workspace root.
- **dsh-client-connection** — Browser-host wire layer for the web GUI: Remote RPC, event-stream delivery with reconnect, exact Fetch routes, the /api HTTP bridge, and the browser-t
- **dsh-client-file-upload** — Session-addressed browser file uploads with streaming intake, progress, cancellation, and staged receipts for later prompts.
- **dsh-client-hmr** — Live graph synchronization and development bundle reloads for Web client plugins.
- **dsh-client-locale** — Localization for the web GUI: the zh/en preference, browser-derived fallback, typed namespace dictionaries, and the framework translation seat, for us
- **dsh-client-modules** — Client module system for the web GUI: the host composes the boot graph and serves plugin bundles, and the browser loads them lazily, for users and mai
- **dsh-client-product-analytics** — Configure Desktop product analytics, identity fields, and event timing without collecting Web usage.
- **dsh-client-resources** — Client resource model: protocol-registered providers turn URL addresses into live values that any slot component reads through the useResource standar
- **dsh-client-shortcuts** — Customize application keyboard commands for each device
- **dsh-client-store** — Observable browser state stores with explicit snapshots, subscriptions, and lifecycle ownership.
- **dsh-client-ui-agent-preset** — Choose Agent presets and the new-task default in Web, read what each mode does and what it declares. Authoring is guided to Creator mode.
- **dsh-client-ui-approval** — Browser approval UI that answers Host permission requests through the scoped interaction path.
- **dsh-client-ui-attachment** — Attachment presentation for the conversation UI: mixed draft-attachment rail, document drop target, history-image gallery, and original-image lightbox
- **dsh-client-ui-brand-official** — Official DeepSeek Harness brand occupants for the sidebar, active only in official builds; for users and maintainers choosing or replacing brand prese
- **dsh-client-ui-chat** — Browser Chat target that renders Session conversation nodes, historical images, actions, localization, and scroll state.
- **dsh-client-ui-commands** — Client command API for the Web GUI: the / command source, three dispatch kinds, the per-session command directory, and popupSelect and action registra
- **dsh-client-ui-conversation** — Target-neutral conversation assembly and browser shell: event and view registries, per-session bindings, input state, slots, and temporary composer ta
- **dsh-client-ui-cordis** — Historical Cordis cards and controls for process-local runner definitions.
- **dsh-client-ui-deliverables** — Changed files, deliveries, and clickable file references for the Web GUI: the changed-files card and delivery cards a finished turn ends with, the rev
- **dsh-client-ui-directory-picker-browse** — In-app directory-browsing surface: the Miller-column Select Workspace Directory dialog that fills workspace directory flows; for users and maintainers
- **dsh-client-ui-directory-picker-native** — Native directory-picker surface: the browser half that drives the local Desktop or Host OS chooser for workspace-directory flows; for users and mainta
- **dsh-client-ui-goal** — Goal surface for the Web GUI: the composer-context strip that shows the current goal and edits, pauses, resumes, or clears it; for users and maintaine
- **dsh-client-ui-input-trigger** — Input trigger pipeline for the Web GUI: / and @ detection under the caret, the grouped candidate menu, and pick routing to registered sources; for use
- **dsh-client-ui-jobs** — The session-header background-job list: expandable streaming output panels, running/finished sections, and static rows for settled jobs without retain
- **dsh-client-ui-layout** — Shell layout for the Web GUI: the three-column AppFrame whose right column is a track for an edge-anchored panel, the panel-geometry service, and them
- **dsh-client-ui-message-feedback** — The Web feedback surface: the Like/Dislike pair in the finalized assistant message's action row, the feedback dialog behind both ratings and `/feedbac
- **dsh-client-ui-model-selection** — Model selection for the Web GUI: the /model popup and the composer model seat over one per-session provider-grouped directory; for users and maintaine
  - ⚠️ cache: Switching the route can reduce or invalidate provider-side cache reuse for subsequent requests; the prompt prefix itself is untouched.
- **dsh-client-ui-open-in-app** — Web \"Open In...\" controls: the Session-header split button launching the remembered application on the workspace directory, and the document preview
- **dsh-client-ui-permission-presets** — Permission preset surfaces for the Web GUI: the General settings default row and the /permission picker for the current session; for users and maintai
  - ⚠️ cache: No direct invalidation; the knob consumers own any request-prefix changes.
- **dsh-client-ui-plan** — Plan-mode status chip for the Web GUI: the composer control that shows plan mode is on and turns it off; for users and maintainers of plan mode.
- **dsh-client-ui-plugin-manager** — Manage the profile's plugin bundles, their rows, and the plugins' configuration from the Web sidebar.
- **dsh-client-ui-primitives** — Shared React UI atoms for the dsh web client: controls, icons, markdown and math rendering, and the terminal/read/diff/search/web output cards (zero C
- **dsh-client-ui-reference** — Web @file and @session reference source for the composer: candidates, ordering, and atomic inline references (unified file/session picking).
- **dsh-client-ui-renderer** — Browser UI renderer: React bindings for ordinary Slots and reusable Component Factories, ctx.uiRenderer, and the assembled dsh web application root.
- **dsh-client-ui-schedule** — Web task management across Sessions and a current-Session reminder catalog.
- **dsh-client-ui-session** — React and Slot adapters for Session Controller lists, interaction state, and per-session context.
- **dsh-client-ui-settings** — Settings domain base plugin: shared configuration forms, schema service, and the canonical settings slot-type contract for the dsh web client.
- **dsh-client-ui-settings-account** — Desktop Account settings display DeepSeek login state and offer browser authorization and cancellation; the sidebar account menu provides Platform sig
- **dsh-client-ui-settings-agent-loop** — The agent loop's settings page on the dsh web client's Plugins page: the parallel tool-call cap of the agent-loop namespace.
- **dsh-client-ui-settings-general** — Settings shell, ownerless copy, and durable product-onboarding namespace for the dsh web client: the General section, trigger chrome, and onboarding l
- **dsh-client-ui-settings-models** — Models settings and product-onboarding plugin for the dsh web client: provider rows, API-key management, model lists, and the DeepSeek first-run dialo
- **dsh-client-ui-settings-plugin-inventory** — Scope-grouped read-only plugin inventory tab in Web Plugins settings for the dsh web client: agent-preset compositions first, the global plane behind 
- **dsh-client-ui-settings-plugins** — Built-in plugins settings section for the dsh web client: the Settings navigation entry and the tab chrome that feature-owned tabs register into.
- **dsh-client-ui-settings-session-log** — Control Session-log upload with DeepSeek API requests from General settings.
- **dsh-client-ui-settings-shell** — The shell executor's settings page on the dsh web client's Plugins page: the command timeout and the per-stream output cap of the shell namespace.
- **dsh-client-ui-settings-subagent** — The Subagent settings page on the dsh web client's Plugins page: delegation depth and capacity over the subagent namespace, and the models agents may 
- **dsh-client-ui-settings-web-search** — The DeepSeek web-search provider's settings page on the dsh web client's Plugins page: its API key, endpoint, and per-request search budget.
- **dsh-client-ui-shortcuts** — Browse the commands available in the current window and find them by action, English alias, or key
- **dsh-client-ui-sidebar** — Sidebar shell plugin for the dsh web client: brand row, New Session action, collapse control, scroll-aware region seat, and bottom-pinned Settings sea
- **dsh-client-ui-sidebar-browser** — Right-Sidebar browser tabs for sandboxed HTTP(S) pages, including loopback services.
- **dsh-client-ui-sidebar-documentpreview** — Document previews in the right Sidebar: shared file loading and controls, selectable Markdown, code, image, PDF, Office and HTML renderers, and plain-
- **dsh-client-ui-sidebar-files** — The right Sidebar's file-tree tab type for the dsh web client: the session workspace root listed one level at a time over the wire, opening files into
- **dsh-client-ui-sidebar-right** — The right Sidebar of the dsh web client: one docking surface per session, two presentations, the navigation controller ctx.sidebarRight, the tab-type 
- **dsh-client-ui-sidebar-terminal** — Open, recover and control interactive shell tabs in the Web right sidebar.
- **dsh-client-ui-skill** — Web skill references and the dedicated skill tool row for the dsh web client: the /-triggered skill source and the skill call card.
- **dsh-client-ui-slots** — Slot registry pure core for the dsh web client: ordinary extension slots, reusable Component Factories, derived props types, store seats, and the rend
- **dsh-client-ui-subagent** — Subagent conversation catalog, continuation routing UI, and '@' reference source for the dsh web client.
- **dsh-client-ui-theme** — Theme and content-font-size settings for the dsh web client: --dsw-* token stylesheets, ThemeRuntime state, General settings rows, and the pre-plugin 
- **dsh-client-ui-tool** — Client Tool presentation plugin for the dsh web client: whole-call tree composition, the keyed per-tool view slot, and the built-in atomic tool cards.
- **dsh-client-ui-trajectory** — Trajectory view for the dsh web client: a turn-aware event ledger with an interactive timing overview, registered into the conversation view ring.
- **dsh-client-ui-user-questions** — Web ask_user_question feature for the dsh web client: the attached question card, timed wait, drafts, late replies, and the plan-review approval card.
  - ⚠️ cache: No direct invalidation; `dsh-tool-ask-user` owns the model-visible tool call and result.
- **dsh-client-ui-workflow-run** — Durable workflow-run Conversation Node for the dsh web client: reconstructs top-level workflow runs as independent chat nodes with nested member discl
- **dsh-client-ui-workspace** — Shared Workspace browser and picker plugin for the dsh web client: grouped or flat session rows, management actions, the slot-composed Session row act
- **dsh-experimental-agent-team** — Run a small team of named agents in one session: durable messages between members and a shared task board, for deployments composing the experimental 
- **dsh-experimental-agent-team-profile** — Enable team collaboration, tools, and the Web roster and task board with one experimental bundle.
- **dsh-experimental-api-speech-to-text** — Expose bounded transient transcription through the authenticated Web Remote.
- **dsh-experimental-auto-review** — Add experimental per-call Auto review to a Web profile, using the current agent's model before tools execute with Full access.
- **dsh-experimental-client-ui-agent-team** — Use and debug the experimental Web Agent Teams roster, shared task board, and teammate navigation panel.
- **dsh-experimental-client-ui-voice-input** — Record speech and insert reviewable transcripts into the conversation draft.
- **dsh-experimental-schedule-bundle** — Add Schedule, its reminder catalog, and the Automation tasks page from the plugin manager.
  - ⚠️ cache: The tool schemas change the request prefix once when the bundle mounts; each appended reading is new visible content after that prefix, so existing entries are not invalidated.
- **dsh-experimental-speech-to-text** — Named experimental transcription providers and cancellation ownership.
- **dsh-experimental-speech-to-text-sensevoice** — Prepare and operate a local CPU SenseVoice worker on demand.
- **dsh-experimental-tool-agent-team** — Nine tools that let the model create, message, and coordinate teammates, for compositions mounting the experimental Team plugins.
- **dsh-experimental-voice-input-bundle** — Enable experimental speech input from the plugin manager.
- **dsh-host-directory-picker** — Workspace-directory picking seam for the web GUI host: the service contract, capability vocabulary, and error codes the native and browse backends imp
- **dsh-host-directory-picker-auto** — Adaptive chooser of the directory-picker seam: resolves the web GUI host's situation once at boot and mounts the matching native or browse backend.
- **dsh-host-directory-picker-browse** — In-app browsing backend of the directory-picker seam: one-level directory listing and child-directory creation for the web GUI host, serving remote cl
- **dsh-host-directory-picker-native** — Native-OS-chooser backend of the directory-picker seam: opens one platform chooser per pick for operators sitting at the web GUI host's display.
- **dsh-host-frontend-static** — SPA dist server for the Web shell: claims the webserver fallback seat and serves the built frontend with traversal rejection and SPA index fallback.
- **dsh-host-open-in-app** — Host half of open-in-app: resolving installed editors, Git GUIs, terminals, and file managers to verified launchers on macOS, Windows, and Linux, and 
- **dsh-host-plugin-inventory** — Read-only projection of the current Cordis Loader plugin state with each agent preset's composition beside it: the pluginInventory service and its plu
- **dsh-host-product-telemetry-otel** — Configure explicit product usage events, OTLP/HTTP routing, batching, and shutdown limits.
- **dsh-host-webserver** — The web GUI host's HTTP server: named-route and upgrade registration, index transforms, and the single fallback seat that serves the Web shell's SPA d
- **dsh-invariants** — Runtime invariant checks for live compositions: the registry service that runs package-owned checks, for users and maintainers choosing, configuring, 
- **dsh-sdk-jsonrpc-server** — The stdio JSON-RPC serving plugin for deployments that let out-of-process SDK clients open sessions and drive agents in a DeepSeek Harness runtime.
  - ⚠️ cache: Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.
- **dsh-sdk-protocol** — The SDK wire protocol for client and server implementers: the newline-delimited JSON-RPC transport and the named request, result, and notification typ
- **dsh-subagent-in-process-driver** — Shared in-process subagent run driver for maintainers and backend authors who need to understand or extend the spawn and fork run lifecycle.
- **dsh-tool-call-timeout-policy** — Cooperative time limit for cancellation-aware tool calls, mapping a settled timeout to a clear model error for users and maintainers choosing or debug
  - ⚠️ cache: Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV Cache entries.
- **dsh-typert-loader** — Loader integration for generated Typert artifacts: how mounted packages automatically contribute their host-face reflection and schemas to the runtime
- **dsh-typert-protocol** — The shared Typert Remote protocol: decorators, wire descriptors, codecs, and provider contracts used by business packages, generated artifacts, the Ho
- **dsh-typert-registry** — The runtime Typert registry: stores generated package reflection, lazy Zod schema factories, and Remote invocation descriptors, and resolves them for 
- **dsh-util-code-language** — Single file-extension to syntax-highlighting language table shared by the Client code surfaces and the Host read card.
- **dsh-util-crypto** — Cross-runtime UUID generation for maintainers replacing secure-context-only crypto.randomUUID calls.
  - ⚠️ cache: No direct invalidation; identifier-minting consumers own any request changes.
- **dsh-util-time** — IANA time-zone validation and canonicalization for maintainers accepting a caller-reported zone at a wire boundary.
- **dsh-util-values** — Lossless JSON validation, detached snapshots, deep freezing, structural equality, and exhaustive-union helpers for runtime packages.
- **dsh-util-workspace-path** — Browser-safe Workspace path helpers for joining relative paths, abbreviating POSIX homes, and deriving display titles.
- **libreoffice-kit** — 
- **node-addon-system** — JavaScript entry for the prebuilt Landlock launcher and asynchronous POSIX flock.
- **node-addon-system-darwin-arm64** — Prebuilt system.node for macOS arm64 POSIX locks.
- **schemastery** — 

## acp (1)

- **dsh-acp** — Automation-only ACP (Agent Client Protocol) server for programmatic clients and maintainers driving DeepSeek Harness agents over JSON-RPC stdio.

## attachment (2)

- **dsh-attachment** — Durable image and file attachments for users and maintainers attaching, reusing, or debugging uploads in prompts and commands.
  - ⚠️ cache: Adding an image changes the provider request and therefore invalidates the affected request suffix.
- **dsh-attachment-local** — Local storage for your attached images below DSH_HOME, for users and maintainers choosing or debugging where image attachments are kept.

## boot (4)

- **dsh-app-boot** — Shared Loader boot support for dsh profiles and the temporary Python SDK runtime: environment layers, patches, diagnostics, and configuration preview.
- **dsh-cmdline** — App-owned command lines for dsh app bins: your app parses its own flags, --help, and exit behavior from the launcher's remaining arguments.
- **dsh-config-editor** — Save active profile configuration and apply it through Loader.
- **dsh-plugin-manager** — Enable profile plugins and install, remove or select bundles from the Web sidebar or an agent.

## bundle (6)

- **dsh-acp-app** — Automation-only ACP stdio application profile for users and maintainers launching persistent harness agents.
- **dsh-base** — The shared dsh core: model access, tools, durable sessions, and safety defaults for every dsh --profile surface, for users composing or customizing a 
- **dsh-headless** — One-shot task mode for dsh: run a single task from the command line and get the final answer printed, for users scripting or automating dsh.
- **dsh-sdk-app** — SDK stdio application profile for users and maintainers launching a JSON-RPC harness runtime.
- **dsh-sdk-minimal** — Standalone SDK profile with one default shell tool for users who need a minimal cross-platform coding agent without the shared base bundle.
- **dsh-web-app** — The browser GUI for dsh: interactive chat, model and settings management, and session history, for users running the dsh web surface.

## client (1)

- **dsh-hmr** — Reload plugin code and profile configuration through one coordinated queue.
  - ⚠️ cache: Reloading a contributing plugin can change later request prefixes; HMR does not rewrite conversation history.

## compaction (5)

- **dsh-command-compact** — The on-demand /compact command for interactive compositions: what it does, what you see, and how to mount it.
  - ⚠️ cache: Discovery and command bookkeeping do not affect the cache. The accepted surface replacement invalidates reuse from the first shadowed history token.
- **dsh-compaction** — Shared compaction contract for backend implementers and deployers: what conversation condensation does, when to use it, and how to build a backend.
  - ⚠️ cache: A successful backend replacement invalidates reuse from the first shadowed history token; the seam itself does not alter a request.
- **dsh-compaction-basic** — Automatic conversation condensation for deployments choosing, tuning, or debugging how older history is summarized as token pressure builds.
  - ⚠️ cache: Replacing rather than append-only. Each checkpoint invalidates reuse from the first replaced history token; the unchanged request prefix before that range remains reusable.
- **dsh-compaction-image-offload** — The image offload executor for deployments composing compaction: what happens when an image-capable route rejects a request as over its image budget.
- **dsh-compaction-tool-result-pruner** — Tool-output trimming for deployments composing compaction: choosing size limits or debugging why oversized tool results get shortened.
  - ⚠️ cache: Replacing an earlier result invalidates reuse from the first changed token. The pruned prefix is eligible for reuse while its route, envelope, and preceding history remain identica

## context (6)

- **dsh-agent-instructions** — Workspace-instruction context for users and maintainers enabling, sizing, or debugging AGENTS.md/CLAUDE.md loading and refresh.
- **dsh-file-reference** — File-reference discovery and @file mention grammar for host-backed UIs, for users and maintainers choosing the seam or pairing it with a provider.
- **dsh-file-reference-local** — Local-workspace @file completion provider for users and maintainers enabling, sizing, or debugging ctx.fileReferences discovery.
- **dsh-session-reference** — Cross-session snapshot references and durable untrusted model context, for users and maintainers enabling or debugging ctx.sessionReferenceResolver.
- **dsh-time-context** — Per-step clock context with the current time, browser zone, and elapsed time, for users and maintainers tuning the plugin.
  - ⚠️ cache: Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV Cache entries.
- **dsh-tmux-context** — Opt-in per-turn tmux location context for users and maintainers enabling or tuning the agent's session, window, and pane awareness.
  - ⚠️ cache: Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV Cache entries.

## core (8)

- **dsh-agent** — The Agent handle, live registry, process-local initiator scope, and agent/* event vocabulary for plugins, UI, and orchestrators building or extending 
- **dsh-agent-default-model** — The deployment default model selection for users and maintainers choosing, configuring, or debugging which model freshly created agents start on.
  - ⚠️ cache: Changing the default affects only agents that subsequently resolve from it. An existing session whose request log already names a selection keeps that selection, so this service do
- **dsh-agent-loop** — The default agent driver for users and maintainers choosing, configuring, or debugging how agents are created and how turns and steps run.
- **dsh-agent-tool-presentation** — The agent-plane presentation selector for users and maintainers choosing, configuring, or debugging which form of its tools an agent preset's models s
  - ⚠️ cache: No direct invalidation; the presentation is fixed when the agent is composed, so its request prefix is stable for the session's life.
- **dsh-scope** — The scoped-registration library for plugin authors and maintainers building registries or event surfaces that isolate contributions per agent or per g
- **dsh-session** — The event-sourced session log and in-memory store for users and maintainers building, inspecting, or extending the durable record behind every agent i
  - ⚠️ cache: Appended surface entries preserve reusable prefixes. A `replace` operation invalidates reuse from the first shadowed message even though the underlying event log stays append-only.
- **dsh-system-prompt** — System-prompt assembly for users and maintainers adding prompt sections, variables, tool-schema sources, or configuring the model-facing prompt.
- **dsh-tools** — The tool registry and execution pipeline for tool authors and maintainers registering, restricting, presenting, or debugging model-facing tools.
  - ⚠️ cache: Prefix-stable while visible definitions and their order are unchanged. Registration, disposal, or scoped restriction may invalidate reuse from the first changed schema token.

## credentials (5)

- **dsh-authorization** — The authorization flow registry for users and maintainers who obtain credentials that configuration cannot supply, because getting one means a convers
  - ⚠️ cache: No invalidation; no authorization state enters a request prefix.
- **dsh-credentials** — The credential seam for users and maintainers resolving, describing, or storing credentials — reference values and durable records — without putting s
  - ⚠️ cache: No direct invalidation; resolved values never enter a request prefix.
- **dsh-credentials-local** — The file-backed credentials provider for users and maintainers choosing, configuring, or debugging the local credential store and its environment laye
  - ⚠️ cache: No direct invalidation; stored values never enter a request prefix.
- **dsh-deepseek-account** — Account consumers read stored login state, start or cancel a browser login, and sign out without editing API keys. Host model consumers resolve accoun
- **dsh-deepseek-account-platform** — Sign in through the system browser and keep the account credential in the existing local credential store. Local cancellation prevents late callbacks 

## deliverables (2)

- **dsh-tool-present** — Declare accessible files as deliverables with present; configuration, Session ownership, and source-file opening.
  - ⚠️ cache: The tool schema is static for the mount lifetime. Delivery result text extends the conversation without rewriting its prompt prefix.
- **dsh-workspace-changes** — Summarize each top-level turn's changed files from git working-tree snapshots and whole-file captures around file-tool edits, announce them with a wor

## document (1)

- **dsh-office-to-pdf** — Host Office conversion with the independently published LibreOffice kit.

## experimental (7)

- **dsh-hook-protocol** — The shared hook rules behind the Claude Code and Codex bridges — what a hook can do and what happens when it runs — for users and maintainers of the h
  - ⚠️ cache: No direct invalidation; the named consumers own any request-prefix changes.
- **dsh-hooks-claude-code** — Run your existing Claude Code hooks.json or settings hook config during agent runs — block prompts and tools, attach context, or force continuation — 
  - ⚠️ cache: Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.
- **dsh-hooks-codex** — Run your existing Codex hooks.json hook config during agent runs — block prompts and tools, attach context, or force continuation — for users and main
  - ⚠️ cache: Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.
- **dsh-skill-badge** — The bundled 'powered by dsh' badge skill for users and maintainers enabling, using, or debugging the optional badge provider.
- **dsh-tool-ralph** — The model-facing ralph tool: a fixed foreground fresh-agent loop toward one immutable objective, for users and maintainers choosing or configuring fre
  - ⚠️ cache: Prefix-stable while the plugin scope and guidance text are unchanged. Activation or disposal may invalidate reuse from this prompt section.
- **dsh-webhook** — Webhook rule runtime for maintainers registering trusted external-event policies that create Workspace Sessions.
  - ⚠️ cache: The initial prompt begins a new Session, so it establishes rather than invalidates that Session's reusable request prefix.
- **dsh-webhook-github** — Signed GitHub webhook adapter for deployments routing authenticated JSON events into the webhook runtime.

## extensions (3)

- **dsh-cordis-client-runner** — Browser half of dynamic Cordis packages for users and maintainers choosing, composing, or debugging how a page answers run requests and loads browser-
  - ⚠️ cache: Host steering appends to the session history; this package does not rewrite earlier messages.
- **dsh-cordis-host-runner** — Host half of dynamic Cordis packages for agents and maintainers choosing, composing, or debugging the registry, sandbox, and run round trip.
  - ⚠️ cache: None of its own. A host half that registers tools changes the next request's tool view, which invalidates prefix reuse from the first changed schema token; running or stopping a pa
- **dsh-tool-cordis** — Read-only runtime API discovery for agents developing and configuring installed Harness plugins.

## feedback (2)

- **dsh-command-feedback** — Session feedback: the `/feedback` command, the `sessionFeedback` Host Remote behind the Web feedback dialog, and the fixed category taxonomy; for user
  - ⚠️ cache: Independent of the model request path. Recording appends to the session log only, leaving an already-reusable request prefix untouched. Nothing this package contributes can invalid
- **dsh-message-feedback** — Canonical Session-log ratings, categories, and notes for finalized assistant messages.

## fs (7)

- **dsh-fs** — The ctx.fs filesystem service contract for deployments choosing or mounting a filesystem backend and developers implementing one.
  - ⚠️ cache: No direct invalidation; the named consumer owns any request-prefix changes.
- **dsh-fs-local** — The host-filesystem backend for ctx.fs for deployments and maintainers choosing or debugging local file access.
  - ⚠️ cache: No direct invalidation; the named consumer owns any request-prefix changes.
- **dsh-fs-observation-policy** — The read-before-edit filesystem policy plugin for deployments and maintainers choosing or debugging guarded write and edit behavior.
  - ⚠️ cache: Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV Cache entries.
- **dsh-fs-sandbox** — The sandbox-enforcing ctx.fs backend for deployments and maintainers confining model file mutations to a session workspace.
- **dsh-tool-fs** — The model-facing read, read_image, write, and edit tools for users and maintainers composing or debugging filesystem access for agents.
  - ⚠️ cache: Prefix-stable while the visible tool set, plugin scope, and guidance text are unchanged. Restrictions or plugin lifecycle changes may invalidate reuse from the first changed sectio
- **dsh-tool-fs-search** — The model-facing glob and grep discovery tools for users and maintainers composing or debugging workspace search for agents.
  - ⚠️ cache: Prefix-stable while the visible tool set, plugin scope, sampling choice, and guidance text are unchanged. Restrictions, activation, disposal, or changing the choice may invalidate 
- **dsh-tool-str-replace-editor** — The standalone str_replace_editor tool over ctx.fs for users and maintainers composing Claude-Code-style file editing for agents.

## goal (4)

- **dsh-command-goal** — The human-facing /goal slash command for users and maintainers choosing, composing, or debugging goal control in UI command planes.
- **dsh-goal** — The persisted same-session goal service for users and maintainers choosing, configuring, or debugging one durable completion objective per session.
- **dsh-goal-round-driver** — The same-session continuation driver for users and maintainers choosing, composing, or debugging automatic goal rounds.
- **dsh-tool-goal** — The model-facing goal tools for users and maintainers choosing, composing, or debugging get_goal, create_goal, and update_goal.
  - ⚠️ cache: Prefix-stable while the plugin scope, configured threshold, and guidance text are unchanged. Activation, disposal, or configuration changes may invalidate reuse from this prompt se

## guard (1)

- **dsh-repeat-tool-reminder** — Advisory loop-hygiene guard that nudges the model out of identical tool-call loops, for users and maintainers choosing, configuring, or debugging the 
  - ⚠️ cache: Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## identity (1)

- **dsh-anonymous-user-id** — Anonymous per-harness-home identity for users and maintainers tracing how telemetry, feedback acknowledgement, and DeepSeek provider requests correlat

## interaction (5)

- **dsh-commands** — Human slash-command registry for interactive UIs: plugin-owned commands that run directly against an agent without creating a model message, for users
- **dsh-permission-presets** — User-facing permission presets for users and maintainers choosing, configuring, or debugging the Permissions selector that bundles sandbox mode with a
  - ⚠️ cache: No direct invalidation; the named consumer owns any request-prefix changes.
- **dsh-tool-ask-user** — The model-facing ask_user_question tool over the user-questions seam, for users and maintainers composing or debugging interactive agent surfaces.
  - ⚠️ cache: Prefix-stable while the definition and visibility are unchanged. Plugin lifecycle or scoped restrictions may invalidate reuse from this schema.
- **dsh-user-approval** — Channel-neutral one-shot approval seam for users and maintainers composing answerers, setting policy, or debugging fail-closed permission decisions.
  - ⚠️ cache: Append-only after retained history. An `ask`/`never` switch preserves the stable system and conversation prefix instead of rewriting the first wire message.
- **dsh-user-questions** — Waterfall-based question and answer service for tools, permission plugins, local answerers, and Agent-scoped Web interactions.
  - ⚠️ cache: No direct invalidation; the named consumer owns any request-prefix changes.

## jobs (3)

- **dsh-jobs** — The background-job registry contract for users and maintainers composing, implementing, or debugging background work: ids, ownership, lifecycle, the o
  - ⚠️ cache: No direct invalidation; the named consumers own any request-prefix changes.
- **dsh-jobs-local** — The process-local background-job registry for users and maintainers composing, sizing, or debugging in-process jobs: per-owner admission, lifecycle, a
  - ⚠️ cache: No direct invalidation; the named consumers own any request-prefix changes.
- **dsh-tool-jobs** — The model-facing background-job controls for users and maintainers choosing, configuring, or debugging job_output, job_list, job_kill, and completion 
  - ⚠️ cache: Prefix-stable while the plugin scope and guidance text are unchanged. Activation or disposal may invalidate reuse from this prompt section.

## llm (9)

- **dsh-deepseek-llm-api-extensions** — Official DeepSeek request-extension registry for provider plugins contributing lifecycle-owned top-level API fields.
- **dsh-llm** — The provider-neutral model-call service for users and maintainers streaming requests, registering provider adapters, or resolving model metadata.
- **dsh-llm-deepseek** — Configure DeepSeek Messages, reasoning, and image input.
  - ⚠️ cache: An unchanged assembled prefix is eligible for DeepSeek cache reuse, which this adapter reports in usage. Deterministic request-image bytes do not make the full prefix immutable: a 
- **dsh-llm-deepseek-account** — DeepSeek account authentication and model discovery.
- **dsh-llm-deepseek-api-key** — DeepSeek api-key authentication and model discovery.
- **dsh-llm-pi-ai** — The pi-ai-backed multi-provider adapter for users and maintainers routing the harness LLM service through pi-ai catalogs and hand-declared gateways.
  - ⚠️ cache: Conversion preserves logical request order, while image handles and offload placeholders add model-visible text. A changed execution-world path rewrites a historical handle and can
- **dsh-llm-retry** — The retry executor for users and maintainers configuring provider-routed model-request recovery at durable agent-step boundaries.
- **dsh-plugin-package-inventory-deepseek** — Active Loader package inventory metadata for deployments sending official DeepSeek requests.
- **dsh-token-meter** — Replay-aware token and context-pressure measurement for users and maintainers sizing prompts or building compaction and occupancy displays.
  - ⚠️ cache: No direct invalidation; the named consumer owns any request-prefix changes.

## mcp (2)

- **dsh-mcp-client** — MCP client bridge for deployments and maintainers choosing, configuring, or debugging connections to external MCP servers whose tools register on ctx.
  - ⚠️ cache: The tool-definition prefix stays stable while the discovered set and schemas are unchanged. A re-sync that adds, removes, renames, or changes a tool replaces definitions and may in
- **dsh-mcp-resources** — Discover and read MCP resources on demand with shared tools, explicit server selection, and agent-scoped access.

## plan (1)

- **dsh-plan-mode** — Plan mode for users and maintainers choosing, configuring, or debugging the per-agent planning feature with deployment guidance, a /plan command, and 

## preset (3)

- **dsh-agent-preset** — Define an Agent’s child plugins in ordinary Cordis YAML. Declare several presets and let sessions select one. Definitions load eagerly, and edits affe
- **dsh-agent-preset-registry** — Choose an Agent’s tools, prompt sections and skills through declarative presets. One process can run several compositions. Failed definitions remain v
- **dsh-persona** — The composable persona row presets mount to give one agent its own system-prompt persona, for users and maintainers configuring or debugging it.

## ptc-runtime (2)

- **dsh-ptc-runtime** — Abstract PTC execution seam (`ctx.ptcRuntime`) for users and maintainers composing, consuming, or building a backend that runs one model-written progr
  - ⚠️ cache: No direct invalidation; the named consumer owns any request-prefix changes.
- **dsh-ptc-runtime-node** — Run TypeScript programs in fresh Node processes with the session filesystem sandbox, managed cleanup, and configurable execution and output limits.
  - ⚠️ cache: No direct invalidation; the named consumer owns any request-prefix changes.

## sandbox (4)

- **dsh-sandbox** — The process-sandbox service contract for users and maintainers composing, using, or extending same-world subprocess confinement.
  - ⚠️ cache: Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV Cache entries.
- **dsh-sandbox-local** — Local per-platform sandbox backends for users and maintainers choosing, configuring, or debugging process confinement on Linux, macOS, or Windows.
  - ⚠️ cache: No direct invalidation; the named consumers own any request-prefix changes.
- **dsh-sandbox-policy** — The shared per-call sandbox policy resolver and current model context for users and maintainers composing, configuring, or debugging file-effect polic
- **dsh-sandbox-windows-acl** — The Windows write-restriction sandbox backend for users and maintainers choosing, configuring, or debugging restricted-token process confinement on Wi

## schedule (1)

- **dsh-schedule** — Host-wide durable reminders and shared Session-bound task management.

## session (19)

- **dsh-session-checkpoint-policy** — Semantic session durability checkpoints for users and maintainers deploying persisted agents that must not lose a model request or tool side effect on
  - ⚠️ cache: The repair result is appended after the reusable prefix, so it does not invalidate earlier cache entries.
- **dsh-session-format** — Pure adjacent Session format planning, lossless JSON value checks, header-only migration, and physical codec dispatch.
- **dsh-session-format-catalog** — Build-static first-party Session format codec and adjacent migration assembly for persistence readers.
- **dsh-session-format-v0-to-v1** — Frozen released-v0 Session header, event, and packed-row decoder with the identity conversion to v1.
- **dsh-session-format-v1-to-v2** — Frozen released-v1 Session reader and cardinality-changing migration that embeds Assistant streams in released v2 events.
- **dsh-session-format-v2-to-v3** — The complete V2-to-V3 Session conversion: system heads, audited references, PTC and preset names, canonical envelopes, preservation, and refusal.
- **dsh-session-format-v3-to-v4** — Complete V3-to-V4 Session conversion and native admission: tool-role results, producer sources, parent catalogs, reference remapping, and refusal.
- **dsh-session-log-deepseek** — Incremental canonical session-log upload for deployments enabling official DeepSeek request metadata.
- **dsh-session-persistence** — The durable session-storage seam for users and maintainers choosing a persistence backend, resuming sessions, or building a backend against the shared
  - ⚠️ cache: Persistence does not mutate live request prefixes. A resumed loop can reuse provider cache only when its reconstructed history, current envelope, and model route match; crash-repai
- **dsh-session-persistence-jsonl** — The shipped JSONL session-persistence backend for deployments and maintainers choosing, configuring, or debugging per-session durable logs with option
- **dsh-session-projection** — The session-projection registry for developers serving whole current values of log-derived per-session state to client carriers, and for maintainers o
- **dsh-session-projection-cache** — The persisted session-projection cache for deployments and maintainers choosing, configuring, or debugging durable checkpoints, zero-I/O list reads, a
- **dsh-session-stats** — Whole-log conversation counts and wall times for clients and maintainers choosing, composing, or debugging the sessionStats projection unit.
- **dsh-session-telemetry** — Session-telemetry capture seam for deployments and backend authors choosing a reporting backend, mounting redaction rules, or implementing the backend
- **dsh-session-telemetry-otel** — OpenTelemetry session-telemetry backend for deployments choosing a mode, configuring the exporter, or tracing what leaves the machine.
- **dsh-session-title** — Log-backed session titles for users and maintainers choosing a title source, configuring the service, or debugging title state.
- **dsh-session-title-first-prompt-llm** — First-message LLM session-title provider for users and maintainers choosing a title strategy or debugging automatic title generation.
  - ⚠️ cache: No main-request invalidation. The auxiliary request uses the configured or logged route and has provider-specific cache behavior.
- **dsh-session-title-llm** — Shared model-backed title generation policy for users and maintainers configuring title providers or debugging auxiliary LLM requests.
  - ⚠️ cache: No main-request invalidation. Auxiliary cache reuse is provider-specific; the fixed instruction is reusable while the JSON message array changes with each revision.
- **dsh-session-turn-outline** — Whole-log turn outline for clients and maintainers composing or debugging the turnOutline projection unit behind full-session turn navigation.

## session-query (3)

- **dsh-session-log-export** — Web Session-log ZIP export: Host streaming, the authenticated download route, the Session Header action, and the /export command.
- **dsh-session-query** — The unified session-history query service for consumers and backend authors: exact reads, relationship traces, and provider-independent filters over l
- **dsh-session-query-sqlite** — The SQLite FTS5 full-text search backend for session history, for deployments and maintainers choosing, configuring, or debugging full-text search ove

## settings (1)

- **dsh-settings** — Inspect and edit live plugin configuration through Config-derived forms.

## shell (10)

- **dsh-bash-local** — The default POSIX Bash executor for deployments and maintainers choosing, configuring, or debugging unconfined command execution over the shell seam.
  - ⚠️ cache: No direct invalidation; the named consumer owns any request-prefix changes.
- **dsh-bash-sandbox** — The sandbox-consuming Bash executor for deployments and maintainers choosing, configuring, or debugging confined command execution with denial and esc
- **dsh-pwsh-local** — The local PowerShell executor for deployments and maintainers choosing, configuring, or debugging unconfined PowerShell command execution over the she
  - ⚠️ cache: No direct invalidation; the named consumer owns any request-prefix changes.
- **dsh-pwsh-sandbox** — The sandbox-consuming PowerShell executor for deployments and maintainers choosing, configuring, or debugging confined PowerShell command execution wi
- **dsh-shell** — The shell executor seam for developers and maintainers choosing, composing, or implementing command execution over ctx.shell.
  - ⚠️ cache: No direct invalidation; the named consumer owns any request-prefix changes.
- **dsh-shell-env** — The managed DSH_* shell environment for users and maintainers choosing, configuring, or extending the environment every model shell call runs with.
  - ⚠️ cache: The managed environment never enters the request prefix, so it does not invalidate provider cache reuse; the shell tools' definitions and the current request envelope own any prefi
- **dsh-tool-bash** — The model-facing bash tool for users and maintainers choosing, configuring, or debugging one-shot command execution, background jobs, and sandbox esca
  - ⚠️ cache: Prefix-stable while the registration scope and prompt text are unchanged. Plugin activation or disposal may invalidate reuse from this prompt section; sandbox mode switches do not.
- **dsh-tool-bash-persistent** — The model-facing persistent bash tool for users and maintainers choosing, configuring, or debugging owner-scoped shell state that survives across call
- **dsh-tool-pwsh** — The model-facing pwsh tool for users and maintainers choosing, configuring, or debugging one-shot PowerShell execution, background jobs, and sandbox e
  - ⚠️ cache: Prefix-stable while the registration scope and prompt text are unchanged. Plugin activation or disposal may invalidate reuse from this prompt section.
- **dsh-tool-pwsh-persistent** — The model-facing persistent pwsh tool for users and maintainers choosing, configuring, or debugging owner-scoped PowerShell state that survives across

## skill (5)

- **dsh-skill** — The skill provider registry for users and maintainers choosing, configuring, or debugging how skills from any source are merged, resolved, and loaded.
  - ⚠️ cache: No direct prompt effect. The named consumer owns the durable initial catalog and append-only replacements after invalidation.
- **dsh-skill-filesystem** — The local filesystem skill provider for users and maintainers authoring local skills or configuring how project, custom, and user skill roots are disc
  - ⚠️ cache: Watcher invalidation can cause the named consumer to append a replacement catalog to the existing request history. Body-only edits leave the catalog digest unchanged.
- **dsh-skill-office** — Bundled Word, PowerPoint, and Excel instructions for deployments providing Office file authoring and structural checks.
- **dsh-tool-skill** — The model-facing skill catalog and loader tool for users and maintainers understanding what agents see, or configuring the session skill catalog.
- **dsh-tool-workspace-dependencies** — The load_workspace_dependencies tool: absolute paths into a bundled Python, Node.js, and pnpm payload, used in place or installed under the Harness ho

## spill (3)

- **dsh-spill** — The spill storage service: save oversized tool text or captured session references and return a retrievable locator.
  - ⚠️ cache: No direct invalidation; the named consumer owns any request-prefix changes.
- **dsh-spill-local** — The local filesystem spill backend: how spilled text is saved to private session-scoped files and retrieved with read or grep.
  - ⚠️ cache: No direct invalidation; the named consumer owns any request-prefix changes.
- **dsh-spill-policy** — Tool-result retention with a shared text/image token budget and readable recovery files.
  - ⚠️ cache: Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## storage (3)

- **dsh-storage** — Storage hub (ctx.storage) for compositions and maintainers choosing, mounting, or debugging named storage backends and data-form facilities.
  - ⚠️ cache: Independent of live requests: the hub never touches a request prefix, so it cannot invalidate provider cache reuse.
- **dsh-storage-domain** — Domain data form (ctx.storageDomain) for hosts and maintainers choosing, mounting, or debugging schema-validated, change-emitting KV domains over stor
  - ⚠️ cache: Independent: domain reads and writes never touch request prefixes, so nothing here can invalidate provider cache reuse.
- **dsh-storage-json** — JSON storage backend for hosts and maintainers choosing, configuring, or debugging whole-unit and per-record files under a configured root.

## subagent (5)

- **dsh-subagent** — The subagent delegation seam for users and maintainers choosing a provider backend, composing delegation tools, or debugging child-agent runs.
- **dsh-subagent-fork-in-process** — In-process fork subagent backend for users and maintainers choosing, configuring, or debugging children seeded with the parent's completed turns.
  - ⚠️ cache: The child may reuse the inherited byte-identical prefix under the same provider and model. Persona, tool-filter, generated-SDK, or route changes may invalidate reuse before inherit
- **dsh-subagent-spawn-in-process** — In-process spawn subagent backend for users and maintainers choosing, configuring, or debugging fresh-child delegation.
- **dsh-tool-subagent** — Model-facing subagent delegation tool for users and maintainers configuring, composing, or debugging delegation over a subagent provider.
- **dsh-tool-subagent-control** — Global send_message, interrupt_agent, and list_agents tools for users and maintainers composing or debugging continuable-child control.

## subprocess (3)

- **dsh-subprocess** — The subprocess service (ctx.subprocess) for composition authors and capability consumers starting, observing, and terminating managed child processes 
  - ⚠️ cache: No direct invalidation; the named consumers own any request-prefix changes.
- **dsh-subprocess-local** — The local host provider for the subprocess service: run OS-owned managed ranges and real terminal sessions on the host machine, with explicit weaker f
  - ⚠️ cache: No direct invalidation; the named consumers own any request-prefix changes.
- **dsh-win32-process** — Low-level Win32 process primitives for maintainers implementing or debugging the Windows ACL sandbox and ordinary subprocess Job runner.
  - ⚠️ cache: The package contributes no stable request prefix, so it does not invalidate model KV caches.

## telemetry (1)

- **dsh-otel** — Create independent OTLP reporting channels through the shared Cordis OTel service.

## terminal (2)

- **dsh-terminal** — Persistent terminal sessions for deployments and consumers choosing, composing, or extending the owner-scoped ctx.terminals service.
  - ⚠️ cache: No direct invalidation; `@deepseek-ai/dsh-tool-terminal` owns request-prefix changes.
- **dsh-terminal-bash** — The shipped shell backend for persistent terminal sessions: interactive bash or pwsh under the shared sandbox policy, with readiness detection and bou
  - ⚠️ cache: No direct invalidation; consumer results remain append-only.

## todo (1)

- **dsh-tool-todo** — The model-facing todo_write tool over the DeepSeek Harness session log: whole-list replacement, per-session ownership, and the todos projection, for u
  - ⚠️ cache: Prefix-stable while the definition and visibility are unchanged. Plugin lifecycle or scoped restrictions may invalidate reuse from this schema.

## util (12)

- **dsh-atomic-write** — Atomic file replacement and cross-process writer locking for packages that must never leave partial, symlink-hijacked, or wider-permission content on 
- **dsh-brand** — Nominal string and number types with stateless constructors for packages that own confusable domain values.
- **dsh-chunked-list** — Immutable append-only lists for projection state, with bounded append copying, insertion-order iteration, and Zod checkpoint validation.
- **dsh-deque** — Circular deque for Host and browser packages that need amortized constant-time queue operations, immediate release of removed entries, and bounded vac
- **dsh-home-paths** — Shared resolution of the DeepSeek Harness home and user-data paths for packages that need one consistent root, tilde expansion, and stable watch paths
- **dsh-http-proxy** — Outbound HTTP proxy support for the harness: how one policy resolved from the launch environment reaches every request Node's fetch would otherwise se
  - ⚠️ cache: No direct invalidation: the package contributes no request tokens and never mutates a request prefix, so provider cache reuse is unaffected.
- **dsh-launch-environment** — An immutable snapshot of this run's environment that remembers which layer supplied each value, for packages that must resolve user-facing values with
- **dsh-lazy-require** — Caller-relative lazy loading for CommonJS-compatible Host dependencies whose initialization is not needed during application startup.
- **dsh-native-command** — Host-native command and path-opening utilities with shell-free execution, cancellation, desktop detection, and WSL path handoff.
- **dsh-output-retention** — Bounded model-facing output for tools that must cap how much context they return: item and text retainers plus a standardized omission footer.
  - ⚠️ cache: No direct invalidation; the retention consumers own any request-prefix changes.
- **dsh-package-manifest** — Shared TypeScript declarations for package identity, runtime requirements, and DSH plugin metadata.
- **dsh-timeout** — Shared timeout arithmetic, deadline fusion, and timeout-versus-cancel classification for capabilities that clamp a caller's hint, arm a deadline, and 
  - ⚠️ cache: No direct invalidation; the timeout consumers own any request-prefix changes.

## web (4)

- **dsh-tool-web** — The model-facing web tools (web_search, web_fetch) over ctx.web: how deployments enable, configure, and observe the search and fetch tools the model s
  - ⚠️ cache: Prefix-stable while visible tools, scope, and guidance text are unchanged. Config, scoped restrictions, `searchMaxQueries`, or plugin lifecycle changes may invalidate reuse from th
- **dsh-web** — The web access service (ctx.web): how deployments and plugin authors search the web and fetch URLs through interchangeable providers, with one selecti
  - ⚠️ cache: No direct invalidation; the named consumer owns any request-prefix changes.
- **dsh-web-fetch-http** — The anonymous public HTTP(S) fetch backend for ctx.web: how deployments mount bounded, safe URL retrieval with same-origin redirects and text-only dec
  - ⚠️ cache: No direct invalidation; the named consumer owns any request-prefix changes.
- **dsh-web-search-deepseek** — The DeepSeek-backed search provider for ctx.web: how deployments mount native DeepSeek web search through the Anthropic-compatible Messages API, with 

## workflow (3)

- **dsh-tool-workflow** — The model-facing workflow tool: run a JavaScript orchestration script that fans out subagents, for users and maintainers choosing or configuring model
  - ⚠️ cache: Prefix-stable while the plugin scope and guidance text are unchanged. Activation or disposal may invalidate reuse from this prompt section.
- **dsh-workflow** — The workflow orchestration capability: run a model-written script that fans out subagents, for users and maintainers choosing or building on ctx.workf
  - ⚠️ cache: No direct invalidation; the named consumer and engine own any request-prefix changes.
- **dsh-workflow-ptc** — Run workflow orchestration through the shared sandboxed PTC Node process runtime, with workflow hooks, subagent routing and caller-owned cancellation.

## workspace (1)

- **dsh-workspace** — Workspace entity registry (ctx.workspaceRegistry) for hosts choosing, mounting, or debugging durable workspace records and header-validated session me
  - ⚠️ cache: Independent of live requests: the package never touches a request prefix, so it cannot invalidate provider cache reuse.
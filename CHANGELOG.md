# Changelog

## 0.2.0

- **Undo / redo** with a full per-session history stack. Toolbar buttons plus `Ctrl+Z` / `Ctrl+Shift+Z` (and `Ctrl+Y`). All three action types reverse cleanly; deletes are fully reversible - removed nodes are reinserted at their original position via stored parent and next-sibling. Native text-field undo is left alone while you're typing.
- **Firefox-first packaging.** Added `browser_specific_settings.gecko` with an add-on id and `strict_min_version`. Background declared as `background.scripts` (Firefox event page) while still exposing `service_worker` for Chrome/Edge from a single manifest.
- **SVG logo** used directly as the toolbar/add-on icon. Firefox renders SVG icons natively, so no rasterization is needed for Firefox builds.
- Undo history is preserved when the toolbar is closed and reopened within the same page session, so earlier edits remain undoable.
- Toolbar separator and disabled-state styling for the history buttons.

## 0.1.0

- Initial release.
- Click any element to edit its text, with no DevTools.
- Hide (preserves layout space) and Delete (removes the node) modes.
- On-demand injection via `activeTab` + `scripting` only - no host permissions, no storage, no network, no telemetry.
- Non-destructive hover highlight overlay and a scoped, style-hardened in-page toolbar.
- Capture-phase click interception so links and buttons don't navigate while tinkering; `html`/`body`/own-UI nodes are protected from deletion.
- Toggle via the toolbar icon or `Alt+Shift+E`.

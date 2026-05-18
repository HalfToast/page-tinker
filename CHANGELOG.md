# Changelog

## 0.3.0

- **Draggable toolbar.** Drag the bar by its title to reposition it (clamped to the viewport) so it doesn't cover the element you want to edit. Its position is remembered for the rest of the page session, including across toggling the editor off and on.
- **Screenshot mode.** Click an element to download a cropped PNG of it. Captures the visible tab via the background script (`activeTab`, no new permission) and crops to the element's box at device-pixel resolution, with the toolbar/overlay hidden from the shot. Visible-viewport only - parts of an element scrolled off-screen are clipped.
- **Find & replace.** A panel (shown in Replace mode) replaces every occurrence of a string in the page's visible text in one go, skipping `script`/`style`/the extension's own UI. Recorded as a single undo step. Matches are highlighted live on the page as you type the search term, via the CSS Custom Highlight API (no DOM mutation; feature-detected, Firefox 140+).
- **Fix:** editing text inside links and buttons no longer cancels. Their native press behavior (focus, activation, drag) is blocked on `mousedown`, and clicking again inside the element being edited no longer reselects its contents and wipes what you typed.
- **Fix:** typing a character that is also a host-page keyboard shortcut (`j`, `k`, `c`, `/`, …) now inserts the character instead of triggering the shortcut. Keystrokes are stopped from bubbling past the edited element while editing.
- **Fix:** pasting into an edited element now inserts plain text instead of the clipboard's styled HTML.

## 0.2.0

- **Three activation gestures.** Start a session from the toolbar button (shown in the browser's extensions area), a right-click menu item (“Start Page Tinker on this page”), or the `Alt+Shift+E` shortcut - all of which grant `activeTab`. Adds the benign `contextMenus` permission (one menu entry, no page access); still no host permissions, storage, network, or telemetry.
- **Undo / redo** with a full per-session history stack. Floating-toolbar buttons plus `Ctrl+Z` / `Ctrl+Shift+Z` (and `Ctrl+Y`). Edit, hide, delete, and replace all reverse cleanly; deletes are fully reversible - removed nodes are reinserted at their original position via stored parent and next-sibling. Native text-field undo is left alone while you're typing. History survives toggling the editor off and on within the same page session.
- **Firefox-first packaging.** `browser_specific_settings.gecko` with an add-on id, `strict_min_version` 142.0, and `data_collection_permissions: none`. Background declared as `background.scripts` (Firefox event page) while still exposing `service_worker` for Chrome/Edge from a single manifest.
- **SVG logo** used directly as the toolbar/add-on icon. Firefox renders SVG icons natively, so no rasterization is needed for Firefox builds.

## 0.1.0

- Initial release.
- Click any element to edit its text, with no DevTools.
- Hide (preserves layout space) and Delete (removes the node) modes.
- On-demand injection via `activeTab` + `scripting` only - no host permissions, no storage, no network, no telemetry.
- Non-destructive hover highlight overlay and a scoped, style-hardened in-page toolbar.
- Capture-phase click interception so links and buttons don't navigate while tinkering; `html`/`body`/own-UI nodes are protected from deletion.
- Toggle via the toolbar icon or `Alt+Shift+E`.

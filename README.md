# Page Tinker

A Firefox extension (desktop **and Firefox for Android**) that lets you click any element on a page to edit its text, hide it, or delete it - no DevTools, no hunting through the HTML inspector. All changes are ephemeral: reload the page and everything is back to normal.

## Features

- **Click to edit text** - click any element and type to replace its text; `Enter` or click away to commit. Works on links and buttons without triggering them.
- **Hide** - click an element to make it invisible while keeping its layout space.
- **Delete** - click an element to remove it from the page entirely.
- **Screenshot** - click an element to download a cropped PNG of it (visible-viewport area; the toolbar is kept out of the shot). No new permissions.
- **Find & replace** - replace every occurrence of a string in the page's visible text at once; matches are highlighted live as you type. Counts as one undo step.
- **Floating toolbar** - a small in-page bar to pick the mode (edit / hide / delete) and undo / redo, scoped and style-hardened so the host page's CSS can't break it. Drag it by its title to move it off whatever you want to edit.
- **Undo / redo** - full per-session history. Toolbar buttons or `Ctrl+Z` / `Ctrl+Shift+Z` (and `Ctrl+Y`). Deletes are fully reversible; removed nodes return to their original position.
- **No permissions, no data** - injected only on an explicit gesture via `activeTab`. No host permissions, no storage, no network, no telemetry. Nothing leaves your machine, nothing is even saved locally. The only API permission besides `activeTab`/`scripting` is `contextMenus` (adds one right-click item; no page access).
- **Non-destructive** - a hover highlight overlay that never mutates the page; typing can't trigger the host page's own keyboard shortcuts.
- Capture-phase clicks so links and buttons don't navigate while tinkering; `html` and `body` are protected from deletion.
- Start from the **toolbar button** (in the browser's extensions area), by **right-clicking** the page → **Start Page Tinker on this page**, or with `Alt+Shift+E`; `Esc` or the toolbar's Done to exit.

## Install (development)

1. Open Firefox → `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select [manifest.json](manifest.json).

Start a session on a page by clicking the **Page Tinker toolbar button** (in the browser's extensions area), right-clicking the page → **Start Page Tinker on this page**, or pressing `Alt+Shift+E`. The floating toolbar then controls it.

**Firefox for Android:** install the signed add-on from AMO (or load it via a debug build). Start a session from the **⋮ menu → Extensions → Page Tinker** (the right-click menu and `Alt+Shift+E` are desktop-only). The toolbar is touch-draggable; element edit/hide/delete/replace work by tapping. Screenshot capture may be unavailable on Android and fails gracefully if so.

Chrome/Edge: the manifest uses `background.scripts` (Firefox event page) and intentionally omits `background.service_worker` so the Firefox/AMO build validates cleanly. Chrome ignores `scripts` and SVG icons, so for a Chrome Web Store build add a `background.service_worker` entry and PNG icons first.

## Files

- [manifest.json](manifest.json) - MV3 manifest (Firefox + Chrome compatible)
- [background.js](background.js) - creates the right-click menu item; injects the editor on the menu click / shortcut
- [content.js](content.js) - in-page editor + floating toolbar: edit, hide, delete, undo/redo
- [content.css](content.css) - toolbar, hover overlay, and edit outline styles
- [icon.svg](icon.svg) - toolbar / add-on icon
- [CHANGELOG.md](CHANGELOG.md) - version history
- [LICENSE](LICENSE) - MIT
- [PRIVACY.md](PRIVACY.md) - privacy disclosure

## License

MIT - see [LICENSE](LICENSE).

# Page Tinker

A Firefox extension that lets you click any element on a page to edit its text, hide it, or delete it - no DevTools, no hunting through the HTML inspector. All changes are ephemeral: reload the page and everything is back to normal. Chrome/Edge compatible from the same manifest.

## Features

- **Click to edit text** - click any element and type to replace its text; `Enter` or click away to commit.
- **Hide** - click an element to make it invisible while keeping its layout space.
- **Delete** - click an element to remove it from the page entirely.
- **Undo / redo** - full per-session history. Toolbar buttons or `Ctrl+Z` / `Ctrl+Shift+Z` (and `Ctrl+Y`). Deletes are fully reversible; removed nodes return to their original position.
- **No permissions, no data** - injected only on an explicit click via `activeTab`. No host permissions, no storage, no network, no telemetry. Nothing leaves your machine, nothing is even saved locally.
- **Non-destructive UI** - a hover highlight overlay and a scoped, style-hardened toolbar the host page's CSS can't break.
- Capture-phase clicks so links and buttons don't navigate while tinkering; `html`, `body`, and the toolbar itself are protected from deletion.
- Toggle via the toolbar icon or `Alt+Shift+E`; `Esc` to exit.

## Install (development)

1. Open Firefox → `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select [manifest.json](manifest.json).

Chrome/Edge: open `chrome://extensions`, enable Developer mode, and **Load unpacked** on this folder. The single manifest declares both `background.scripts` (Firefox) and `service_worker` (Chrome). Chrome ignores SVG icons, so generate PNGs before a Chrome Web Store submission.

## Files

- [manifest.json](manifest.json) - MV3 manifest (Firefox + Chrome compatible)
- [background.js](background.js) - injects the editor on toolbar click / shortcut
- [content.js](content.js) - in-page editor: edit, hide, delete, undo/redo
- [content.css](content.css) - toolbar and overlay styles
- [icon.svg](icon.svg) - toolbar icon
- [CHANGELOG.md](CHANGELOG.md) - version history
- [LICENSE](LICENSE) - MIT
- [PRIVACY.md](PRIVACY.md) - privacy disclosure

## License

MIT - see [LICENSE](LICENSE).

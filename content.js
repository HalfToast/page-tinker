// Page Tinker - in-page editor
//
// Injected on demand by the toolbar button / right-click menu / Alt+Shift+E
// (the gestures that grant activeTab). All changes are ephemeral: nothing is
// stored and a reload restores the original page. This file is idempotent -
// re-injecting it just toggles the editor.

(() => {
  "use strict";

  // Re-injection (second toolbar press etc.) is a toggle request.
  if (window.__PAGE_TINKER__) {
    window.__PAGE_TINKER__.toggle();
    return;
  }

  const NS = "pt"; // class prefix to avoid collisions with the host page
  const MODES = {
    EDIT: "edit",
    HIDE: "hide",
    DELETE: "delete",
    SHOT: "shot",
    REPLACE: "replace"
  };

  const state = {
    active: false,
    mode: MODES.EDIT,
    overlay: null, // hover highlight box
    toolbar: null, // floating in-page control bar
    panel: null, // find/replace panel (part of the toolbar)
    findInput: null, // the Find text box, so setMode can refresh highlights
    toolbarPos: null, // {left, top} once the user has dragged it this session
    editingEl: null, // element currently in contentEditable mode
    editingBefore: null, // innerHTML snapshot captured when editing began
    editHandlers: null, // listeners bound to the element being edited
    undo: [], // stack of applied actions (most recent last)
    redo: [] // stack of undone actions
  };

  // ---- helpers ---------------------------------------------------------

  function isOwnUI(el) {
    return !!(el && el.closest && el.closest(`.${NS}-ui`));
  }

  function isProtected(el) {
    if (!el || el.nodeType !== 1) return true;
    if (el === document.documentElement || el === document.body) return true;
    return isOwnUI(el);
  }

  function moveOverlayTo(el) {
    if (!state.overlay) return;
    if (!el || isProtected(el)) {
      state.overlay.style.display = "none";
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      state.overlay.style.display = "none";
      return;
    }
    const o = state.overlay.style;
    o.display = "block";
    o.top = `${r.top}px`;
    o.left = `${r.left}px`;
    o.width = `${r.width}px`;
    o.height = `${r.height}px`;
  }

  function downloadBlob(blob, name) {
    const a = document.createElement("a");
    // Tag it as our own UI so the editor's own click/mousedown interceptors
    // ignore the synthetic click that triggers the download.
    a.className = `${NS}-ui`;
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---- undo / redo -----------------------------------------------------

  function record(action) {
    state.undo.push(action);
    state.redo.length = 0; // a new action invalidates the redo branch
    refreshHistoryButtons();
  }

  function applyInverse(a) {
    try {
      if (a.type === "edit") {
        a.el.innerHTML = a.before;
      } else if (a.type === "hide") {
        if (a.prevValue) {
          a.el.style.setProperty("visibility", a.prevValue, a.prevPriority);
        } else {
          a.el.style.removeProperty("visibility");
        }
      } else if (a.type === "delete") {
        a.parent.insertBefore(a.el, a.next);
      } else if (a.type === "replace") {
        a.changes.forEach((c) => { c.node.nodeValue = c.before; });
      }
    } catch (e) {
      console.warn("Page Tinker: could not undo an action.", e);
    }
  }

  function applyForward(a) {
    try {
      if (a.type === "edit") {
        a.el.innerHTML = a.after;
      } else if (a.type === "hide") {
        a.el.style.setProperty("visibility", "hidden", "important");
      } else if (a.type === "delete") {
        a.el.remove();
      } else if (a.type === "replace") {
        a.changes.forEach((c) => { c.node.nodeValue = c.after; });
      }
    } catch (e) {
      console.warn("Page Tinker: could not redo an action.", e);
    }
  }

  function undo() {
    const a = state.undo.pop();
    if (!a) return;
    applyInverse(a);
    state.redo.push(a);
    onScrollOrResize();
    refreshHistoryButtons();
  }

  function redo() {
    const a = state.redo.pop();
    if (!a) return;
    applyForward(a);
    state.undo.push(a);
    onScrollOrResize();
    refreshHistoryButtons();
  }

  function refreshHistoryButtons() {
    if (!state.toolbar) return;
    const u = state.toolbar.querySelector(`.${NS}-undo`);
    const r = state.toolbar.querySelector(`.${NS}-redo`);
    if (u) u.disabled = state.undo.length === 0;
    if (r) r.disabled = state.redo.length === 0;
  }

  // ---- text editing ----------------------------------------------------

  function detachEditListeners() {
    const h = state.editHandlers;
    if (!h) return;
    h.el.removeEventListener("keydown", h.onKey);
    h.el.removeEventListener("keyup", h.swallow);
    h.el.removeEventListener("keypress", h.swallow);
    h.el.removeEventListener("paste", h.onPaste);
    h.el.removeEventListener("blur", h.onBlur);
    state.editHandlers = null;
  }

  function endTextEdit() {
    if (!state.editingEl) return;
    const el = state.editingEl;
    const before = state.editingBefore;
    detachEditListeners();
    el.removeAttribute("contenteditable");
    el.classList.remove(`${NS}-editing`);
    state.editingEl = null;
    state.editingBefore = null;
    if (before != null && el.innerHTML !== before) {
      record({ type: "edit", el, before, after: el.innerHTML });
    }
  }

  function startTextEdit(el) {
    endTextEdit();
    state.editingEl = el;
    state.editingBefore = el.innerHTML;
    el.setAttribute("contenteditable", "true");
    el.classList.add(`${NS}-editing`);
    el.focus();

    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);

    // Stop the host page from reacting to our typing. Many sites bind
    // single-key shortcuts (j/k, c, /, ?) on document/window in the bubble
    // phase; without this the keystroke bubbles past the edited element and
    // triggers the shortcut instead of inserting the character. We only stop
    // propagation - never preventDefault - so the character is still typed.
    const swallow = (ev) => { ev.stopPropagation(); };

    const onKey = (ev) => {
      ev.stopPropagation();
      if (ev.key === "Escape" || (ev.key === "Enter" && !ev.shiftKey)) {
        ev.preventDefault(); // commit, instead of a newline / page dismiss
        endTextEdit();
      }
    };

    // Paste as plain text so styled clipboard HTML doesn't get baked in.
    const onPaste = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const text = (ev.clipboardData || window.clipboardData).getData("text");
      document.execCommand("insertText", false, text);
    };

    const onBlur = () => endTextEdit();

    el.addEventListener("keydown", onKey);
    el.addEventListener("keyup", swallow);
    el.addEventListener("keypress", swallow);
    el.addEventListener("paste", onPaste);
    el.addEventListener("blur", onBlur);
    state.editHandlers = { el, onKey, swallow, onPaste, onBlur };
  }

  // ---- screenshot ------------------------------------------------------

  async function captureElement(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;

    const tb = state.toolbar;
    const ov = state.overlay;
    // Keep our own UI out of the shot.
    if (tb) tb.style.setProperty("visibility", "hidden", "important");
    if (ov) ov.style.setProperty("display", "none", "important");
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r))
    );

    let dataUrl = null;
    try {
      dataUrl = await chrome.runtime.sendMessage({ cmd: "capture" });
    } catch (e) {
      dataUrl = null;
    }

    if (tb) tb.style.removeProperty("visibility");
    if (ov) ov.style.removeProperty("display");

    if (!dataUrl) {
      console.warn("Page Tinker: screenshot capture failed.");
      return;
    }

    const img = new Image();
    img.onload = () => {
      const dpr = window.devicePixelRatio || 1;
      const sx = Math.max(0, rect.left * dpr);
      const sy = Math.max(0, rect.top * dpr);
      const sw = Math.min(img.width - sx, rect.width * dpr);
      const sh = Math.min(img.height - sy, rect.height * dpr);
      if (sw < 1 || sh < 1) return;
      const c = document.createElement("canvas");
      c.width = Math.round(sw);
      c.height = Math.round(sh);
      c.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      c.toBlob((b) => {
        if (b) {
          const ts = new Date().toISOString().replace(/[:.]/g, "-");
          downloadBlob(b, `page-tinker-${ts}.png`);
        }
      }, "image/png");
    };
    img.src = dataUrl;
  }

  // ---- find & replace --------------------------------------------------

  function collectTextNodes() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(n) {
          if (!n.nodeValue || !n.nodeValue.trim()) {
            return NodeFilter.FILTER_REJECT;
          }
          const p = n.parentNode;
          if (!p) return NodeFilter.FILTER_REJECT;
          if (p.closest && p.closest(`.${NS}-ui`)) {
            return NodeFilter.FILTER_REJECT;
          }
          const tag = p.nodeName;
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  function doReplace(find, repl) {
    if (!find) return 0;
    const changes = [];
    for (const node of collectTextNodes()) {
      const v = node.nodeValue;
      if (v.indexOf(find) === -1) continue;
      const nv = v.split(find).join(repl);
      if (nv !== v) {
        changes.push({ node, before: v, after: nv });
        node.nodeValue = nv;
      }
    }
    if (changes.length) record({ type: "replace", changes });
    return changes.length;
  }

  // Live match highlighting via the CSS Custom Highlight API - no DOM
  // mutation, so it can't disturb the replace logic or the undo stack.
  // Feature-detected (Firefox 140+); a no-op if unavailable.
  const HL_NAME = `${NS}-find`;
  const HL_SUPPORTED =
    typeof CSS !== "undefined" && CSS.highlights && typeof Highlight !== "undefined";
  let hlTimer = null;

  function clearHighlight() {
    if (!HL_SUPPORTED) return;
    try {
      CSS.highlights.delete(HL_NAME);
    } catch (e) {
      /* nothing to clear */
    }
  }

  function updateHighlight(term) {
    if (!HL_SUPPORTED) return;
    clearHighlight();
    if (!term) return;
    const ranges = [];
    const MAX = 5000; // guard against a 1-char term matching everything
    for (const node of collectTextNodes()) {
      const v = node.nodeValue;
      let i = v.indexOf(term);
      while (i !== -1) {
        const r = document.createRange();
        r.setStart(node, i);
        r.setEnd(node, i + term.length);
        ranges.push(r);
        if (ranges.length >= MAX) break;
        i = v.indexOf(term, i + term.length);
      }
      if (ranges.length >= MAX) break;
    }
    if (ranges.length) CSS.highlights.set(HL_NAME, new Highlight(...ranges));
  }

  function scheduleHighlight(term) {
    if (hlTimer) clearTimeout(hlTimer);
    hlTimer = setTimeout(() => updateHighlight(term), 120);
  }

  // ---- event handlers --------------------------------------------------

  function onMouseMove(e) {
    if (state.editingEl) return;
    if (state.mode === MODES.REPLACE) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    moveOverlayTo(el);
  }

  function onScrollOrResize() {
    if (state.overlay) state.overlay.style.display = "none";
  }

  // Block the native press behavior of links/buttons (focus, activation,
  // drag start) BEFORE it happens, so a click can become an edit instead of
  // a navigation. Presses inside the element being edited must pass through
  // so the browser can place the text caret.
  function onMouseDown(e) {
    if (!state.active) return;
    if (state.mode === MODES.REPLACE) return;
    const el = e.target;
    if (isOwnUI(el)) return;
    if (isProtected(el)) return;
    if (state.editingEl && state.editingEl.contains(el)) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function onClick(e) {
    const el = e.target;
    if (isOwnUI(el)) return; // toolbar buttons / inputs work normally
    if (!state.active) return;
    if (isProtected(el)) return;
    if (state.mode === MODES.REPLACE) return; // panel-driven; ignore the page

    // Already editing this element (or a child): block the page's own click
    // behavior - link navigation, form submit - but let the click through so
    // the caret can move. Do NOT restart the edit; that would reselect all
    // contents and the next keystroke would wipe what was typed.
    if (state.editingEl && state.editingEl.contains(el)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (state.mode === MODES.EDIT) {
      startTextEdit(el);
    } else if (state.mode === MODES.HIDE) {
      record({
        type: "hide",
        el,
        prevValue: el.style.getPropertyValue("visibility"),
        prevPriority: el.style.getPropertyPriority("visibility")
      });
      el.style.setProperty("visibility", "hidden", "important");
      onScrollOrResize();
    } else if (state.mode === MODES.DELETE) {
      record({
        type: "delete",
        el,
        parent: el.parentNode,
        next: el.nextSibling
      });
      el.remove();
      onScrollOrResize();
    } else if (state.mode === MODES.SHOT) {
      captureElement(el);
    }
  }

  function onKeyDown(e) {
    // Typing in our own UI (find/replace inputs): hands off entirely.
    if (isOwnUI(e.target)) return;
    // While typing in a page element, let the browser's native editing win.
    if (state.editingEl) return;

    if (e.key === "Escape") {
      disable();
      return;
    }

    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((key === "z" && e.shiftKey) || key === "y") {
      e.preventDefault();
      redo();
    }
  }

  // ---- toolbar UI ------------------------------------------------------

  // Drag the bar by its title so it can be moved off whatever the user wants
  // to edit. The CSS positions the bar with !important, so the drag must set
  // its inline styles with priority "important" too or they're ignored.
  function setPos(bar, left, top) {
    bar.style.setProperty("left", `${left}px`, "important");
    bar.style.setProperty("top", `${top}px`, "important");
    bar.style.setProperty("transform", "none", "important");
  }

  function makeDraggable(bar, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0;

    const onMove = (e) => {
      const r = bar.getBoundingClientRect();
      const maxX = Math.max(0, window.innerWidth - r.width);
      const maxY = Math.max(0, window.innerHeight - r.height);
      const nx = Math.min(Math.max(0, ox + e.clientX - sx), maxX);
      const ny = Math.min(Math.max(0, oy + e.clientY - sy), maxY);
      setPos(bar, nx, ny);
      state.toolbarPos = { left: nx, top: ny };
      e.preventDefault();
      e.stopPropagation();
    };

    const onUp = (e) => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      e.stopPropagation();
    };

    handle.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const r = bar.getBoundingClientRect();
      setPos(bar, r.left, r.top); // pin before the CSS centering fights us
      sx = e.clientX;
      sy = e.clientY;
      ox = r.left;
      oy = r.top;
      e.preventDefault();
      e.stopPropagation();
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("mouseup", onUp, true);
    }, true);
  }

  function applyToolbarPos(bar) {
    const p = state.toolbarPos;
    if (p) setPos(bar, p.left, p.top);
  }

  function buildToolbar() {
    const bar = document.createElement("div");
    bar.className = `${NS}-ui ${NS}-toolbar`;

    const title = document.createElement("span");
    title.className = `${NS}-title`;
    title.textContent = "⠿ Page Tinker";
    title.title = "Drag to move";
    bar.appendChild(title);
    makeDraggable(bar, title);

    const mk = (label, mode) => {
      const b = document.createElement("button");
      b.className = `${NS}-btn`;
      b.textContent = label;
      b.dataset.mode = mode;
      b.addEventListener("click", () => setMode(mode));
      return b;
    };

    bar.appendChild(mk("Edit text", MODES.EDIT));
    bar.appendChild(mk("Hide", MODES.HIDE));
    bar.appendChild(mk("Delete", MODES.DELETE));
    bar.appendChild(mk("Screenshot", MODES.SHOT));
    bar.appendChild(mk("Replace", MODES.REPLACE));

    const sep = document.createElement("span");
    sep.className = `${NS}-sep`;
    bar.appendChild(sep);

    const undoBtn = document.createElement("button");
    undoBtn.className = `${NS}-btn ${NS}-undo`;
    undoBtn.textContent = "↶ Undo";
    undoBtn.title = "Undo (Ctrl+Z)";
    undoBtn.addEventListener("click", undo);
    bar.appendChild(undoBtn);

    const redoBtn = document.createElement("button");
    redoBtn.className = `${NS}-btn ${NS}-redo`;
    redoBtn.textContent = "↷ Redo";
    redoBtn.title = "Redo (Ctrl+Shift+Z)";
    redoBtn.addEventListener("click", redo);
    bar.appendChild(redoBtn);

    const done = document.createElement("button");
    done.className = `${NS}-btn ${NS}-done`;
    done.textContent = "Done (Esc)";
    done.addEventListener("click", disable);
    bar.appendChild(done);

    // Find/replace panel - its own line under the buttons, shown only in
    // Replace mode (flex-basis:100% via .pt-panel in CSS).
    const panel = document.createElement("div");
    panel.className = `${NS}-panel`;

    const findInput = document.createElement("input");
    findInput.className = `${NS}-input`;
    findInput.type = "text";
    findInput.placeholder = "Find";
    findInput.addEventListener("input", () =>
      scheduleHighlight(findInput.value)
    );
    state.findInput = findInput;

    const replInput = document.createElement("input");
    replInput.className = `${NS}-input`;
    replInput.type = "text";
    replInput.placeholder = "Replace with";

    const apply = document.createElement("button");
    apply.className = `${NS}-btn`;
    apply.textContent = "Replace all";

    const count = document.createElement("span");
    count.className = `${NS}-count`;

    apply.addEventListener("click", () => {
      const n = doReplace(findInput.value, replInput.value);
      count.textContent =
        n > 0 ? `${n} node${n === 1 ? "" : "s"} changed` : "No matches";
      // Re-highlight against the now-changed page (usually clears it).
      updateHighlight(findInput.value);
    });

    panel.appendChild(findInput);
    panel.appendChild(replInput);
    panel.appendChild(apply);
    panel.appendChild(count);
    bar.appendChild(panel);
    state.panel = panel;

    return bar;
  }

  function setMode(mode) {
    state.mode = mode;
    endTextEdit();
    if (!state.toolbar) return;
    state.toolbar.querySelectorAll(`.${NS}-btn[data-mode]`).forEach((b) => {
      b.classList.toggle(`${NS}-active`, b.dataset.mode === mode);
    });
    if (state.panel) {
      state.panel.style.display = mode === MODES.REPLACE ? "flex" : "none";
    }
    if (mode === MODES.REPLACE) {
      // The hover highlight is meaningless here; show match highlights.
      onScrollOrResize();
      updateHighlight(state.findInput ? state.findInput.value : "");
    } else {
      clearHighlight();
    }
  }

  // ---- lifecycle -------------------------------------------------------

  function enable() {
    if (state.active) return;
    state.active = true;

    state.overlay = document.createElement("div");
    state.overlay.className = `${NS}-ui ${NS}-overlay`;
    document.body.appendChild(state.overlay);

    state.toolbar = buildToolbar();
    document.body.appendChild(state.toolbar);
    applyToolbarPos(state.toolbar);
    setMode(state.mode);
    refreshHistoryButtons();

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize, true);
  }

  function disable() {
    if (!state.active) return;
    state.active = false;
    endTextEdit();

    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("mousedown", onMouseDown, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", onScrollOrResize, true);
    window.removeEventListener("resize", onScrollOrResize, true);

    if (hlTimer) clearTimeout(hlTimer);
    clearHighlight();

    if (state.overlay) state.overlay.remove();
    if (state.toolbar) state.toolbar.remove();
    state.overlay = null;
    state.toolbar = null;
    state.panel = null;
    state.findInput = null;
    // History is intentionally kept: re-enabling within the same page session
    // lets the user keep undoing/redoing earlier changes.
  }

  function toggle() {
    if (state.active) disable();
    else enable();
  }

  window.__PAGE_TINKER__ = { toggle, enable, disable };
  enable(); // first injection turns it on
})();

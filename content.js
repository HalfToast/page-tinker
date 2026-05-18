// Page Tinker - in-page editor
//
// Injected on demand. All changes are ephemeral: nothing is stored and a
// reload restores the original page. This file is idempotent - re-injecting
// it just toggles the editor.

(() => {
  "use strict";

  // If we've already set up, this injection is a "toggle" request.
  if (window.__PAGE_TINKER__) {
    window.__PAGE_TINKER__.toggle();
    return;
  }

  const NS = "pt"; // class/data prefix to avoid collisions with the host page
  const MODES = {
    EDIT: "edit",
    HIDE: "hide",
    DELETE: "delete"
  };

  const state = {
    active: false,
    mode: MODES.EDIT,
    overlay: null, // hover highlight box
    toolbar: null,
    editingEl: null, // element currently in contentEditable mode
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

  // ---- undo / redo -----------------------------------------------------
  //
  // Every destructive action records exactly enough to reverse and replay it.
  // Element references are kept alive even for deleted nodes (a detached node
  // is not garbage-collected while we hold it), so delete is fully reversible.

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
      }
    } catch (e) {
      // Target may have been detached by an earlier action; skip gracefully.
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

  function endTextEdit() {
    if (!state.editingEl) return;
    const el = state.editingEl;
    const before = state.editingBefore;
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

    const finish = (e) => {
      if (e.type === "keydown" && e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
      } else if (e.type === "keydown" && e.key !== "Escape" && e.key !== "Enter") {
        return;
      }
      el.removeEventListener("blur", finish);
      el.removeEventListener("keydown", finish);
      endTextEdit();
    };
    el.addEventListener("blur", finish);
    el.addEventListener("keydown", finish);
  }

  // ---- event handlers --------------------------------------------------

  function onMouseMove(e) {
    if (state.editingEl) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    moveOverlayTo(el);
  }

  function onScrollOrResize() {
    if (state.overlay) state.overlay.style.display = "none";
  }

  function onClick(e) {
    const el = e.target;
    if (isOwnUI(el)) return; // toolbar buttons work normally
    if (!state.active) return;
    if (isProtected(el)) return;

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
    }
  }

  function onKeyDown(e) {
    // While typing in an element, let the browser's native editing/undo win.
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

  // ---- UI --------------------------------------------------------------

  function buildToolbar() {
    const bar = document.createElement("div");
    bar.className = `${NS}-ui ${NS}-toolbar`;

    const title = document.createElement("span");
    title.className = `${NS}-title`;
    title.textContent = "Page Tinker";
    bar.appendChild(title);

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

    return bar;
  }

  function setMode(mode) {
    state.mode = mode;
    endTextEdit();
    if (!state.toolbar) return;
    state.toolbar.querySelectorAll(`.${NS}-btn[data-mode]`).forEach((b) => {
      b.classList.toggle(`${NS}-active`, b.dataset.mode === mode);
    });
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
    setMode(state.mode);
    refreshHistoryButtons();

    document.addEventListener("mousemove", onMouseMove, true);
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
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", onScrollOrResize, true);
    window.removeEventListener("resize", onScrollOrResize, true);

    if (state.overlay) state.overlay.remove();
    if (state.toolbar) state.toolbar.remove();
    state.overlay = null;
    state.toolbar = null;
    // History is intentionally kept: re-opening the toolbar in the same page
    // session lets the user keep undoing/redoing earlier changes.
  }

  function toggle() {
    if (state.active) disable();
    else enable();
  }

  window.__PAGE_TINKER__ = { toggle, enable, disable };
  enable(); // first injection turns it on
})();

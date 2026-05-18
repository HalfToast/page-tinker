// Page Tinker - background service worker
//
// We deliberately use NO host_permissions and NO declarative content scripts.
// The editor is injected only when the user clicks the toolbar icon or presses
// the shortcut, using the activeTab permission. That means the extension can
// touch a page only on an explicit user gesture - the core privacy promise.

async function toggleOnTab(tab) {
  if (!tab || !tab.id) return;

  // Refuse to inject on pages where extensions are not allowed (chrome://,
  // the Web Store, etc). executeScript would throw an unhelpful error.
  const url = tab.url || "";
  if (/^(chrome|edge|about|chrome-extension|https:\/\/chrome\.google\.com\/webstore)/.test(url)) {
    return;
  }

  try {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["content.css"]
    });
    // Re-running content.js is safe: it guards against double-init and simply
    // toggles the editor on/off on each injection.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
  } catch (err) {
    console.warn("Page Tinker: could not attach to this page.", err);
  }
}

chrome.action.onClicked.addListener((tab) => {
  toggleOnTab(tab);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-tinker") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  toggleOnTab(tab);
});

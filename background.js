// Page Tinker - background
//
// No host_permissions and no declarative content scripts. The editor is
// injected only on a user gesture that grants activeTab: the toolbar button
// (shown in the browser's extensions list/area), the right-click menu item,
// or the Alt+Shift+E shortcut.

const MENU_ID = "pt-start";

async function toggleOnTab(tab) {
  if (!tab || !tab.id) return;

  // Browsers forbid extension injection on internal pages; executeScript
  // would only throw an unhelpful error there.
  const url = tab.url || "";
  if (/^(chrome|edge|about|chrome-extension|https:\/\/chrome\.google\.com\/webstore)/.test(url)) {
    return;
  }

  try {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["content.css"]
    });
    // Re-running content.js is safe: it guards against double-init and just
    // toggles the editor on/off on each injection.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
  } catch (err) {
    console.warn("Page Tinker: could not attach to this page.", err);
  }
}

// The context-menu API is desktop-only on Firefox - chrome.contextMenus is
// undefined on Firefox for Android. Feature-detect so the background script
// doesn't throw there; the toolbar button (extensions menu) still works.
const hasMenus = typeof chrome.contextMenus !== "undefined";

// Recreate the menu item idempotently. removeAll first so an event-page /
// service-worker restart can't throw "duplicate id".
function ensureMenu() {
  if (!hasMenus) return;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Start Page Tinker on this page",
      contexts: ["all"]
    });
  });
}

chrome.runtime.onInstalled.addListener(ensureMenu);
chrome.runtime.onStartup.addListener(ensureMenu);

chrome.action.onClicked.addListener((tab) => {
  toggleOnTab(tab);
});

if (hasMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_ID) toggleOnTab(tab);
  });
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-tinker") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  toggleOnTab(tab);
});

// Screenshot: the content script can't call captureVisibleTab itself, so it
// asks here. activeTab (already granted by the start gesture) covers this -
// no host permissions needed.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.cmd !== "capture") return;
  const winId = sender.tab ? sender.tab.windowId : undefined;
  chrome.tabs
    .captureVisibleTab(winId, { format: "png" })
    .then((url) => sendResponse(url))
    .catch((err) => {
      console.warn("Page Tinker: captureVisibleTab failed.", err);
      sendResponse(null);
    });
  return true; // keep the channel open for the async response
});

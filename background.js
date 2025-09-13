chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "calcFromSelection",
    title: "用工時計算（從選取文字）",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "calcFromPage",
    title: "用工時計算（偵測頁面價格）",
    contexts: ["page"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === "calcFromSelection" && info.selectionText) {
    const price = parsePrice(info.selectionText);
    chrome.tabs.sendMessage(tab.id, { type: "CALC_RESULT", price });
  }

  if (info.menuItemId === "calcFromPage") {
    chrome.tabs.sendMessage(tab.id, { type: "FIND_AND_CALC" });
  }
});

function parsePrice(text) {
  // 抓 NT$ 或 $ 開頭、含逗號的數字
  const m = text.replace(/\s+/g, "")
                .match(/(?:NT\$|\$)?\s*([\d,]+(?:\.\d+)?)/i);
  if (!m) return null;
  return Number(m[1].replace(/,/g, ""));
}

const priceInput = document.getElementById("price");
const resultEl = document.getElementById("result");
const detectedEl = document.getElementById("detected");

document.getElementById("calc").addEventListener("click", async () => {
  const price = Number(priceInput.value || 0);
  if (!price) return (resultEl.textContent = "請輸入價格");
  const { hours, days } = await calcWorkHours(price);
  resultEl.textContent = `約需 ${hours} 小時（約 ${days} 天）`;
});

(async function init(){
  // 嘗試從目前分頁讀取價格（透過 content.js 的搜尋）
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.id) return;
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const PRICE_REGEX = /(?:NT\$|\$)?\s*([\d,]+(?:\.\d+)?)/;
      const candidates = [...document.body.innerText.matchAll(PRICE_REGEX)]
        .map(m=>Number(m[1].replace(/,/g,"")))
        .filter(n=>n>=100 && n<=1000000);
      if (!candidates.length) return null;
      candidates.sort((a,b)=>a-b);
      return candidates[Math.floor(candidates.length/2)];
    }
  });
  if (result) {
    detectedEl.textContent = `偵測到頁面價格：NT$${result.toLocaleString("zh-TW")}`;
    priceInput.value = result;
  }
})();

async function calcWorkHours(price){
  const defaults = { mode:"hourly", hourlyWage:183, dailyHours:8, roundTo:1 };
  const s = Object.assign(defaults, await chrome.storage.sync.get(null));
  const wage = s.mode === "hourly" ? s.hourlyWage : (s.monthlySalary||0)/(s.monthlyHours||174);
  const net = (typeof s.taxRate==="number") ? wage*(1-s.taxRate) : wage;
  const hours = price/Math.max(net,1);
  const days = hours/Math.max(s.dailyHours,1);
  return { hours: round(hours, s.roundTo), days: round(days, s.roundTo) };
}
function round(n,d=1){ const p=10**d; return Math.round(n*p)/p; }

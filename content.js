const PRICE_SELECTORS = [
  ".price .promoPrice",       // 舉例
  ".prdprice .sale-price",    // 舉例
  "[class*='price'] strong",  // 比較寬鬆
  "[class*='price'] span"
];

const PRICE_REGEX = /(?:NT\$|\$)?\s*([\d,]+(?:\.\d+)?)/;

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.type === "CALC_RESULT") {
    if (!msg.price) return showDialog("選取文字中找不到價格");
    const { hours, days } = await calcWorkHours(msg.price);

    // 1) 右鍵時，盡量貼在「目前選取文字」旁
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      return showDialog(`NT$${msg.price.toLocaleString("zh-TW")} ≈ ${hours} 小時（約 ${days} 天）`,
                       { left: rect.left, top: rect.bottom });
    }

    // 2) 退回：找主價格元素錨點
    const anchor = findMainPriceEl(msg.price) || document.querySelector(PRICE_SELECTORS.join(", "));
    showDialog(`NT$${msg.price.toLocaleString("zh-TW")} ≈ ${hours} 小時（約 ${days} 天）`, anchor);
  }

  if (msg.type === "FIND_AND_CALC") {
    const price = findPriceOnPage();
    if (!price) return showDialog("找不到可解析的價格");
    const { hours, days } = await calcWorkHours(price);
    const anchor = findMainPriceEl(price) || document.querySelector(PRICE_SELECTORS.join(", "));
    showDialog(`NT$${price.toLocaleString("zh-TW")} ≈ ${hours} 小時（約 ${days} 天）`, anchor);
  }
});

function findPriceOnPage() {
  // 先試選擇器
  for (const sel of PRICE_SELECTORS) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const text = el.textContent || "";
    const m = text.replace(/\s+/g, "").match(PRICE_REGEX);
    if (m) return Number(m[1].replace(/,/g, ""));
  }
  // 再掃整頁（避免誤判，取最大合理值但排除極大/極小）
  const allText = document.body.innerText;
  const matches = [...allText.matchAll(PRICE_REGEX)]
    .map(m => Number(m[1].replace(/,/g, "")))
    .filter(n => n >= 100 && n <= 1000000);
  if (matches.length) {
    // 取中位數避免取到「已折xx」之類干擾
    matches.sort((a,b)=>a-b);
    return matches[Math.floor(matches.length/2)];
  }
  return null;
}
function findMainPriceEl(expectedPrice = null) {
  // 嚴格一點的 momo 主價格候選
  const CANDIDATES = [
    ".special .money",               // momo 常見藍底大字
    ".priceArea .special .money",
    ".priceArea .sale, .priceArea .promoPrice",
    ".prdprice .sale-price",
    ".price .promoPrice"
  ];

  // 先找候選
  let els = [];
  CANDIDATES.forEach(sel => els.push(...document.querySelectorAll(sel)));
  if (els.length === 0) els = [...document.querySelectorAll(PRICE_SELECTORS.join(", "))];

  // 若知道目標價格，挑「文字數值相等」者
  if (expectedPrice != null) {
    const match = els.find(el => {
      const m = (el.textContent || "").replace(/\s+/g,"").match(/([\d,]+(?:\.\d+)?)/);
      return m && Number(m[1].replace(/,/g,"")) === Number(expectedPrice);
    });
    if (match) return match;
  }

  // 不知道價格：挑畫面上最「顯眼」（寬度/字體較大）的
  els.sort((a,b) => {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return (rb.width * rb.height) - (ra.width * ra.height);
  });
  return els[0] || null;
}

async function calcWorkHours(price) {
  const defaults = {
    mode: "hourly",
    hourlyWage: 183,   // 台灣基本時薪可自訂
    dailyHours: 8,
    roundTo: 1
  };
  const { mode, hourlyWage, monthlySalary, monthlyHours, dailyHours, taxRate, roundTo } =
    Object.assign(defaults, await chrome.storage.sync.get(null));

  let wage;
  if (mode === "hourly") wage = hourlyWage;
  else wage = (monthlySalary || 0) / (monthlyHours || 174); // 常見月工時預設 174

  const netWage = (typeof taxRate === "number") ? wage * (1 - taxRate) : wage;
  const hours = price / Math.max(netWage, 1);
  const days = hours / Math.max(dailyHours, 1);
  return {
    hours: round(hours, roundTo),
    days: round(days, roundTo)
  };
}

function round(n, digits=1){ const p = 10**digits; return Math.round(n*p)/p; }
function formatCurrency(n){ return `NT$${n.toLocaleString("zh-TW")}`; }

// 2) 於價格旁邊插入「工時計算」小按鈕（提升可發現性）
const injected = new WeakSet();
function injectButtons() {
  PRICE_SELECTORS.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      if (injected.has(el)) return;
      const btn = document.createElement("button");
      btn.textContent = "工時計算";
      btn.className = "wtc-inline-btn";
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const m = (el.textContent || "").replace(/\s+/g, "").match(PRICE_REGEX);
        if (!m) return showDialog("讀不到價格");
        const price = Number(m[1].replace(/,/g, ""));
        const result = await calcWorkHours(price);
        showDialog(`${formatCurrency(price)} ≈ ${result.hours} 小時（約 ${result.days} 天）`, el);
      });
      el.insertAdjacentElement("afterend", btn);
      injected.add(el);
    });
  });
}
injectButtons();
// 應對 SPA 與動態載入
const mo = new MutationObserver(() => injectButtons());
mo.observe(document.body, { childList: true, subtree: true });

// 單一對話框（泡泡）
function showDialog(text, anchor = null, ttl = 8000) {
  // 若已存在舊的，先移除
  const old = document.getElementById("wtc-dialog");
  if (old) old.remove();

  const box = document.createElement("div");
  box.id = "wtc-dialog";
  box.className = "wtc-dialog";
  box.setAttribute("role", "status");
  box.setAttribute("aria-live", "polite");

  // 文字
  const msg = document.createElement("div");
  msg.textContent = text;
  box.appendChild(msg);

  // 右上角 ×
  const btn = document.createElement("button");
  btn.className = "wtc-close";
  btn.setAttribute("aria-label", "close");
  btn.textContent = "×";
  btn.addEventListener("click", remove);
  box.appendChild(btn);

  // 泡泡箭頭
  const arrow = document.createElement("div");
  arrow.className = "wtc-arrow";
  box.appendChild(arrow);

  document.body.appendChild(box);

  // 定位：元素錨點 / 座標錨點 / 右下角
  const placeAt = (left, top) => {
    const pad = 8, maxW = 320;
    // 邊界修正
    left = Math.min(Math.max(left, pad), window.innerWidth - maxW - pad);
    top  = Math.min(top + 8, window.innerHeight - 56);
    box.style.left = `${left}px`;
    box.style.top  = `${top}px`;
    box.style.right = "auto";
    box.style.bottom = "auto";
    // 箭頭位置（盡量靠近錨點）
    arrow.style.left = Math.max(16, Math.min((left + 24) - left, maxW - 24)) + "px";
  };

  if (anchor && typeof anchor.left === "number") {
    // 座標錨點（例如：選取文字 rect）
    box.style.position = "fixed";
    placeAt(anchor.left, anchor.top);
  } else if (anchor instanceof Element) {
    // 元素錨點（例如：價格元素）
    const r = anchor.getBoundingClientRect();
    box.style.position = "fixed";
    placeAt(r.left, r.bottom);
  } else {
    // 右下角（退路）
    box.style.position = "fixed";
    box.style.right = "16px";
    box.style.bottom = "16px";
    arrow.style.display = "none"; // 右下角不需要箭頭
  }

  // 進場
  requestAnimationFrame(() => box.classList.add("show"));

  // 自動關閉（可暫停）
  let timer;
  function remove() {
    box.classList.remove("show");
    setTimeout(() => box.remove(), 250);
  }
  function start(){ timer = setTimeout(remove, ttl); }
  function stop(){ if (timer) clearTimeout(timer); }
  box.addEventListener("mouseenter", stop);
  box.addEventListener("mouseleave", start);
  start();
}


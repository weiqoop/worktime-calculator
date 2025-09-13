const modeEl = document.getElementById("mode");
const hourlyEl = document.getElementById("hourlyWage");
const mSalEl = document.getElementById("monthlySalary");
const mHrsEl = document.getElementById("monthlyHours");
const dHrsEl = document.getElementById("dailyHours");
const taxEl = document.getElementById("taxRate");
const roundEl = document.getElementById("roundTo");
const statusEl = document.getElementById("status");

function syncModeUI(){
  document.querySelectorAll("[data-mode]").forEach(el=>{
    el.style.display = (el.getAttribute("data-mode") === modeEl.value) ? "grid" : "none";
  });
}
modeEl.addEventListener("change", syncModeUI);

async function load(){
  const s = await chrome.storage.sync.get(null);
  modeEl.value = s.mode || "hourly";
  hourlyEl.value = s.hourlyWage ?? "";
  mSalEl.value = s.monthlySalary ?? "";
  mHrsEl.value = s.monthlyHours ?? "";
  dHrsEl.value = s.dailyHours ?? 8;
  roundEl.value = s.roundTo ?? 1;
  taxEl.value = (typeof s.taxRate === "number") ? (s.taxRate * 100) : "";
  syncModeUI();
}
load();

document.getElementById("save").addEventListener("click", async ()=>{
  const payload = {
    mode: modeEl.value,
    hourlyWage: numOrUndef(hourlyEl.value),
    monthlySalary: numOrUndef(mSalEl.value),
    monthlyHours: numOrUndef(mHrsEl.value),
    dailyHours: numOrUndef(dHrsEl.value) ?? 8,
    roundTo: numOrUndef(roundEl.value) ?? 1,
    taxRate: numOrUndef(taxEl.value) != null ? (Number(taxEl.value)/100) : undefined
  };
  await chrome.storage.sync.set(payload);
  statusEl.textContent = "已儲存 ✅";
  setTimeout(()=>statusEl.textContent="", 1500);
});

function numOrUndef(v){ return v===""? undefined : Number(v); }

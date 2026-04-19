const DB_NAME = "smoke-tracker-db";
const RECORD_STORE = "records";
const SETTINGS_STORE = "settings";
const DB_VERSION = 3;
const HISTORY_LIMIT = 10;
const DEFAULT_PACK_PRICE = 600;
const TREND_LOOKBACK_DAYS = 7;

const dateEl = document.getElementById("today-date");
const elapsedEl = document.getElementById("elapsed-time");
const monthlyCostEl = document.getElementById("monthly-cost");
const dailyCountEl = document.getElementById("daily-count");
const trendArrowEl = document.getElementById("trend-arrow");
const historyListEl = document.getElementById("history-list");
const incrementButton = document.getElementById("increment-button");
const viewHomeEl = document.getElementById("view-home");
const viewSettingsEl = document.getElementById("view-settings");
const navItems = document.querySelectorAll(".nav-item");
const packPriceInput = document.getElementById("pack-price-input");
const savePackPriceButton = document.getElementById("save-pack-price-button");
const exportButton = document.getElementById("export-button");
const importButton = document.getElementById("import-button");
const importFileInput = document.getElementById("import-file-input");

let dbPromise;
let currentRecords = [];
let currentSettings = { packPrice: DEFAULT_PACK_PRICE };
let timerId = null;
let elapsedBaseTime = null;

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "2-digit",
  day: "2-digit",
});
const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const numberFormatter = new Intl.NumberFormat("ja-JP");

function getTodayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDuration(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(safe / 3600)).padStart(2, "0");
  const mm = String(Math.floor((safe % 3600) / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function normalizeRecord(raw) {
  if (!raw || typeof raw.createdAt !== "string") return null;
  const dt = new Date(raw.createdAt);
  if (Number.isNaN(dt.getTime())) return null;
  const quantity = Number(raw.quantity);
  return {
    createdAt: dt.toISOString(),
    dayKey: getTodayKey(dt),
    quantity: Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1,
    trendEligible: typeof raw.trendEligible === "boolean" ? raw.trendEligible : true,
  };
}

function countCigarettes(records) {
  return records.reduce((sum, r) => sum + r.quantity, 0);
}

function getTodayRecords(records, now = new Date()) {
  const key = getTodayKey(now);
  return records.filter((r) => r.dayKey === key);
}

function getMonthRecords(records, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  return records.filter((r) => {
    const dt = new Date(r.createdAt);
    return dt.getFullYear() === y && dt.getMonth() === m;
  });
}

function getLatestRecord(records) {
  if (records.length === 0) return null;
  return records
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
}

function calcTrendArrow(records, now = new Date()) {
  const todayEligible = getTodayRecords(records, now).filter((r) => r.trendEligible);
  const todayCount = countCigarettes(todayEligible);

  const baselineCounts = [];
  for (let i = 1; i <= TREND_LOOKBACK_DAYS; i += 1) {
    const target = new Date(now);
    target.setDate(target.getDate() - i);
    const targetKey = getTodayKey(target);
    const cutoff = new Date(target);
    cutoff.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());

    const partial = records.filter((r) => {
      if (!r.trendEligible || r.dayKey !== targetKey) return false;
      return new Date(r.createdAt) <= cutoff;
    });
    baselineCounts.push(countCigarettes(partial));
  }

  const avg = baselineCounts.reduce((s, n) => s + n, 0) / TREND_LOOKBACK_DAYS;
  if (todayCount > avg + 0.5) return "↑";
  if (todayCount < avg - 0.5) return "↓";
  return "→";
}

function renderElapsedOnly() {
  if (!elapsedBaseTime) {
    elapsedEl.textContent = "00:00:00";
    return;
  }
  const diff = (Date.now() - elapsedBaseTime) / 1000;
  elapsedEl.textContent = formatDuration(diff);
}

function startElapsedTimer() {
  if (timerId !== null) clearInterval(timerId);
  renderElapsedOnly();
  timerId = setInterval(() => {
    renderElapsedOnly();
  }, 1000);
}

function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORD_STORE)) {
        const store = db.createObjectStore(RECORD_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function getAllRecords() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECORD_STORE, "readonly");
    const request = tx.objectStore(RECORD_STORE).getAll();
    request.onsuccess = () => {
      resolve(request.result.map(normalizeRecord).filter(Boolean));
    };
    request.onerror = () => reject(request.error);
  });
}

async function addRecord(quantity = 1, trendEligible = true) {
  const db = await openDatabase();
  const now = new Date();
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
  const payload = {
    createdAt: now.toISOString(),
    dayKey: getTodayKey(now),
    quantity: safeQuantity,
    trendEligible,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECORD_STORE, "readwrite");
    tx.objectStore(RECORD_STORE).add(payload);
    tx.oncomplete = () => resolve(payload);
    tx.onerror = () => reject(tx.error);
  });
}

async function getSettings() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, "readonly");
    const request = tx.objectStore(SETTINGS_STORE).get("main");
    request.onsuccess = () => {
      const packPrice = Number(request.result?.value?.packPrice);
      resolve({
        packPrice: Number.isFinite(packPrice) && packPrice > 0 ? Math.floor(packPrice) : DEFAULT_PACK_PRICE,
      });
    };
    request.onerror = () => reject(request.error);
  });
}

async function saveSettings(nextSettings) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, "readwrite");
    tx.objectStore(SETTINGS_STORE).put({ key: "main", value: nextSettings });
    tx.oncomplete = () => resolve(nextSettings);
    tx.onerror = () => reject(tx.error);
  });
}

function renderHome() {
  const now = new Date();
  const todayRecords = getTodayRecords(currentRecords, now);
  const monthRecords = getMonthRecords(currentRecords, now);
  const latestRecord = getLatestRecord(currentRecords);

  const todayCount = countCigarettes(todayRecords);
  const monthCount = countCigarettes(monthRecords);
  const monthlyCost = Math.floor((monthCount * currentSettings.packPrice) / 20);

  dailyCountEl.textContent = String(todayCount);
  monthlyCostEl.textContent = numberFormatter.format(monthlyCost);
  trendArrowEl.textContent = calcTrendArrow(currentRecords, now);
  dateEl.textContent = dateFormatter.format(now);

  elapsedBaseTime = latestRecord ? new Date(latestRecord.createdAt).getTime() : null;
  renderElapsedOnly();

  const recent = currentRecords
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, HISTORY_LIMIT);

  historyListEl.innerHTML = "";
  if (recent.length === 0) {
    const li = document.createElement("li");
    li.className = "history-item history-empty";
    li.textContent = "まだ記録はありません";
    historyListEl.appendChild(li);
  } else {
    for (const rec of recent) {
      const li = document.createElement("li");
      li.className = "history-item";
      const label = rec.quantity > 1 ? ` x${rec.quantity}` : "";
      li.textContent = `${dateTimeFormatter.format(new Date(rec.createdAt))}${label}`;
      historyListEl.appendChild(li);
    }
  }
}

function switchView(viewName) {
  const settings = viewName === "settings";
  viewHomeEl.classList.toggle("hidden", settings);
  viewSettingsEl.classList.toggle("hidden", !settings);
  incrementButton.classList.toggle("hidden", settings);
  navItems.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.view === viewName);
  });
}

async function refreshScreen() {
  currentRecords = await getAllRecords();
  currentSettings = await getSettings();
  packPriceInput.value = String(currentSettings.packPrice);
  renderHome();
}

async function exportData() {
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    records: currentRecords,
    settings: currentSettings,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  a.href = url;
  a.download = `smoke-tracker-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importData(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const importedRecords = Array.isArray(parsed.records)
    ? parsed.records.map(normalizeRecord).filter(Boolean)
    : [];
  const packPrice = Number(parsed.settings?.packPrice);
  const settings = {
    packPrice: Number.isFinite(packPrice) && packPrice > 0 ? Math.floor(packPrice) : DEFAULT_PACK_PRICE,
  };

  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction([RECORD_STORE, SETTINGS_STORE], "readwrite");
    tx.objectStore(RECORD_STORE).clear();
    tx.objectStore(SETTINGS_STORE).clear();
    for (const rec of importedRecords) tx.objectStore(RECORD_STORE).add(rec);
    tx.objectStore(SETTINGS_STORE).put({ key: "main", value: settings });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return;
  try {
    await navigator.storage.persist();
  } catch (error) {
    console.warn("persistent storage request failed", error);
  }
}

incrementButton.addEventListener("click", async () => {
  incrementButton.disabled = true;
  try {
    await addRecord(1, true);
    await refreshScreen();
  } catch (error) {
    console.error(error);
    alert("記録に失敗しました。");
  } finally {
    incrementButton.disabled = false;
  }
});

savePackPriceButton.addEventListener("click", async () => {
  const value = Number(packPriceInput.value);
  if (!Number.isFinite(value) || value <= 0) {
    alert("1箱金額は1以上で入力してください。");
    return;
  }
  try {
    currentSettings = await saveSettings({ packPrice: Math.floor(value) });
    await refreshScreen();
    alert("保存しました。");
  } catch (error) {
    console.error(error);
    alert("保存に失敗しました。");
  }
});

exportButton.addEventListener("click", async () => {
  try {
    await refreshScreen();
    await exportData();
  } catch (error) {
    console.error(error);
    alert("エクスポートに失敗しました。");
  }
});

importButton.addEventListener("click", async () => {
  const file = importFileInput.files?.[0];
  if (!file) {
    alert("インポートするファイルを選択してください。");
    return;
  }
  try {
    await importData(file);
    importFileInput.value = "";
    await refreshScreen();
    alert("インポートしました。");
  } catch (error) {
    console.error(error);
    alert("インポートに失敗しました。JSONを確認してください。");
  }
});

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    const view = item.dataset.view;
    if (view === "home" || view === "settings") switchView(view);
  });
});

window.addEventListener("load", async () => {
  try {
    if ("serviceWorker" in navigator) {
      await navigator.serviceWorker.register("./sw.js");
    }
    await requestPersistentStorage();
    switchView("home");
    await refreshScreen();
    startElapsedTimer();
  } catch (error) {
    console.error(error);
    alert("初期化に失敗しました。");
  }
});

window.addEventListener("beforeunload", () => {
  if (timerId !== null) clearInterval(timerId);
});

const DB_NAME = "smoke-tracker-db";
const RECORD_STORE = "records";
const SETTINGS_STORE = "settings";
const DB_VERSION = 3;
const DEFAULT_PACK_PRICE = 600;
const TREND_LOOKBACK_DAYS = 7;

const dateEl = document.getElementById("today-date");
const elapsedEl = document.getElementById("elapsed-time");
const monthlyCostEl = document.getElementById("monthly-cost");
const dailyCountEl = document.getElementById("daily-count");
const trendArrowEl = document.getElementById("trend-arrow");
const trendAverageEl = document.getElementById("trend-average");
const historyListEl = document.getElementById("history-list");
const incrementButton = document.getElementById("increment-button");

const viewHomeEl = document.getElementById("view-home");
const viewDataEl = document.getElementById("view-data");
const viewSettingsEl = document.getElementById("view-settings");
const navItems = document.querySelectorAll(".nav-item");

const calendarMonthEl = document.getElementById("calendar-month");
const calendarGridEl = document.getElementById("calendar-grid");
const calendarPrevButton = document.getElementById("calendar-prev");
const calendarNextButton = document.getElementById("calendar-next");
const selectedDateLabelEl = document.getElementById("selected-date-label");
const dataRecordListEl = document.getElementById("data-record-list");
const dataAddOneButton = document.getElementById("data-add-one");
const dataAddBatchButton = document.getElementById("data-add-batch");

const packPriceInput = document.getElementById("pack-price-input");
const savePackPriceButton = document.getElementById("save-pack-price-button");
const exportButton = document.getElementById("export-button");
const importButton = document.getElementById("import-button");
const importFileInput = document.getElementById("import-file-input");

let dbPromise;
let currentRecords = [];
let currentSettings = { packPrice: DEFAULT_PACK_PRICE };
let currentView = "home";
let timerId = null;
let elapsedBaseTime = null;
let selectedDate = new Date();
let calendarCursor = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);

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
const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
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
    id: raw.id,
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

function getRecordsByDate(records, date) {
  const key = getTodayKey(date);
  return records.filter((r) => r.dayKey === key);
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
  let arrow = "→";
  if (todayCount > avg + 0.5) arrow = "↑";
  if (todayCount < avg - 0.5) arrow = "↓";
  return { arrow, average: avg };
}

function parseHHMM(value) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

function combineDateAndTime(baseDate, hhmm) {
  const parsed = parseHHMM(hhmm);
  if (!parsed) return null;
  const dt = new Date(baseDate);
  dt.setHours(parsed.hour, parsed.minute, 0, 0);
  return dt;
}

function renderElapsedOnly() {
  if (!elapsedBaseTime) {
    elapsedEl.textContent = "00:00:00";
    return;
  }
  elapsedEl.textContent = formatDuration((Date.now() - elapsedBaseTime) / 1000);
}

function startElapsedTimer() {
  if (timerId !== null) clearInterval(timerId);
  renderElapsedOnly();
  timerId = setInterval(renderElapsedOnly, 1000);
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
    request.onsuccess = () => resolve(request.result.map(normalizeRecord).filter(Boolean));
    request.onerror = () => reject(request.error);
  });
}

async function addRecordByDate(dateObj, quantity = 1, trendEligible = true) {
  const db = await openDatabase();
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
  const payload = {
    createdAt: dateObj.toISOString(),
    dayKey: getTodayKey(dateObj),
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

async function updateRecordById(id, patch) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECORD_STORE, "readwrite");
    const store = tx.objectStore(RECORD_STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) {
        reject(new Error("record not found"));
        return;
      }
      const merged = { ...existing, ...patch };
      if (merged.createdAt) {
        const dt = new Date(merged.createdAt);
        merged.dayKey = getTodayKey(dt);
      }
      store.put(merged);
    };
    getReq.onerror = () => reject(getReq.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteRecordById(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECORD_STORE, "readwrite");
    tx.objectStore(RECORD_STORE).delete(id);
    tx.oncomplete = () => resolve();
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

  const trend = calcTrendArrow(currentRecords, now);
  trendArrowEl.textContent = trend.arrow;
  trendAverageEl.textContent = `avg ${trend.average.toFixed(1)}`;
  dateEl.textContent = dateFormatter.format(now);

  elapsedBaseTime = latestRecord ? new Date(latestRecord.createdAt).getTime() : null;
  renderElapsedOnly();

  const recent = currentRecords
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  historyListEl.innerHTML = "";
  if (recent.length === 0) {
    const li = document.createElement("li");
    li.className = "history-item history-empty";
    li.textContent = "まだ記録はありません";
    historyListEl.appendChild(li);
    return;
  }

  for (const rec of recent) {
    const li = document.createElement("li");
    li.className = "history-item";
    const suffix = rec.quantity > 1 ? ` x${rec.quantity}` : "";
    li.textContent = `${dateTimeFormatter.format(new Date(rec.createdAt))}${suffix}`;
    historyListEl.appendChild(li);
  }
}

function renderCalendar() {
  const y = calendarCursor.getFullYear();
  const m = calendarCursor.getMonth();
  calendarMonthEl.textContent = `${y}/${String(m + 1).padStart(2, "0")}`;
  calendarGridEl.innerHTML = "";

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i += 1) {
    const dayNum = i - firstDay + 1;
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cal-cell";

    if (dayNum < 1 || dayNum > daysInMonth) {
      cell.classList.add("muted");
      cell.disabled = true;
      cell.textContent = "";
    } else {
      cell.textContent = String(dayNum);
      const dateObj = new Date(y, m, dayNum);
      const key = getTodayKey(dateObj);
      const dayCount = countCigarettes(getRecordsByDate(currentRecords, dateObj));
      if (dayCount > 0) cell.dataset.count = String(dayCount);

      if (key === getTodayKey(new Date())) cell.classList.add("today");
      if (key === getTodayKey(selectedDate)) cell.classList.add("selected");

      cell.addEventListener("click", () => {
        selectedDate = dateObj;
        renderData();
      });
    }
    calendarGridEl.appendChild(cell);
  }
}

function renderDataList() {
  const records = getRecordsByDate(currentRecords, selectedDate)
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  dataRecordListEl.innerHTML = "";
  if (records.length === 0) {
    const empty = document.createElement("p");
    empty.className = "data-empty";
    empty.textContent = "選択日のデータはありません";
    dataRecordListEl.appendChild(empty);
    return;
  }

  for (const rec of records) {
    const item = document.createElement("div");
    item.className = "data-row";

    const info = document.createElement("p");
    info.className = "data-row-text";
    const trendText = rec.trendEligible ? "分析: 使う" : "分析: 使わない";
    info.textContent = `${timeFormatter.format(new Date(rec.createdAt))} / 本数 ${rec.quantity} / ${trendText}`;

    const actions = document.createElement("div");
    actions.className = "data-row-actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "mini-action";
    edit.textContent = "変更";
    edit.addEventListener("click", () => onEditRecord(rec));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "mini-action danger";
    del.textContent = "削除";
    del.addEventListener("click", () => onDeleteRecord(rec));

    actions.appendChild(edit);
    actions.appendChild(del);
    item.appendChild(info);
    item.appendChild(actions);
    dataRecordListEl.appendChild(item);
  }
}

function renderData() {
  selectedDateLabelEl.textContent = dateFormatter.format(selectedDate);
  renderCalendar();
  renderDataList();
}

function switchView(viewName) {
  currentView = viewName;
  viewHomeEl.classList.toggle("hidden", viewName !== "home");
  viewDataEl.classList.toggle("hidden", viewName !== "data");
  viewSettingsEl.classList.toggle("hidden", viewName !== "settings");
  incrementButton.classList.toggle("hidden", viewName !== "home");

  navItems.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.view === viewName);
  });

  if (viewName === "data") renderData();
}

async function refreshScreen() {
  currentRecords = await getAllRecords();
  currentSettings = await getSettings();
  packPriceInput.value = String(currentSettings.packPrice);
  renderHome();
  if (currentView === "data") renderData();
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

async function onAddSingle() {
  const defaultTime = getTodayKey(selectedDate) === getTodayKey(new Date())
    ? timeFormatter.format(new Date())
    : "12:00";
  const hhmm = prompt("時刻を入力 (HH:mm)", defaultTime);
  if (hhmm === null) return;
  const dt = combineDateAndTime(selectedDate, hhmm);
  if (!dt) {
    alert("時刻形式が不正です。例: 14:30");
    return;
  }
  await addRecordByDate(dt, 1, true);
  await refreshScreen();
}

async function onAddBatch() {
  const qtyText = prompt("本数を入力 (2以上)");
  if (qtyText === null) return;
  const qty = Number(qtyText);
  if (!Number.isFinite(qty) || qty < 2) {
    alert("本数は2以上の数値を入力してください。");
    return;
  }
  const hhmm = prompt("代表時刻を入力 (HH:mm)", "23:59");
  if (hhmm === null) return;
  const dt = combineDateAndTime(selectedDate, hhmm);
  if (!dt) {
    alert("時刻形式が不正です。例: 23:59");
    return;
  }
  await addRecordByDate(dt, Math.floor(qty), false);
  await refreshScreen();
}

async function onEditRecord(rec) {
  const currentTime = timeFormatter.format(new Date(rec.createdAt));
  const timeText = prompt("時刻を入力 (HH:mm)", currentTime);
  if (timeText === null) return;
  const dt = combineDateAndTime(selectedDate, timeText);
  if (!dt) {
    alert("時刻形式が不正です。");
    return;
  }

  const qtyText = prompt("本数を入力 (1以上)", String(rec.quantity));
  if (qtyText === null) return;
  const qty = Number(qtyText);
  if (!Number.isFinite(qty) || qty < 1) {
    alert("本数は1以上で入力してください。");
    return;
  }

  const trendText = prompt("分析に使う? y/n", rec.trendEligible ? "y" : "n");
  if (trendText === null) return;
  const trendEligible = trendText.trim().toLowerCase() !== "n";

  await updateRecordById(rec.id, {
    createdAt: dt.toISOString(),
    quantity: Math.floor(qty),
    trendEligible,
  });
  await refreshScreen();
}

async function onDeleteRecord(rec) {
  const yes = confirm(`削除しますか?\n${dateTimeFormatter.format(new Date(rec.createdAt))} / ${rec.quantity}本`);
  if (!yes) return;
  await deleteRecordById(rec.id);
  await refreshScreen();
}

incrementButton.addEventListener("click", async () => {
  incrementButton.disabled = true;
  try {
    await addRecordByDate(new Date(), 1, true);
    await refreshScreen();
  } catch (error) {
    console.error(error);
    alert("記録に失敗しました。");
  } finally {
    incrementButton.disabled = false;
  }
});

calendarPrevButton.addEventListener("click", () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
  renderData();
});
calendarNextButton.addEventListener("click", () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
  renderData();
});
dataAddOneButton.addEventListener("click", async () => {
  try {
    await onAddSingle();
  } catch (error) {
    console.error(error);
    alert("追加に失敗しました。");
  }
});
dataAddBatchButton.addEventListener("click", async () => {
  try {
    await onAddBatch();
  } catch (error) {
    console.error(error);
    alert("一括追加に失敗しました。");
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
    if (view === "home" || view === "data" || view === "settings") {
      switchView(view);
    }
  });
});

window.addEventListener("load", async () => {
  try {
    if ("serviceWorker" in navigator) {
      try {
        await navigator.serviceWorker.register("./sw.js");
      } catch (swError) {
        console.warn("service worker registration skipped", swError);
      }
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

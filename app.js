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
const viewAnalysisEl = document.getElementById("view-analysis");
const viewDataEl = document.getElementById("view-data");
const viewSettingsEl = document.getElementById("view-settings");
const navItems = document.querySelectorAll(".nav-item");

const analysisModeButtons = document.querySelectorAll("[data-analysis-mode]");
const analysisWeekdayButtons = document.querySelectorAll("[data-weekday]");
const analysisPeriodLabelEl = document.getElementById("analysis-period-label");
const analysisPrevButton = document.getElementById("analysis-prev");
const analysisNextButton = document.getElementById("analysis-next");
const analysisChartEl = document.getElementById("analysis-chart");
const analysisMonthSummaryEl = document.getElementById("analysis-month-summary");
const analysisMonthCostEl = document.getElementById("analysis-month-cost");
const analysisWeekdayRowEl = document.getElementById("analysis-weekday-row");
const legendCurrentTextEl = document.getElementById("legend-current-text");
const legendAverageTextEl = document.getElementById("legend-average-text");
const legendCumulativeItemEl = document.getElementById("legend-cumulative-item");
const legendCumulativeTextEl = document.getElementById("legend-cumulative-text");

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
let analysisMode = "hour";
let analysisWeekdayFilter = "all";
let analysisAnchor = getWeekStart(new Date());

const dateFormatter = new Intl.DateTimeFormat("ja-JP", { month: "2-digit", day: "2-digit" });
const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const timeFormatter = new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false });
const numberFormatter = new Intl.NumberFormat("ja-JP");

function getTodayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMonthStart(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
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
  const normalized = {
    createdAt: dt.toISOString(),
    dayKey: getTodayKey(dt),
    quantity: Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1,
    trendEligible: typeof raw.trendEligible === "boolean" ? raw.trendEligible : true,
  };
  if (Number.isInteger(raw.id) && raw.id > 0) normalized.id = raw.id;
  return normalized;
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
  return records.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
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
  if (todayCount > avg + 0.5) return { arrow: "↑", average: avg };
  if (todayCount < avg - 0.5) return { arrow: "↓", average: avg };
  return { arrow: "→", average: avg };
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

function isSameDate(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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
        const store = db.createObjectStore(RECORD_STORE, { keyPath: "id", autoIncrement: true });
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
      if (!existing) return reject(new Error("record not found"));
      const merged = { ...existing, ...patch };
      const dt = new Date(merged.createdAt);
      merged.dayKey = getTodayKey(dt);
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

  const recent = todayRecords.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
      calendarGridEl.appendChild(cell);
      continue;
    }

    cell.textContent = String(dayNum);
    const dateObj = new Date(y, m, dayNum);
    const dayCount = countCigarettes(getRecordsByDate(currentRecords, dateObj));
    if (dayCount > 0) cell.dataset.count = String(dayCount);
    if (isSameDate(dateObj, new Date())) cell.classList.add("today");
    if (isSameDate(dateObj, selectedDate)) cell.classList.add("selected");
    cell.addEventListener("click", () => {
      selectedDate = dateObj;
      renderData();
    });
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
    const row = document.createElement("div");
    row.className = "data-row";
    const trendText = rec.trendEligible ? "分析: 使う" : "分析: 使わない";
    const text = document.createElement("p");
    text.className = "data-row-text";
    text.textContent = `${timeFormatter.format(new Date(rec.createdAt))} / 本数 ${rec.quantity} / ${trendText}`;
    const actions = document.createElement("div");
    actions.className = "data-row-actions";

    const editButton = document.createElement("button");
    editButton.className = "mini-action";
    editButton.type = "button";
    editButton.textContent = "変更";
    editButton.addEventListener("click", () => onEditRecord(rec));

    const deleteButton = document.createElement("button");
    deleteButton.className = "mini-action danger";
    deleteButton.type = "button";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", () => onDeleteRecord(rec));

    actions.appendChild(editButton);
    actions.appendChild(deleteButton);
    row.appendChild(text);
    row.appendChild(actions);
    dataRecordListEl.appendChild(row);
  }
}

function renderData() {
  selectedDateLabelEl.textContent = dateFormatter.format(selectedDate);
  renderCalendar();
  renderDataList();
}

function getWeekRecords(weekStart) {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return currentRecords.filter((r) => {
    const dt = new Date(r.createdAt);
    return dt >= start && dt < end;
  });
}

function getMonthRecordsByAnchor(anchor) {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  return currentRecords.filter((r) => {
    const dt = new Date(r.createdAt);
    return dt.getFullYear() === y && dt.getMonth() === m;
  });
}

function aggregateWeekDailyCounts(weekStart, includeTrendIneligible = true) {
  const records = getWeekRecords(weekStart).filter((r) => includeTrendIneligible || r.trendEligible);
  const arr = new Array(7).fill(0);
  for (const r of records) {
    const dt = new Date(r.createdAt);
    const idx = (dt.getDay() + 6) % 7;
    arr[idx] += r.quantity;
  }
  return arr;
}

function aggregateMonthDailyCounts(anchor, includeTrendIneligible = true) {
  const records = getMonthRecordsByAnchor(anchor).filter((r) => includeTrendIneligible || r.trendEligible);
  const days = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const arr = new Array(days).fill(0);
  for (const r of records) {
    const d = new Date(r.createdAt).getDate();
    arr[d - 1] += r.quantity;
  }
  return arr;
}

function aggregateHourCounts(weekStart, weekdayFilter, includeTrendIneligible) {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const arr = new Array(24).fill(0);
  for (const r of currentRecords) {
    if (!includeTrendIneligible && !r.trendEligible) continue;
    const dt = new Date(r.createdAt);
    if (dt < start || dt >= end) continue;
    if (weekdayFilter !== "all" && dt.getDay() !== Number(weekdayFilter)) continue;
    arr[dt.getHours()] += r.quantity;
  }
  return arr;
}

function averageArrays(list) {
  if (list.length === 0) return [];
  const len = list[0].length;
  const out = new Array(len).fill(0);
  for (const a of list) {
    for (let i = 0; i < len; i += 1) out[i] += a[i];
  }
  return out.map((v) => v / list.length);
}

function cumulativeArray(values) {
  const out = new Array(values.length).fill(0);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    out[i] = sum;
  }
  return out;
}

function getAnalysisSeries() {
  if (analysisMode === "week") {
    const labels = ["月", "火", "水", "木", "金", "土", "日"];
    const current = aggregateWeekDailyCounts(analysisAnchor, true);
    const past = [];
    for (let i = 1; i <= 4; i += 1) {
      const w = new Date(analysisAnchor);
      w.setDate(w.getDate() - i * 7);
      past.push(aggregateWeekDailyCounts(w, true));
    }
    return { labels, current, average: averageArrays(past), type: "barline" };
  }

  if (analysisMode === "month") {
    const labels = [];
    const current = aggregateMonthDailyCounts(analysisAnchor, true);
    for (let d = 1; d <= current.length; d += 1) labels.push(String(d));
    const past = [];
    for (let i = 1; i <= 4; i += 1) {
      const m = new Date(analysisAnchor.getFullYear(), analysisAnchor.getMonth() - i, 1);
      const arr = aggregateMonthDailyCounts(m, true);
      const padded = new Array(current.length).fill(0);
      for (let x = 0; x < Math.min(arr.length, current.length); x += 1) padded[x] = arr[x];
      past.push(padded);
    }
    return { labels, current, average: averageArrays(past), type: "barline" };
  }

  const labels = new Array(24).fill(0).map((_, i) => `${String(i).padStart(2, "0")}`);
  const current = aggregateHourCounts(analysisAnchor, analysisWeekdayFilter, false);
  const past = [];
  for (let i = 1; i <= 4; i += 1) {
    const w = new Date(analysisAnchor);
    w.setDate(w.getDate() - i * 7);
    past.push(aggregateHourCounts(w, analysisWeekdayFilter, false));
  }
  const avgHourly = averageArrays(past);
  const currentCumulative = cumulativeArray(current);
  return { labels, current, cumulative: currentCumulative, average: avgHourly, type: "hour-combo" };
}

function drawAnalysisChart(series) {
  const canvas = analysisChartEl;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const pad = { left: 42, right: 14, top: 14, bottom: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const maxY = (series.type === "hour-combo"
    ? Math.max(1, ...series.current, ...series.cumulative, ...series.average)
    : Math.max(1, ...series.current, ...series.average)) * 1.15;

  ctx.strokeStyle = "#d4d0e1";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#666078";
  ctx.font = "18px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i += 1) {
    const value = ((maxY * (4 - i)) / 4).toFixed(0);
    const y = pad.top + (plotH * i) / 4;
    ctx.fillText(value, pad.left - 8, y);
  }

  const n = series.labels.length;
  const step = plotW / n;
  const barW = Math.max(4, step * 0.62);

  if (series.type === "barline") {
    ctx.fillStyle = "#7867dc";
    for (let i = 0; i < n; i += 1) {
      const h = (series.current[i] / maxY) * plotH;
      const x = pad.left + i * step + (step - barW) / 2;
      const y = pad.top + plotH - h;
      ctx.fillRect(x, y, barW, h);
    }
  }

  const drawLine = (data, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) {
      const x = pad.left + i * step + step / 2;
      const y = pad.top + plotH - (data[i] / maxY) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  if (series.type === "line") {
    drawLine(series.current, "#7867dc");
    drawLine(series.average, "#4f9db8");
  } else if (series.type === "hour-combo") {
    ctx.fillStyle = "#7867dc";
    for (let i = 0; i < n; i += 1) {
      const h = (series.current[i] / maxY) * plotH;
      const x = pad.left + i * step + (step - barW) / 2;
      const y = pad.top + plotH - h;
      ctx.fillRect(x, y, barW, h);
    }
    drawLine(series.cumulative, "#d38e44");
    ctx.setLineDash([8, 6]);
    drawLine(series.average, "#4f9db8");
    ctx.setLineDash([]);
  } else {
    drawLine(series.average, "#4f9db8");
  }

  ctx.fillStyle = "#666078";
  ctx.font = "16px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const labelEvery = n > 12 ? 2 : 1;
  for (let i = 0; i < n; i += labelEvery) {
    const x = pad.left + i * step + step / 2;
    ctx.fillText(series.labels[i], x, pad.top + plotH + 8);
  }
}

function renderAnalysis() {
  for (const b of analysisModeButtons) {
    b.classList.toggle("is-active", b.dataset.analysisMode === analysisMode);
  }
  const isHour = analysisMode === "hour";
  analysisWeekdayRowEl.classList.toggle("hidden", !isHour);
  for (const b of analysisWeekdayButtons) {
    b.classList.toggle("is-active", b.dataset.weekday === analysisWeekdayFilter);
  }

  if (analysisMode === "week") {
    const end = new Date(analysisAnchor);
    end.setDate(end.getDate() + 6);
    analysisPeriodLabelEl.textContent = `${dateFormatter.format(analysisAnchor)} - ${dateFormatter.format(end)}`;
  } else if (analysisMode === "month") {
    analysisPeriodLabelEl.textContent = `${analysisAnchor.getFullYear()}/${String(analysisAnchor.getMonth() + 1).padStart(2, "0")}`;
  } else {
    const end = new Date(analysisAnchor);
    end.setDate(end.getDate() + 6);
    analysisPeriodLabelEl.textContent = `${dateFormatter.format(analysisAnchor)} - ${dateFormatter.format(end)}`;
  }

  if (analysisMode === "hour") {
    legendCurrentTextEl.textContent = "その時間で吸った本数";
    legendAverageTextEl.textContent = "過去4週間の平均";
    legendCumulativeItemEl.classList.remove("hidden");
    legendCumulativeTextEl.textContent = "その時間までの累計";
  } else {
    legendCurrentTextEl.textContent = "対象期間";
    legendAverageTextEl.textContent = "過去4期間平均";
    legendCumulativeItemEl.classList.add("hidden");
  }

  const series = getAnalysisSeries();
  drawAnalysisChart(series);

  if (analysisMode === "month") {
    analysisMonthSummaryEl.classList.remove("hidden");
    const monthCount = countCigarettes(getMonthRecordsByAnchor(analysisAnchor));
    const monthCost = Math.floor((monthCount * currentSettings.packPrice) / 20);
    analysisMonthCostEl.textContent = numberFormatter.format(monthCost);
  } else {
    analysisMonthSummaryEl.classList.add("hidden");
  }
}

function switchView(viewName) {
  currentView = viewName;
  viewHomeEl.classList.toggle("hidden", viewName !== "home");
  viewAnalysisEl.classList.toggle("hidden", viewName !== "analysis");
  viewDataEl.classList.toggle("hidden", viewName !== "data");
  viewSettingsEl.classList.toggle("hidden", viewName !== "settings");
  incrementButton.classList.toggle("hidden", viewName !== "home");

  navItems.forEach((item) => item.classList.toggle("is-active", item.dataset.view === viewName));

  if (viewName === "analysis") renderAnalysis();
  if (viewName === "data") renderData();
}

async function refreshScreen() {
  currentRecords = await getAllRecords();
  currentSettings = await getSettings();
  packPriceInput.value = String(currentSettings.packPrice);
  renderHome();
  if (currentView === "analysis") renderAnalysis();
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
  const importedRecords = Array.isArray(parsed.records) ? parsed.records.map(normalizeRecord).filter(Boolean) : [];
  const packPrice = Number(parsed.settings?.packPrice);
  const settings = { packPrice: Number.isFinite(packPrice) && packPrice > 0 ? Math.floor(packPrice) : DEFAULT_PACK_PRICE };

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
  const defaultTime = isSameDate(selectedDate, new Date()) ? timeFormatter.format(new Date()) : "12:00";
  const hhmm = prompt("時刻を入力 (HH:mm)", defaultTime);
  if (hhmm === null) return;
  const dt = combineDateAndTime(selectedDate, hhmm);
  if (!dt) return alert("時刻形式が不正です。例: 14:30");
  await addRecordByDate(dt, 1, true);
  await refreshScreen();
}

async function onAddBatch() {
  const qtyText = prompt("本数を入力 (2以上)");
  if (qtyText === null) return;
  const qty = Number(qtyText);
  if (!Number.isFinite(qty) || qty < 2) return alert("本数は2以上の数値を入力してください。");
  const hhmm = prompt("代表時刻を入力 (HH:mm)", "23:59");
  if (hhmm === null) return;
  const dt = combineDateAndTime(selectedDate, hhmm);
  if (!dt) return alert("時刻形式が不正です。例: 23:59");
  await addRecordByDate(dt, Math.floor(qty), false);
  await refreshScreen();
}

async function onEditRecord(rec) {
  const currentTime = timeFormatter.format(new Date(rec.createdAt));
  const timeText = prompt("時刻を入力 (HH:mm)", currentTime);
  if (timeText === null) return;
  const dt = combineDateAndTime(selectedDate, timeText);
  if (!dt) return alert("時刻形式が不正です。");
  const qtyText = prompt("本数を入力 (1以上)", String(rec.quantity));
  if (qtyText === null) return;
  const qty = Number(qtyText);
  if (!Number.isFinite(qty) || qty < 1) return alert("本数は1以上で入力してください。");
  const trendText = prompt("分析に使う? y/n", rec.trendEligible ? "y" : "n");
  if (trendText === null) return;
  const trendEligible = trendText.trim().toLowerCase() !== "n";
  await updateRecordById(rec.id, { createdAt: dt.toISOString(), quantity: Math.floor(qty), trendEligible });
  await refreshScreen();
}

async function onDeleteRecord(rec) {
  const yes = confirm(`削除しますか?\n${dateTimeFormatter.format(new Date(rec.createdAt))} / ${rec.quantity}本`);
  if (!yes) return;
  await deleteRecordById(rec.id);
  await refreshScreen();
}

function bindEvents() {
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

  analysisModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      analysisMode = button.dataset.analysisMode;
      if (analysisMode === "month") analysisAnchor = getMonthStart(analysisAnchor);
      else analysisAnchor = getWeekStart(analysisAnchor);
      renderAnalysis();
    });
  });
  analysisWeekdayButtons.forEach((button) => {
    button.addEventListener("click", () => {
      analysisWeekdayFilter = button.dataset.weekday;
      renderAnalysis();
    });
  });
  analysisPrevButton.addEventListener("click", () => {
    if (analysisMode === "month") analysisAnchor = new Date(analysisAnchor.getFullYear(), analysisAnchor.getMonth() - 1, 1);
    else analysisAnchor = new Date(analysisAnchor.getFullYear(), analysisAnchor.getMonth(), analysisAnchor.getDate() - 7);
    renderAnalysis();
  });
  analysisNextButton.addEventListener("click", () => {
    if (analysisMode === "month") analysisAnchor = new Date(analysisAnchor.getFullYear(), analysisAnchor.getMonth() + 1, 1);
    else analysisAnchor = new Date(analysisAnchor.getFullYear(), analysisAnchor.getMonth(), analysisAnchor.getDate() + 7);
    renderAnalysis();
  });

  calendarPrevButton.addEventListener("click", () => {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
    renderData();
  });
  calendarNextButton.addEventListener("click", () => {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
    renderData();
  });
  dataAddOneButton.addEventListener("click", () => onAddSingle().catch((e) => { console.error(e); alert("追加に失敗しました。"); }));
  dataAddBatchButton.addEventListener("click", () => onAddBatch().catch((e) => { console.error(e); alert("一括追加に失敗しました。"); }));

  savePackPriceButton.addEventListener("click", async () => {
    const value = Number(packPriceInput.value);
    if (!Number.isFinite(value) || value <= 0) return alert("1箱金額は1以上で入力してください。");
    try {
      await saveSettings({ packPrice: Math.floor(value) });
      await refreshScreen();
      alert("保存しました。");
    } catch (error) {
      console.error(error);
      alert("保存に失敗しました。");
    }
  });

  exportButton.addEventListener("click", () => exportData().catch((e) => { console.error(e); alert("エクスポートに失敗しました。"); }));
  importButton.addEventListener("click", async () => {
    const file = importFileInput.files?.[0];
    if (!file) return alert("インポートするファイルを選択してください。");
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
      if (view === "home" || view === "analysis" || view === "data" || view === "settings") {
        switchView(view);
      }
    });
  });
}

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
    bindEvents();
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

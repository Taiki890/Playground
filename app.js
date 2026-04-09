const DB_NAME = "smoke-tracker-db";
const STORE_NAME = "records";
const DB_VERSION = 1;
const HISTORY_LIMIT = 10;

const dateEl = document.getElementById("today-date");
const elapsedEl = document.getElementById("elapsed-time");
const dailyCountEl = document.getElementById("daily-count");
const historyListEl = document.getElementById("history-list");
const incrementButton = document.getElementById("increment-button");

let dbPromise;
let currentRecords = [];
let timerId = null;

const jpDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const historyFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function openDatabase() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function getTodayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatScreenDate(date = new Date()) {
  return jpDateFormatter.format(date);
}

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":");
}

async function getAllRecords() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function addRecord() {
  const db = await openDatabase();
  const now = new Date();
  const record = {
    createdAt: now.toISOString(),
    dayKey: getTodayKey(now),
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.add(record);
    transaction.oncomplete = () => resolve(record);
    transaction.onerror = () => reject(transaction.error);
  });
}

function getTodayRecords(records) {
  const todayKey = getTodayKey();
  return records.filter((record) => record.dayKey === todayKey);
}

function getLatestRecord(records) {
  if (records.length === 0) {
    return null;
  }

  return records
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
}

function renderDate() {
  dateEl.textContent = formatScreenDate(new Date());
}

function renderDailyCount() {
  dailyCountEl.textContent = String(getTodayRecords(currentRecords).length);
}

function renderHistory() {
  const recentRecords = currentRecords
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, HISTORY_LIMIT);

  historyListEl.innerHTML = "";

  if (recentRecords.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "history-empty";
    emptyItem.textContent = "まだ記録はありません";
    historyListEl.appendChild(emptyItem);
    return;
  }

  for (const record of recentRecords) {
    const item = document.createElement("li");
    item.className = "history-item";

    const time = document.createElement("time");
    time.dateTime = record.createdAt;
    time.textContent = historyFormatter.format(new Date(record.createdAt));

    item.appendChild(time);
    historyListEl.appendChild(item);
  }
}

function renderElapsed() {
  const latestRecord = getLatestRecord(currentRecords);
  if (!latestRecord) {
    elapsedEl.textContent = "00:00:00";
    return;
  }

  const diffSeconds = Math.floor((Date.now() - new Date(latestRecord.createdAt).getTime()) / 1000);
  elapsedEl.textContent = formatDuration(diffSeconds);
}

function startElapsedTimer() {
  if (timerId !== null) {
    window.clearInterval(timerId);
  }

  renderElapsed();
  timerId = window.setInterval(() => {
    renderDate();
    renderElapsed();
  }, 1000);
}

async function refreshScreen() {
  currentRecords = await getAllRecords();
  renderDate();
  renderDailyCount();
  renderHistory();
  startElapsedTimer();
}

async function requestPersistentStorage() {
  if (!navigator.storage || !navigator.storage.persist) {
    return;
  }

  try {
    await navigator.storage.persist();
  } catch (error) {
    console.warn("Persistent storage request failed", error);
  }
}

incrementButton.addEventListener("click", async () => {
  incrementButton.disabled = true;
  try {
    await addRecord();
    await refreshScreen();
  } catch (error) {
    console.error("Failed to add record", error);
    window.alert("記録に失敗しました。再度お試しください。");
  } finally {
    incrementButton.disabled = false;
  }
});

window.addEventListener("load", async () => {
  try {
    if ("serviceWorker" in navigator) {
      await navigator.serviceWorker.register("./sw.js");
    }
    await requestPersistentStorage();
    await refreshScreen();
  } catch (error) {
    console.error("Initialization failed", error);
    window.alert("初期化に失敗しました。ブラウザを再読み込みしてください。");
  }
});

const { app, BrowserWindow, dialog, ipcMain, Menu, Notification, Tray, nativeImage } = require("electron");
const path = require("path");
const Store = require("electron-store");

const isDev = !app.isPackaged;

const defaultSettings = {
  targetCups: 8,
  cupProfiles: [
    { id: "cup-200", name: "日常水杯", ml: 200 },
    { id: "cup-300", name: "大杯", ml: 300 },
    { id: "cup-500", name: "瓶装水", ml: 500 }
  ],
  selectedCupId: null,
  hasChosenCup: false,
  targetCupsByCupId: {},
  workStart: "09:30",
  workEnd: "18:30",
  staleMinutes: 60,
  repeatUntilLogged: true,
  snoozeMinutes: 15,
  showClosePrompt: true,
  closeAction: "hide",
  progressMode: "cups"
};

const store = new Store({
  name: "water-data",
  defaults: {
    settings: defaultSettings,
    days: {}
  }
});

let mainWindow;
let tray;
let reminderTimer;
let snoozedUntil = null;
let lastReminder = null;
let pendingClose = false;

function createAppMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "文件",
      submenu: [
        { label: "显示主窗口", click: showWindow },
        { label: "加一杯", click: () => addDrink({ source: "menu" }) },
        { type: "separator" },
        { label: "退出", accelerator: "Alt+F4", click: () => quitApp() }
      ]
    },
    {
      label: "视图",
      submenu: [
        { role: "reload", label: "重新加载" },
        { role: "toggleDevTools", label: "开发者工具" },
        { type: "separator" },
        { role: "resetZoom", label: "实际大小" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" }
      ]
    }
  ]));
}

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function minutesOfDay(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function getDay(key = todayKey()) {
  const days = store.get("days", {});
  if (!days[key]) {
    days[key] = { entries: [] };
    store.set("days", days);
  }
  return days[key];
}

function setDay(key, day) {
  const days = store.get("days", {});
  days[key] = day;
  store.set("days", days);
}

function getAllDays() {
  const days = store.get("days", {});
  return Object.fromEntries(
    Object.entries(days).map(([key, day]) => [
      key,
      {
        entries: Array.isArray(day.entries)
          ? [...day.entries].sort((a, b) => new Date(a.at) - new Date(b.at))
          : []
      }
    ])
  );
}

function entryMatchesCup(entry, cup) {
  if (entry.cupId) return entry.cupId === cup.id;
  return Number(entry.ml) === Number(cup.ml);
}

function getState() {
  const settings = { ...defaultSettings, ...store.get("settings", {}) };
  settings.cupProfiles = Array.isArray(settings.cupProfiles) && settings.cupProfiles.length
    ? settings.cupProfiles
    : defaultSettings.cupProfiles;
  settings.targetCupsByCupId = settings.targetCupsByCupId && typeof settings.targetCupsByCupId === "object"
    ? settings.targetCupsByCupId
    : {};
  const selectedCup = settings.cupProfiles.find((cup) => cup.id === settings.selectedCupId)
    || settings.cupProfiles[0];
  const selectedTargetCups = Number(settings.targetCupsByCupId[selectedCup.id] || settings.targetCups)
    || defaultSettings.targetCups;
  settings.targetCups = selectedTargetCups;
  const key = todayKey();
  const day = getDay(key);
  const selectedEntries = day.entries.filter((entry) => entryMatchesCup(entry, selectedCup));
  const totalMl = selectedEntries.reduce((sum, item) => sum + item.ml, 0);
  const cups = selectedEntries.length;
  const targetMl = selectedTargetCups * selectedCup.ml;
  const lastEntry = selectedEntries[selectedEntries.length - 1] || null;
  const days = getAllDays();

  return {
    date: key,
    settings,
    selectedCup,
    today: {
      entries: selectedEntries,
      cups,
      totalMl,
      targetMl,
      lastEntry
    },
    history: {
      days
    }
  };
}

function broadcastState() {
  const state = getState();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("state:changed", state);
  }
  updateTray();
}

function getAssetPath(name) {
  return isDev
    ? path.join(__dirname, "assets", name)
    : path.join(process.resourcesPath, "assets", name);
}

function createTrayImage() {
  for (const asset of ["app.png", "app.ico"]) {
    const image = nativeImage.createFromPath(getAssetPath(asset));
    if (!image.isEmpty()) {
      return image.resize({ width: 16, height: 16 });
    }
  }

  const svg = `
    <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="#1597ff"/>
      <path d="M16 6c3.7 4.4 6.4 8.1 6.4 12a6.4 6.4 0 0 1-12.8 0C9.6 14.1 12.3 10.4 16 6z" fill="white"/>
    </svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

function updateTray() {
  if (!tray) return;
  const state = getState();
  const percent = Math.min(100, Math.round((state.today.totalMl / Math.max(1, state.today.targetMl)) * 100));
  const reminderStatus = state.today.cups >= state.settings.targetCups
    ? "已达标，提醒静默"
    : `提醒 ${state.settings.staleMinutes}分钟`;
  tray.setToolTip(`drinking-counter ${state.today.cups}/${state.settings.targetCups}杯`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `今日 ${state.today.cups}/${state.settings.targetCups}杯 · ${percent}%`, enabled: false },
    { label: `${state.today.totalMl}/${state.today.targetMl}ml · ${state.selectedCup.name}`, enabled: false },
    { label: reminderStatus, enabled: false },
    { type: "separator" },
    { label: "显示主窗口", click: showWindow },
    { label: `加一杯 (${state.selectedCup.ml}ml)`, click: () => addDrink({ source: "tray" }) },
    {
      label: `重复上次容量 (${state.today.lastEntry?.ml || state.selectedCup.ml}ml)`,
      click: () => addDrink({ source: "tray", ml: state.today.lastEntry?.ml || state.selectedCup.ml })
    },
    { type: "separator" },
    { label: "退出", click: () => quitApp() }
  ]));
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  mainWindow.show();
  mainWindow.focus();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1536,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#f4f6f8",
    show: false,
    title: "drinking-counter",
    icon: getAssetPath("app.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.on("close", (event) => {
    const settings = getState().settings;
    if (pendingClose) {
      pendingClose = false;
      return;
    }
    if (!settings.showClosePrompt) {
      if (settings.closeAction === "hide") {
        event.preventDefault();
        mainWindow.hide();
        broadcastState();
        return;
      }
      event.preventDefault();
      quitApp();
      return;
    }
    event.preventDefault();
    const { response, checkboxChecked } = dialog.showMessageBoxSync(mainWindow, {
      type: "question",
      buttons: ["隐藏到托盘", "退出程序", "取消"],
      defaultId: 0,
      cancelId: 2,
      title: "关闭 drinking-counter",
      message: "关闭 drinking-counter？",
      detail: "隐藏后会继续在托盘运行并按设置提醒。",
      checkboxLabel: "不再询问",
      checkboxChecked: false
    });

    if (response === 2) return;

    const action = response === 0 ? "hide" : "quit";
    if (checkboxChecked) {
      store.set("settings", { ...settings, showClosePrompt: false, closeAction: action });
    }

    if (action === "hide") {
      mainWindow.hide();
      broadcastState();
      return;
    }

    quitApp();
  });

  if (isDev) {
    mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function addDrink(payload = {}) {
  const state = getState();
  const settings = state.settings;
  const selectedCup = state.selectedCup;
  const key = payload.date || todayKey();
  const at = payload.time ? new Date(`${key}T${payload.time}:00`) : new Date();
  const day = getDay(key);
  day.entries.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    at: at.toISOString(),
    ml: Number(payload.ml || selectedCup.ml),
    cupId: selectedCup.id,
    source: payload.source || "button"
  });
  day.entries.sort((a, b) => new Date(a.at) - new Date(b.at));
  setDay(key, day);
  snoozedUntil = null;
  lastReminder = null;
  broadcastState();
  if (payload.source === "tray" || payload.source === "menu") {
    new Notification({
      title: "已记录一杯水",
      body: `今天已记录 ${getState().today.cups}/${settings.targetCups} 杯。`,
      silent: true
    }).show();
  }
  return getState();
}

function undoDrink() {
  const key = todayKey();
  const state = getState();
  const day = getDay(key);
  const index = [...day.entries]
    .map((entry, entryIndex) => ({ entry, entryIndex }))
    .reverse()
    .find((item) => entryMatchesCup(item.entry, state.selectedCup))?.entryIndex;
  if (index !== undefined) {
    day.entries.splice(index, 1);
  }
  setDay(key, day);
  snoozedUntil = null;
  lastReminder = null;
  broadcastState();
  return getState();
}

function inWorkWindow(now, settings) {
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= minutesOfDay(settings.workStart) && current <= minutesOfDay(settings.workEnd);
}

function progressIsBehind(now, settings, cups) {
  const start = minutesOfDay(settings.workStart);
  const end = minutesOfDay(settings.workEnd);
  const current = now.getHours() * 60 + now.getMinutes();
  const elapsed = Math.max(0, Math.min(current, end) - start);
  const total = Math.max(1, end - start);
  const expected = Math.floor((elapsed / total) * settings.targetCups);
  return cups < expected;
}

function maybeNotify() {
  const state = getState();
  const { settings, selectedCup, today } = state;
  const now = new Date();

  if (!inWorkWindow(now, settings)) return;
  if (snoozedUntil && now < snoozedUntil) return;
  if (today.cups >= settings.targetCups) return;

  const lastAt = today.lastEntry ? new Date(today.lastEntry.at) : null;
  const stale = !lastAt || (now - lastAt) / 60000 >= settings.staleMinutes;
  const behind = stale && progressIsBehind(now, settings, today.cups);
  if (!stale && !behind) return;

  const reminderKey = [
    state.date,
    selectedCup.id,
    today.cups,
    today.lastEntry?.id || "none",
    stale ? "stale" : "behind"
  ].join("|");
  if (!settings.repeatUntilLogged && lastReminder?.key === reminderKey) return;

  const notification = new Notification({
    title: "该喝水了",
    body: `今天已记录 ${today.cups}/${settings.targetCups} 杯，${today.totalMl}/${today.targetMl}ml。`,
    silent: false
  });

  notification.on("click", showWindow);
  notification.show();
  lastReminder = { key: reminderKey, at: now.toISOString() };

  if (settings.repeatUntilLogged) {
    snoozedUntil = new Date(now.getTime() + settings.snoozeMinutes * 60000);
  } else {
    snoozedUntil = null;
  }
}

function startReminderLoop() {
  clearInterval(reminderTimer);
  reminderTimer = setInterval(maybeNotify, 60 * 1000);
  setTimeout(maybeNotify, 3000);
}

ipcMain.handle("state:get", () => getState());
ipcMain.handle("drink:add", (_, payload) => addDrink(payload));
ipcMain.handle("drink:undo", () => undoDrink());
ipcMain.handle("settings:save", (_, settings) => {
  const nextSettings = { ...defaultSettings, ...settings };
  nextSettings.cupProfiles = Array.isArray(nextSettings.cupProfiles) && nextSettings.cupProfiles.length
    ? nextSettings.cupProfiles.map((cup) => ({ ...cup, ml: Number(cup.ml) || 200 }))
    : defaultSettings.cupProfiles;
  const selectedCup = nextSettings.cupProfiles.find((cup) => cup.id === nextSettings.selectedCupId)
    || nextSettings.cupProfiles[0];
  const targetCups = Number(nextSettings.targetCups) || defaultSettings.targetCups;
  const targetCupsByCupId = nextSettings.targetCupsByCupId && typeof nextSettings.targetCupsByCupId === "object"
    ? nextSettings.targetCupsByCupId
    : {};
  nextSettings.targetCupsByCupId = {
    ...targetCupsByCupId,
    [selectedCup.id]: targetCups
  };
  nextSettings.targetCups = targetCups;
  store.set("settings", nextSettings);
  snoozedUntil = null;
  lastReminder = null;
  broadcastState();
  return getState();
});
ipcMain.handle("app:request-close", () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});
ipcMain.handle("app:resolve-close-choice", (_, choice) => {
  if (choice.remember) {
    const settings = getState().settings;
    store.set("settings", { ...settings, showClosePrompt: false, closeAction: choice.action });
  }
  if (choice.action === "hide") {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    broadcastState();
    return "hidden";
  }
  pendingClose = true;
  app.quit();
  return "quit";
});

app.whenReady().then(() => {
  app.setName("drinking-counter");
  app.setAppUserModelId("local.drinking.counter");
  createAppMenu();
  tray = new Tray(createTrayImage());
  tray.on("double-click", showWindow);
  createWindow();
  updateTray();
  startReminderLoop();
});

app.on("window-all-closed", () => {});

app.on("before-quit", () => {
  pendingClose = true;
  if (tray) {
    tray.destroy();
    tray = null;
  }
});
function quitApp() {
  pendingClose = true;
  app.quit();
}

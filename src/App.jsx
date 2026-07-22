import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  CupSoda,
  Droplets,
  Minus,
  Plus,
  RotateCcw,
  Settings,
  Target,
} from "lucide-react";
import appIcon from "../electron/assets/app.png";

const fallbackSettings = {
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

const fallbackState = {
  date: "",
  settings: fallbackSettings,
  selectedCup: fallbackSettings.cupProfiles[0],
  today: {
    entries: [],
    cups: 0,
    totalMl: 0,
    targetMl: 1600,
    lastEntry: null
  },
  history: {
    days: {}
  }
};

function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTime(iso) {
  if (!iso) return "今天还未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(iso));
}

function formatMonth(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long"
  }).format(date);
}

function formatDateLabel(key) {
  if (!key) return "未选择日期";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(new Date(`${key}T00:00:00`));
}

function getDaySummary(days, key, cup) {
  const allEntries = days?.[key]?.entries || [];
  const entries = cup
    ? allEntries.filter((entry) => (entry.cupId ? entry.cupId === cup.id : Number(entry.ml) === Number(cup.ml)))
    : allEntries;
  return {
    key,
    entries,
    cups: entries.length,
    totalMl: entries.reduce((sum, entry) => sum + Number(entry.ml || 0), 0)
  };
}

function startOfWeek(date) {
  const next = new Date(date);
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  next.setHours(0, 0, 0, 0);
  return next;
}

function daysBetween(start, count) {
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function monthGrid(monthDate) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const gridStart = startOfWeek(first);
  return daysBetween(gridStart, 42);
}

function summarizeRange(days, dates, cup) {
  const summaries = dates.map((date) => getDaySummary(days, dateKey(date), cup));
  return {
    days: summaries,
    cups: summaries.reduce((sum, day) => sum + day.cups, 0),
    totalMl: summaries.reduce((sum, day) => sum + day.totalMl, 0),
    activeDays: summaries.filter((day) => day.cups > 0).length
  };
}

const hourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const minuteOptions = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
const minuteWheelOptions = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));

function normalizeTimeInput(value, fallback = "00:00") {
  const match = value.trim().match(/^(\d{1,2}):?(\d{0,2})$/);
  if (!match) return fallback;
  const hour = Math.min(23, Math.max(0, Number(match[1] || 0)));
  const minute = Math.min(59, Math.max(0, Number(match[2] || 0)));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function polarPosition(index, total, radius) {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  return {
    left: `${50 + Math.cos(angle) * radius}%`,
    top: `${50 + Math.sin(angle) * radius}%`
  };
}

function App() {
  const [state, setState] = useState(fallbackState);
  const [view, setView] = useState("cups");
  const [draftSettings, setDraftSettings] = useState(fallbackSettings);

  useEffect(() => {
    window.waterApi.getState().then((next) => {
      setState(next);
      setDraftSettings(next.settings);
      setView(next.settings.hasChosenCup ? "progress" : "cups");
    });
    const offState = window.waterApi.onStateChanged((next) => {
      setState(next);
      setDraftSettings(next.settings);
    });
    return () => offState();
  }, []);

  const percent = Math.min(100, Math.round((state.today.totalMl / Math.max(1, state.today.targetMl)) * 100));
  const remainingCups = Math.max(0, state.settings.targetCups - state.today.cups);
  const remainingMl = Math.max(0, state.today.targetMl - state.today.totalMl);

  async function saveSettings(nextDraft) {
    const normalized = {
      ...nextDraft,
      targetCups: Number(nextDraft.targetCups) || 8,
      staleMinutes: Number(nextDraft.staleMinutes) || 60,
      snoozeMinutes: Number(nextDraft.snoozeMinutes) || 15,
      cupProfiles: nextDraft.cupProfiles.map((cup) => ({
        ...cup,
        name: cup.name || "未命名杯子",
        ml: Number(cup.ml) || 200
      }))
    };
    const selectedCup = normalized.cupProfiles.find((cup) => cup.id === normalized.selectedCupId)
      || normalized.cupProfiles[0];
    normalized.targetCupsByCupId = {
      ...(normalized.targetCupsByCupId || {}),
      [selectedCup.id]: normalized.targetCups
    };
    const nextState = await window.waterApi.saveSettings(normalized);
    setState(nextState);
    setDraftSettings(nextState.settings);
  }

  function updateSetting(key, value) {
    const next = { ...draftSettings, [key]: value };
    setDraftSettings(next);
    saveSettings(next);
  }

  async function chooseCup(cupId) {
    const nextTargetCups = Number(draftSettings.targetCupsByCupId?.[cupId])
      || fallbackSettings.targetCups;
    const next = {
      ...draftSettings,
      selectedCupId: cupId,
      hasChosenCup: true,
      targetCups: nextTargetCups
    };
    setDraftSettings(next);
    await saveSettings(next);
    setView("progress");
  }

  function updateCup(cupId, patch) {
    const nextProfiles = draftSettings.cupProfiles.map((cup) => (
      cup.id === cupId ? { ...cup, ...patch } : cup
    ));
    const next = { ...draftSettings, cupProfiles: nextProfiles };
    setDraftSettings(next);
    saveSettings(next);
  }

  function addCupProfile() {
    const id = `cup-${Date.now()}`;
    const next = {
      ...draftSettings,
      cupProfiles: [...draftSettings.cupProfiles, { id, name: "新杯子", ml: 200 }]
    };
    setDraftSettings(next);
    saveSettings(next);
  }

  function removeCupProfile(cupId) {
    if (draftSettings.cupProfiles.length <= 1) return;
    const nextProfiles = draftSettings.cupProfiles.filter((cup) => cup.id !== cupId);
    const next = {
      ...draftSettings,
      cupProfiles: nextProfiles,
      selectedCupId: draftSettings.selectedCupId === cupId ? nextProfiles[0].id : draftSettings.selectedCupId
    };
    setDraftSettings(next);
    saveSettings(next);
  }

  const title = view === "cups"
    ? "选择杯子容积"
    : view === "settings"
      ? "偏好设置"
      : view === "history"
        ? "历史统计"
        : "今日饮水";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><img src={appIcon} alt="" /></span>
          <div>
            <strong>drinking-counter</strong>
            <span>本地工作助手</span>
          </div>
        </div>
        <nav className="nav">
          <button className={view === "cups" ? "active" : ""} onClick={() => setView("cups")}>
            <CupSoda size={18} /> 容积
          </button>
          <button className={view === "progress" ? "active" : ""} onClick={() => setView("progress")}>
            <Droplets size={18} /> 进度
          </button>
          <button className={view === "history" ? "active" : ""} onClick={() => setView("history")}>
            <CalendarDays size={18} /> 历史
          </button>
          <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>
            <Settings size={18} /> 设置
          </button>
        </nav>
        <div className="sidebar-note">
          <Bell size={15} />
          <span>{state.settings.workStart}-{state.settings.workEnd}提醒</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="title-row">
            {view === "progress" && (
              <button className="icon-button" onClick={() => setView("cups")} aria-label="返回容积列表">
                <ArrowLeft size={20} />
              </button>
            )}
            <div>
              <p>{state.date || "今天"}</p>
              <h1>{title}</h1>
            </div>
          </div>
        </header>

        {view === "cups" && (
          <CupList
            cups={draftSettings.cupProfiles}
            selectedCupId={state.selectedCup?.id}
            onChoose={chooseCup}
            onAdd={addCupProfile}
            onUpdate={updateCup}
            onRemove={removeCupProfile}
          />
        )}

        {view === "progress" && (
          <ProgressView
            state={state}
            setState={setState}
            percent={percent}
            remainingCups={remainingCups}
            remainingMl={remainingMl}
            updateSetting={updateSetting}
          />
        )}

        {view === "history" && (
          <HistoryView state={state} />
        )}

        {view === "settings" && (
          <SettingsView draftSettings={draftSettings} updateSetting={updateSetting} />
        )}
      </section>
    </main>
  );
}

function CupList({ cups, selectedCupId, onChoose, onAdd, onUpdate, onRemove }) {
  return (
    <section className="cup-page">
      <div className="cup-intro">
        <p>选择本次使用的杯子，之后会默认进入进度页。这里像地址簿一样维护常用容积。</p>
        <button className="secondary-button" onClick={onAdd}>新增容积</button>
      </div>
      <div className="cup-list">
        {cups.map((cup) => (
          <article className={`cup-row ${selectedCupId === cup.id ? "selected" : ""}`} key={cup.id}>
            <button className="cup-main" onClick={() => onChoose(cup.id)}>
              <span className="cup-icon"><CupSoda size={20} /></span>
              <span>
                <strong>{cup.name}</strong>
                <em>容积 {cup.ml}ml</em>
              </span>
              {selectedCupId === cup.id && <Check size={20} />}
            </button>
            <div className="cup-edit">
              <input value={cup.name} onChange={(event) => onUpdate(cup.id, { name: event.target.value })} aria-label="杯子名称" />
              <div className="compact-number">
                <input type="number" value={cup.ml} min="50" step="10" onChange={(event) => onUpdate(cup.id, { ml: event.target.value })} aria-label="杯子容积" />
                <span>ml</span>
              </div>
              <button onClick={() => onRemove(cup.id)} disabled={cups.length <= 1}>删除</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProgressView({ state, setState, percent, remainingCups, remainingMl, updateSetting }) {
  const [manualTime, setManualTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const [manualMl, setManualMl] = useState(state.selectedCup?.ml || 200);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const displayValue = state.settings.progressMode === "cups"
    ? `${state.today.cups}/${state.settings.targetCups}`
    : `${state.today.totalMl}/${state.today.targetMl}`;

  useEffect(() => {
    setManualMl(state.selectedCup?.ml || 200);
  }, [state.selectedCup?.ml]);

  async function submitManual(event) {
    event.preventDefault();
    const next = await window.waterApi.addDrink({
      time: manualTime,
      ml: Number(manualMl) || state.selectedCup.ml,
      source: "manual"
    });
    setState(next);
  }

  async function repeatLastCapacity() {
    const next = await window.waterApi.addDrink({
      ml: state.today.lastEntry?.ml || state.selectedCup.ml,
      source: "repeat"
    });
    setState(next);
  }

  return (
    <section className="progress-page">
      <div className="hero-card">
        <div className="hero-tools">
          <div className="mode-switch">
            <button className={state.settings.progressMode === "cups" ? "selected" : ""} onClick={() => updateSetting("progressMode", "cups")}>按杯</button>
            <button className={state.settings.progressMode === "ml" ? "selected" : ""} onClick={() => updateSetting("progressMode", "ml")}>按毫升</button>
          </div>
          <div className="target-edit">
            <Target size={16} />
            <input
              type="number"
              value={state.settings.targetCups}
              min="1"
              max="30"
              onChange={(event) => updateSetting("targetCups", event.target.value)}
              aria-label="目标杯数"
            />
            <span>杯目标</span>
          </div>
        </div>

        <div className="water-ring" style={{ "--percent": `${percent}%` }}>
          <div className="water-core">
            <Droplets size={36} strokeWidth={1.6} />
          </div>
        </div>

        <div className="metric">
          <strong>{displayValue}</strong>
          <span>{state.settings.progressMode === "cups" ? "杯" : "ml"}</span>
        </div>
        <p className="metric-sub">
          当前杯子 {state.selectedCup.name} · {state.selectedCup.ml}ml/杯 · {state.today.cups}/{state.settings.targetCups}杯 · {state.today.totalMl}/{state.today.targetMl}ml
        </p>
        <div className="progress-line"><span style={{ width: `${percent}%` }} /></div>

        <div className="action-grid">
          <button className="add-button" onClick={() => window.waterApi.addDrink()}>
            <CupSoda size={22} />
            <span>加一杯</span>
            <em>{state.selectedCup.ml}ml</em>
          </button>
          <button className="undo-button" onClick={() => window.waterApi.undoDrink()} disabled={state.today.cups === 0}>
            <Minus size={18} />
            撤销上一杯
          </button>
          <button className="repeat-button" onClick={repeatLastCapacity}>
            <RotateCcw size={18} />
            重复上次
          </button>
        </div>

        <form className="progress-manual" onSubmit={submitManual}>
          <div className="manual-title">
            <Plus size={18} />
            <strong>补记今天</strong>
          </div>
          <div className="time-select-group" aria-label="补记时间">
            <span>时间</span>
            <button className="time-display-button" type="button" onClick={() => setTimePickerOpen(true)}>
              <Clock size={15} />
              {manualTime}
            </button>
          </div>
          <label>
            <span>容量</span>
            <input type="number" min="50" step="10" value={manualMl} onChange={(event) => setManualMl(event.target.value)} />
          </label>
          <button className="manual-button" type="submit">记入</button>
        </form>
        {timePickerOpen && (
          <TimeWheelPicker
            value={manualTime}
            onChange={setManualTime}
            onClose={() => setTimePickerOpen(false)}
          />
        )}
      </div>

      <aside className="info-column">
        <div className="stat-card">
          <span>距离目标</span>
          <strong>{remainingCups}杯</strong>
          <p title={`还差${remainingMl}ml`}>还差{remainingMl}ml</p>
        </div>
        <div className="stat-card">
          <span>提醒状态</span>
          <strong>{state.settings.staleMinutes}分钟</strong>
          <p title={`久未喝水会提醒，重复间隔${state.settings.snoozeMinutes}分钟`}>
            久未喝水会提醒，重复间隔{state.settings.snoozeMinutes}分钟
          </p>
        </div>
        <div className="history-card">
          <div className="card-title">
            <Clock size={18} />
            <strong>今天记录</strong>
          </div>
          {state.today.entries.length === 0 ? (
            <div className="empty-state">
              <Droplets size={34} />
              <span>还没有第一杯</span>
            </div>
          ) : (
            <ol className="timeline">
              {[...state.today.entries].reverse().slice(0, 7).map((entry, index) => (
                <li key={entry.id}>
                  <span>{formatTime(entry.at)}</span>
                  <strong>第{state.today.entries.length - index}杯</strong>
                  <em>{entry.ml}ml</em>
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </section>
  );
}

function TimeWheelPicker({ value, onChange, onClose }) {
  const [draft, setDraft] = useState(value);
  const [mode, setMode] = useState("hour");
  const [hour, minute] = normalizeTimeInput(draft, value).split(":");

  function commit(nextTime = draft) {
    onChange(normalizeTimeInput(nextTime, value));
    onClose();
  }

  function chooseHour(nextHour) {
    setDraft(`${nextHour}:${minute}`);
    setMode("minute");
  }

  function chooseMinute(nextMinute) {
    setDraft(`${hour}:${nextMinute}`);
  }

  return (
    <div className="time-popover" role="dialog" aria-label="选择补记时间">
      <div className="time-popover-backdrop" onClick={onClose} />
      <div className="time-picker-card">
        <div className="time-editor">
          <button type="button" className={mode === "hour" ? "active" : ""} onClick={() => setMode("hour")}>
            {hour}
          </button>
          <span>:</span>
          <button type="button" className={mode === "minute" ? "active" : ""} onClick={() => setMode("minute")}>
            {minute}
          </button>
        </div>
        <input
          className="time-direct-input"
          value={draft}
          inputMode="numeric"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => setDraft(normalizeTimeInput(draft, value))}
          aria-label="直接输入时间"
        />

        <div className="clock-face">
          {mode === "hour" ? (
            <ClockFace
              type="hour"
              value={hour}
              onChoose={chooseHour}
            />
          ) : (
            <ClockFace
              type="minute"
              value={minute}
              onChoose={chooseMinute}
            />
          )}
        </div>

        <div className="time-picker-actions">
          <button type="button" onClick={onClose}>取消</button>
          <button type="button" onClick={() => commit()}>确定</button>
        </div>
      </div>
    </div>
  );
}

function ClockFace({ type, value, onChoose }) {
  const isHour = type === "hour";
  const values = isHour ? hourOptions : minuteWheelOptions;
  const activeIndex = isHour ? Number(value) : Math.round(Number(value) / 5) % 12;
  const handAngle = isHour
    ? ((Number(value) % 12) / 12) * 360
    : (Number(value) / 60) * 360;

  return (
    <div className={`clock-dial ${isHour ? "hour-dial" : "minute-dial"}`}>
      <span className="clock-hand" style={{ transform: `translateX(-50%) rotate(${handAngle}deg)` }} />
      <span className="clock-pin" />
      {values.map((item, index) => {
        const radius = isHour && (item === "00" || Number(item) > 12) ? 25 : 39;
        const position = isHour
          ? polarPosition(Number(item) % 12, 12, radius)
          : polarPosition(index, values.length, 39);
        const selected = isHour ? item === value : index === activeIndex;
        return (
          <button
            type="button"
            key={item}
            className={selected ? "selected" : ""}
            style={position}
            onClick={() => onChoose(item)}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}

function HistoryView({ state }) {
  const today = dateKey();
  const [selectedDate, setSelectedDate] = useState(state.date || today);
  const [monthDate, setMonthDate] = useState(new Date(`${state.date || today}T00:00:00`));

  const days = state.history?.days || {};
  const selectedSummary = getDaySummary(days, selectedDate, state.selectedCup);
  const targetMl = state.settings.targetCups * state.selectedCup.ml;
  const weekStats = useMemo(() => {
    const selected = new Date(`${selectedDate}T00:00:00`);
    return summarizeRange(days, daysBetween(startOfWeek(selected), 7), state.selectedCup);
  }, [days, selectedDate, state.selectedCup]);
  const monthStats = useMemo(() => {
    const count = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    return summarizeRange(days, daysBetween(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1), count), state.selectedCup);
  }, [days, monthDate, state.selectedCup]);
  const gridDays = monthGrid(monthDate);

  function moveMonth(offset) {
    setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + offset, 1));
  }

  return (
    <section className="history-page">
      <div className="calendar-panel">
        <div className="calendar-head">
          <button className="icon-button small" onClick={() => moveMonth(-1)} aria-label="上个月">
            <ChevronLeft size={18} />
          </button>
          <strong>{formatMonth(monthDate)}</strong>
          <button className="icon-button small" onClick={() => moveMonth(1)} aria-label="下个月">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="weekday-row">
          {["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="calendar-grid">
          {gridDays.map((day) => {
            const key = dateKey(day);
            const summary = getDaySummary(days, key, state.selectedCup);
            const inMonth = day.getMonth() === monthDate.getMonth();
            const progress = Math.min(1, summary.totalMl / Math.max(1, targetMl));
            const achieved = summary.totalMl >= targetMl;
            return (
              <button
                key={key}
                className={`day-cell ${inMonth ? "" : "muted"} ${key === selectedDate ? "selected" : ""} ${key === today ? "today" : ""} ${achieved ? "achieved" : ""}`}
                onClick={() => setSelectedDate(key)}
                style={{ "--fill": `${Math.round(progress * 100)}%` }}
              >
                <span>{day.getDate()}</span>
                <em>{summary.cups ? `${summary.cups}杯` : ""}{achieved ? <b>达标</b> : null}</em>
              </button>
            );
          })}
        </div>
      </div>

      <div className="history-side">
        <div className="history-card day-detail">
          <div className="card-title">
            <Clock size={18} />
            <strong>{formatDateLabel(selectedDate)}</strong>
          </div>
          <div className="day-total">
            <strong>{selectedSummary.cups}杯</strong>
            <span>{selectedSummary.totalMl}ml</span>
          </div>
          {selectedSummary.entries.length === 0 ? (
            <div className="empty-state compact">
              <Droplets size={28} />
              <span>这天还没有记录</span>
            </div>
          ) : (
            <ol className="timeline full">
              {[...selectedSummary.entries].reverse().map((entry, index) => (
                <li key={entry.id}>
                  <span>{formatTime(entry.at)}</span>
                  <strong>第{selectedSummary.entries.length - index}杯</strong>
                  <em>{entry.ml}ml</em>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="stats-panel">
        <StatBlock title="本周统计" stats={weekStats} targetMl={targetMl} />
        <StatBlock title="本月统计" stats={monthStats} targetMl={targetMl} wide />
      </div>
    </section>
  );
}

function StatBlock({ title, stats, targetMl, wide = false }) {
  const maxMl = Math.max(targetMl, ...stats.days.map((day) => day.totalMl), 1);
  const avgMl = Math.round(stats.totalMl / Math.max(1, stats.days.length));

  return (
    <article className={`range-card ${wide ? "wide" : ""}`}>
      <div className="range-head">
        <span><BarChart3 size={17} />{title}</span>
        <strong>{stats.totalMl}ml</strong>
      </div>
      <div className="range-meta">
        <span>{stats.cups}杯</span>
        <span>{stats.activeDays}天有记录</span>
        <span>日均{avgMl}ml</span>
      </div>
      <div className="bar-strip">
        {stats.days.map((day) => (
          <span
            key={day.key}
            title={`${day.key} ${day.totalMl}ml`}
            style={{ height: `${Math.max(8, Math.round((day.totalMl / maxMl) * 100))}%` }}
          />
        ))}
      </div>
    </article>
  );
}

function SettingsView({ draftSettings, updateSetting }) {
  return (
    <section className="settings-panel">
      <div className="setting-row">
        <label>工作时间</label>
        <div className="time-pair">
          <input type="time" value={draftSettings.workStart} onChange={(e) => updateSetting("workStart", e.target.value)} />
          <span>至</span>
          <input type="time" value={draftSettings.workEnd} onChange={(e) => updateSetting("workEnd", e.target.value)} />
        </div>
      </div>
      <SettingNumber label="久未喝水阈值" value={draftSettings.staleMinutes} min={10} max={240} suffix="分钟" onChange={(value) => updateSetting("staleMinutes", value)} />
      <div className="setting-row">
        <label>重复提醒</label>
        <button className={`toggle ${draftSettings.repeatUntilLogged ? "on" : ""}`} onClick={() => updateSetting("repeatUntilLogged", !draftSettings.repeatUntilLogged)}>
          <span />
          {draftSettings.repeatUntilLogged ? "开启" : "关闭"}
        </button>
      </div>
      <SettingNumber label="重复间隔" value={draftSettings.snoozeMinutes} min={5} max={120} suffix="分钟" onChange={(value) => updateSetting("snoozeMinutes", value)} />
      <div className="setting-row">
        <label>关闭时询问</label>
        <button className={`toggle ${draftSettings.showClosePrompt ? "on" : ""}`} onClick={() => updateSetting("showClosePrompt", !draftSettings.showClosePrompt)}>
          <span />
          {draftSettings.showClosePrompt ? "开启" : "关闭"}
        </button>
      </div>
      <div className="setting-row">
        <label>不询问时</label>
        <div className="choice-pair">
          <button className={draftSettings.closeAction === "hide" ? "picked" : ""} onClick={() => updateSetting("closeAction", "hide")}>隐藏到托盘</button>
          <button className={draftSettings.closeAction === "quit" ? "picked" : ""} onClick={() => updateSetting("closeAction", "quit")}>退出程序</button>
        </div>
      </div>
    </section>
  );
}

function SettingNumber({ label, value, suffix, onChange, min, max, step = 1 }) {
  return (
    <div className="setting-row">
      <label>{label}</label>
      <div className="number-field">
        <input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.value)} />
        <span>{suffix}</span>
      </div>
    </div>
  );
}

export default App;

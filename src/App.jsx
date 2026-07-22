import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bell, Check, Clock, CupSoda, Droplets, Minus, Settings, Target, X } from "lucide-react";

const fallbackSettings = {
  targetCups: 8,
  cupProfiles: [
    { id: "cup-200", name: "日常水杯", ml: 200 },
    { id: "cup-300", name: "大杯", ml: 300 },
    { id: "cup-500", name: "瓶装水", ml: 500 }
  ],
  selectedCupId: null,
  hasChosenCup: false,
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
  }
};

function formatTime(iso) {
  if (!iso) return "今天还未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(iso));
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
    const next = { ...draftSettings, selectedCupId: cupId, hasChosenCup: true };
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

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Droplets size={22} /></span>
          <div>
            <strong>饮水提醒</strong>
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
              <h1>{view === "cups" ? "选择杯子容积" : view === "settings" ? "偏好设置" : "今日饮水"}</h1>
            </div>
          </div>
          <button className="icon-button close" onClick={() => window.waterApi.requestClose()} aria-label="关闭">
            <X size={20} />
          </button>
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
            percent={percent}
            remainingCups={remainingCups}
            remainingMl={remainingMl}
            updateSetting={updateSetting}
          />
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

function ProgressView({ state, percent, remainingCups, remainingMl, updateSetting }) {
  const displayValue = state.settings.progressMode === "cups"
    ? `${state.today.cups}/${state.settings.targetCups}`
    : `${state.today.totalMl}/${state.today.targetMl}`;

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
        </div>
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

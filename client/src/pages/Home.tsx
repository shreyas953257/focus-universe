/**
 * Observatory Nightfall UI: cinematic astronomical command deck with instrument-grade clarity.
 * Ion Teal is reserved for constructive progress; motion is deliberate and low-amplitude.
 */
import {
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Edit3,
  Flame,
  Goal,
  MoreHorizontal,
  Orbit,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { CSSProperties, FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  FOCUS_XP,
  GOAL_XP,
  STORAGE_KEY,
  calculateStreak as calculateProductivityStreak,
  confirmFocusUniverseImport,
  completeTimerSession,
  createFocusUniverseExport,
  createFocusTimer,
  dailyFocusMinutes,
  deleteDailyGoal,
  editDailyGoal,
  filterAndSortUnlockHistory,
  levelForXp as productivityLevelForXp,
  levelProgress as productivityLevelProgress,
  loadProductivityState,
  monthlyFocusMinutes,
  parseFocusUniverseExport,
  saveProductivityState,
  resetAllProgress,
  recordUniverseUnlocks,
  tickFocusTimer,
  toggleDailyGoal,
  universeProgress,
  universeUnlockEvents,
  weeklyFocusTotals,
  type FocusTimer,
  type UnlockHistoryFilter,
  type UnlockHistorySort,
  type UniverseUnlockHistoryRecord,
  type UniverseUnlockEvent,
} from "@/lib/productivity";

const NEBULA_IMAGE = "/manus-storage/focus-universe-nebula-hero_0d4c7968.jpg";
const PLANET_IMAGE = "/manus-storage/focus-universe-orbital-planet_a011269a.jpg";
const COMET_IMAGE = "/manus-storage/focus-universe-comet_a0367955.jpg";
const LOGO_IMAGE = "/manus-storage/focus-universe-mark_cdda4958.png";

type FocusSession = {
  id: string;
  completedAt: string;
  durationMinutes: number;
};

type DailyGoal = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  completedAt?: string;
  xpAwarded?: boolean;
};

type FocusUniverseState = {
  xp: number;
  sessions: FocusSession[];
  goals: DailyGoal[];
  productiveDates: Record<string, true>;
  announcedUnlocks: string[];
  unlockHistory: UniverseUnlockHistoryRecord[];
  soundEnabled: boolean;
};

type CosmicEvent = {
  id: number;
  kind: "session" | "xp" | "level" | "unlock";
  title: string;
  detail: string;
};

const initialState: FocusUniverseState = {
  xp: 0,
  sessions: [],
  goals: [],
  productiveDates: {},
  announcedUnlocks: [],
  unlockHistory: [],
  soundEnabled: false,
};

function dateKey(input: Date | string) {
  const date = new Date(input);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function dayOffset(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
}

function parseKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function levelBase(level: number) {
  return Math.pow(level - 1, 2) * 100;
}

function levelForXp(xp: number) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}

function levelProgress(xp: number) {
  const level = levelForXp(xp);
  const currentFloor = levelBase(level);
  const nextFloor = levelBase(level + 1);
  const inLevel = xp - currentFloor;
  return {
    level,
    current: inLevel,
    required: nextFloor - currentFloor,
    remaining: nextFloor - xp,
    percent: Math.min(100, Math.max(0, (inLevel / (nextFloor - currentFloor)) * 100)),
  };
}

function cosmicSnapshot(xp: number, streak: number) {
  const progress = universeProgress(xp, streak);
  return { stars: progress.stars, planets: progress.planets, moons: progress.moons, comet: progress.cometUnlocked };
}

function cosmicUnlock(before: ReturnType<typeof cosmicSnapshot>, after: ReturnType<typeof cosmicSnapshot>) {
  if (after.planets > before.planets) return { title: "Planet detected", detail: "A new world has settled into your orbit." };
  if (after.moons > before.moons) return { title: "Moon detected", detail: "A companion moon now circles your sector." };
  if (after.comet && !before.comet) return { title: "Comet detected", detail: "Your three-day focus streak has lit the outer sky." };
  if (after.stars > before.stars) return { title: "Star ignited", detail: "A new point of light has joined your constellation." };
  return null;
}

function calculateStreak(productiveDates: Record<string, true>) {
  const keys = Object.keys(productiveDates).sort();
  if (!keys.length) return { current: 0, best: 0 };

  let current = 0;
  let cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  if (!productiveDates[dateKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  while (productiveDates[dateKey(cursor)]) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  let best = 1;
  let running = 1;
  for (let index = 1; index < keys.length; index += 1) {
    const previous = parseKey(keys[index - 1]);
    const next = parseKey(keys[index]);
    const diff = Math.round((next.getTime() - previous.getTime()) / 86_400_000);
    running = diff === 1 ? running + 1 : 1;
    best = Math.max(best, running);
  }
  return { current, best };
}

function formatMinutes(value: number) {
  if (value < 60) return `${value}m`;
  return `${Math.floor(value / 60)}h ${value % 60 ? `${value % 60}m` : ""}`.trim();
}

function formatTimer(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function getWeekDays() {
  return Array.from({ length: 7 }, (_, index) => dayOffset(6 - index));
}

function shortDay(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2);
}

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readState(): FocusUniverseState {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return initialState;
    const parsed = JSON.parse(value) as Partial<FocusUniverseState>;
    return {
      xp: Number(parsed.xp) || 0,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
      productiveDates: parsed.productiveDates ?? {},
      announcedUnlocks: Array.isArray(parsed.announcedUnlocks) ? parsed.announcedUnlocks.filter((value): value is string => typeof value === "string") : [],
      unlockHistory: Array.isArray(parsed.unlockHistory) ? parsed.unlockHistory.filter((record): record is UniverseUnlockHistoryRecord => Boolean(record) && typeof record.id === "string" && typeof record.title === "string" && typeof record.detail === "string" && typeof record.unlockedAt === "string") : [],
      soundEnabled: parsed.soundEnabled === true,
    };
  } catch {
    return initialState;
  }
}

function NavItem({ icon: Icon, label, active, onClick }: { icon: typeof Orbit; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button className={`nav-item ${active ? "is-active" : ""}`} onClick={onClick} type="button">
      <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
      <span>{label}</span>
    </button>
  );
}

function Metric({ icon: Icon, label, value, detail, accent, energized }: { icon: typeof Clock3; label: string; value: string | number; detail?: string; accent?: "teal" | "gold" | "blue"; energized?: boolean }) {
  return (
    <article className={`metric-card ${accent ? `metric-${accent}` : ""} ${energized ? "is-energized" : ""}`}>
      <div className="metric-icon"><Icon size={17} /></div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </article>
  );
}

export default function Home() {
  const [state, setState] = useState<FocusUniverseState>(readState);
  const [duration, setDuration] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [goalText, setGoalText] = useState("");
  const [editingGoal, setEditingGoal] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [notice, setNotice] = useState("Your observatory is ready for a new orbit.");
  const [xpPulse, setXpPulse] = useState<number | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [cosmicEvent, setCosmicEvent] = useState<CosmicEvent | null>(null);
  const [unlockQueue, setUnlockQueue] = useState<UniverseUnlockEvent[]>([]);
  const [historyFilter, setHistoryFilter] = useState<UnlockHistoryFilter>("all");
  const [historySort, setHistorySort] = useState<UnlockHistorySort>("newest");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [universeTilt, setUniverseTilt] = useState({ x: 0, y: 0 });
  const [activeView, setActiveView] = useState("Mission control");

  useEffect(() => {
    saveProductivityState(window.localStorage, state);
  }, [state]);

  useEffect(() => {
    if (!isRunning) return undefined;
    const interval = window.setInterval(() => setSecondsLeft((seconds) => tickFocusTimer({ durationMinutes: duration, secondsLeft: seconds, status: "running" }).secondsLeft), 1000);
    return () => window.clearInterval(interval);
  }, [isRunning]);

  const playLocalTone = (signal: "focus" | "xp" | "level" | "unlock") => {
    if (!state.soundEnabled || typeof window === "undefined") return;
    try {
      const context = audioContextRef.current ?? new window.AudioContext();
      audioContextRef.current = context;
      if (context.state === "suspended") void context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;
      oscillator.frequency.setValueAtTime({ focus: 392, xp: 523, level: 659, unlock: 784 }[signal], now);
      oscillator.type = signal === "level" ? "sine" : "triangle";
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.045, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.23);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.24);
    } catch {
      // Optional local audio never blocks the productivity workflow.
    }
  };

  const triggerCosmicEvent = (kind: CosmicEvent["kind"], title: string, detail: string) => {
    const id = Date.now();
    setCosmicEvent({ id, kind, title, detail });
    if (kind !== "unlock") window.setTimeout(() => setCosmicEvent((event) => event?.id === id ? null : event), kind === "level" ? 3600 : 2600);
  };

  useEffect(() => {
    if (cosmicEvent || !unlockQueue.length) return;
    const [nextEvent, ...remainingEvents] = unlockQueue;
    setUnlockQueue(remainingEvents);
    triggerCosmicEvent("unlock", nextEvent.title, nextEvent.detail);
  }, [cosmicEvent, unlockQueue]);

  useEffect(() => {
    if (cosmicEvent?.kind !== "unlock") return undefined;
    const id = cosmicEvent.id;
    const timeout = window.setTimeout(() => setCosmicEvent((event) => event?.id === id ? null : event), 2600);
    return () => window.clearTimeout(timeout);
  }, [cosmicEvent]);

  const completeFocus = () => {
    const timestamp = new Date().toISOString();
    const session = { id: activeSessionId ?? randomId(), completedAt: timestamp, durationMinutes: duration };
    const completedTimer: FocusTimer = { durationMinutes: duration, secondsLeft: 0, status: "completed" };
    const completion = completeTimerSession(state, completedTimer, session);
    if (!completion.awarded) {
      setIsRunning(false);
      return;
    }
    const productiveDates = completion.state.productiveDates;
    const beforeProgress = universeProgress(state.xp, calculateStreak(state.productiveDates).current);
    const afterProgress = universeProgress(state.xp + FOCUS_XP, calculateStreak(productiveDates).current);
    const newUnlocks = universeUnlockEvents(beforeProgress, afterProgress, state.announcedUnlocks);
    setIsRunning(false);
    setSecondsLeft(duration * 60);
    setActiveSessionId(null);
    setState((previous) => recordUniverseUnlocks(completeTimerSession(previous, completedTimer, session).state, newUnlocks, timestamp));
    if (newUnlocks.length) setUnlockQueue((events) => [...events, ...newUnlocks]);
    playLocalTone("focus");
    playLocalTone("xp");
    const beforeLevel = levelForXp(state.xp);
    const afterLevel = levelForXp(state.xp + FOCUS_XP);
    setXpPulse(FOCUS_XP);
    window.setTimeout(() => setXpPulse(null), 1500);
    if (afterLevel > beforeLevel) {
      setLevelUp(afterLevel);
      setNotice(`Level ${afterLevel} reached. Your universe has expanded.`);
      window.setTimeout(() => setLevelUp(null), 3800);
      triggerCosmicEvent("level", `Observer level ${afterLevel}`, "A wider orbit has opened in your universe.");
      playLocalTone("level");
    } else if (newUnlocks.length) {
      setNotice(newUnlocks[0].detail);
      playLocalTone("unlock");
    } else {
      setNotice(`Session complete. +${FOCUS_XP} XP recorded in your constellation.`);
      triggerCosmicEvent("session", "Orbit complete", "The session has been recorded in your constellation.");
    }
  };

  useEffect(() => {
    if (secondsLeft === 0 && isRunning) completeFocus();
    // Completion is intentionally tied to the exact zero-second event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, isRunning]);

  const progress = useMemo(() => productivityLevelProgress(state.xp), [state.xp]);
  const streak = useMemo(() => calculateProductivityStreak(state.productiveDates), [state.productiveDates]);
  const today = dateKey(new Date());
  const todaySessions = useMemo(() => state.sessions.filter((session) => dateKey(session.completedAt) === today), [state.sessions, today]);
  const todayFocus = dailyFocusMinutes(state.sessions);
  const todayGoals = state.goals.filter((goal) => dateKey(goal.createdAt) === today);
  const completeGoals = todayGoals.filter((goal) => goal.completed).length;
  const weeklyData = useMemo(() => getWeekDays().map((date) => {
    const key = dateKey(date);
    return {
      label: shortDay(date),
      minutes: state.sessions.filter((session) => dateKey(session.completedAt) === key).reduce((total, session) => total + session.durationMinutes, 0),
    };
  }), [state.sessions]);
  const weeklyFocus = weeklyData.reduce((total, day) => total + day.minutes, 0);
  const monthlyFocus = monthlyFocusMinutes(state.sessions);
  const universe = useMemo(() => universeProgress(state.xp, streak.current), [state.xp, streak.current]);
  const universeLevel = universe.universeLevel;
  const starCount = universe.stars;
  const planetCount = universe.planets;
  const moonCount = universe.moons;
  const showComet = universe.cometUnlocked;
  const historyRecords = useMemo(() => filterAndSortUnlockHistory(state.unlockHistory, historyFilter, historySort), [state.unlockHistory, historyFilter, historySort]);
  const weeklyTotals = useMemo(() => weeklyFocusTotals(state.sessions), [state.sessions]);

  const timerProgress = Math.max(0, Math.min(1, 1 - secondsLeft / (duration * 60)));
  const timerDash = 2 * Math.PI * 118;

  const changeDuration = (next: number) => {
    const safe = createFocusTimer(next).durationMinutes;
    setDuration(safe);
    if (!isRunning) setSecondsLeft(safe * 60);
  };

  const addGoal = (event: FormEvent) => {
    event.preventDefault();
    const title = goalText.trim();
    if (!title) return;
    setState((previous) => ({
      ...previous,
      goals: [...previous.goals, { id: randomId(), title, completed: false, createdAt: new Date().toISOString() }],
    }));
    setGoalText("");
    setNotice("A new goal is waiting in today’s flight plan.");
  };

  const toggleGoal = (id: string) => {
    const goal = state.goals.find((item) => item.id === id);
    if (!goal) return;
    const completing = !goal.completed;
    const now = new Date().toISOString();
    const transition = toggleDailyGoal(state, id, now);
    const xpGain = transition.awarded ? GOAL_XP : 0;
    const productiveDates = transition.state.productiveDates;
    const beforeProgress = universeProgress(state.xp, calculateStreak(state.productiveDates).current);
    const afterProgress = universeProgress(state.xp + xpGain, calculateStreak(productiveDates).current);
    const newUnlocks = universeUnlockEvents(beforeProgress, afterProgress, state.announcedUnlocks);
    setState((previous) => recordUniverseUnlocks(toggleDailyGoal(previous, id, now).state, newUnlocks, now));
    if (newUnlocks.length) setUnlockQueue((events) => [...events, ...newUnlocks]);
    if (xpGain) {
      const beforeLevel = levelForXp(state.xp);
      const afterLevel = levelForXp(state.xp + xpGain);
      setXpPulse(GOAL_XP);
      window.setTimeout(() => setXpPulse(null), 1500);
      playLocalTone("xp");
      if (afterLevel > beforeLevel) {
        setLevelUp(afterLevel);
        setNotice(`Level ${afterLevel} reached. A new orbit has opened.`);
        window.setTimeout(() => setLevelUp(null), 3800);
        triggerCosmicEvent("level", `Observer level ${afterLevel}`, "A wider orbit has opened in your universe.");
        playLocalTone("level");
      } else if (newUnlocks.length) {
        setNotice(newUnlocks[0].detail);
        playLocalTone("unlock");
      } else {
        setNotice(`Goal complete. +${GOAL_XP} XP added to your record.`);
        triggerCosmicEvent("xp", "Energy gathered", `+${GOAL_XP} XP has been added to your record.`);
      }
    } else {
      setNotice(completing ? "Goal marked complete." : "Goal returned to your flight plan.");
    }
  };

  const saveGoalEdit = (id: string) => {
    const title = editingText.trim();
    if (!title) return;
    setState((previous) => editDailyGoal(previous, id, title));
    setEditingGoal(null);
    setNotice("Goal coordinates updated.");
  };

  const deleteGoal = (id: string) => {
    setState((previous) => deleteDailyGoal(previous, id));
    if (editingGoal === id) setEditingGoal(null);
    setNotice("Goal removed from today’s flight plan.");
  };

  const resetAll = () => {
    const resetState = resetAllProgress(() => window.confirm("Reset all Focus Universe progress? This removes saved sessions, goals, XP, and streak history from this browser."));
    if (!resetState) return;
    setState(resetState);
    setIsRunning(false);
    setDuration(25);
    setSecondsLeft(25 * 60);
    setNotice("All saved progress has been cleared from this device.");
  };

  const exportProgress = () => {
    const blob = new Blob([createFocusUniverseExport(state)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `focus-universe-backup-${dateKey(new Date())}.json`;
    anchor.click();
    window.URL.revokeObjectURL(url);
    setNotice("Local backup exported. No data left this device.");
  };

  const importProgress = async (file: File | undefined) => {
    if (!file) return;
    const content = await file.text();
    if (!parseFocusUniverseExport(content)) {
      setNotice("Import rejected. Select a valid Focus Universe backup file.");
      return;
    }
    const imported = confirmFocusUniverseImport(content, () => window.confirm("Replace all current Focus Universe progress with this local backup?"));
    if (!imported) return;
    setState(imported);
    setIsRunning(false);
    setActiveSessionId(null);
    setDuration(25);
    setSecondsLeft(25 * 60);
    setNotice("Local backup restored to this device.");
  };

  const scrollTo = (id: string, label: string) => {
    setActiveView(label);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleUniversePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
    const vertical = (event.clientY - bounds.top) / bounds.height - 0.5;
    setUniverseTilt({ x: Math.round(horizontal * 10), y: Math.round(vertical * 8) });
  };

  const universeStyle = {
    "--parallax-x": `${universeTilt.x}px`,
    "--parallax-y": `${universeTilt.y}px`,
  } as CSSProperties;

  return (
    <div className="focus-universe-shell">
      <div className="deep-space" aria-hidden="true" style={{ backgroundImage: `url(${NEBULA_IMAGE})` }} />
      <div className="star-dust" aria-hidden="true" />
      <div className="stellar-field" aria-hidden="true">
        {Array.from({ length: 18 }, (_, index) => <i key={index} className={`ambient-star ambient-star-${index % 4}`} style={{ left: `${(index * 29 + 7) % 97}%`, top: `${(index * 47 + 11) % 91}%`, animationDelay: `${(index % 9) * -1.1}s`, animationDuration: `${8 + (index % 5) * 2}s` }} />)}
      </div>
      <aside className="side-rail" aria-label="Primary navigation">
        <button className="brand-lockup" type="button" onClick={() => scrollTo("mission-control", "Mission control")} aria-label="Focus Universe home">
          <img src={LOGO_IMAGE} alt="" className="brand-mark" />
          <span><b>FOCUS</b><em>UNIVERSE</em></span>
        </button>
        <nav className="nav-stack">
          <NavItem icon={Orbit} label="Mission control" active={activeView === "Mission control"} onClick={() => scrollTo("mission-control", "Mission control")} />
          <NavItem icon={Sparkles} label="My universe" active={activeView === "My universe"} onClick={() => scrollTo("universe", "My universe")} />
          <NavItem icon={Clock3} label="Focus log" active={activeView === "Focus log"} onClick={() => scrollTo("focus-log", "Focus log")} />
          <NavItem icon={Goal} label="Daily goals" active={activeView === "Daily goals"} onClick={() => scrollTo("goals", "Daily goals")} />
        </nav>
        <div className="rail-bottom">
          <button className="rail-utility" type="button" onClick={() => setNotice("All signals are saved locally in this browser.")} aria-label="About local storage"><CircleHelp size={18} /></button>
          <div className="local-signal"><i /> local</div>
        </div>
      </aside>

      <main className="command-deck" id="mission-control">
        <header className="topbar">
          <div>
            <div className="deck-brand" aria-label="Focus Universe">
              <img src={LOGO_IMAGE} alt="" />
              <span><b>Focus</b><em>Universe</em></span>
              <i />
              <small>Observer log</small>
            </div>
            <p className="eyebrow">Mission control <span>•</span> {new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</p>
            <h1>Make space for what matters.</h1>
          </div>
          <div className="topbar-status" aria-live="polite">
            <span className="signal-dot" />
            <p>{notice}</p>
          </div>
        </header>

        <section className="main-orbit" aria-label="Focus session and universe overview">
          <article className={`timer-panel glass-panel ${cosmicEvent?.kind === "session" ? "is-celebrating" : ""}`}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Current orbit</p>
                <h2>{isRunning ? "Focus session in progress" : secondsLeft < duration * 60 ? "Orbit on pause" : "Ready when you are"}</h2>
              </div>
              <div className="node-readout"><span>NODE α·01</span><span className="panel-status"><i className={isRunning ? "live" : ""} /> {isRunning ? "Focusing" : "Standby"}</span></div>
            </div>

            <div className="timer-layout">
              <div className="timer-orbit" role="timer" aria-label={`${formatTimer(secondsLeft)} remaining`}>
                <svg viewBox="0 0 260 260" aria-hidden="true">
                  <circle className="timer-track" cx="130" cy="130" r="118" />
                  <circle className="timer-progress" cx="130" cy="130" r="118" style={{ strokeDasharray: timerDash, strokeDashoffset: timerDash * (1 - timerProgress) }} />
                  <circle className="timer-orbit-dot" cx="130" cy="12" r="3" />
                </svg>
                <div className="timer-readout">
                  <span>{formatTimer(secondsLeft)}</span>
                  <small>{duration} MIN FOCUS BLOCK</small>
                </div>
              </div>
              <div className="timer-controls">
                <div className="timer-action-row">
                  <button className="timer-action primary" type="button" onClick={() => { if (!isRunning && secondsLeft === duration * 60 && !activeSessionId) setActiveSessionId(randomId()); setIsRunning((current) => !current); }}>
                    {isRunning ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
                    {isRunning ? "Pause orbit" : secondsLeft < duration * 60 ? "Resume orbit" : "Begin focus"}
                  </button>
                  <button className="timer-action icon-only" type="button" onClick={() => { setIsRunning(false); setActiveSessionId(null); setSecondsLeft(createFocusTimer(duration).secondsLeft); setNotice("The current orbit has been reset."); }} aria-label="Reset timer"><RotateCcw size={19} /></button>
                </div>
                <label className="duration-control">
                  <span>Focus duration</span>
                  <div><input type="number" min="1" max="120" inputMode="numeric" value={duration} disabled={isRunning} onChange={(event) => changeDuration(Number(event.target.value))} /><b>min</b></div>
                </label>
                <p className="timer-note">Complete the entire block to capture <b>+{FOCUS_XP} XP</b>. Resets and pauses keep the orbit unfinished.</p>
              </div>
            </div>
          </article>

          <article className={`universe-panel ${cosmicEvent ? `is-reacting is-${cosmicEvent.kind}` : ""}`} id="universe">
            <div className="universe-visual" style={universeStyle} onPointerMove={handleUniversePointerMove} onPointerLeave={() => setUniverseTilt({ x: 0, y: 0 })}>
              <div className="planet-atmosphere" aria-hidden="true" style={{ backgroundImage: `linear-gradient(180deg, rgba(3, 8, 24, 0.05), rgba(3, 8, 24, 0.72)), url(${PLANET_IMAGE})` }} />
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              {Array.from({ length: starCount }, (_, index) => <i className={`universe-star star-${index % 6}`} key={index} style={{ left: `${(index * 37 + 9) % 93}%`, top: `${(index * 53 + 5) % 86}%`, animationDelay: `${(index % 8) * 0.7}s` }} />)}
              {planetCount > 0 && <span className="mini-planet mini-planet-one" />}
              {planetCount > 1 && <span className="mini-planet mini-planet-two" />}
              {moonCount > 0 && <span className="moon moon-one" />}
              {moonCount > 1 && <span className="moon moon-two" />}
              {showComet && <img className="comet-object" src={COMET_IMAGE} alt="A comet unlocked by your focus streak" />}
              <div className="universe-copy">
                <p className="eyebrow">Personal universe</p>
                <div><strong>Sector 0{universeLevel}</strong><span>growing with every completed orbit</span></div>
              </div>
              <span className="sector-node">SECTOR β·{String(universeLevel).padStart(2, "0")}</span>
              <div className="universe-legend"><span><i className="legend-star" /> {starCount} stars</span><span><i className="legend-orbit" /> {planetCount} planets</span></div>
              {cosmicEvent && <div className={`universe-event event-${cosmicEvent.kind}`} key={cosmicEvent.id} role="status" aria-live="polite"><i /><i /><div><button className="dismiss-event" type="button" onClick={() => setCosmicEvent(null)} aria-label="Dismiss milestone notification"><X size={13} /></button><small>{cosmicEvent.kind === "unlock" ? "Cosmic object unlocked" : cosmicEvent.kind === "level" ? "Level increase" : "Productivity signal"}</small><strong>{cosmicEvent.title}</strong><span>{cosmicEvent.detail}</span></div></div>}
            </div>
            <div className="universe-footer">
              <div><p>Next object</p><strong>{planetCount === 0 ? "First planet" : moonCount === 0 ? "Companion moon" : showComet ? "Outer orbit" : "Streak comet"}</strong></div>
              <div className="unlock-progress"><span style={{ width: `${Math.min(100, (state.xp % 300) / 3)}%` }} /></div>
              <small>{state.xp % 300}/300 XP</small>
            </div>
          </article>
        </section>

        <section className="metrics-strip" aria-label="Today’s productivity metrics">
          <Metric icon={Clock3} label="Today’s focus" value={formatMinutes(todayFocus)} detail={`${todaySessions.length} completed ${todaySessions.length === 1 ? "session" : "sessions"}`} accent="blue" />
          <Metric icon={Zap} label="Total energy" value={`${state.xp} XP`} detail={`${progress.remaining} XP to next level`} accent="teal" energized={xpPulse !== null} />
          <Metric icon={Flame} label="Focus streak" value={`${streak.current} ${streak.current === 1 ? "day" : "days"}`} detail={`Personal best: ${streak.best} ${streak.best === 1 ? "day" : "days"}`} accent="gold" />
          <Metric icon={Trophy} label="Universe level" value={`0${universeLevel}`} detail={`Level ${progress.level} observer`} />
        </section>

        <section className="lower-deck" id="focus-log">
          <article className="insight-panel glass-panel">
            <div className="section-heading">
              <div><p className="eyebrow">Focus log</p><h2>Energy across your week</h2></div>
              <div className="instrument-status"><span>VECTOR C·07</span><span className="metric-note">{formatMinutes(weeklyFocus)} total</span></div>
            </div>
            <div className="trend-chart" aria-label="Weekly focus time chart">
              <div className="chart-grid"><span /><span /><span /><span /></div>
              <div className="chart-bars">
                {weeklyData.map((day) => <div className="bar-group" key={day.label}><div className="bar-value">{day.minutes ? `${day.minutes}m` : ""}</div><div className="bar-well"><span style={{ height: `${Math.max(5, Math.min(100, (day.minutes / Math.max(30, ...weeklyData.map((entry) => entry.minutes))) * 100))}%` }} /></div><small>{day.label}</small></div>)}
              </div>
            </div>
            <div className="insight-stat-row">
              <div><span>Monthly focus</span><strong>{formatMinutes(monthlyFocus)}</strong></div>
              <div><span>Sessions complete</span><strong>{state.sessions.length}</strong></div>
              <div><span>Goals complete</span><strong>{state.goals.filter((goal) => goal.completed).length}</strong></div>
              <button type="button" onClick={() => setNotice("Analytics reflect every completed session and goal saved on this device.")}>View signal <ChevronRight size={16} /></button>
            </div>
            <div className="weekly-totals" aria-label="Focus totals by week">
              {weeklyTotals.map((week) => <div key={week.label}><span>{week.label}</span><strong>{formatMinutes(week.minutes)}</strong><small>{week.start.slice(5)}–{week.end.slice(5)}</small></div>)}
            </div>
          </article>

          <article className="level-panel glass-panel">
            <div className="level-badge"><span>LVL</span><strong>{String(progress.level).padStart(2, "0")}</strong></div>
            <div className="level-content"><p className="eyebrow">Observer level</p><h2>{progress.level < 3 ? "Stargazer" : progress.level < 6 ? "Orbit keeper" : "Deep space navigator"}</h2><p>Every focused block adds a little more gravity to your universe.</p></div>
            <div className="level-progress"><div><span>{progress.current} XP gathered</span><span>{progress.required} XP</span></div><div className="level-track"><span style={{ width: `${progress.percent}%` }} /></div></div>
          </article>
        </section>

        <section className="unlock-history-panel glass-panel" aria-label="Unlock History">
          <div className="section-heading">
            <div><p className="eyebrow">Discovery archive</p><h2>Unlock history</h2></div>
            <div className="instrument-status"><span>ARCHIVE U·01</span><span className="metric-note">{state.unlockHistory.length} discovered</span></div>
          </div>
          <div className="history-controls" aria-label="Unlock History controls">
            <div className="history-filter-group" role="group" aria-label="Filter unlock history">
              {(["all", "star", "planet", "moon", "comet", "sector"] as UnlockHistoryFilter[]).map((filter) => <button type="button" key={filter} className={historyFilter === filter ? "is-active" : ""} aria-pressed={historyFilter === filter} onClick={() => setHistoryFilter(filter)}>{filter === "all" ? "All" : `${filter[0].toUpperCase()}${filter.slice(1)}${filter === "sector" ? "s" : ""}`}</button>)}
            </div>
            <label className="history-sort"><span>Sort</span><select value={historySort} onChange={(event) => setHistorySort(event.target.value as UnlockHistorySort)} aria-label="Sort unlock history"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="type">Object type</option></select></label>
          </div>
          {historyRecords.length === 0 ? (
            <div className="unlock-history-empty"><Sparkles size={20} /><p>Your discovery archive is waiting for its first signal.</p></div>
          ) : (
            <div className="unlock-history-list">
              {historyRecords.map((record) => (
                <article className="unlock-history-row" key={record.id}>
                  <span className={`history-glyph history-${record.id.split("-")[0]}`} aria-hidden="true" />
                  <div><strong>{record.title}</strong><p>{record.detail}</p></div>
                  <time dateTime={record.unlockedAt}>{new Date(record.unlockedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="goals-panel glass-panel" id="goals">
            <div className="section-heading">
              <div><p className="eyebrow">Today’s flight plan</p><h2>Daily goals</h2></div>
            <div className="instrument-status"><span>LOG D·TODAY</span><span className="goals-count"><b>{completeGoals}</b> / {todayGoals.length} complete</span></div>
          </div>
          <form className="add-goal" onSubmit={addGoal}>
            <input value={goalText} onChange={(event) => setGoalText(event.target.value)} placeholder="Add an intentional goal for today" aria-label="New daily goal" maxLength={120} />
            <button type="submit"><Plus size={18} /> Add goal</button>
          </form>
          <div className="goal-list">
            {todayGoals.length === 0 ? <div className="empty-goals"><Sparkles size={20} /><p>No goals in orbit yet. Add one small, specific intention to begin.</p></div> : todayGoals.map((goal) => (
              <div className={`goal-row ${goal.completed ? "is-complete" : ""}`} key={goal.id}>
                <button className="goal-check" type="button" aria-label={goal.completed ? `Mark ${goal.title} incomplete` : `Complete ${goal.title}`} onClick={() => toggleGoal(goal.id)}>{goal.completed && <Check size={15} strokeWidth={3} />}</button>
                {editingGoal === goal.id ? <input className="goal-edit-input" autoFocus value={editingText} onChange={(event) => setEditingText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveGoalEdit(goal.id); if (event.key === "Escape") setEditingGoal(null); }} /> : <p>{goal.title}</p>}
                <span className="goal-xp">{goal.completed && goal.xpAwarded ? "+20 XP" : "+20 XP on completion"}</span>
                <div className="goal-actions">
                  {editingGoal === goal.id ? <><button type="button" aria-label="Save goal" onClick={() => saveGoalEdit(goal.id)}><Check size={16} /></button><button type="button" aria-label="Cancel edit" onClick={() => setEditingGoal(null)}><X size={16} /></button></> : <><button type="button" aria-label="Edit goal" onClick={() => { setEditingGoal(goal.id); setEditingText(goal.title); }}><Edit3 size={16} /></button><button type="button" aria-label="Delete goal" onClick={() => deleteGoal(goal.id)}><Trash2 size={16} /></button></>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="data-settings-panel glass-panel" aria-label="Data and Settings">
          <div className="section-heading">
            <div><p className="eyebrow">Local observatory</p><h2>Data &amp; settings</h2></div>
            <div className="instrument-status"><span>VAULT D·01</span><span className="metric-note">device-only</span></div>
          </div>
          <div className="settings-grid">
            <div className="settings-card">
              <div className="settings-card-heading"><span className="settings-orbit" aria-hidden="true" /><div><strong>Backup vault</strong><p>Export every local session, goal, level, and discovery as validated JSON.</p></div></div>
              <div className="settings-actions">
                <button type="button" onClick={exportProgress}>Export backup</button>
                <button type="button" onClick={() => importInputRef.current?.click()}>Import backup</button>
                <input ref={importInputRef} type="file" accept="application/json" className="visually-hidden" aria-label="Import Focus Universe backup" onChange={(event) => { void importProgress(event.target.files?.[0]); event.currentTarget.value = ""; }} />
              </div>
            </div>
            <div className="settings-card">
              <div className="settings-card-heading"><span className="settings-signal" aria-hidden="true" /><div><strong>Sound effects</strong><p>Optional local tones for milestones. Off by default and saved on this device.</p></div></div>
              <button type="button" role="switch" aria-checked={state.soundEnabled} className={state.soundEnabled ? "sound-toggle is-on" : "sound-toggle"} onClick={() => { const next = !state.soundEnabled; setState((previous) => ({ ...previous, soundEnabled: next })); setNotice(next ? "Local milestone sounds enabled." : "Local milestone sounds muted."); if (next) { try { const context = audioContextRef.current ?? new window.AudioContext(); audioContextRef.current = context; void context.resume(); } catch { /* Optional browser audio may remain unavailable. */ } } }}><span>{state.soundEnabled ? "ON" : "OFF"}</span><i aria-hidden="true" /></button>
            </div>
          </div>
        </section>

        <footer className="deck-footer">
          <p><span className="signal-dot" /> All progress is stored locally on this device.</p>
          <button type="button" onClick={resetAll}><Trash2 size={14} /> Reset all progress</button>
        </footer>
      </main>

      {xpPulse !== null && <div className="xp-pulse" aria-live="polite"><Zap size={17} fill="currentColor" /> +{xpPulse} XP</div>}
      {levelUp !== null && <div className="level-up" role="status" aria-live="polite"><button className="dismiss-level" type="button" onClick={() => setLevelUp(null)} aria-label="Dismiss level-up notification"><X size={16} /></button><img src={LOGO_IMAGE} alt="" /><p>New level detected</p><strong>Observer level {levelUp}</strong><span>Your universe has opened a new orbit.</span></div>}
    </div>
  );
}

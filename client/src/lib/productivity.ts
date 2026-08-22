/**
 * Focus Universe local-first productivity domain.
 * This module has no network, browser, or UI dependencies so timer and reward rules remain deterministic and testable.
 */
export const STORAGE_KEY = "focus-universe-state-v1";
export const FOCUS_XP = 50;
export const GOAL_XP = 20;

export type FocusSession = {
  id: string;
  completedAt: string;
  durationMinutes: number;
};

export type DailyGoal = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  completedAt?: string;
  xpAwarded?: boolean;
};

export type FocusUniverseState = {
  xp: number;
  sessions: FocusSession[];
  goals: DailyGoal[];
  productiveDates: Record<string, true>;
};

export type FocusTimerStatus = "ready" | "running" | "paused" | "completed";

export type FocusTimer = {
  durationMinutes: number;
  secondsLeft: number;
  status: FocusTimerStatus;
};

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export const initialProductivityState: FocusUniverseState = {
  xp: 0,
  sessions: [],
  goals: [],
  productiveDates: {},
};

export function dateKey(input: Date | string) {
  const date = new Date(input);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function levelBase(level: number) {
  return Math.pow(level - 1, 2) * 100;
}

export function levelForXp(xp: number) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}

export function levelProgress(xp: number) {
  const level = levelForXp(xp);
  const currentFloor = levelBase(level);
  const nextFloor = levelBase(level + 1);
  const current = xp - currentFloor;
  const required = nextFloor - currentFloor;
  return {
    level,
    current,
    required,
    remaining: nextFloor - xp,
    percent: Math.min(100, Math.max(0, (current / required) * 100)),
  };
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function calculateStreak(productiveDates: Record<string, true>, now = new Date()) {
  const keys = Object.keys(productiveDates).sort();
  if (!keys.length) return { current: 0, best: 0 };

  let current = 0;
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  if (!productiveDates[dateKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  while (productiveDates[dateKey(cursor)]) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  let best = 1;
  let running = 1;
  for (let index = 1; index < keys.length; index += 1) {
    const previous = parseDateKey(keys[index - 1]);
    const next = parseDateKey(keys[index]);
    const difference = Math.round((next.getTime() - previous.getTime()) / 86_400_000);
    running = difference === 1 ? running + 1 : 1;
    best = Math.max(best, running);
  }
  return { current, best };
}

export function createFocusTimer(durationMinutes = 25): FocusTimer {
  const safeDuration = Math.min(120, Math.max(1, Math.floor(durationMinutes || 1)));
  return { durationMinutes: safeDuration, secondsLeft: safeDuration * 60, status: "ready" };
}

export function startFocusTimer(timer: FocusTimer): FocusTimer {
  if (timer.status === "completed") return timer;
  return { ...timer, status: "running" };
}

export function pauseFocusTimer(timer: FocusTimer): FocusTimer {
  return timer.status === "running" ? { ...timer, status: "paused" } : timer;
}

export function resumeFocusTimer(timer: FocusTimer): FocusTimer {
  return timer.status === "paused" || timer.status === "ready" ? { ...timer, status: "running" } : timer;
}

export function tickFocusTimer(timer: FocusTimer, elapsedSeconds = 1): FocusTimer {
  if (timer.status !== "running") return timer;
  const secondsLeft = Math.max(0, timer.secondsLeft - Math.max(0, elapsedSeconds));
  return { ...timer, secondsLeft, status: secondsLeft === 0 ? "completed" : "running" };
}

export function resetFocusTimer(timer: FocusTimer, durationMinutes = timer.durationMinutes): FocusTimer {
  return createFocusTimer(durationMinutes);
}

export function completeTimerSession(state: FocusUniverseState, timer: FocusTimer, session: FocusSession): { state: FocusUniverseState; awarded: boolean } {
  if (timer.status !== "completed" || state.sessions.some((item) => item.id === session.id)) {
    return { state, awarded: false };
  }

  return {
    awarded: true,
    state: {
      ...state,
      xp: state.xp + FOCUS_XP,
      sessions: [...state.sessions, session],
      productiveDates: { ...state.productiveDates, [dateKey(session.completedAt)]: true } as Record<string, true>,
    },
  };
}

export function completeDailyGoal(state: FocusUniverseState, goalId: string, completedAt: string): { state: FocusUniverseState; awarded: boolean } {
  const goal = state.goals.find((item) => item.id === goalId);
  if (!goal || goal.completed) return { state, awarded: false };

  const awarded = !goal.xpAwarded;

  return {
    awarded,
    state: {
      ...state,
      xp: state.xp + (awarded ? GOAL_XP : 0),
      productiveDates: { ...state.productiveDates, [dateKey(completedAt)]: true } as Record<string, true>,
      goals: state.goals.map((item) => item.id === goalId ? { ...item, completed: true, completedAt, xpAwarded: true } : item),
    },
  };
}

export function toggleDailyGoal(state: FocusUniverseState, goalId: string, completedAt: string): { state: FocusUniverseState; awarded: boolean } {
  const goal = state.goals.find((item) => item.id === goalId);
  if (!goal) return { state, awarded: false };
  if (!goal.completed) return completeDailyGoal(state, goalId, completedAt);
  return { state: { ...state, goals: state.goals.map((item) => item.id === goalId ? { ...item, completed: false } : item) }, awarded: false };
}

export function editDailyGoal(state: FocusUniverseState, goalId: string, title: string): FocusUniverseState {
  const nextTitle = title.trim();
  if (!nextTitle || !state.goals.some((goal) => goal.id === goalId)) return state;
  return { ...state, goals: state.goals.map((goal) => goal.id === goalId ? { ...goal, title: nextTitle } : goal) };
}

export function deleteDailyGoal(state: FocusUniverseState, goalId: string): FocusUniverseState {
  if (!state.goals.some((goal) => goal.id === goalId)) return state;
  return { ...state, goals: state.goals.filter((goal) => goal.id !== goalId) };
}

export function resetAllProgress(confirmReset: () => boolean): FocusUniverseState | null {
  if (!confirmReset()) return null;
  return { xp: 0, sessions: [], goals: [], productiveDates: {} };
}

export function dailyFocusMinutes(sessions: FocusSession[], now = new Date()) {
  const today = dateKey(now);
  return sessions.filter((session) => dateKey(session.completedAt) === today).reduce((total, session) => total + session.durationMinutes, 0);
}

export function monthlyFocusMinutes(sessions: FocusSession[], now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setHours(12, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 29);
  return sessions.filter((session) => new Date(session.completedAt) >= cutoff).reduce((total, session) => total + session.durationMinutes, 0);
}

export function loadProductivityState(storage: StorageLike): FocusUniverseState {
  try {
    const storedValue = storage.getItem(STORAGE_KEY);
    if (!storedValue) return initialProductivityState;
    const parsed = JSON.parse(storedValue) as Partial<FocusUniverseState>;
    return {
      xp: Number(parsed.xp) || 0,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
      productiveDates: parsed.productiveDates ?? {},
    };
  } catch {
    return initialProductivityState;
  }
}

export function saveProductivityState(storage: StorageLike, state: FocusUniverseState) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

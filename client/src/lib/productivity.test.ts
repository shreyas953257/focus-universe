import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FOCUS_XP,
  GOAL_XP,
  calculateStreak,
  completeDailyGoal,
  completeTimerSession,
  createFocusTimer,
  dailyFocusMinutes,
  deleteDailyGoal,
  editDailyGoal,
  initialProductivityState,
  levelForXp,
  levelProgress,
  loadProductivityState,
  pauseFocusTimer,
  resetFocusTimer,
  resetAllProgress,
  resumeFocusTimer,
  saveProductivityState,
  startFocusTimer,
  tickFocusTimer,
  toggleDailyGoal,
  universeProgress,
  monthlyFocusMinutes,
  type FocusTimer,
  type StorageLike,
} from "./productivity";

function runScheduledTimer(timer: FocusTimer) {
  let current = timer;
  const interval = setInterval(() => {
    current = tickFocusTimer(current);
  }, 1_000);
  return { get timer() { return current; }, stop: () => clearInterval(interval) };
}

function createMemoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe("Focus Universe timer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts a 25-minute focus session and completes immediately under fake timers", () => {
    const runner = runScheduledTimer(startFocusTimer(createFocusTimer(25)));

    expect(runner.timer.status).toBe("running");
    expect(runner.timer.secondsLeft).toBe(1_500);
    vi.advanceTimersByTime(25 * 60 * 1_000);

    expect(runner.timer.status).toBe("completed");
    expect(runner.timer.secondsLeft).toBe(0);
    runner.stop();
  });

  it("pauses and resumes without counting paused time", () => {
    const runner = runScheduledTimer(startFocusTimer(createFocusTimer(25)));
    vi.advanceTimersByTime(30_000);
    const paused = pauseFocusTimer(runner.timer);
    const secondsAtPause = paused.secondsLeft;

    vi.advanceTimersByTime(10 * 60 * 1_000);
    expect(tickFocusTimer(paused)).toEqual(paused);
    expect(secondsAtPause).toBe(1_470);

    const resumed = resumeFocusTimer(paused);
    expect(resumed.status).toBe("running");
    runner.stop();
  });

  it("resets a partially completed session to its full duration", () => {
    const partial = tickFocusTimer(startFocusTimer(createFocusTimer(25)), 415);
    const reset = resetFocusTimer(partial);

    expect(reset).toEqual({ durationMinutes: 25, secondsLeft: 1_500, status: "ready" });
  });
});

describe("Focus Universe productivity rules", () => {
  const completedTimer = tickFocusTimer(startFocusTimer(createFocusTimer(25)), 1_500);
  const session = { id: "session-1", completedAt: "2026-08-22T10:00:00.000Z", durationMinutes: 25 };

  it("awards a completed focus session exactly once", () => {
    const firstCompletion = completeTimerSession(initialProductivityState, completedTimer, session);
    const secondCompletion = completeTimerSession(firstCompletion.state, completedTimer, session);

    expect(firstCompletion.awarded).toBe(true);
    expect(firstCompletion.state.xp).toBe(FOCUS_XP);
    expect(firstCompletion.state.sessions).toHaveLength(1);
    expect(secondCompletion.awarded).toBe(false);
    expect(secondCompletion.state.xp).toBe(FOCUS_XP);
    expect(secondCompletion.state.sessions).toHaveLength(1);
  });

  it("awards zero XP for incomplete or interrupted focus sessions", () => {
    const incomplete = tickFocusTimer(startFocusTimer(createFocusTimer(25)), 1_499);
    const paused = pauseFocusTimer(incomplete);
    const result = completeTimerSession(initialProductivityState, paused, session);

    expect(result.awarded).toBe(false);
    expect(result.state.xp).toBe(0);
    expect(result.state.sessions).toHaveLength(0);
  });

  it("updates levels, goal XP, and consecutive productive-day streaks", () => {
    const withGoal = completeDailyGoal({
      ...initialProductivityState,
      xp: 80,
      goals: [{ id: "goal-1", title: "Draft outline", completed: false, createdAt: "2026-08-20T09:00:00.000Z" }],
    }, "goal-1", "2026-08-20T10:00:00.000Z");
    const withSession = completeTimerSession(withGoal.state, completedTimer, session);

    expect(withGoal.awarded).toBe(true);
    expect(withGoal.state.xp).toBe(80 + GOAL_XP);
    expect(withSession.state.xp).toBe(80 + GOAL_XP + FOCUS_XP);
    expect(levelForXp(withSession.state.xp)).toBe(2);
    expect(levelProgress(withSession.state.xp)).toMatchObject({ level: 2, current: 50, required: 300 });
    expect(calculateStreak({
      "2026-08-20": true,
      "2026-08-21": true,
      "2026-08-22": true,
    }, new Date("2026-08-22T12:00:00.000Z"))).toEqual({ current: 3, best: 3 });
  });

  it("round-trips progress through local storage without a network dependency", () => {
    const storage = createMemoryStorage();
    const completed = completeTimerSession(initialProductivityState, completedTimer, session).state;

    saveProductivityState(storage, completed);
    expect(loadProductivityState(storage)).toEqual(completed);
  });
});

describe("Focus Universe goal and reset management", () => {
  const stateWithGoals = {
    ...initialProductivityState,
    xp: 70,
    goals: [
      { id: "goal-1", title: "Outline the chapter", completed: false, createdAt: "2026-08-22T09:00:00.000Z" },
      { id: "goal-2", title: "Review notes", completed: true, createdAt: "2026-08-22T09:15:00.000Z", completedAt: "2026-08-22T09:30:00.000Z", xpAwarded: true },
    ],
    productiveDates: { "2026-08-22": true as const },
  };

  it("edits only the requested goal and ignores a blank edit", () => {
    const edited = editDailyGoal(stateWithGoals, "goal-1", "  Draft the opening section  ");

    expect(edited.goals[0].title).toBe("Draft the opening section");
    expect(edited.goals[1]).toEqual(stateWithGoals.goals[1]);
    expect(editDailyGoal(edited, "goal-1", "   ")).toBe(edited);
  });

  it("deletes only the selected goal without altering saved productivity", () => {
    const deleted = deleteDailyGoal(stateWithGoals, "goal-1");

    expect(deleted.goals).toEqual([stateWithGoals.goals[1]]);
    expect(deleted.xp).toBe(70);
    expect(deleted.productiveDates).toEqual({ "2026-08-22": true });
    expect(deleteDailyGoal(deleted, "missing-goal")).toBe(deleted);
  });

  it("resets all progress only after confirmation", () => {
    const decline = vi.fn(() => false);
    const accept = vi.fn(() => true);

    expect(resetAllProgress(decline)).toBeNull();
    expect(decline).toHaveBeenCalledTimes(1);
    expect(resetAllProgress(accept)).toEqual(initialProductivityState);
    expect(accept).toHaveBeenCalledTimes(1);
  });
});

describe("Focus Universe goal idempotency and analytics", () => {
  afterEach(() => vi.useRealTimers());

  it("toggles a goal completion while awarding its XP only once", () => {
    const state = {
      ...initialProductivityState,
      goals: [{ id: "goal-1", title: "Ship the draft", completed: false, createdAt: "2026-08-22T09:00:00.000Z" }],
    };
    const firstCompletion = toggleDailyGoal(state, "goal-1", "2026-08-22T10:00:00.000Z");
    const toggledOff = toggleDailyGoal(firstCompletion.state, "goal-1", "2026-08-22T10:05:00.000Z");
    const secondCompletion = toggleDailyGoal(toggledOff.state, "goal-1", "2026-08-22T10:10:00.000Z");

    expect(firstCompletion.awarded).toBe(true);
    expect(firstCompletion.state.xp).toBe(GOAL_XP);
    expect(toggledOff.awarded).toBe(false);
    expect(toggledOff.state.goals[0].completed).toBe(false);
    expect(secondCompletion.awarded).toBe(false);
    expect(secondCompletion.state.goals[0].completed).toBe(true);
    expect(secondCompletion.state.xp).toBe(GOAL_XP);
  });

  it("calculates daily and monthly focus with a fake current date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T12:00:00.000Z"));
    const sessions = [
      { id: "today", completedAt: "2026-08-22T08:00:00.000Z", durationMinutes: 25 },
      { id: "this-month", completedAt: "2026-08-05T12:00:00.000Z", durationMinutes: 20 },
      { id: "outside-window", completedAt: "2026-07-20T12:00:00.000Z", durationMinutes: 30 },
    ];

    expect(dailyFocusMinutes(sessions)).toBe(25);
    expect(monthlyFocusMinutes(sessions)).toBe(45);
  });
});

describe("Focus Universe cosmic unlock progression", () => {
  it("unlocks stars exactly at each 55 XP boundary and never prematurely", () => {
    expect(universeProgress(54, 0).stars).toBe(9);
    expect(universeProgress(55, 0).stars).toBe(10);
    expect(universeProgress(2_310, 0).stars).toBe(42);
    expect(universeProgress(2_365, 0).stars).toBe(42);
  });

  it("unlocks planets exactly at 300 XP intervals and respects the four-planet cap", () => {
    expect(universeProgress(299, 0).planets).toBe(0);
    expect(universeProgress(300, 0).planets).toBe(1);
    expect(universeProgress(1_199, 0).planets).toBe(3);
    expect(universeProgress(1_200, 0).planets).toBe(4);
    expect(universeProgress(9_999, 0).planets).toBe(4);
  });

  it("unlocks moons only at the intended level thresholds", () => {
    expect(universeProgress(899, 0).moons).toBe(0);
    expect(universeProgress(900, 0).moons).toBe(1);
    expect(universeProgress(2_499, 0).moons).toBe(1);
    expect(universeProgress(2_500, 0).moons).toBe(2);
  });

  it("unlocks the streak comet exactly on the third consecutive productive day", () => {
    expect(universeProgress(0, 2).cometUnlocked).toBe(false);
    expect(universeProgress(0, 3).cometUnlocked).toBe(true);
  });

  it("calculates universe levels at the same level milestones used by the dashboard", () => {
    expect(universeProgress(0, 0)).toMatchObject({ level: 1, universeLevel: 1 });
    expect(universeProgress(100, 0)).toMatchObject({ level: 2, universeLevel: 1 });
    expect(universeProgress(400, 0)).toMatchObject({ level: 3, universeLevel: 2 });
  });

  it("preserves already-unlocked cosmic objects after a local storage reload", () => {
    const storage = createMemoryStorage();
    const beforeReload = {
      ...initialProductivityState,
      xp: 1_200,
      productiveDates: { "2026-08-20": true as const, "2026-08-21": true as const, "2026-08-22": true as const },
    };
    const beforeProgress = universeProgress(beforeReload.xp, calculateStreak(beforeReload.productiveDates, new Date("2026-08-22T12:00:00.000Z")).current);

    saveProductivityState(storage, beforeReload);
    const afterReload = loadProductivityState(storage);
    const afterProgress = universeProgress(afterReload.xp, calculateStreak(afterReload.productiveDates, new Date("2026-08-22T12:00:00.000Z")).current);

    expect(afterProgress).toEqual(beforeProgress);
    expect(afterProgress).toMatchObject({ stars: 30, planets: 4, moons: 1, cometUnlocked: true });
  });
});

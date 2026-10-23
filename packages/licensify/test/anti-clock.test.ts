import { describe, expect, it } from "vitest";
import {
  ClockGuard,
  ClockRollbackError,
  MemoryClockStore,
} from "../src/index.js";

describe("Anti-clock (rollback detection)", () => {
  it("accepts increasing wall-clock time", () => {
    const guard = new ClockGuard({ store: new MemoryClockStore() });
    expect(() => guard.check(1_000)).not.toThrow();
    expect(() => guard.check(2_000)).not.toThrow();
    expect(guard.lastSeen()).toBe(2_000);
  });

  it("detects a rollback beyond tolerance (persisted)", () => {
    const guard = new ClockGuard({ store: new MemoryClockStore() });
    guard.check(100_000);
    // 70s backwards exceeds the default 60s tolerance.
    expect(() => guard.check(30_000)).toThrow(ClockRollbackError);
  });

  it("tolerates small backward drift within tolerance", () => {
    const guard = new ClockGuard({ store: new MemoryClockStore() });
    guard.check(100_000);
    // 30s backwards is within the default 60s tolerance.
    expect(() => guard.check(70_000)).not.toThrow();
  });

  it("persists across guard instances via the store", () => {
    const store = new MemoryClockStore();
    const g1 = new ClockGuard({ store });
    g1.check(500_000);
    const g2 = new ClockGuard({ store });
    expect(() => g2.check(400_000)).toThrow(ClockRollbackError);
  });

  it("respects a custom tolerance", () => {
    const guard = new ClockGuard({ store: new MemoryClockStore(), toleranceMs: 0 });
    guard.check(1_000);
    expect(() => guard.check(999)).toThrow(ClockRollbackError);
  });
});

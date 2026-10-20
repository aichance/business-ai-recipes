/** @vitest-environment happy-dom */
// Original App Crash Lab regression, MIT. Copy beside reduce-motion.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let motion: typeof import("./reduce-motion");

beforeEach(async () => {
  vi.resetModules();
  document.documentElement.className = "";
  motion = await import("./reduce-motion");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.className = "";
});

const choices = [
  { name: "unset to ON", saved: null, choice: "on" },
  { name: "saved ON to OFF", saved: "true", choice: "off" },
  { name: "saved OFF to ON", saved: "false", choice: "on" },
] as const;

describe("the current choice survives a failed persistence write", () => {
  for (const osReduced of [false, true]) {
    for (const writeFails of [false, true]) {
      for (const row of choices) {
        it(`${row.name}; OS reduce=${osReduced}; write fails=${writeFails}`, () => {
          let saved: string | null = row.saved;
          const setItem = vi.fn((key: string, value: string) => {
            expect(key).toBe(motion.REDUCE_MOTION_KEY);
            if (writeFails) {
              throw new DOMException("Injected write failure", "QuotaExceededError");
            }
            saved = value;
          });
          vi.stubGlobal("localStorage", {
            getItem: (key: string) => {
              expect(key).toBe(motion.REDUCE_MOTION_KEY);
              return saved;
            },
            setItem,
          });
          vi.stubGlobal("matchMedia", vi.fn((query: string) => {
            expect(query).toBe("(prefers-reduced-motion: reduce)");
            return { matches: osReduced };
          }));

          motion.applyMotionPreferences();
          expect(motion.manualReduceMotion()).toBe(row.saved === "true");
          expect(() => motion.setReduceMotion(row.choice)).not.toThrow();

          const on = row.choice === "on";
          const snapshot = () => ({
            manual: motion.manualReduceMotion(),
            reduced: motion.prefersReducedMotion(),
            animations: document.documentElement.classList.contains("kw-anim"),
            saved,
          });
          const expected = {
            manual: on,
            reduced: osReduced || on,
            animations: !osReduced && !on,
            saved: writeFails ? row.saved : String(on),
          };
          expect(setItem).toHaveBeenCalledExactlyOnceWith(
            motion.REDUCE_MOTION_KEY, String(on),
          );
          expect(snapshot()).toEqual(expected);

          // Another same-document sync must not restore a stale stored choice.
          motion.applyMotionPreferences();
          expect(snapshot()).toEqual(expected);
        });
      }
    }
  }
});

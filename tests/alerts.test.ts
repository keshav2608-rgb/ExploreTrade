/** Unit tests for alert conditions and the repeat-trigger rule (§16.1). */
import { describe, expect, it } from "vitest";
import { conditionMet, evaluateAlert } from "@/lib/alerts";

describe("conditions", () => {
  it("ABOVE fires strictly above, BELOW strictly below", () => {
    expect(conditionMet("ABOVE", "100", "100.01")).toBe(true);
    expect(conditionMet("ABOVE", "100", "100")).toBe(false);
    expect(conditionMet("BELOW", "100", "99.99")).toBe(true);
    expect(conditionMet("BELOW", "100", "100")).toBe(false);
  });
});

describe("repeat-trigger rule (FR-ALT-07)", () => {
  const armed = { condition: "ABOVE" as const, thresholdPrice: "100", isEnabled: true, isTriggered: false };

  it("fires once on crossing, then stays quiet while the condition holds", () => {
    const first = evaluateAlert(armed, "101");
    expect(first).toEqual({ fire: true, isTriggered: true });
    const second = evaluateAlert({ ...armed, isTriggered: true }, "105");
    expect(second).toEqual({ fire: false, isTriggered: true });
  });

  it("re-arms when the price crosses back, and fires again on the next crossing", () => {
    const back = evaluateAlert({ ...armed, isTriggered: true }, "99");
    expect(back).toEqual({ fire: false, isTriggered: false });
    expect(evaluateAlert({ ...armed, isTriggered: false }, "100.5").fire).toBe(true);
  });

  it("does nothing while disabled", () => {
    expect(evaluateAlert({ ...armed, isEnabled: false }, "500")).toEqual({ fire: false, isTriggered: false });
  });
});

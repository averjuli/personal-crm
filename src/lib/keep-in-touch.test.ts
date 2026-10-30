import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatDay,
  formatOverdue,
  todayInAppTimeZone,
} from "@/lib/keep-in-touch";

describe("formatOverdue", () => {
  it("says it is due today on the due day", () => {
    expect(formatOverdue(0)).toBe("пора сегодня");
  });

  it("uses the Russian plural forms for days", () => {
    expect(formatOverdue(1)).toBe("просрочено на 1 день");
    expect(formatOverdue(2)).toBe("просрочено на 2 дня");
    expect(formatOverdue(5)).toBe("просрочено на 5 дней");
    expect(formatOverdue(11)).toBe("просрочено на 11 дней");
    expect(formatOverdue(21)).toBe("просрочено на 21 день");
    expect(formatOverdue(22)).toBe("просрочено на 22 дня");
  });
});

describe("formatDay", () => {
  it("writes the day, the month in words and the year without «г.»", () => {
    expect(formatDay("2026-10-12")).toBe("12 октября 2026");
    expect(formatDay("2026-10-01")).toBe("1 октября 2026");
  });
});

describe("todayInAppTimeZone", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts the day in Moscow time", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 22:30 UTC on 23 October is already 01:30 on 24 October in Moscow
    vi.setSystemTime(new Date("2026-10-23T22:30:00Z"));
    expect(todayInAppTimeZone()).toBe("2026-10-24");
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarCells,
  calendarDate,
  calendarDuration,
  calendarRangeError,
  chooseCalendarDay,
  shiftCalendarDay,
  shiftCalendarMonth,
} from "../lib/trip-calendar";

test("calendar checkout duration uses engine validation and UTC across Lisbon DST boundaries", () => {
  assert.equal(calendarDuration("2026-03-28", "2026-03-30"), 2);
  assert.equal(calendarDuration("2026-10-24", "2026-10-26"), 2);
  assert.equal(calendarDuration("2026-10-07", "2026-11-06"), 30);
  assert.equal(calendarDuration("2026-10-07", "2026-11-07"), null);
  assert.equal(calendarDate("2026-02-30"), null);
  assert.ok(calendarDate("2024-02-29"));
});

test("calendar has a Monday-first six-row grid and preserves valid day focus across months", () => {
  const cells = calendarCells("2024-02-16");
  assert.equal(cells.length, 42);
  assert.deepEqual(cells.slice(0, 4), [null, null, null, "2024-02-01"]);
  assert.equal(cells.filter(Boolean).length, 29);
  assert.equal(shiftCalendarMonth("2024-01-31", 1), "2024-02-29");
  assert.equal(shiftCalendarMonth("2026-01-31", 1), "2026-02-28");
  assert.equal(shiftCalendarMonth("2026-12-31", 1), "2027-01-31");
  assert.equal(shiftCalendarDay("2026-10-31", 1), "2026-11-01");
});

test("a new calendar start is pending until valid checkout; oversized and reversed ranges remain explicit", () => {
  let range = chooseCalendarDay(
    { start: "2026-10-07", end: "2026-10-10", choosingEnd: false },
    "2026-10-20",
  );
  assert.deepEqual(range, { start: "2026-10-20", end: "", choosingEnd: true });
  range = chooseCalendarDay(range, "2026-11-21");
  assert.equal(range.choosingEnd, true);
  assert.match(calendarRangeError(range)!, /1 to 30/);
  range = chooseCalendarDay(range, "2026-10-22");
  assert.deepEqual(range, {
    start: "2026-10-20",
    end: "2026-10-22",
    choosingEnd: false,
  });
  assert.equal(calendarRangeError(range), null);
  range = chooseCalendarDay(range, "2026-10-15");
  range = chooseCalendarDay(range, "2026-10-14");
  assert.deepEqual(range, { start: "2026-10-14", end: "", choosingEnd: true });
  assert.match(
    calendarRangeError({
      start: "2026-10-14",
      end: "2026-10-14",
      choosingEnd: true,
    })!,
    /after/,
  );
});

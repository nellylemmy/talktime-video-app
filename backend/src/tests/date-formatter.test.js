// talktime dateFormatter.js — unit tests
// Run: node --test src/tests/date-formatter.test.js  (from backend/)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatDate,
  formatTime,
  formatDateTime,
  getRelativeTimeString,
} from "../utils/dateFormatter.js";

// ── formatDate ────────────────────────────────────────────────────────────────
describe("formatDate", () => {
  it("accepts a Date object", () => {
    const result = formatDate(new Date("2025-07-17T00:00:00.000Z"));
    assert.ok(result.includes("2025"));
    assert.ok(result.includes("17"));
  });
  it("accepts an ISO string", () => {
    const result = formatDate("2025-07-17T00:00:00.000Z");
    assert.ok(typeof result === "string");
    assert.ok(result.length > 0);
  });
  it("returns a string (not a Date)", () => {
    assert.equal(typeof formatDate(new Date()), "string");
  });
  it("includes the year", () => {
    const result = formatDate(new Date("2024-01-15"));
    assert.ok(result.includes("2024"));
  });
});

// ── formatTime ────────────────────────────────────────────────────────────────
describe("formatTime", () => {
  it("accepts a Date object", () => {
    const result = formatTime(new Date("2025-07-17T14:30:00.000Z"));
    assert.ok(typeof result === "string");
    assert.ok(result.length > 0);
  });
  it("accepts an ISO string", () => {
    const result = formatTime("2025-07-17T14:30:00.000Z");
    assert.ok(typeof result === "string");
  });
  it("returns string containing AM or PM", () => {
    const result = formatTime(new Date("2025-07-17T02:00:00.000Z"));
    assert.ok(result.includes("AM") || result.includes("PM"));
  });
});

// ── formatDateTime ────────────────────────────────────────────────────────────
describe("formatDateTime", () => {
  it("returns a string containing ' at '", () => {
    const result = formatDateTime(new Date("2025-07-17T14:30:00.000Z"));
    assert.ok(result.includes(" at "));
  });
  it("contains the date part", () => {
    const result = formatDateTime(new Date("2025-07-17T14:30:00.000Z"));
    assert.ok(result.includes("2025"));
  });
  it("contains AM or PM", () => {
    const result = formatDateTime(new Date("2025-07-17T14:30:00.000Z"));
    assert.ok(result.includes("AM") || result.includes("PM"));
  });
  it("accepts ISO string input", () => {
    const result = formatDateTime("2025-07-17T14:30:00.000Z");
    assert.equal(typeof result, "string");
    assert.ok(result.includes(" at "));
  });
});

// ── getRelativeTimeString ─────────────────────────────────────────────────────
describe("getRelativeTimeString", () => {
  it("returns '... seconds ago' for a date 30 seconds in the past", () => {
    const past = new Date(Date.now() - 30_000);
    const result = getRelativeTimeString(past);
    assert.match(result, /seconds ago/);
  });
  it("returns '... minutes ago' for a date 5 minutes in the past", () => {
    const past = new Date(Date.now() - 5 * 60_000);
    const result = getRelativeTimeString(past);
    assert.match(result, /minutes ago/);
  });
  it("returns '... hours ago' for 3 hours past", () => {
    const past = new Date(Date.now() - 3 * 3600_000);
    const result = getRelativeTimeString(past);
    assert.match(result, /hours ago/);
  });
  it("returns '... days ago' for 5 days past", () => {
    const past = new Date(Date.now() - 5 * 86400_000);
    const result = getRelativeTimeString(past);
    assert.match(result, /days ago/);
  });
  it("returns formatted date for > 30 days past (falls back to formatDate)", () => {
    const past = new Date(Date.now() - 40 * 86400_000);
    const result = getRelativeTimeString(past);
    // Should be a formatted date string, not a relative expression
    assert.ok(!result.includes("days ago") && !result.includes("hours ago"));
  });
  it("returns 'in ... seconds' for 30 seconds in future", () => {
    const future = new Date(Date.now() + 30_000);
    const result = getRelativeTimeString(future);
    assert.match(result, /in \d+ seconds/);
  });
  it("returns 'in ... minutes' for 10 minutes in future", () => {
    const future = new Date(Date.now() + 10 * 60_000);
    const result = getRelativeTimeString(future);
    assert.match(result, /in \d+ minutes/);
  });
  it("returns 'in ... hours' for 2 hours in future", () => {
    const future = new Date(Date.now() + 2 * 3600_000);
    const result = getRelativeTimeString(future);
    assert.match(result, /in \d+ hours/);
  });
  it("returns 'in ... days' for 10 days in future", () => {
    const future = new Date(Date.now() + 10 * 86400_000);
    const result = getRelativeTimeString(future);
    assert.match(result, /in \d+ days/);
  });
  it("returns formatted date for > 30 days in future", () => {
    const future = new Date(Date.now() + 40 * 86400_000);
    const result = getRelativeTimeString(future);
    assert.ok(!result.startsWith("in "));
  });
  it("accepts ISO string input", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const result = getRelativeTimeString(past);
    assert.ok(typeof result === "string");
  });
});

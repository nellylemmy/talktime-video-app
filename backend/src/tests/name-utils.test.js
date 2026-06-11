// talktime nameUtils.js — unit tests
// Run: node --test src/tests/name-utils.test.js  (from backend/)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { capitalizeName, capitalizeNameFields } from "../utils/nameUtils.js";

// ── capitalizeName ────────────────────────────────────────────────────────────
describe("capitalizeName — basic cases", () => {
  it("capitalizes first letter of single word", () => {
    assert.equal(capitalizeName("john"), "John");
  });
  it("lowercases rest of ALL-CAPS word", () => {
    assert.equal(capitalizeName("JOHN"), "John");
  });
  it("handles mixed case", () => {
    assert.equal(capitalizeName("jOHN"), "John");
  });
  it("capitalizes multiple words", () => {
    assert.equal(capitalizeName("john doe"), "John Doe");
  });
  it("handles ALL-CAPS multi-word", () => {
    assert.equal(capitalizeName("JOHN DOE"), "John Doe");
  });
  it("trims leading/trailing spaces", () => {
    assert.equal(capitalizeName("  john  "), "John");
  });
  it("collapses multiple internal spaces to single", () => {
    assert.equal(capitalizeName("john  doe"), "John Doe");
  });
});

describe("capitalizeName — hyphenated names", () => {
  it("capitalizes both parts of hyphenated name", () => {
    assert.equal(capitalizeName("mary-jane"), "Mary-Jane");
  });
  it("handles ALL-CAPS hyphenated", () => {
    assert.equal(capitalizeName("MARY-JANE"), "Mary-Jane");
  });
  it("handles three-part hyphenated", () => {
    assert.equal(capitalizeName("anne-marie-louise"), "Anne-Marie-Louise");
  });
});

describe("capitalizeName — apostrophes", () => {
  it("capitalizes after apostrophe: o'brien → O'Brien", () => {
    assert.equal(capitalizeName("o'brien"), "O'Brien");
  });
  it("handles ALL-CAPS apostrophe name", () => {
    assert.equal(capitalizeName("O'BRIEN"), "O'Brien");
  });
});

describe("capitalizeName — edge cases", () => {
  it("returns null unchanged (not a string)", () => {
    assert.equal(capitalizeName(null), null);
  });
  it("returns undefined unchanged", () => {
    assert.equal(capitalizeName(undefined), undefined);
  });
  it("returns number unchanged", () => {
    assert.equal(capitalizeName(42), 42);
  });
  it("returns empty string for whitespace-only input", () => {
    assert.equal(capitalizeName("   "), "");
  });
  it("returns empty string for empty string input", () => {
    assert.equal(capitalizeName(""), "");
  });
  it("single character is capitalized", () => {
    assert.equal(capitalizeName("a"), "A");
  });
});

describe("capitalizeName — Kenyan name examples", () => {
  it("Wanjiku Mwangi", () => {
    assert.equal(capitalizeName("wanjiku mwangi"), "Wanjiku Mwangi");
  });
  it("Kipchoge Keino", () => {
    assert.equal(capitalizeName("KIPCHOGE KEINO"), "Kipchoge Keino");
  });
  it("Auma Obama", () => {
    assert.equal(capitalizeName("auma obama"), "Auma Obama");
  });
});

// ── capitalizeNameFields ──────────────────────────────────────────────────────
describe("capitalizeNameFields", () => {
  it("capitalizes default fields: full_name, fullName, guardian_name", () => {
    const input = { full_name: "john doe", fullName: "john doe", guardian_name: "jane doe" };
    const result = capitalizeNameFields(input);
    assert.equal(result.full_name, "John Doe");
    assert.equal(result.fullName, "John Doe");
    assert.equal(result.guardian_name, "Jane Doe");
  });
  it("does not mutate the original object", () => {
    const input = { full_name: "john" };
    capitalizeNameFields(input);
    assert.equal(input.full_name, "john");
  });
  it("accepts custom field list", () => {
    const input = { first_name: "alice", last_name: "smith" };
    const result = capitalizeNameFields(input, ["first_name", "last_name"]);
    assert.equal(result.first_name, "Alice");
    assert.equal(result.last_name, "Smith");
  });
  it("skips fields not present in data", () => {
    const input = { full_name: "bob" };
    const result = capitalizeNameFields(input, ["full_name", "missing_field"]);
    assert.equal(result.full_name, "Bob");
    assert.equal(result.missing_field, undefined);
  });
  it("skips non-string field values", () => {
    const input = { full_name: 42 };
    const result = capitalizeNameFields(input);
    assert.equal(result.full_name, 42);
  });
  it("returns null for null data", () => {
    assert.equal(capitalizeNameFields(null), null);
  });
  it("returns undefined for undefined data", () => {
    assert.equal(capitalizeNameFields(undefined), undefined);
  });
  it("returns non-object types unchanged", () => {
    assert.equal(capitalizeNameFields("string"), "string");
  });
  it("preserves non-name fields unchanged", () => {
    const input = { full_name: "john", age: 25, role: "student" };
    const result = capitalizeNameFields(input);
    assert.equal(result.age, 25);
    assert.equal(result.role, "student");
  });
});

// talktime jwt.js utility — unit tests
// Run: node --test src/tests/jwt-utils.test.js  (from backend/)
// All functions tested against a fixed JWT_SECRET to avoid env coupling.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

// Set a deterministic secret before importing the module so the module-level
// JWT_SECRET constant is predictable in test runs.
process.env.JWT_SECRET = "test-secret-32-chars-minimum-len";
process.env.JWT_EXPIRES_IN = "1h";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";

const {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  generateTokens,
  extractTokenFromHeader,
} = await import("../utils/jwt.js");

// ── generateAccessToken ───────────────────────────────────────────────────────
describe("generateAccessToken", () => {
  it("returns a JWT string (3 dot-separated segments)", () => {
    const token = generateAccessToken({ id: "u1", role: "volunteer" });
    const parts = token.split(".");
    assert.equal(parts.length, 3);
  });
  it("payload id is recoverable via verifyToken", () => {
    const token = generateAccessToken({ id: "u42", role: "student" });
    const decoded = verifyToken(token);
    assert.equal(decoded.id, "u42");
  });
  it("issuer is 'talktime-api'", () => {
    const token = generateAccessToken({ id: "u1", role: "volunteer" });
    const decoded = verifyToken(token);
    assert.equal(decoded.iss, "talktime-api");
  });
  it("audience is 'talktime-clients'", () => {
    const token = generateAccessToken({ id: "u1", role: "volunteer" });
    const decoded = verifyToken(token);
    assert.equal(decoded.aud, "talktime-clients");
  });
  it("contains exp claim", () => {
    const token = generateAccessToken({ id: "u1" });
    const decoded = verifyToken(token);
    assert.ok(typeof decoded.exp === "number");
  });
});

// ── generateRefreshToken ──────────────────────────────────────────────────────
describe("generateRefreshToken", () => {
  it("returns a JWT string", () => {
    const token = generateRefreshToken({ id: "u1" });
    assert.equal(token.split(".").length, 3);
  });
  it("refresh token has longer expiry than access token", () => {
    const access = generateAccessToken({ id: "u1" });
    const refresh = generateRefreshToken({ id: "u1" });
    const aExp = verifyToken(access).exp;
    const rExp = verifyToken(refresh).exp;
    assert.ok(rExp > aExp, "refresh exp should be later than access exp");
  });
  it("payload id preserved", () => {
    const token = generateRefreshToken({ id: "u99" });
    const decoded = verifyToken(token);
    assert.equal(decoded.id, "u99");
  });
});

// ── verifyToken ───────────────────────────────────────────────────────────────
describe("verifyToken", () => {
  it("returns decoded payload for valid token", () => {
    const token = generateAccessToken({ id: "u1", role: "admin" });
    const decoded = verifyToken(token);
    assert.equal(decoded.role, "admin");
  });
  it("throws for completely invalid string", () => {
    assert.throws(() => verifyToken("not.a.jwt"), /Invalid token/);
  });
  it("throws for tampered token (modified payload)", () => {
    const token = generateAccessToken({ id: "u1" });
    const [h, , sig] = token.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ id: "hacker" })).toString("base64url");
    assert.throws(() => verifyToken(`${h}.${tamperedPayload}.${sig}`), /Invalid token/);
  });
  it("throws for empty string", () => {
    assert.throws(() => verifyToken(""), /Invalid token/);
  });
  it("throws for expired token", async () => {
    // Generate a token that expires immediately
    const { default: jwt } = await import("jsonwebtoken");
    const expired = jwt.sign({ id: "u1" }, process.env.JWT_SECRET, {
      expiresIn: -1,
      issuer: "talktime-api",
      audience: "talktime-clients",
    });
    assert.throws(() => verifyToken(expired), /Invalid token/);
  });
});

// ── generateTokens ────────────────────────────────────────────────────────────
describe("generateTokens", () => {
  it("returns { accessToken, refreshToken }", () => {
    const result = generateTokens({ id: "u1", email: "a@b.co", role: "volunteer" });
    assert.ok("accessToken" in result);
    assert.ok("refreshToken" in result);
  });
  it("accessToken contains role", () => {
    const { accessToken } = generateTokens({ id: "u1", role: "student" });
    const decoded = verifyToken(accessToken);
    assert.equal(decoded.role, "student");
  });
  it("student role includes admissionNumber in payload", () => {
    const { accessToken } = generateTokens({
      id: "s1",
      role: "student",
      admission_number: "ADM-001",
    });
    const decoded = verifyToken(accessToken);
    assert.equal(decoded.admissionNumber, "ADM-001");
  });
  it("volunteer role includes volunteerId", () => {
    const { accessToken } = generateTokens({
      id: "v1",
      role: "volunteer",
      volunteer_type: "university",
    });
    const decoded = verifyToken(accessToken);
    assert.equal(decoded.volunteerId, "v1");
    assert.equal(decoded.volunteer_type, "university");
  });
  it("admin role includes permissions: ['all']", () => {
    const { accessToken } = generateTokens({ id: "a1", role: "admin" });
    const decoded = verifyToken(accessToken);
    assert.deepEqual(decoded.permissions, ["all"]);
  });
  it("null email is preserved in payload", () => {
    const { accessToken } = generateTokens({ id: "u1", email: null, role: "student" });
    const decoded = verifyToken(accessToken);
    assert.equal(decoded.email, null);
  });
});

// ── extractTokenFromHeader ────────────────────────────────────────────────────
describe("extractTokenFromHeader", () => {
  it("extracts token from 'Bearer <token>' header", () => {
    const token = generateAccessToken({ id: "u1" });
    const extracted = extractTokenFromHeader(`Bearer ${token}`);
    assert.equal(extracted, token);
  });
  it("returns null/undefined for missing header", () => {
    const result = extractTokenFromHeader(undefined);
    assert.ok(result == null);
  });
  it("returns null/undefined for empty string", () => {
    const result = extractTokenFromHeader("");
    assert.ok(result == null);
  });
  it("returns null/undefined for header without Bearer prefix", () => {
    const result = extractTokenFromHeader("Token abc123");
    assert.ok(result == null);
  });
  it("returns null/undefined for 'Bearer' alone (no token)", () => {
    const result = extractTokenFromHeader("Bearer ");
    assert.ok(result == null || result === "");
  });
});

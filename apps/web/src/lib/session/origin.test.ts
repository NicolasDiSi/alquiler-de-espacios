import { describe, expect, it } from "vitest";

import { isAllowedOrigin, isJsonRequest } from "./origin";

const headers = (values: Record<string, string>) => new Headers(values);

describe("isAllowedOrigin", () => {
  it("allows a request with no Origin (curl, scripts)", () => {
    expect(isAllowedOrigin(headers({ host: "localhost:3000" }))).toBe(true);
  });

  it("allows the app's own origin", () => {
    expect(isAllowedOrigin(headers({ host: "localhost:3000", origin: "http://localhost:3000" }))).toBe(true);
  });

  it("refuses another localhost port, which SameSite=Lax would let through", () => {
    expect(isAllowedOrigin(headers({ host: "localhost:3000", origin: "http://localhost:4000" }))).toBe(false);
  });

  it("refuses another site", () => {
    expect(isAllowedOrigin(headers({ host: "localhost:3000", origin: "https://evil.example" }))).toBe(false);
  });

  it("refuses the opaque null origin and a malformed one", () => {
    expect(isAllowedOrigin(headers({ host: "localhost:3000", origin: "null" }))).toBe(false);
    expect(isAllowedOrigin(headers({ host: "localhost:3000", origin: "::not a url" }))).toBe(false);
  });

  it("compares with the forwarded host behind a proxy", () => {
    const behindProxy = headers({
      host: "internal:3000",
      "x-forwarded-host": "espacios.test",
      origin: "https://espacios.test",
    });
    expect(isAllowedOrigin(behindProxy)).toBe(true);
  });

  it("refuses when there is no host to compare with", () => {
    expect(isAllowedOrigin(headers({ origin: "http://localhost:3000" }))).toBe(false);
  });
});

describe("isJsonRequest", () => {
  it("accepts application/json with or without a charset", () => {
    expect(isJsonRequest(headers({ "content-type": "application/json" }))).toBe(true);
    expect(isJsonRequest(headers({ "content-type": "Application/JSON; charset=utf-8" }))).toBe(true);
  });

  it("refuses form posts and a missing type", () => {
    expect(isJsonRequest(headers({ "content-type": "application/x-www-form-urlencoded" }))).toBe(false);
    expect(isJsonRequest(headers({ "content-type": "text/plain" }))).toBe(false);
    expect(isJsonRequest(headers({}))).toBe(false);
  });
});

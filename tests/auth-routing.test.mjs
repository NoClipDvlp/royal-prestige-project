// Unit test (NO core) de la decisión de routing pura (lib/auth/routing.ts).
// Built-in node:test, sin framework. Correr:
//   node --experimental-strip-types --test tests/auth-routing.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAuthRedirect, isPublicRoute } from "../lib/auth/routing.ts";

test("sin sesión → /login en ruta privada", () => {
  assert.equal(resolveAuthRedirect("/dashboard", { authenticated: false, hasRole: false }), "/login");
});

test("sin sesión → permitido en /login y /signup", () => {
  assert.equal(resolveAuthRedirect("/login", { authenticated: false, hasRole: false }), null);
  assert.equal(resolveAuthRedirect("/signup", { authenticated: false, hasRole: false }), null);
});

test("sin sesión → permitido en /auth/callback", () => {
  assert.equal(resolveAuthRedirect("/auth/callback", { authenticated: false, hasRole: false }), null);
});

test("auth + role=null → /sin-rol", () => {
  assert.equal(resolveAuthRedirect("/dashboard", { authenticated: true, hasRole: false }), "/sin-rol");
});

test("auth + orfandad (sin perfil = hasRole false) → /sin-rol", () => {
  assert.equal(resolveAuthRedirect("/metricas", { authenticated: true, hasRole: false }), "/sin-rol");
});

test("auth + role=null ya en /sin-rol → permitido", () => {
  assert.equal(resolveAuthRedirect("/sin-rol", { authenticated: true, hasRole: false }), null);
});

test("auth + rol en /login → dashboard", () => {
  assert.equal(resolveAuthRedirect("/login", { authenticated: true, hasRole: true }), "/");
});

test("auth + rol en /sin-rol → dashboard", () => {
  assert.equal(resolveAuthRedirect("/sin-rol", { authenticated: true, hasRole: true }), "/");
});

test("auth + rol en ruta de app → permitido", () => {
  assert.equal(resolveAuthRedirect("/tareas", { authenticated: true, hasRole: true }), null);
});

test("isPublicRoute", () => {
  assert.equal(isPublicRoute("/login"), true);
  assert.equal(isPublicRoute("/auth/callback"), true);
  assert.equal(isPublicRoute("/dashboard"), false);
});

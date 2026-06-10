// Test (Node, type-stripping) de sanitizeHtml (ADR-0032). Cierra el XSS del cuerpo de correo.
// Ejecuta: node --import ./db/tests/ts-register.mjs ./db/tests/sanitize.test.ts
import assert from "node:assert/strict";
import { sanitizeHtml } from "@/lib/ms/sanitize";

let n = 0;
const ok = (cond: boolean, msg: string) => {
  assert.ok(cond, msg);
  n += 1;
};

// script / handlers / esquemas peligrosos → fuera
ok(!/<script/i.test(sanitizeHtml('<p>hola</p><script>alert(1)</script>')), "elimina <script>");
ok(!/onerror/i.test(sanitizeHtml('<img src="https://x/a.png" onerror="alert(1)">')), "elimina on*=");
ok(!/javascript:/i.test(sanitizeHtml('<a href="javascript:alert(1)">x</a>')), "bloquea javascript:");
ok(!/<iframe/i.test(sanitizeHtml('<iframe src="https://evil"></iframe>')), "elimina <iframe>");

// img: solo https; data:/http se caen
ok(/src="https:\/\/cdn\/x\.png"/.test(sanitizeHtml('<img src="https://cdn/x.png" alt="a">')), "img https se conserva");
ok(!/src=/.test(sanitizeHtml('<img src="data:image/png;base64,AAAA">')), "img data: se cae (sin base64)");
ok(!/src=/.test(sanitizeHtml('<img src="http://cdn/x.png">')), "img http (no https) se cae");

// allowlist: tags permitidos se conservan; el texto de tags no permitidos se preserva
ok(/<strong>Hola<\/strong>/.test(sanitizeHtml("<strong>Hola</strong>")), "conserva <strong>");
ok(sanitizeHtml("<marquee>texto</marquee>").includes("texto"), "tag no permitido: conserva el texto");

// enlaces seguros ganan rel/target
const a = sanitizeHtml('<a href="https://x.com">x</a>');
ok(/rel="noopener noreferrer nofollow"/.test(a) && /target="_blank"/.test(a), "a recibe rel/target seguros");

// merge tokens intactos (se sustituyen después)
ok(sanitizeHtml("<p>Hola {Nombre}</p>") === "<p>Hola {Nombre}</p>", "respeta {tokens} y <p>");

console.log(`sanitize OK (${n} casos)`);

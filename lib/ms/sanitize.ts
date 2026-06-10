// Saneador de HTML del cuerpo de correo (ADR-0032). PURO (server + cliente, sin deps, testeable).
// Allowlist de tags/atributos: cierra el XSS latente de dangerouslySetInnerHTML (el cuerpo lo escribe el
// distribuidor, pero se renderiza en preview y se envía como email). Defensa en profundidad — se aplica al
// GUARDAR (autoritativo) y al RENDER del preview.
//
// Nota: es un saneador por allowlist con tokenizado por regex (sin parser DOM, para correr igual en el
// cliente). No pretende cubrir cada vector exótico de un navegador; para este modelo de amenaza (contenido
// del propio dueño, render a sí mismo + email) la allowlist + el bloqueo de script/handlers/esquemas es sólido.

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "span", "div", "blockquote", "img", "hr", "table", "thead", "tbody", "tr", "td", "th",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
  img: new Set(["src", "alt", "width", "height"]),
};

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** URL segura por tipo: img → solo https (el bucket es https); a → http(s)/mailto. Devuelve null si no. */
function safeUrl(value: string, kind: "href" | "src"): string | null {
  const s = value.trim();
  if (/^\s*javascript:/i.test(s) || /^\s*data:/i.test(s) || /^\s*vbscript:/i.test(s)) return null;
  if (kind === "src") return /^https:\/\//i.test(s) ? s : null;
  return /^(https?:\/\/|mailto:)/i.test(s) ? s : null;
}

export function sanitizeHtml(input: string): string {
  let html = input ?? "";
  // 1) comentarios + bloques peligrosos con contenido
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/<\s*(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  html = html.replace(/<\s*(script|style|iframe|object|embed|noscript|template|svg|math)\b[^>]*\/?>/gi, "");

  // 2) cada tag: allowlist de tag + de atributos; esquemas de URL seguros
  html = html.replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (_m, slash: string, name: string, attrs: string) => {
    const tag = name.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return ""; // elimina el tag, conserva el texto interno
    if (slash) return `</${tag}>`;
    const allowed = ALLOWED_ATTRS[tag];
    const kept: string[] = [];
    if (allowed) {
      const attrRe = /([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let a: RegExpExecArray | null;
      while ((a = attrRe.exec(attrs))) {
        const key = a[1].toLowerCase();
        const val = a[2] ?? a[3] ?? "";
        if (!allowed.has(key)) continue;
        if (key === "href") {
          const u = safeUrl(val, "href");
          if (u) kept.push(`href="${escAttr(u)}"`);
        } else if (key === "src") {
          const u = safeUrl(val, "src");
          if (u) kept.push(`src="${escAttr(u)}"`);
        } else if (key === "width" || key === "height") {
          if (/^\d{1,4}$/.test(val)) kept.push(`${key}="${val}"`);
        } else {
          kept.push(`${key}="${escAttr(val)}"`);
        }
      }
    }
    if (tag === "a") kept.push('target="_blank"', 'rel="noopener noreferrer nofollow"');
    return `<${tag}${kept.length ? ` ${kept.join(" ")}` : ""}>`;
  });

  // 3) defensa extra: cualquier on*= residual o javascript: que haya quedado suelto
  html = html.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/javascript:/gi, "");
  return html;
}

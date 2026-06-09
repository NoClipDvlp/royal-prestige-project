// Loader hook SOLO para los tests .ts del harness (no afecta el build de Next ni producción).
// Permite que un test ejecutado con el type-stripping nativo de Node (≥22) importe módulos del repo
// con el alias "@/" y SIN extensión, igual que el código fuente. Mapea "@/x" → <raíz>/x y añade ".ts".
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", ".."); // db/tests → raíz del repo

export async function resolve(specifier, context, nextResolve) {
  let url;
  if (specifier.startsWith("@/")) {
    url = pathToFileURL(join(ROOT, specifier.slice(2))).href; // alias del tsconfig
  } else if (specifier.startsWith(".")) {
    url = new URL(specifier, context.parentURL).href; // relativo al importador
  } else {
    return nextResolve(specifier, context); // node:*, paquetes → resolución normal
  }
  if (!/\.[mc]?[jt]s$/.test(url) && existsSync(fileURLToPath(`${url}.ts`))) url += ".ts";
  return nextResolve(url, context);
}

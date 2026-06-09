// Bootstrap del hook de resolución para los tests .ts (uso: node --import ./db/tests/ts-register.mjs test.ts).
import { register } from "node:module";

register(new URL("./ts-resolve.mjs", import.meta.url));

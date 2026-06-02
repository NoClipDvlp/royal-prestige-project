import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Compone clases condicionales y resuelve choques de Tailwind. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

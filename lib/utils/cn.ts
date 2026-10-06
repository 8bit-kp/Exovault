import { clsx, type ClassValue } from "clsx";

/** Join conditional class names. Tokens are semantic, so no merge/dedupe step is needed. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

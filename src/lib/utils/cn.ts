import { clsx, type ClassValue } from "clsx";

/** Small classnames helper used by every UI primitive. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

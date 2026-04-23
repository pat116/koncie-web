import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui's standard className merger. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

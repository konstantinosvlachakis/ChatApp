// src/libs/utils.ts

import { ClassValue } from 'clsx';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names conditionally using clsx and tailwind-merge
 * 
 * @param inputs - A list of class values to merge
 * @returns A string of merged class names
 */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(...inputs));
}

"use client";

import { useState, useCallback } from "react";

/** Generates a UUID v4 suitable for idempotency keys. */
export function generateIdempotencyKey(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Prevents double-submission of forms.
 *
 * Usage:
 *   const { submitting, submit } = useSubmit();
 *   await submit(async () => { ... });
 *
 * - Button should be disabled when `submitting` is true.
 * - If `submit` is called while already submitting, it silently no-ops.
 * - On error, `submitting` resets to false so the button re-enables.
 */
export function useSubmit() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async <T>(fn: () => Promise<T>): Promise<T | null> => {
    if (submitting) return null;
    setSubmitting(true);
    setError(null);
    try {
      const result = await fn();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Une erreur est survenue";
      setError(message);
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [submitting]);

  function clearError() {
    setError(null);
  }

  return { submitting, error, submit, clearError };
}

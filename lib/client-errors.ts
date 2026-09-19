"use client";

import { useTranslations } from "next-intl";

/** Thrown when a request was redirected to sign-in or came back as a page instead of data. */
export class SessionEndedError extends Error {
  constructor() {
    super("session ended");
  }
}

/**
 * Turns an error caught around a fetch into words for the student, in their language:
 * a dropped connection and an ended session are ours; anything else is the server's own message.
 */
export function useExplainError() {
  const t = useTranslations("Errors");
  return (err: unknown): string =>
    err instanceof SessionEndedError ? t("sessionEnded") : err instanceof TypeError ? t("connection") : (err as Error).message;
}

/** The message of a failed input check, in the student's language when the check names its message. */
export function useCheckMessage() {
  const t = useTranslations("Server");
  return (result: { message: string; code?: string; params?: Record<string, string | number> }): string =>
    result.code ? t(result.code as never, result.params as never) : result.message;
}

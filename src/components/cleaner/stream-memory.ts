"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { CleanerStream } from "./stream-control-state";

// Which state this browser tab last saw for a job's stream (T22). The server holds the truth
// (stream_sessions) and the job page reads it with my_stream_status (D4) on every render, so a reloaded
// page, another tab or another phone starts from the server's state; this memory carries the answer of
// the cleaner's last press until the page redraws, and covers a page whose server read failed. Session
// storage: it ends with the tab, and a blocked or missing storage just means the page shows the
// server's state (or "off" when that is unknown; pressing Mulai siaran again resumes the same stream).

const listeners = new Set<() => void>();
const keyOf = (orderId: string) => `homeklin.stream.${orderId}`;
const remembered: readonly string[] = ["off", "active", "weak", "disconnected"];

/** The state this tab remembers for the job, or null when it remembers none. */
export function readStream(orderId: string): CleanerStream | null {
  try {
    const value = window.sessionStorage.getItem(keyOf(orderId));
    return value && remembered.includes(value) ? (value as CleanerStream) : null;
  } catch {
    return null;
  }
}

export function rememberStream(orderId: string, stream: CleanerStream) {
  try {
    window.sessionStorage.setItem(keyOf(orderId), stream);
  } catch (error) {
    console.warn("[stream] could not remember the stream in this tab:", error);
  }
  for (const notify of listeners) notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The stream state to show: what this tab remembers, else the server's (serverStream, null when the
 * server's read failed), else off. Each new server state replaces the memory, since it is newer.
 */
export function useRememberedStream(orderId: string, serverStream: CleanerStream | null): CleanerStream {
  useEffect(() => {
    if (serverStream !== null) rememberStream(orderId, serverStream);
  }, [orderId, serverStream]);
  return useSyncExternalStore(
    subscribe,
    () => readStream(orderId) ?? serverStream ?? "off",
    () => serverStream ?? "off",
  );
}

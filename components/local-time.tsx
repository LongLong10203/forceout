"use client";

import { useSyncExternalStore } from "react";

const subscribeToNothing = () => () => {};

/**
 * A date in the viewer's own time zone and language. The server does not
 * know either, so it renders a neutral UTC date first.
 */
export function LocalTime({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    subscribeToNothing,
    () =>
      new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    () => iso.slice(0, 10),
  );
  return <time dateTime={iso}>{text}</time>;
}

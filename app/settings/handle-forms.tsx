"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  cancelChallengeAction,
  checkChallengeAction,
  startChallengeAction,
  type ActionState,
} from "./actions";

const initial: ActionState = {};

export function StartChallengeForm() {
  const [state, action, pending] = useActionState(
    startChallengeAction,
    initial,
  );

  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="handle">Your Codeforces handle</Label>
        <Input
          id="handle"
          name="handle"
          placeholder="tourist"
          autoComplete="off"
          spellCheck={false}
          required
          minLength={3}
          maxLength={24}
          className="font-mono"
        />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Checking Codeforces..." : "Start verification"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        You need a linked handle to create or join rooms. You can link one
        handle, and it stays linked for good.
      </p>
    </form>
  );
}

function formatLeft(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function ChallengePanel({
  handle,
  problemName,
  problemUrl,
  expiresAt,
}: {
  handle: string;
  problemName: string;
  problemUrl: string;
  /** ISO time. */
  expiresAt: string;
}) {
  const router = useRouter();
  const [checkState, check, checking] = useActionState(
    checkChallengeAction,
    initial,
  );
  const [, cancel, cancelling] = useActionState(cancelChallengeAction, initial);

  const deadline = new Date(expiresAt).getTime();
  // Null until mounted: the server and the browser clocks differ, so the
  // countdown is only rendered in the browser.
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(deadline - Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  const expired = left !== null && left <= 0;
  useEffect(() => {
    // Reload the section so the server drops the expired challenge.
    if (expired) router.refresh();
  }, [expired, router]);

  return (
    <div className="mt-3 flex flex-col gap-4">
      <p>
        Prove that <span className="font-mono font-semibold">{handle}</span> is
        yours:
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>
          Open{" "}
          <a
            href={problemUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-4"
          >
            {problemName}
          </a>{" "}
          on Codeforces, signed in as {handle}.
        </li>
        <li>
          Submit anything that does not compile, for example the single word{" "}
          <code className="rounded bg-muted px-1 font-mono">forceout</code> as
          C++.
        </li>
        <li>
          Wait until Codeforces shows <strong>Compilation error</strong>, then
          press the button below.
        </li>
      </ol>

      <p className="text-sm text-muted-foreground">
        Time left:{" "}
        <span className="font-mono text-foreground">
          {left === null ? "-:--" : formatLeft(left)}
        </span>
      </p>

      {checkState.error && (
        <p className="text-sm text-destructive">{checkState.error}</p>
      )}

      <div className="flex gap-2">
        <form action={check}>
          <Button type="submit" disabled={checking || expired}>
            {checking ? "Checking Codeforces..." : "I submitted, check now"}
          </Button>
        </form>
        <form action={cancel}>
          <Button type="submit" variant="ghost" disabled={cancelling}>
            Use a different handle
          </Button>
        </form>
      </div>
    </div>
  );
}

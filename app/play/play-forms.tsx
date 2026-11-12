"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ModeConfigField } from "@/lib/modes";
import { RATING_MAX, RATING_MIN, ROOM_CODE_LENGTH } from "@/lib/room-types";
import { cn } from "@/lib/utils";
import {
  createRoomAction,
  joinByCodeAction,
  type PlayActionState,
} from "./actions";

const initial: PlayActionState = {};

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function JoinForm() {
  const [state, action, pending] = useActionState(joinByCodeAction, initial);

  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          name="code"
          aria-label="Room code"
          placeholder="ABC234"
          maxLength={ROOM_CODE_LENGTH + 2}
          autoComplete="off"
          spellCheck={false}
          required
          className="w-36 font-mono tracking-widest uppercase"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Joining..." : "Join"}
        </Button>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}

export type ModeOption = {
  id: string;
  name: string;
  description: string;
  players: string;
  /** The mode has its own clock, so the room duration does not apply. */
  ownClock: boolean;
  configFields: ModeConfigField[];
};

type TagState = "include" | "exclude";

const ratings = Array.from(
  { length: (RATING_MAX - RATING_MIN) / 100 + 1 },
  (_, i) => RATING_MIN + i * 100,
);

export function CreateRoomForm({
  modes,
  defaultModeId,
  tags,
}: {
  modes: ModeOption[];
  defaultModeId: string;
  tags: string[];
}) {
  const [state, action, pending] = useActionState(createRoomAction, initial);
  const [modeId, setModeId] = useState(defaultModeId);
  const [tagStates, setTagStates] = useState<Record<string, TagState>>({});
  const mode = modes.find((m) => m.id === modeId) ?? modes[0];

  // Each click moves a tag on: off -> must have -> must not have -> off.
  function cycleTag(tag: string) {
    setTagStates((current) => {
      const next = { ...current };
      if (!current[tag]) next[tag] = "include";
      else if (current[tag] === "include") next[tag] = "exclude";
      else delete next[tag];
      return next;
    });
  }

  const included = tags.filter((t) => tagStates[t] === "include");
  const excluded = tags.filter((t) => tagStates[t] === "exclude");

  return (
    <form action={action} className="mt-4 flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Mode</legend>
        {modes.map((m) => (
          <label
            key={m.id}
            className={cn(
              "flex cursor-pointer gap-3 rounded-lg border p-3",
              m.id === modeId && "border-primary bg-muted/50",
            )}
          >
            <input
              type="radio"
              name="mode"
              value={m.id}
              checked={m.id === modeId}
              onChange={() => setModeId(m.id)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{m.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {m.players}
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                {m.description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {mode.configFields.map((field) => (
          <div
            key={`${mode.id}.${field.key}`}
            className="flex flex-col gap-1.5"
          >
            <Label htmlFor={`mode.${field.key}`}>{field.label}</Label>
            <Input
              id={`mode.${field.key}`}
              name={`mode.${field.key}`}
              type="number"
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              defaultValue={field.default}
              required
            />
          </div>
        ))}
        {!mode.ownClock && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="durationMinutes">Duration (minutes)</Label>
            <Input
              id="durationMinutes"
              name="durationMinutes"
              type="number"
              min={5}
              max={180}
              step={5}
              defaultValue={60}
              required
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ratingMin">Problem rating</Label>
        <div className="flex items-center gap-2 text-sm">
          <select
            id="ratingMin"
            name="ratingMin"
            defaultValue={1200}
            className={selectClass}
          >
            {ratings.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground">to</span>
          <select
            name="ratingMax"
            aria-label="Highest rating"
            defaultValue={1800}
            className={selectClass}
          >
            {ratings.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Tag filters{" "}
          <span className="font-normal text-muted-foreground">
            {included.length + excluded.length === 0
              ? "(optional, none set)"
              : `(${included.length} required, ${excluded.length} banned)`}
          </span>
        </summary>
        <p className="mt-3 text-xs text-muted-foreground">
          Click once to require a tag (a problem needs at least one required
          tag), twice to ban it, three times to clear it.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => cycleTag(tag)}
              aria-pressed={Boolean(tagStates[tag])}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                !tagStates[tag] && "text-muted-foreground hover:bg-muted",
                tagStates[tag] === "include" &&
                  "border-emerald-500/60 bg-emerald-500/15 text-emerald-300",
                tagStates[tag] === "exclude" &&
                  "border-red-500/60 bg-red-500/15 text-red-300 line-through",
              )}
            >
              {tagStates[tag] === "include" && "+ "}
              {tagStates[tag] === "exclude" && "− "}
              {tag}
            </button>
          ))}
        </div>
        {included.map((tag) => (
          <input key={tag} type="hidden" name="includeTags" value={tag} />
        ))}
        {excluded.map((tag) => (
          <input key={tag} type="hidden" name="excludeTags" value={tag} />
        ))}
      </details>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Creating..." : "Create room"}
        </Button>
      </div>
    </form>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import { SignOutButton } from "@/components/auth-buttons";
import { problemUrl } from "@/lib/codeforces/problem-cache";
import { getActiveChallenge } from "@/lib/handle-verification";
import { requireUser } from "@/lib/session";
import { ChallengePanel, StartChallengeForm } from "./handle-forms";

export const metadata: Metadata = { title: "Settings · ForceOut" };

async function Account() {
  const user = await requireUser("/settings");
  const challenge = user.cfHandle ? null : await getActiveChallenge(user.id);

  return (
    <>
      <section className="rounded-lg border bg-card p-5 text-card-foreground">
        <h2 className="text-sm font-medium text-muted-foreground">Account</h2>
        <p className="mt-3 font-medium">{user.name}</p>
        <p className="text-sm text-muted-foreground">{user.email}</p>
        <div className="mt-4">
          <SignOutButton />
        </div>
      </section>

      <section className="rounded-lg border bg-card p-5 text-card-foreground">
        <h2 className="text-sm font-medium text-muted-foreground">
          Codeforces handle
        </h2>
        {user.cfHandle ? (
          <div className="mt-3">
            <a
              href={`https://codeforces.com/profile/${user.cfHandle}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-lg font-semibold underline-offset-4 hover:underline"
            >
              {user.cfHandle}
            </a>
            <p className="mt-1 text-sm text-muted-foreground">
              Verified and linked
              {user.cfRating ? ` · rating ${user.cfRating}` : ""}
            </p>
          </div>
        ) : challenge ? (
          <ChallengePanel
            key={challenge.id}
            handle={challenge.cfHandle}
            problemName={`${challenge.problem.id} ${challenge.problem.name}`}
            problemUrl={problemUrl(
              challenge.problem.contestId,
              challenge.problem.index,
            )}
            expiresAt={challenge.expiresAt.toISOString()}
          />
        ) : (
          <StartChallengeForm />
        )}
      </section>
    </>
  );
}

export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading...</p>}
      >
        <Account />
      </Suspense>
    </main>
  );
}

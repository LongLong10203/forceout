import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GoogleSignInButton } from "@/components/auth-buttons";
import { DEV_ACCOUNTS, devAccountsEnabled } from "@/lib/dev-accounts";
import { safeReturnPath } from "@/lib/safe-redirect";
import { getCurrentUser } from "@/lib/session";
import { devSignInAction } from "./dev-actions";

export const metadata: Metadata = { title: "Sign in · ForceOut" };

async function LoginForm({
  searchParams,
}: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const returnTo = safeReturnPath(params.next);

  // Already signed in: go straight to where the user was heading.
  if (await getCurrentUser()) redirect(returnTo);

  return (
    <>
      {params.error && (
        <p className="text-sm text-destructive">
          Google sign-in did not finish. Please try again.
        </p>
      )}
      <GoogleSignInButton returnTo={returnTo} />
      {devAccountsEnabled && (
        <form
          action={devSignInAction}
          className="mt-4 flex flex-col gap-2 rounded-lg border border-dashed p-4"
        >
          <p className="text-xs text-muted-foreground">
            Local development only: sign in as a fake player to test a match by
            yourself.
          </p>
          <input type="hidden" name="next" value={returnTo} />
          <div className="flex gap-2">
            {DEV_ACCOUNTS.map((account) => (
              <Button
                key={account.id}
                type="submit"
                name="account"
                value={account.id}
                variant="outline"
                size="sm"
              >
                {account.name}
              </Button>
            ))}
          </div>
        </form>
      )}
    </>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use your Google account. You will link your Codeforces handle once,
          after signing in.
        </p>
      </div>
      <Suspense fallback={<div className="h-10" />}>
        <LoginForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

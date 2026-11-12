import { Suspense } from "react";
import Link from "next/link";
import { SignOutButton } from "@/components/auth-buttons";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";

async function UserNav() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Link href="/login" className={buttonVariants({ size: "sm" })}>
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link href="/play" className={buttonVariants({ size: "sm" })}>
        Play
      </Link>
      {user.cfHandle ? (
        <Link
          href={`/u/${user.cfHandle}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          {user.cfHandle}
        </Link>
      ) : null}
      <Link
        href="/settings"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        Settings
      </Link>
      <SignOutButton variant="ghost" />
    </div>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          ForceOut
        </Link>
        {/* The session is read per request, so it streams in after the shell. */}
        <Suspense fallback={<div className="h-8 w-20" />}>
          <UserNav />
        </Suspense>
      </div>
    </header>
  );
}

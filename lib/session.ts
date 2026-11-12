import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type SessionUser } from "@/lib/auth";
import { loginUrl } from "@/lib/safe-redirect";

/**
 * The signed-in user, or null. Checked against the database, so this is the
 * real authority (the proxy only looks at whether a cookie exists).
 * Reads request headers: call it from inside a <Suspense> boundary.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
});

/** The signed-in user. Redirects to /login (and back afterwards) if there is none. */
export async function requireUser(returnTo: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(loginUrl(returnTo));
  return user;
}

/**
 * The signed-in user with a verified Codeforces handle. Creating or joining
 * a room needs one, so anyone without it is sent to /settings to link it.
 */
export async function requireVerifiedUser(
  returnTo: string,
): Promise<SessionUser & { cfHandle: string }> {
  const user = await requireUser(returnTo);
  if (!user.cfHandle) redirect("/settings?link=1");
  return user as SessionUser & { cfHandle: string };
}

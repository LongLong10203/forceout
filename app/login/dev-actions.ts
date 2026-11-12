"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  DEV_ACCOUNTS,
  DEV_PASSWORD,
  devAccountsEnabled,
} from "@/lib/dev-accounts";
import { safeReturnPath } from "@/lib/safe-redirect";

/** Sign in as a seeded fake account. Local development only. */
export async function devSignInAction(formData: FormData) {
  if (!devAccountsEnabled) throw new Error("Dev accounts are disabled.");

  const account = DEV_ACCOUNTS.find((a) => a.id === formData.get("account"));
  if (!account) throw new Error("Unknown dev account.");

  await auth.api.signInEmail({
    body: { email: account.email, password: DEV_PASSWORD },
    headers: await headers(),
  });
  redirect(safeReturnPath(String(formData.get("next") ?? "/")));
}

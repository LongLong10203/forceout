/**
 * Where to send a user after sign-in. Only same-site paths are allowed, so a
 * crafted link cannot bounce someone to another website.
 */
export function safeReturnPath(value: string | string[] | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;
  if (
    !path ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\")
  ) {
    return "/";
  }
  return path;
}

export function loginUrl(returnTo: string): string {
  return `/login?next=${encodeURIComponent(returnTo)}`;
}

import { createAuthClient } from "better-auth/react";

// Browser-side helper. Uses the current origin, so it needs no configuration.
export const authClient = createAuthClient();

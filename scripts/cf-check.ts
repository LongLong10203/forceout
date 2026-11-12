// Manual check of the Codeforces client against the real API.
//   pnpm cf:check [handle]
import "dotenv/config";

async function main() {
  // Imported here so DATABASE_URL is loaded before lib/db reads it.
  const { userInfo, userStatus } = await import("../lib/codeforces/client");
  const handle = process.argv[2] ?? "tourist";

  console.log(
    "1. Five calls at once with onBusy=skip (expect 1 sent, 4 rate_limited):",
  );
  const burst = await Promise.all(
    Array.from({ length: 5 }, () => userStatus(handle, { count: 1 })),
  );
  console.log("  ", burst.map((r) => (r.ok ? "sent" : r.reason)).join(", "));

  console.log(
    "2. Three calls at once with onBusy=wait (expect about 2s apart):",
  );
  const start = Date.now();
  await Promise.all(
    Array.from({ length: 3 }, async (_, i) => {
      const r = await userInfo(handle, { onBusy: "wait" });
      const at = ((Date.now() - start) / 1000).toFixed(1);
      console.log(
        `   call ${i + 1} done at ${at}s:`,
        r.ok
          ? `${r.result.handle} rating ${r.result.rating}`
          : `${r.reason} (${r.message})`,
      );
    }),
  );

  console.log("3. A handle that does not exist (expect failed):");
  const missing = await userInfo("no_such_handle_forceout_zz", {
    onBusy: "wait",
  });
  console.log(
    "  ",
    missing.ok ? "unexpectedly found" : `${missing.reason}: ${missing.message}`,
  );

  console.log(`4. Recent submissions of ${handle}:`);
  const recent = await userStatus(handle, { count: 3 }, { onBusy: "wait" });
  if (recent.ok) {
    for (const s of recent.result) {
      console.log(
        `   #${s.id} ${s.problem.contestId}${s.problem.index} ${s.verdict}`,
      );
    }
  } else {
    console.log(`   ${recent.reason}: ${recent.message}`);
  }
}

main().then(() => process.exit(0));

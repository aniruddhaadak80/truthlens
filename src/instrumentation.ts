export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { getRepository } = await import("@/lib/db");
      await getRepository();
    } catch {
      // Warmup is best-effort; the health endpoint reports the real store status.
    }
  }
}

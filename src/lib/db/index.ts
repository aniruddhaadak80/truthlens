import type { Repository } from "./repository";

const GLOBAL_KEY = "__truthlensRepository";

type GlobalWithRepo = typeof globalThis & { [GLOBAL_KEY]?: Repository };

let cached: Repository | null = null;
let initPromise: Promise<Repository> | null = null;

export function getRepository(): Promise<Repository> {
  const g = globalThis as GlobalWithRepo;
  if (cached) return Promise.resolve(cached);
  if (g[GLOBAL_KEY]) {
    cached = g[GLOBAL_KEY]!;
    return Promise.resolve(cached);
  }
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const url = process.env.DATABASE_URL;
    if (url) {
      const { createPgRepository } = await import("./pg");
      const repo = await createPgRepository(url);
      await repo.init();
      cached = repo;
      g[GLOBAL_KEY] = repo;
      return repo;
    }
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "DATABASE_URL is not set. TruthLens requires a hosted Postgres database in production (see .env.example).",
      );
    }
    const { createPgliteRepository } = await import("./pglite");
    const repo = await createPgliteRepository();
    await repo.init();
    cached = repo;
    g[GLOBAL_KEY] = repo;
    return repo;
  })();

  initPromise.catch(() => {
    initPromise = null;
  });
  return initPromise;
}

export function currentStoreKind(): string {
  return cached?.kind ?? (process.env.DATABASE_URL ? "pg" : "pglite");
}

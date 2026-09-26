import path from "node:path";
import { defineConfig } from "prisma/config";
import { readFileSync, existsSync } from "node:fs";

let dbUrl = process.env.DATABASE_URL || "";

// Support the existing DB_* deployment variables while making PostgreSQL the
// only relational provider for iAssetsPro staging/production.
if (!dbUrl) {
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT || "5432";
  const user = process.env.DB_USER;
  const pass = process.env.DB_PASSWORD;
  const dbName = process.env.DB_NAME;
  if (host && user && pass && dbName) {
    dbUrl = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${dbName}?schema=public`;
  }
}

if (!dbUrl) {
  const envPaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "..", ".env"),
    "/home/z/my-project/.env",
  ];
  for (const envPath of envPaths) {
    if (!existsSync(envPath)) continue;
    try {
      const content = readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("#") || !trimmed) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^[\"']|[\"']$/g, "");
        if (key === "DATABASE_URL" && val) {
          dbUrl = val;
          break;
        }
      }
      if (dbUrl) break;
    } catch {}
  }
}

if (!dbUrl && (process.env.CI === "true" || process.env.NODE_ENV === "test")) {
  dbUrl = "postgresql://ci:ci@127.0.0.1:5432/iassetspro_ci?schema=public";
}

if (!dbUrl) {
  throw new Error(
    "DATABASE_URL is not set. Configure PostgreSQL, for example:\n" +
    "  postgresql://user:password@host:5432/iassetspro?schema=public\n" +
    "Or set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD and DB_NAME."
  );
}

if (!/^postgres(?:ql)?:\/\//i.test(dbUrl)) {
  throw new Error("iAssetsPro now requires a PostgreSQL DATABASE_URL.");
}

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  datasource: {
    url: dbUrl,
  },
  migrations: {
    seed: "bun ./prisma/seed.ts",
  },
});

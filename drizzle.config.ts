import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  process.loadEnvFile();
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

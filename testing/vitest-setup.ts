// Runs in every test file before its imports, so src/db connects to the test
// database instead of the development one
import { inject } from "vitest";

process.env.DATABASE_URL = inject("databaseUrl");

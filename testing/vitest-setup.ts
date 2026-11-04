// Runs in every test file before its imports, so src/db connects to the test
// database instead of the development one
import { inject } from "vitest";

process.env.DATABASE_URL = inject("databaseUrl");

// Sign-in settings for tests: same values for every machine and CI. The
// emails never leave the process: tests replace src/lib/mailer.ts
process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.SMTP_URL = "smtp://localhost:1025";
process.env.MAIL_FROM = "Личная CRM <noreply@mail.crm.vupsen.space>";

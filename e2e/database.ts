// e2e tests run against their own database, see testing/database.ts
import { testDatabaseUrl } from "../testing/database";

export const e2eDatabaseUrl = testDatabaseUrl("e2e");

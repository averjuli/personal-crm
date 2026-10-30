// Prepares the Vitest database once before all test files
import type { TestProject } from "vitest/node";

import { prepareTestDatabase, testDatabaseUrl } from "./database";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const databaseUrl = testDatabaseUrl("test");
  await prepareTestDatabase(databaseUrl);
  project.provide("databaseUrl", databaseUrl);
}

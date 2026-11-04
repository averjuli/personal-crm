// Signs in the test user once and saves the session for the other specs: they
// start signed in, and the sign-in itself is checked in auth.spec.ts and
// main-scenario.spec.ts
import { test as setup } from "./fixtures";
import { authFile, e2eUser } from "./test-user";
import { signIn } from "./sign-in";

setup("sign in the test user", async ({ page }) => {
  await signIn(page, e2eUser.email);
  await page.context().storageState({ path: authFile });
});

// The user of the e2e tests that need existing contacts. Not a real address.
// global-setup creates it with the contacts; auth.setup.ts signs it in once
export const e2eUser = { id: "e2e-user", email: "e2e-user@example.com" };

// Session saved by auth.setup.ts, used by the specs that start signed in
export const authFile = "e2e/.auth/user.json";

// For specs that start without a session
export const signedOut = { cookies: [], origins: [] };

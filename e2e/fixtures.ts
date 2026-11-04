// `test` for all specs. Better Auth limits sign-in requests to 5 a minute per
// client address, and the production build under test enforces it. One test
// machine would be one address, so each test comes from an address of its own,
// as separate visitors do in real life (the app reads X-Real-IP, which nginx
// sets on the server). The limit itself stays on
import { test as base, type Browser } from "@playwright/test";

let counter = 0;

function nextClientIp() {
  counter += 1;
  return `10.1.${Math.floor(counter / 250)}.${(counter % 250) + 1}`;
}

export const test = base.extend({
  extraHTTPHeaders: async ({}, provide) => {
    await provide({ "x-real-ip": nextClientIp() });
  },
});

export { expect } from "@playwright/test";

// A second browser: its own cookies and its own client address
export async function newBrowserContext(
  browser: Browser,
  baseURL: string | undefined,
) {
  return browser.newContext({
    baseURL,
    locale: "ru-RU",
    extraHTTPHeaders: { "x-real-ip": nextClientIp() },
  });
}

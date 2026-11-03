// Signing in the way a person does: the form, then the link from the email
import { expect, type Page } from "@playwright/test";

import { openMailbox } from "./mailpit";

// Types the address in the form and presses «Получить ссылку»
export async function requestLink(page: Page, typed: string) {
  await page.goto("/login");
  await page.getByLabel("Почта").fill(typed);
  await page.getByRole("button", { name: "Получить ссылку" }).click();
}

// Signs the page in with a new link
export async function signIn(page: Page, email: string) {
  const mailbox = await openMailbox(email);
  await requestLink(page, email);
  await expect(
    page.getByText(`Ссылка для входа отправлена на ${email}`),
  ).toBeVisible();
  await page.goto(await mailbox.link());
  await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();
}

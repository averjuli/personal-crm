// «Группы» page: the row buttons stay in one place whatever the name length
import { expect, test, type Locator, type Page } from "@playwright/test";

const shortName = "Англ";
const longName = "Одноклассники из школы № 57 и их родители";

const viewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
];

// Where the button is inside its row: offsets from the row's top and right edges
async function placeInRow(row: Locator, button: Locator) {
  const rowBox = (await row.boundingBox())!;
  const buttonBox = (await button.boundingBox())!;
  return {
    top: buttonBox.y - rowBox.y,
    right: rowBox.x + rowBox.width - (buttonBox.x + buttonBox.width),
    width: buttonBox.width,
  };
}

function groupRow(page: Page, name: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name, exact: true }) });
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto("/groups");
  for (const name of [shortName, longName]) {
    await page.getByLabel("Новая группа").fill(name);
    await page.getByRole("button", { name: "Добавить", exact: true }).click();
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await page.close();
});

for (const viewport of viewports) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("rename and delete buttons are in the same place for short and long names", async ({
      page,
    }) => {
      await page.goto("/groups");
      const shortRow = groupRow(page, shortName);
      const longRow = groupRow(page, longName);

      for (const buttonName of ["Переименовать", "Удалить"]) {
        const inShort = await placeInRow(
          shortRow,
          shortRow.getByRole("button", { name: buttonName }),
        );
        const inLong = await placeInRow(
          longRow,
          longRow.getByRole("button", { name: buttonName }),
        );
        expect(inLong.top, `${buttonName}: top`).toBeCloseTo(inShort.top, 0);
        expect(inLong.right, `${buttonName}: right`).toBeCloseTo(
          inShort.right,
          0,
        );
        // Phone: icon-only 44px square buttons; wider screens show the text
        if (viewport.name === "phone") {
          expect(inShort.width, `${buttonName}: width`).toBeCloseTo(44, 0);
        } else {
          expect(inShort.width, `${buttonName}: width`).toBeGreaterThan(44);
        }
      }
    });
  });
}

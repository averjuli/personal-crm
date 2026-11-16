import { buildSync } from "esbuild";

import { expect, test } from "./fixtures";

// Exercise the real input with development warnings enabled, even when the
// application under test uses a production build.
const { outputFiles } = buildSync({
  stdin: {
    contents: `
      import { createRoot } from "react-dom/client";
      import { Input } from "./src/components/ui/input";

      const root = createRoot(document.getElementById("root"));
      window.renderInput = (defaultValue) => root.render(
        <form>
          <Input aria-label="Birthday" name="birthday" defaultValue={defaultValue} />
          <button type="reset">Reset</button>
        </form>
      );
    `,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
});

test("updates input defaults after submission without warnings or losing edits", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: outputFiles[0].text });

  const render = (value: string) =>
    page.evaluate((defaultValue) => {
      const harness = window as unknown as {
        renderInput: (value: string) => void;
      };
      harness.renderInput(defaultValue);
    }, value);

  await render("15");
  const input = page.getByRole("textbox", { name: "Birthday" });
  await expect(input).toHaveValue("15");
  await input.fill("20");

  // New server defaults must not overwrite an edit until the form resets.
  await render("20");
  await expect(input).toHaveJSProperty("defaultValue", "20");
  await expect(input).toHaveValue("20");
  await input.fill("25");
  await render("10");
  await expect(input).toHaveJSProperty("defaultValue", "10");
  await expect(input).toHaveValue("25");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(input).toHaveValue("10");

  expect(errors).toEqual([]);
});

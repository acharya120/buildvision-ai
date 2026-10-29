import { expect, test } from "@playwright/test";

// NOTE: written against the UI as built, but NOT yet executed (the build environment had no npm access).
// Run with:  npx playwright install chromium && npm run test:e2e

test("create a project, add and edit a room, save, reopen and export", async ({ page }) => {
  await page.goto("/");

  // 1-2. create a project with plot dimensions
  await page.getByRole("button", { name: "+ New project" }).first().click();
  await page.getByLabel("Project name").fill("E2E house");
  await page.getByLabel("Units").selectOption("metric");
  await page.getByLabel(/Plot width/).fill("10");
  await page.getByLabel(/Plot depth/).fill("8");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/project\//);

  // 3. add a room (library button has the default size as its title)
  await page.getByTitle("3.30 m × 3.00 m").first().click();
  await page.getByRole("img", { name: /Floor plan of/ }).click({ position: { x: 150, y: 150 } });

  // 4. edit width and verify dimensions and area
  const props = page.getByRole("complementary", { name: "Properties and checks" });
  const width = props.getByLabel(/^Width \(m\)$/);
  await width.fill("4");
  await width.press("Enter");
  await expect(page.getByText("Area:", { exact: false }).first()).toContainText("12.00 m²");

  // 5. wait for autosave, then reload and confirm the room is still there
  await expect(page.getByText("Saved in this browser")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("cell", { name: "Bedroom" }).first()).toBeVisible();

  // 6. export the floor plan as SVG
  await page.getByRole("button", { name: "Drawings & export" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download SVG" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.svg$/);
});

test("rejects an invalid plot size with a readable message", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ New project" }).first().click();
  await page.getByLabel(/Plot width/).fill("0");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("alert")).toContainText(/greater than zero|positive number/);
});

// NOTE: also not yet executed.
test("auto design generates options and applies one", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ New project" }).first().click();
  await page.getByLabel("Units").selectOption("metric");
  await page.getByLabel(/Plot width/).fill("9");
  await page.getByLabel(/Plot depth/).fill("12");
  await page.getByLabel(/Generate a starting layout/).check();
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/project\//);
  await page.getByRole("button", { name: "Auto design", exact: true }).click();
  await page.getByRole("button", { name: "Generate designs" }).click();
  await expect(page.getByRole("article", { name: "Option A" })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("article", { name: "Option A" }).getByRole("button", { name: "Use this design" }).click();
  await expect(page.getByRole("img", { name: /Floor plan of/ })).toBeVisible();
});

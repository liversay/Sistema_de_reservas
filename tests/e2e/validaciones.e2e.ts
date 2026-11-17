import { expect, newUser, test } from "./fixtures";

const MSG = {
  name: "Escribe tu nombre (de 2 a 60 caracteres).",
  email: "Escribe un email válido, por ejemplo nombre@correo.com.",
  phone: "Teléfono inválido: de 7 a 15 dígitos, puede empezar con +.",
  password: "La contraseña debe tener al menos 8 caracteres.",
} as const;

test("CA-08 registro con datos inválidos muestra un error por campo y no crea la cuenta", async ({ page }) => {
  const ok = newUser("ca08");
  const cases: { field: keyof typeof MSG; patch: Partial<typeof ok> }[] = [
    { field: "email", patch: { email: "no-es-un-email" } },
    { field: "phone", patch: { phone: "abc" } },
    { field: "password", patch: { password: "1234567" } }, // 7 caracteres
    { field: "name", patch: { name: "A" } },
  ];
  await page.goto("/registro");
  for (const { field, patch } of cases) {
    const data = { ...ok, ...patch };
    await page.locator('input[name="name"]').fill(data.name);
    await page.locator('input[name="email"]').fill(data.email);
    await page.locator('input[name="phone"]').fill(data.phone);
    await page.locator('input[name="password"]').fill(data.password);
    await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();

    await expect(page.getByText(MSG[field], { exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("Revisa los campos marcados.");
    // Solo el campo inválido se marca.
    await expect(page.locator('input[aria-invalid="true"]')).toHaveCount(1);
    await expect(page).toHaveURL(/\/registro/);
  }
  // No se creó ningún usuario: el login con esos datos responde 401.
  const login = await page.request.post("/api/auth/login", { data: { email: ok.email, password: ok.password } });
  expect(login.status()).toBe(401);

  // Con datos válidos crea la cuenta, abre sesión y vuelve a la disponibilidad.
  await page.locator('input[name="name"]').fill(ok.name);
  await page.locator('input[name="email"]').fill(ok.email);
  await page.locator('input[name="phone"]').fill(ok.phone);
  await page.locator('input[name="password"]').fill(ok.password);
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
  const me = await (await page.request.get("/api/auth/me")).json();
  expect(me).toMatchObject({ email: ok.email, role: "client" });

  // Un email ya registrado responde 409 con aviso.
  await page.getByRole("button", { name: "Salir" }).click();
  await page.goto("/registro");
  await page.locator('input[name="name"]').fill("Otra Persona");
  await page.locator('input[name="email"]').fill(ok.email);
  await page.locator('input[name="phone"]').fill(ok.phone);
  await page.locator('input[name="password"]').fill(ok.password);
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Ya existe una cuenta con ese email.");
});

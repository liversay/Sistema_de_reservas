import { bookViaApi, cell, CONFLICT, dayOffset, expect, freeCell, gridUrl, newContext, registerViaApi, test } from "./fixtures";

async function pick(page: import("@playwright/test").Page, court: string, time: string) {
  await freeCell(page, court, time).click();
}
const confirm = (page: import("@playwright/test").Page) =>
  page.locator("aside.panel").getByRole("button", { name: "Confirmar reserva" }).click();

test("CA-05 dos usuarios mismo turno: el segundo ve el mensaje de choque", async ({ browser }) => {
  const date = dayOffset(5);
  const a = await newContext(browser);
  const b = await newContext(browser);
  await registerViaApi(a, "dosa");
  await registerViaApi(b, "dosb");
  const pa = await a.newPage();
  const pb = await b.newPage();
  await pa.goto(gridUrl(date));
  await pb.goto(gridUrl(date));
  await pick(pa, "Pádel 1", "21:00");
  await pick(pb, "Pádel 1", "21:00");

  await confirm(pa);
  await expect(pa.getByRole("status").filter({ hasText: "Reserva confirmada." })).toBeVisible();

  await confirm(pb);
  await expect(pb.getByRole("alert")).toContainText(CONFLICT);
  // La cuadrícula del segundo se refresca y muestra el turno ocupado; solo hay una reserva.
  await expect(cell(pb, "Pádel 1", "21:00", "ocupado")).toBeVisible();
  const rows = await (await b.request.get("/api/bookings/mine")).json();
  expect(rows).toHaveLength(0);
  await a.close();
  await b.close();
});

test("CA-05 solape parcial en la misma cancha: el segundo recibe el mensaje de choque", async ({ browser }) => {
  const date = dayOffset(5);
  const a = await newContext(browser);
  const b = await newContext(browser);
  await registerViaApi(a, "solapea");
  await registerViaApi(b, "solapeb");
  const pb = await b.newPage();
  await pb.goto(gridUrl(date));
  await pick(pb, "Básquet 1", "20:30"); // B elige 20:30–21:30 con la cuadrícula aún libre

  await bookViaApi(a.request, { courtId: "basquet-1", date, startTime: "20:00", durationMin: 60 }); // A toma 20:00–21:00
  await confirm(pb);
  await expect(pb.getByRole("alert")).toContainText(CONFLICT);
  await expect(cell(pb, "Básquet 1", "20:30", "ocupado")).toBeVisible();
  await expect(freeCell(pb, "Básquet 1", "21:00")).toBeVisible(); // no quedaron bloques extra
  await a.close();
  await b.close();
});

test("CA-06 completa no disponible si una mitad está ocupada (y Media B sigue libre)", async ({ browser }) => {
  const date = dayOffset(6);
  const a = await newContext(browser);
  const b = await newContext(browser);
  await registerViaApi(a, "mitada");
  await registerViaApi(b, "mitadb");
  const pb = await b.newPage();
  await pb.goto(gridUrl(date));
  await pick(pb, "Fútbol · Completa", "20:30"); // B elige la Completa 20:30–21:30

  await bookViaApi(a.request, { courtId: "media-a", date, startTime: "20:00", durationMin: 60 });
  await confirm(pb);
  await expect(pb.getByRole("alert")).toContainText(CONFLICT);
  await expect(cell(pb, "Fútbol · Completa", "20:30", "ocupado")).toBeVisible();
  await expect(freeCell(pb, "Fútbol · Media B", "20:30")).toBeVisible();

  // Media B sigue reservable en el mismo horario.
  await pick(pb, "Fútbol · Media B", "20:00");
  await confirm(pb);
  await expect(pb.getByRole("status").filter({ hasText: "Reserva confirmada." })).toBeVisible();
  await a.close();
  await b.close();
});

test("CA-06 completa reservada bloquea Media A y Media B en su rango", async ({ browser }) => {
  const date = dayOffset(4);
  const a = await newContext(browser);
  await registerViaApi(a, "completa");
  await bookViaApi(a.request, { courtId: "completa", date, startTime: "20:00", durationMin: 60 });
  const pa = await a.newPage();
  await pa.goto(gridUrl(date));
  for (const court of ["Fútbol · Media A", "Fútbol · Media B"]) {
    for (const t of ["20:00", "20:30"]) await expect(cell(pa, court, t, "ocupado")).toBeVisible();
    await expect(freeCell(pa, court, "21:00")).toBeVisible();
  }
  await a.close();
});

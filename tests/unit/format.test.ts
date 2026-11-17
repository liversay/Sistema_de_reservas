import { describe, expect, test } from "bun:test";
import { formatLongDate, formatRange12, formatTime12 } from "../../src/web/src/format";

describe("formatTime12", () => {
  test.each([
    ["20:00", "8:00 p. m."],
    ["12:00", "12:00 p. m."],
    ["00:30", "12:30 a. m."],
    ["00:00", "12:00 a. m."],
    ["08:00", "8:00 a. m."],
    ["12:30", "12:30 p. m."],
    ["13:30", "1:30 p. m."],
    ["23:30", "11:30 p. m."],
    ["11:59", "11:59 a. m."],
  ])("%s → %s", (input, out) => expect(formatTime12(input)).toBe(out));

  test("entrada inesperada se devuelve tal cual", () => expect(formatTime12("")).toBe(""));
});

test("formatRange12", () => expect(formatRange12("20:00", "21:30")).toBe("8:00 p. m. – 9:30 p. m."));

describe("formatLongDate", () => {
  test("jueves 12 de noviembre de 2026", () => expect(formatLongDate("2026-11-12")).toBe("jueves 12 de noviembre de 2026"));
  test("primer día del año", () => expect(formatLongDate("2027-01-01")).toBe("viernes 1 de enero de 2027"));
  test("fin de año", () => expect(formatLongDate("2026-12-31")).toBe("jueves 31 de diciembre de 2026"));
  test("domingo", () => expect(formatLongDate("2026-11-15")).toBe("domingo 15 de noviembre de 2026"));
});

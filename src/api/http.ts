import type { Context } from "hono";
import { ZodError, type ZodTypeAny } from "zod";

/** JSON malformado -> ZodError (400) para que la respuesta sea uniforme. */
export async function readBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ZodError([{ code: "custom", path: [], message: "El cuerpo debe ser JSON válido." }]);
  }
}

export function fieldsOf(e: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const i of e.issues) {
    const key = i.path.join(".") || "_";
    if (!(key in fields)) fields[key] = i.message;
  }
  return fields;
}

export const parse = <S extends ZodTypeAny>(schema: S, data: unknown): S["_output"] => schema.parse(data);

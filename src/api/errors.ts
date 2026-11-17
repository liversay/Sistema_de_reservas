/** Mapeados luego a 409 / 422 / 404. */
export class ConflictError extends Error {
  readonly status = 409;
  constructor(message = "Ese horario ya fue tomado. Elige otro.") {
    super(message);
    this.name = "ConflictError";
  }
}
export class RuleError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = "RuleError";
  }
}
export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message = "No encontrado") {
    super(message);
    this.name = "NotFoundError";
  }
}

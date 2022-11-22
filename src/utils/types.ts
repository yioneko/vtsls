export function isNil(val: unknown): val is undefined | null {
  return val === undefined || val === null;
}

export function isPrimitive(val: unknown): boolean {
  return (
    val === null ||
    typeof val === "boolean" ||
    typeof val === "number" ||
    typeof val === "string" ||
    typeof val === "symbol" || // ES6 symbol
    typeof val === "undefined"
  );
}

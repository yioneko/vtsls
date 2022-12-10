export {
  equals,
} from "@vsc-ts/utils/objects"

export function deepClone<T>(obj: T): T {
  if (!obj || typeof obj !== "object") {
    return obj;
  }
  if (obj instanceof RegExp) {
    return obj;
  }
  const result: any = Array.isArray(obj) ? [] : {};
  Object.entries(obj).forEach(([key, value]) => {
    result[key] = value && typeof value === "object" ? deepClone(value) : value;
  });
  return result;
}



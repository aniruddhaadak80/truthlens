export function ok(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function fail(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError(400, "invalid_json", "Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
}

export function requireString(value: unknown, field: string, maxLen = 2000): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, "invalid_field", `Field "${field}" must be a non-empty string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLen) {
    throw new ApiError(400, "invalid_field", `Field "${field}" exceeds ${maxLen} characters.`);
  }
  return trimmed;
}

export function optionalEnum(
  value: unknown,
  field: string,
  allowed: string[],
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new ApiError(400, "invalid_field", `Field "${field}" must be one of: ${allowed.join(", ")}.`);
  }
  return value;
}

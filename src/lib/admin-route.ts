import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { requireAdmin, type Admin } from "@/lib/admin-service";
import { getEnv } from "@/lib/env";
import { readJson } from "@/lib/http";

export class UserError extends Error {
  constructor(
    message: string,
    public status = 400,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export type AdminContext<T> = {
  admin: Admin;
  req: NextRequest;
  params: Record<string, string>;
  body: T;
};

type RouteArgs = { params: Promise<Record<string, string>> };

function errorFields(issues: Array<{ path: PropertyKey[]; message: string }>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "_";
    fields[key] ??= issue.message;
  }
  return fields;
}

function foreignOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin || req.method === "GET" || req.method === "HEAD") return false;
  try {
    return new URL(origin).host !== new URL(getEnv().APP_URL).host;
  } catch {
    return true;
  }
}

export function adminRoute<T = undefined>(
  schema: ZodType<T> | null,
  handler: (ctx: AdminContext<T>) => Promise<Response>,
) {
  return async (req: NextRequest, route: RouteArgs): Promise<Response> => {
    const res = await run(req, route);
    res.headers.set("cache-control", "no-store");
    return res;
  };

  async function run(req: NextRequest, route: RouteArgs): Promise<Response> {
    const admin = await requireAdmin(req);
    if (!admin) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk lagi." }, { status: 401 });
    if (foreignOrigin(req)) return NextResponse.json({ error: "Permintaan ditolak." }, { status: 403 });

    let body = undefined as T;
    if (schema) {
      const parsed = schema.safeParse(await readJson(req));
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Periksa kembali isian yang ditandai.", fields: errorFields(parsed.error.issues) },
          { status: 422 },
        );
      }
      body = parsed.data;
    }

    try {
      return await handler({ admin, req, params: await route.params, body });
    } catch (e) {
      if (e instanceof UserError) {
        return NextResponse.json({ error: e.message, ...(e.fields ? { fields: e.fields } : {}) }, { status: e.status });
      }
      throw e;
    }
  }
}

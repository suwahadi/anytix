import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { foreignOrigin, UserError, userErrorResponse, validationResponse } from "@/lib/admin-route";
import { readJson } from "@/lib/http";
import { readVisitorId, VISITOR_COOKIE } from "@/lib/visitor";

export type VisitorContext<T> = {
  visitorId: string;
  req: NextRequest;
  params: Record<string, string>;
  body: T;
};

type RouteArgs = { params: Promise<Record<string, string>> };

/** Buyer-facing JSON route: the signed visitor cookie identifies the owner of a hold. */
export function visitorRoute<T = undefined>(
  schema: ZodType<T> | null,
  handler: (ctx: VisitorContext<T>) => Promise<Response>,
) {
  return async (req: NextRequest, route: RouteArgs): Promise<Response> => {
    const res = await run(req, route);
    res.headers.set("cache-control", "no-store");
    return res;
  };

  async function run(req: NextRequest, route: RouteArgs): Promise<Response> {
    const visitorId = readVisitorId(req.cookies.get(VISITOR_COOKIE)?.value);
    if (!visitorId) return NextResponse.json({ error: "Sesi pembelian tidak dikenali. Muat ulang halaman." }, { status: 401 });
    if (foreignOrigin(req)) return NextResponse.json({ error: "Permintaan ditolak." }, { status: 403 });

    let body = undefined as T;
    if (schema) {
      const parsed = schema.safeParse(await readJson(req));
      if (!parsed.success) return validationResponse(parsed.error.issues);
      body = parsed.data;
    }

    try {
      return await handler({ visitorId, req, params: await route.params, body });
    } catch (e) {
      if (e instanceof UserError) return userErrorResponse(e);
      throw e;
    }
  }
}

import { NextResponse } from "next/server";
import { adminRoute, UserError, validationResponse } from "@/lib/admin-route";
import { readJson } from "@/lib/http";
import { getSettingsGroup, putSettingsGroup } from "@/lib/settings-service";
import { SETTINGS_SCHEMAS, type SettingsGroup } from "@/lib/validation/settings";

function groupOf(params: Record<string, string>): SettingsGroup {
  if (params.group in SETTINGS_SCHEMAS) return params.group as SettingsGroup;
  throw new UserError("Grup pengaturan tidak dikenal.", 404);
}

export const GET = adminRoute(null, async ({ params }) => {
  const group = groupOf(params);
  return NextResponse.json({ settings: await getSettingsGroup(group as "transaction") });
});

export const PUT = adminRoute(null, async ({ admin, params, req }) => {
  const group = groupOf(params);
  const parsed = SETTINGS_SCHEMAS[group].safeParse(await readJson(req));
  if (!parsed.success) return validationResponse(parsed.error.issues);
  await putSettingsGroup(admin.id, group as "transaction", parsed.data as never);
  return NextResponse.json({ settings: await getSettingsGroup(group as "transaction") });
});

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE } from "@/lib/admin-session";
import { adminFromCookie, type Admin } from "@/lib/admin-service";

/** For server components that render admin data: the proxy checks only the cookie signature, this also requires an active account. */
export async function pageAdmin(): Promise<Admin> {
  const admin = await adminFromCookie((await cookies()).get(ADMIN_COOKIE)?.value);
  if (!admin) redirect("/admin/login");
  return admin;
}

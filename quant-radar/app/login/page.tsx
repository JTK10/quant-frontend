import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, validSession, safeDestination } from "@/utils/auth";
import LoginForm from "./LoginForm";
export const metadata = { title: "Sign in · Quant Radar", robots: { index: false, follow: false } };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeDestination((await searchParams).next);
  if (validSession((await cookies()).get(SESSION_COOKIE)?.value)) redirect(next);
  return <LoginForm next={next} />;
}

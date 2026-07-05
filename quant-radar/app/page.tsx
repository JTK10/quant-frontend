import { redirect } from "next/navigation";

// Smart Radar's AWS Lambda backend was retired (2026-07) — engines now live on
// Oracle VM. CARACAL is the home page. The old Smart Radar page lives in git
// history; restore it here if/when its backend is rebuilt on Oracle.
export const dynamic = "force-dynamic";

export default function Home() {
  redirect("/caracal");
}

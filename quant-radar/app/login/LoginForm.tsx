"use client";
import { useState, type FormEvent } from "react";
import { Activity, ArrowRight, Eye, EyeOff, LockKeyhole } from "lucide-react";

export default function LoginForm({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, next }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Unable to sign in."); setBusy(false); return; }
      window.location.assign(data.next);
    } catch { setError("Could not connect. Please try again."); setBusy(false); }
  }
  return <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-bg" style={{ backgroundImage: "radial-gradient(ellipse at 50% 0%, rgba(45,142,255,.12), transparent 65%)" }}>
    <div className="w-full max-w-sm">
      <div className="flex items-center gap-3 mb-12"><span className="rounded-xl border border-accent/25 bg-accent/10 p-3 text-accent"><Activity size={25} /></span><div><div className="text-xl font-semibold text-text2 tracking-tight">Quant Radar</div><div className="text-xs text-muted2 mt-1">Your private market workspace</div></div></div>
      <div className="rounded-2xl border border-border2 bg-surface p-7 shadow-2xl">
        <LockKeyhole size={22} className="text-accent mb-5" /><h1 className="text-2xl font-semibold text-text2 mb-2">Welcome back</h1><p className="text-sm text-muted2 mb-7">Enter your password to open your dashboard.</p>
        <form onSubmit={submit}>
          <label htmlFor="password" className="block text-sm text-text mb-2">Password</label>
          <div className="relative"><input id="password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" required maxLength={256} value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg border border-border2 bg-bg px-3 py-3 pr-12 text-text2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"} className="absolute right-3 top-3.5 text-muted2 hover:text-text2">{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
          {error && <p role="alert" className="mt-3 text-sm text-bear">{error}</p>}
          <button disabled={busy} className="mt-5 w-full flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60">{busy ? "Signing in…" : "Sign in"}{!busy && <ArrowRight size={17} />}</button>
        </form>
      </div><p className="mt-5 text-center text-xs text-muted2">Private access · Signed in for 1 year</p>
    </div>
  </div>;
}

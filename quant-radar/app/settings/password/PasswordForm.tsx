"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { LockKeyhole } from "lucide-react";
export default function PasswordForm({ ready }: { ready: boolean }) {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (newPassword !== confirmPassword) { setError("The new passwords do not match."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Unable to change password."); return; }
      setCurrent(""); setNew(""); setConfirm(""); setDone(true);
    } catch { setError("Connection interrupted. Try signing in with the new password before retrying."); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto w-full max-w-lg px-6 py-14"><Link href="/rusty" className="text-sm text-accent">← Back to dashboard</Link><div className="mt-7 rounded-2xl border border-border2 bg-surface p-7"><LockKeyhole className="text-accent mb-5" size={24} /><h1 className="text-2xl font-semibold text-text2">Change password</h1>
    {done ? <div className="mt-5"><p role="status" className="text-sm text-text">Password changed. All laptops have been signed out. Sign in again with your new password.</p><a href="/login" className="mt-6 block rounded-lg bg-accent px-4 py-3 text-center text-sm font-semibold text-white">Sign in again</a></div> : <><p className="mt-3 text-sm text-muted2">Changing your password signs out all laptops, including this one.</p>
      {!ready && <p role="status" className="mt-5 text-sm text-gold">Password changes will be available after the private database is connected.</p>}
      <form className="mt-6 space-y-5" onSubmit={submit}>
        {[{ id: "currentPassword", label: "Current password", value: currentPassword, set: setCurrent, auto: "current-password", min: 1 }, { id: "newPassword", label: "New password", value: newPassword, set: setNew, auto: "new-password", min: 8 }, { id: "confirmPassword", label: "Confirm new password", value: confirmPassword, set: setConfirm, auto: "new-password", min: 8 }].map(field => <div key={field.id}><label htmlFor={field.id} className="block text-sm text-text mb-2">{field.label}</label><input id={field.id} name={field.id} type="password" autoComplete={field.auto} required minLength={field.min} maxLength={256} value={field.value} disabled={!ready || busy} onChange={e => field.set(e.target.value)} className="w-full rounded-lg border border-border2 bg-bg px-3 py-3 text-text2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50" /></div>)}
        <p className="text-xs text-muted2">Use at least 8 characters. Choose a unique passphrase and save it in your password manager.</p>
        {error && <p role="alert" className="text-sm text-bear">{error}</p>}
        <button disabled={!ready || busy} className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Changing password…" : "Change password & sign out"}</button>
      </form></>}
    </div></div>;
}

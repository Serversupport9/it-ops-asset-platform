import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { IconUser } from "../components/icons";
import { requestPasswordReset } from "../services/passwordReset";

const GENERIC_MESSAGE = "If this account exists and has an email on file, a reset link has been sent.";

export default function ForgotPassword() {
  const [employeeId, setEmployeeId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const msg = await requestPasswordReset(employeeId);
      setMessage(msg);
    } catch {
      // Same generic message even on a network/rate-limit error - never reveal account existence.
      setMessage(GENERIC_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Forgot password" subtitle="Enter your employee ID and we'll email you a reset link.">
      {message ? (
        <>
          <p className="mb-5 rounded-xl border border-blue-100 bg-blue-50/80 px-3.5 py-3 text-[13px] leading-relaxed text-slate-600">
            {message}
          </p>
          <Link to="/login" className="text-[13px] font-medium text-blue-600 transition-colors hover:text-blue-700">
            ← Back to sign in
          </Link>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Employee ID</label>
            <div className="group relative">
              <IconUser className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-600" />
              <input
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="IPACxxxx"
                autoComplete="username"
                className="w-full rounded-2xl border border-slate-200 bg-white/80 py-3 pl-11 pr-3.5 text-[15px] text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-blue-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/35 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
          >
            {submitting ? "Sending…" : "Send reset link"}
          </button>
          <Link
            to="/login"
            className="block text-center text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-700"
          >
            ← Back to sign in
          </Link>
        </form>
      )}
    </AuthShell>
  );
}

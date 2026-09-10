import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { IconEye, IconEyeOff, IconLock } from "../components/icons";
import { confirmPasswordReset } from "../services/passwordReset";

const MIN_PASSWORD_LENGTH = 12;

function PasswordField({
  label,
  value,
  onChange,
  visible,
  onToggleVisible,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  visible: boolean;
  onToggleVisible: () => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-slate-700">{label}</label>
      <div className="group relative">
        <IconLock className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-600" />
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="new-password"
          className="w-full rounded-2xl border border-slate-200 bg-white/80 py-3 pl-11 pr-11 text-[15px] text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]"
          required
        />
        <button
          type="button"
          onClick={onToggleVisible}
          aria-label={visible ? "Hide password" : "Show password"}
          tabIndex={-1}
          className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          {visible ? <IconEyeOff className="h-[18px] w-[18px]" /> : <IconEye className="h-[18px] w-[18px]" />}
        </button>
      </div>
    </div>
  );
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(token, newPassword);
      setDone(true);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? "Invalid or expired reset link.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title="Reset link missing">
        <p className="mb-5 text-center text-[13px] text-slate-500">This reset link is missing its token.</p>
        <Link to="/forgot-password" className="block text-center text-[13px] font-medium text-blue-600 hover:text-blue-700">
          Request a new one
        </Link>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password reset">
        <p className="mb-5 text-center text-[13px] text-slate-500">Password reset successful. You can now log in.</p>
        <button
          onClick={() => navigate("/login")}
          className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-blue-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/35 active:scale-[0.98]"
        >
          Go to sign in
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" subtitle={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordField
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          visible={showPassword}
          onToggleVisible={() => setShowPassword((v) => !v)}
        />
        <PasswordField
          label="Confirm new password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          visible={showPassword}
          onToggleVisible={() => setShowPassword((v) => !v)}
        />

        {error && (
          <div className="rounded-xl border border-rose-100 bg-rose-50/80 px-3.5 py-2.5 text-[13px] font-medium text-rose-600">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-blue-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/35 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
        >
          {submitting ? "Resetting…" : "Reset password"}
        </button>
      </form>
    </AuthShell>
  );
}

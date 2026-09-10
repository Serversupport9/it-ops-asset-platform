export default function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 p-4">
      {/* Ambient gradient wash - soft blue + orange, iOS-wallpaper style, decorative only */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-sky-300/40 blur-[110px]" />
        <div className="absolute -bottom-40 -right-24 h-[30rem] w-[30rem] rounded-full bg-orange-300/35 blur-[120px]" />
        <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-blue-200/30 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-white p-3 shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/[0.04]">
            <img src="/logo.png" alt="IT Asset Platform" className="h-full w-full object-contain" />
          </div>
          <div className="text-center">
            <p className="text-[15px] font-semibold tracking-tight text-slate-900">IT Asset Platform</p>
            <p className="text-xs text-slate-400">Asset Management</p>
          </div>
        </div>

        <div className="relative rounded-[1.75rem] border border-white/60 bg-white/75 p-8 shadow-2xl shadow-slate-900/[0.08] backdrop-blur-2xl">
          <div className="mb-6">
            <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">{title}</h1>
            {subtitle && <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{subtitle}</p>}
          </div>
          {children}
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-400">Secured access · Internal use only</p>
      </div>
    </div>
  );
}

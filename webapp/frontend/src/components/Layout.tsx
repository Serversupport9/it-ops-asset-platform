import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import { IconMenu } from "./icons";

const COLLAPSE_KEY = "sidebar_collapsed";

export default function Layout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Desktop sidebar */}
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        className="hidden shrink-0 lg:flex"
      />

      {/* Mobile off-canvas sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <Sidebar
            collapsed={false}
            onToggleCollapsed={() => setMobileOpen(false)}
            onNavigate={() => setMobileOpen(false)}
            className="absolute inset-y-0 left-0 z-50 shadow-xl"
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <IconMenu className="h-5 w-5" />
          </button>
          <img src="/logo.png" alt="IT Asset Platform" className="h-6 w-6 object-contain" />
          <span className="text-sm font-semibold text-slate-800">IT Asset Platform</span>
        </header>

        <main className="relative min-w-0 flex-1 overflow-y-auto">
          {/* Same soft blue/orange ambient wash as the auth pages, low-opacity and fixed so it
              never competes with table/data readability. */}
          <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
            <div className="absolute -left-20 -top-20 h-96 w-96 rounded-full bg-sky-200/25 blur-[100px]" />
            <div className="absolute -bottom-24 -right-16 h-[26rem] w-[26rem] rounded-full bg-orange-200/20 blur-[110px]" />
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

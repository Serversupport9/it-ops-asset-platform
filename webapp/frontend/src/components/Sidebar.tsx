import { NavLink, useNavigate } from "react-router-dom";
import { getRole, logout } from "../services/auth";
import {
  IconArrowReturn,
  IconBox,
  IconCheckSquare,
  IconChevronsLeft,
  IconDashboard,
  IconLayers,
  IconList,
  IconLogout,
  IconPlusCircle,
  IconShieldMark,
  IconTag,
  IconUserPlus,
} from "./icons";

const ADMIN_ROLES = ["it", "management", "super_admin"];

const ROLE_LABEL: Record<string, string> = {
  employee: "Employee",
  it: "IT",
  management: "Management",
  super_admin: "Super Admin",
};

interface NavItem {
  to: string;
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
  adminOnly?: boolean;
}

const PRIMARY_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: IconDashboard },
  { to: "/assets/mine", label: "My Assets", icon: IconLayers },
  { to: "/requests/new", label: "New Request", icon: IconPlusCircle },
  { to: "/returns/new", label: "Return Asset", icon: IconArrowReturn },
  { to: "/requests/mine", label: "My Requests", icon: IconList },
];

const ADMIN_ITEMS: NavItem[] = [
  { to: "/fulfillment", label: "Fulfillment", icon: IconBox, adminOnly: true },
  { to: "/approvals", label: "Approvals", icon: IconCheckSquare, adminOnly: true },
  { to: "/admin/assets", label: "Assets", icon: IconTag, adminOnly: true },
  { to: "/admin/add-employee", label: "Add Employee", icon: IconUserPlus, adminOnly: true },
  { to: "/admin/roles", label: "Roles", icon: IconShieldMark, adminOnly: true },
];

function NavRow({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
          isActive
            ? "bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-md shadow-blue-900/20"
            : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
        } ${collapsed ? "justify-center" : ""}`
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
}

export default function Sidebar({
  collapsed,
  onToggleCollapsed,
  onNavigate,
  className = "",
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate?: () => void;
  className?: string;
}) {
  const role = getRole();
  const isAdmin = ADMIN_ROLES.includes(role ?? "");
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <aside
      className={`flex h-full flex-col bg-gradient-to-b from-slate-900 to-[#0b1220] text-slate-300 transition-all duration-200 ${
        collapsed ? "w-[72px]" : "w-64"
      } ${className}`}
    >
      <div className={`flex items-center gap-2.5 px-4 py-5 ${collapsed ? "justify-center px-2" : ""}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white p-1.5 shadow-md shadow-black/20">
          <img src="/logo.png" alt="IT Asset Platform" className="h-full w-full object-contain" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">IT Asset Platform</p>
            <p className="truncate text-[11px] text-slate-400">Asset Management</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2 scrollbar-thin">
        {PRIMARY_ITEMS.map((item) => (
          <NavRow key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}

        {isAdmin && (
          <>
            <div className={`px-3 pb-1 pt-4 ${collapsed ? "text-center" : ""}`}>
              {!collapsed ? (
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Admin</p>
              ) : (
                <div className="mx-auto h-px w-6 bg-slate-700" />
              )}
            </div>
            {ADMIN_ITEMS.map((item) => (
              <NavRow key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-slate-800 p-3">
        {!collapsed && (
          <div className="mb-2 px-1">
            <p className="text-xs font-medium text-slate-200">{ROLE_LABEL[role ?? ""] ?? role}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          title={collapsed ? "Log out" : undefined}
    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-300 transition-all hover:bg-white/[0.06] hover:text-white ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <IconLogout className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span>Log out</span>}
        </button>
        <button
          onClick={onToggleCollapsed}
          className={`mt-1 hidden w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-400 transition-all hover:bg-white/[0.06] hover:text-white lg:flex ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <IconChevronsLeft className={`h-[18px] w-[18px] shrink-0 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

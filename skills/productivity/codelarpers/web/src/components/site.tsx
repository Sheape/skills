import { NavLink, Link, Outlet } from "react-router";
import { Sparkles } from "lucide-react";
import { useApi, type Meta } from "@/lib/api";
import { ThemeToggle, Wordmark, cx } from "./ui";

export function PointsPill({ points }: { points: number }) {
  return (
    <Link
      to="/profile"
      className="inline-flex items-center gap-1.5 rounded border border-accent-line bg-button px-2 py-1 text-[13px] font-semibold text-white hover:bg-button-hover"
      title="Total points across every challenge"
    >
      <Sparkles className="size-3.5" />
      {points.toLocaleString()} pts
    </Link>
  );
}

function NavItem({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cx(
          "relative flex h-14 items-center px-2 text-[15px] transition-colors",
          isActive ? "text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-accent" : "text-ink-3 hover:text-ink",
        )
      }
    >
      {children}
    </NavLink>
  );
}

export function TopNav() {
  const { data: meta } = useApi<Meta>("/api/meta");
  return (
    <header className="border-b border-line-soft">
      <div className="mx-auto flex h-14 max-w-[1024px] items-center justify-between px-6">
        <div className="flex items-center">
          <Link to="/catalog" className="pr-5">
            <Wordmark />
          </Link>
          <span className="mr-3 h-5 w-px bg-line" />
          <nav className="flex gap-2">
            <NavItem to="/catalog">Catalog</NavItem>
            <NavItem to="/profile">Profile</NavItem>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {meta && <PointsPill points={meta.totals.points} />}
          {meta && (
            <Link to="/profile" className="hidden text-[14px] text-ink-3 hover:text-ink sm:block">
              {meta.user.name}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteLayout() {
  return (
    <div className="min-h-full bg-canvas">
      <TopNav />
      <Outlet />
    </div>
  );
}

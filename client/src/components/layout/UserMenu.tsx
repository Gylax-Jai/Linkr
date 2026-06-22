import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Palette, User } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/button";
import { useLogoutMutation } from "@/features/auth";
import { ThemeModeToggle, ThemeSwatches } from "@/features/settings/ThemeSwitcher";
import { useAuthStore } from "@/lib/store";
import { PATHS } from "@/routes/paths";
import { cn } from "@/lib/utils";

/** Header profile chip: Profile, Theme, Dark/Light toggle, Sign out. */
export function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const logout = useLogoutMutation();
  const [open, setOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setThemeOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (!user) return null;

  const handleLabel = user.username ? `@${user.username}` : user.displayName;

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => navigate(PATHS.login, { replace: true }),
    });
    setOpen(false);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "flex items-center gap-2 rounded-2xl border border-transparent px-2 py-1.5 transition-colors",
          "hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          open && "border-border bg-surface-2",
        )}
      >
        <Avatar name={user.displayName} src={user.avatar} size="sm" ring />
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-sm font-medium text-text">{user.displayName}</span>
          <span className="block truncate font-mono text-[11px] text-text-muted">{handleLabel}</span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 text-text-muted transition-transform sm:ml-0.5", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-border bg-surface p-2 shadow-elevated"
        >
          <div className="border-b border-border px-3 py-2.5 sm:hidden">
            <p className="truncate text-sm font-medium text-text">{user.displayName}</p>
            <p className="truncate font-mono text-xs text-text-muted">{handleLabel}</p>
          </div>

          <Link
            to={PATHS.profile}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-text transition-colors hover:bg-surface-2"
          >
            <User className="h-4 w-4 text-text-muted" />
            Profile
          </Link>

          <div className="my-1 border-t border-border" />

          <button
            type="button"
            role="menuitem"
            onClick={() => setThemeOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-text transition-colors hover:bg-surface-2"
          >
            <span className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-text-muted" />
              Theme
            </span>
            <ChevronDown className={cn("h-4 w-4 text-text-muted transition-transform", themeOpen && "rotate-180")} />
          </button>

          {themeOpen ? (
            <div className="px-3 py-2">
              <ThemeSwatches />
            </div>
          ) : null}

          <ThemeModeToggle />

          <div className="my-1 border-t border-border" />

          <Button
            variant="ghost"
            size="sm"
            role="menuitem"
            className="w-full justify-start text-text-muted hover:text-text"
            disabled={logout.isPending}
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            {logout.isPending ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

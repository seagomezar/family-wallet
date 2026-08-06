import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { useState, useCallback } from 'react';
import { MonthSelector } from '@/components/month-selector';
import { TourOverlay } from '@/components/tour-overlay';
import { TourAutoStart } from '@/components/tour-auto-start';
import { useAutoRecurring } from '@/hooks/useAutoRecurring';
import {
  LayoutDashboard,
  List,
  FolderOpen,
  Upload,
  Settings,
} from "lucide-react";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const [globalToast, setGlobalToast] = useState<string | null>(null);

  const handleToast = useCallback((msg: string) => {
    setGlobalToast(msg);
    setTimeout(() => setGlobalToast(null), 4000);
  }, []);

  // Global auto-populate recurring expenses on month change
  useAutoRecurring(handleToast);

  return (
    <div className="min-h-screen bg-background">
      {/* Global toast for recurring expenses */}
      {globalToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-card border border-border rounded-lg shadow-lg px-4 py-3 text-sm font-medium animate-in fade-in slide-in-from-top-2">
          {globalToast}
        </div>
      )}

      {/* Tour */}
      <TourOverlay />
      <TourAutoStart />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <h1 className="text-lg font-bold text-primary">💰 Billetera</h1>
          <MonthSelector />
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Outlet />
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 md:hidden">
        <div className="mx-auto flex max-w-4xl items-center justify-around py-2">
          <NavLink
            to="/"
            icon={<LayoutDashboard className="h-5 w-5" />}
            label="Inicio"
          />
          <NavLink
            to="/gastos"
            icon={<List className="h-5 w-5" />}
            label="Gastos"
          />
          <NavLink
            to="/categorias"
            icon={<FolderOpen className="h-5 w-5" />}
            label="Categorías"
          />
          <NavLink
            to="/importar"
            icon={<Upload className="h-5 w-5" />}
            label="Importar"
          />
          <NavLink
            to="/ajustes"
            icon={<Settings className="h-5 w-5" />}
            label="Ajustes"
          />
        </div>
      </nav>

      {/* Desktop sidebar-style nav */}
      <nav className="fixed top-14 left-0 bottom-0 z-40 hidden w-56 border-r bg-card p-4 md:block">
        <div className="flex flex-col gap-1">
          <DesktopNavLink
            to="/"
            icon={<LayoutDashboard className="h-4 w-4" />}
            label="Dashboard"
          />
          <DesktopNavLink
            to="/gastos"
            icon={<List className="h-4 w-4" />}
            label="Gastos Mensual"
          />
          <DesktopNavLink
            to="/categorias"
            icon={<FolderOpen className="h-4 w-4" />}
            label="Categorías"
          />
          <DesktopNavLink
            to="/importar"
            icon={<Upload className="h-4 w-4" />}
            label="Importar Banco"
          />
          <DesktopNavLink
            to="/ajustes"
            icon={<Settings className="h-4 w-4" />}
            label="Ajustes"
          />
        </div>
      </nav>

      {/* Push content for desktop nav */}
      <div className="hidden md:block md:pl-56" />
    </div>
  );
}

function NavLink({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-0.5 px-2 py-1 text-muted-foreground transition-colors [&.active]:text-primary"
      activeProps={{ className: "active text-primary" }}
    >
      {icon}
      <span className="text-[10px]">{label}</span>
    </Link>
  );
}

function DesktopNavLink({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-foreground"
      activeProps={{ className: "active" }}
    >
      {icon}
      {label}
    </Link>
  );
}

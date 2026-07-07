"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
   ApiAuthError, apiFetch, clearSession } from "@/lib/api";
import { 
  LayoutDashboard, 
  Users, 
  Building2,
  Layers,
  UserCircle, 
  LogOut, 
  Menu,
  Building,
  CreditCard,
  Info,
  CheckCircle2,
  Eye,
  EyeOff,
} from "lucide-react";
import { Onboarding } from "@/components/dashboard/Onboarding";
import { AnimatePresence } from "framer-motion";
import { CiGlobe } from "react-icons/ci";
import { useTranslations, useLocale } from "next-intl";

const STORAGE_KEY = "oson_uy_developer_name";
const TOKEN_KEY = "oson_uy_token";
const getInitialName = () =>
  typeof window === "undefined" ? "" : (window.localStorage.getItem(STORAGE_KEY) ?? "");
const getInitialToken = () =>
  typeof window === "undefined" ? "" : (window.localStorage.getItem(TOKEN_KEY) ?? "");

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [developerName, setDeveloperName] = useState(getInitialName);
  const [draftName, setDraftName] = useState(getInitialName);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [token, setToken] = useState(getInitialToken);
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [accountRole, setAccountRole] = useState<"OWNER" | "MANAGER" | "SALES">("OWNER");

  const toggleLocale = () => {
    const nextLocale = locale === "ru" ? "uz" : "ru";
    fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: nextLocale }),
    }).finally(() => {
      router.refresh();
    });
  };

  useEffect(() => {
    const hasSeenOnboarding = window.localStorage.getItem("oson_uy_onboarding_seen");
    if (!hasSeenOnboarding && developerName && token) {
      setShowOnboarding(true);
    }
  }, [developerName, token]);

  const closeOnboarding = () => {
    setShowOnboarding(false);
    window.localStorage.setItem("oson_uy_onboarding_seen", "true");
  };

  const saveName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void (async () => {
      try {
        setError(null);
        const endpoint = isRegister ? "register" : "login";
        const data = await apiFetch<{
          token: string;
          developer: { name: string };
        }>(`/auth/${endpoint}`, {
          method: "POST",
          body: JSON.stringify(
            isRegister
              ? { name: draftName.trim(), email: email.trim(), password }
              : { email: email.trim(), password },
          ),
        });
        window.localStorage.setItem(STORAGE_KEY, data.developer.name);
        window.localStorage.setItem(TOKEN_KEY, data.token);
        setDeveloperName(data.developer.name);
        setToken(data.token);
        setCheckingSession(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка авторизации");
      }
    })();
  };

  const logout = () => {
    clearSession();
    setDeveloperName("");
    setToken("");
    setCheckingSession(false);
    setIsSidebarOpen(false);
  };

  useEffect(() => {
    void (async () => {
      if (!token) {
        setCheckingSession(false);
        return;
      }
      try {
        await apiFetch<{ developerId: number }>("/auth/me");
        // роль аккаунта → адаптируем навигацию под сотрудника
        const dev = await apiFetch<{ accountRole?: "OWNER" | "MANAGER" | "SALES" }>(
          "/developers",
        );
        if (dev.accountRole) setAccountRole(dev.accountRole);
      } catch (err) {
        if (err instanceof ApiAuthError) {
          logout();
        }
      } finally {
        setCheckingSession(false);
      }
    })();
  }, [token]);

  // Пункты меню с уровнем доступа: sales — минимум, manager — без биллинга, owner — всё
  const ALL_NAV = [
    { name: t("nav.dashboard"), href: "/dashboard", icon: LayoutDashboard, min: "SALES" },
    { name: t("nav.leads"), href: "/dashboard/leads", icon: Users, min: "SALES" },
    { name: t("nav.projects"), href: "/dashboard/projects", icon: Building2, min: "SALES" },
    { name: t("nav.progress"), href: "/dashboard/progress", icon: CheckCircle2, min: "MANAGER" },
    { name: t("nav.floors"), href: "/dashboard/floors", icon: Layers, min: "MANAGER" },
    { name: t("nav.subscriptions"), href: "/dashboard/subscriptions", icon: CreditCard, min: "OWNER" },
    { name: t("nav.profile"), href: "/dashboard/profile", icon: UserCircle, min: "OWNER" },
  ] as const;
  const RANK: Record<string, number> = { SALES: 0, MANAGER: 1, OWNER: 2 };
  const navItems = ALL_NAV.filter((i) => RANK[accountRole] >= RANK[i.min]);
  const roleLabel =
    accountRole === "SALES"
      ? "Отдел продаж"
      : accountRole === "MANAGER"
        ? "Менеджер"
        : t("common.developer");

  const sidebarClass = `fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-100 shadow-2xl transition-transform duration-300 transform md:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col md:flex-row">
      {/* Sidebar Desktop & Mobile */}
      <aside className={sidebarClass}>
        <div className="flex h-full min-h-0 flex-col">
          {/* Logo Section */}
          <div className="shrink-0 p-8">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="bg-[#1E3A8A] p-2.5 rounded-2xl shadow-lg shadow-blue-900/20 text-white">
                <Building className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-black text-[#1E3A8A] leading-tight">Oson <span className="text-[#F97316]">Uy</span></h1>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dashboard</p>
              </div>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`flex items-center gap-4 px-5 py-4 rounded-2xl font-bold text-sm transition-all group ${
                    isActive 
                      ? "bg-[#1E3A8A] text-white shadow-xl shadow-blue-900/20" 
                      : "text-slate-500 hover:bg-slate-50 hover:text-[#1E3A8A]"
                  }`}
                >
                  <item.icon className={`h-5 w-5 ${isActive ? "text-white" : "text-slate-400 group-hover:text-[#1E3A8A]"}`} />
                  {item.name}
                </Link>
              );
            })}
            <button
              onClick={() => {
                setShowOnboarding(true);
                setIsSidebarOpen(false);
              }}
              className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-bold text-sm text-slate-500 hover:bg-slate-50 hover:text-[#1E3A8A] transition-all group"
            >
              <Info className="h-5 w-5 text-slate-400 group-hover:text-[#1E3A8A]" />
              {t("nav.onboarding")}
            </button>
            <button
              onClick={toggleLocale}
              className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-bold text-sm text-slate-500 hover:bg-slate-50 hover:text-[#3C55BE] transition-all group"
            >
              <CiGlobe className="h-5 w-5 text-slate-400 group-hover:text-[#3C55BE]" />
              {locale === "ru" ? "O'zbekcha" : "Русский"}
            </button>
          </nav>

          {/* Bottom Section */}
          <div className="shrink-0 border-t border-slate-50 p-4">
            <div className="bg-slate-50 rounded-[2rem] p-6 space-y-4">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{roleLabel}</p>
                <p className="text-sm font-bold text-slate-900 truncate">{developerName || "—"}</p>
              </div>
              <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 py-3 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 hover:border-red-100 transition-all"
              >
                <LogOut className="h-4 w-4" />
                {t("common.logout")}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay Mobile */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:ml-72 min-h-screen">
        {/* Top Header Mobile */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-100 bg-white/80 px-4 py-4 backdrop-blur md:hidden">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-[#1E3A8A] p-1.5 text-white">
              <Building className="h-4 w-4" />
            </div>
            <span className="font-black text-[#1E3A8A]">Oson Uy</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={logout}
              className="rounded-xl border border-slate-100 bg-slate-50 p-2 text-red-500 transition-colors hover:bg-red-50"
              aria-label={t("common.logout")}
              title={t("common.logout")}
            >
              <LogOut className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="rounded-xl border border-slate-100 bg-slate-50 p-2 text-slate-600"
              aria-label="Menu"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </header>

        {/* Content Container */}
        <main className="mx-auto w-full max-w-7xl px-4 py-6 md:p-12">
          {!checkingSession && developerName && token ? children : null}
        </main>
      </div>

      {/* Auth Modal */}
      {!checkingSession && (!developerName || !token) ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0F172A]/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-white/20 animate-in zoom-in-95 duration-300">
            <div className="bg-[#1E3A8A] p-10 text-center text-white relative">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <Building className="h-32 w-32" />
              </div>
              <h2 className="text-3xl font-black uppercase italic tracking-tight">
                {isRegister ? t("auth.registerTitle") : t("auth.loginTitle")}
              </h2>
              <p className="mt-2 text-blue-100/60 font-bold uppercase text-[10px] tracking-[0.2em]">
                {t("common.title")}
              </p>
            </div>
            
            <form onSubmit={saveName} className="p-10 space-y-6">
              {error && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-bold text-center italic">
                  {error}
                </div>
              )}
              
              <div className="space-y-4">
                {isRegister && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t("auth.company")}</label>
                    <input
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      placeholder="OOO Grand Build"
                      className="h-14 w-full rounded-2xl bg-slate-50 border border-slate-100 px-6 text-sm font-bold outline-none ring-blue-600/10 focus:ring-4 focus:bg-white focus:border-blue-600 transition-all text-black"
                      required
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t("auth.email")}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="email@example.com"
                    className="h-14 w-full rounded-2xl bg-slate-50 border border-slate-100 px-6 text-sm font-bold outline-none ring-blue-600/10 focus:ring-4 focus:bg-white focus:border-blue-600 transition-all text-black"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t("auth.password")}</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••"
                      autoComplete={isRegister ? "new-password" : "current-password"}
                      className="h-14 w-full rounded-2xl border border-slate-100 bg-slate-50 py-0 pl-6 pr-14 text-sm font-bold text-black outline-none ring-blue-600/10 transition-all focus:border-blue-600 focus:bg-white focus:ring-4"
                      required
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="h-16 w-full rounded-2xl bg-[#F97316] text-white font-black uppercase tracking-widest shadow-xl shadow-orange-900/20 hover:bg-orange-600 transition-all active:scale-[0.98]"
              >
                {isRegister ? t("auth.registerBtn") : t("auth.loginBtn")}
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError(null);
                }}
                className="w-full text-center text-xs font-bold text-slate-400 hover:text-[#1E3A8A] transition-colors"
              >
                {isRegister ? t("auth.toggleLogin") : t("auth.toggleRegister")}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <AnimatePresence>
        {showOnboarding && <Onboarding onClose={closeOnboarding} />}
      </AnimatePresence>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  ArrowLeft,
  LayoutGrid,
  Grid3x3,
  Users,
  FileText,
  Wallet,
  Box,
  BarChart2,
  Shield,
  Lock,
  Loader2,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { membersApi, MemberMe, PermKey } from "@/lib/crm-api";
import { hasUltimateWorkspaceAccess } from "@/lib/subscription-access";

type Tab = {
  seg: string;
  label: string;
  icon: typeof LayoutGrid;
  perm?: PermKey;
  ultra?: boolean;
};

const TABS: Tab[] = [
  { seg: "", label: "Обзор", icon: LayoutGrid },
  { seg: "chessboard", label: "Шахматка", icon: Grid3x3, perm: "chessboard", ultra: true },
  { seg: "customers", label: "Клиенты", icon: Users, perm: "customers", ultra: true },
  { seg: "contracts", label: "Договоры", icon: FileText, perm: "contracts", ultra: true },
  { seg: "finance", label: "Финансы", icon: Wallet, perm: "finance", ultra: true },
  { seg: "scene3d", label: "3D-модель", icon: Box, perm: "scene3d", ultra: true },
  { seg: "reports", label: "Отчёты", icon: BarChart2, perm: "reports", ultra: true },
  { seg: "team", label: "Команда", icon: Shield, perm: "team" },
];

export default function ProjectWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const projectId = Number(params.id);
  const pathname = usePathname();
  const base = `/dashboard/projects/${projectId}`;

  const [name, setName] = useState("");
  const [ultra, setUltra] = useState(false);
  const [me, setMe] = useState<MemberMe | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [proj, meRes] = await Promise.all([
        apiFetch<{ name: string; subscription?: { plan: string; status: string } }>(
          `/projects/${projectId}`,
        ),
        membersApi.me(projectId).catch(() => null),
      ]);
      setName(proj.name);
      setUltra(hasUltimateWorkspaceAccess(proj.subscription));
      setMe(meRes);
    } catch {
      /* ignore — child page shows its own error */
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeSeg = (() => {
    if (pathname === base) return "";
    const rest = pathname.slice(base.length + 1);
    return rest.split("/")[0];
  })();

  const roleColor: Record<string, string> = {
    OWNER: "bg-[#1E3A8A] text-white",
    ADMIN: "bg-[#1E3A8A] text-white",
    MANAGER: "bg-blue-100 text-blue-700",
    SALES: "bg-orange-100 text-orange-700",
  };

  return (
    <div className="space-y-5">
      {/* Workspace header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/projects"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:text-[#1E3A8A]"
          aria-label="Все проекты"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Рабочая область проекта
          </p>
          <h1 className="truncate text-lg font-black text-slate-900">
            {loading ? "Загрузка…" : name || "Проект"}
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {me && (
            <span
              className={`rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wide ${
                roleColor[me.role] ?? "bg-slate-100 text-slate-600"
              }`}
            >
              {me.roleLabel}
            </span>
          )}
          {!ultra && !loading && (
            <span className="rounded-full bg-amber-100 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-amber-700">
              Тариф не Ultra
            </span>
          )}
        </div>
      </div>

      {/* Tab nav */}
      <div className="-mx-1 overflow-x-auto pb-1">
        <div className="flex min-w-max items-center gap-1.5 px-1">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Загрузка навигации…
            </div>
          ) : (
            TABS.map((tab) => {
              // видимость: право есть (или таб без права) — иначе скрываем
              const allowed = !tab.perm || (me?.permissions[tab.perm] ?? false);
              if (!allowed) return null;
              const locked = tab.ultra === true && !ultra;
              const href = locked
                ? "/dashboard/subscriptions"
                : `${base}${tab.seg ? "/" + tab.seg : ""}`;
              const isActive = !locked && activeSeg === tab.seg;
              const Icon = locked ? Lock : tab.icon;
              return (
                <Link
                  key={tab.seg || "overview"}
                  href={href}
                  className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-[13px] font-bold transition ${
                    isActive
                      ? "bg-[#1E3A8A] text-white shadow-lg shadow-blue-900/20"
                      : locked
                        ? "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                        : "border border-slate-200 bg-white text-slate-600 hover:border-[#1E3A8A] hover:text-[#1E3A8A]"
                  }`}
                  title={locked ? "Доступно на тарифе Ultra" : tab.label}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </Link>
              );
            })
          )}
        </div>
      </div>

      {/* Child page */}
      <div>{children}</div>
    </div>
  );
}

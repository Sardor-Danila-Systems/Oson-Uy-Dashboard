"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Grid3x3,
  Users,
  FileText,
  Wallet,
  Box,
  BarChart2,
  Shield,
  ListChecks,
  ArrowRight,
  Lock,
  Loader2,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { membersApi, MemberMe, PermKey } from "@/lib/crm-api";
import { hasUltimateWorkspaceAccess } from "@/lib/subscription-access";

type Card = {
  seg: string;
  label: string;
  desc: string;
  icon: typeof Grid3x3;
  perm?: PermKey;
  ultra?: boolean;
  color: string;
  external?: string;
};

const CARDS: Card[] = [
  { seg: "chessboard", label: "Шахматка", desc: "Квартиры, статусы, бронь", icon: Grid3x3, perm: "chessboard", ultra: true, color: "text-blue-600 bg-blue-50" },
  { seg: "customers", label: "Клиенты", desc: "CRM: покупатели и коды", icon: Users, perm: "customers", ultra: true, color: "text-violet-600 bg-violet-50" },
  { seg: "contracts", label: "Договоры", desc: "Оформление и график оплат", icon: FileText, perm: "contracts", ultra: true, color: "text-indigo-600 bg-indigo-50" },
  { seg: "finance", label: "Финансы", desc: "Кассы, расходы, долги", icon: Wallet, perm: "finance", ultra: true, color: "text-emerald-600 bg-emerald-50" },
  { seg: "scene3d", label: "3D-модель", desc: "Загрузка и публикация", icon: Box, perm: "scene3d", ultra: true, color: "text-cyan-600 bg-cyan-50" },
  { seg: "reports", label: "Отчёты", desc: "Аналитика и выгрузки", icon: BarChart2, perm: "reports", ultra: true, color: "text-orange-600 bg-orange-50" },
  { seg: "team", label: "Команда", desc: "Сотрудники, роли и права", icon: Shield, perm: "team", color: "text-slate-700 bg-slate-100" },
];

export default function ProjectOverview() {
  const params = useParams();
  const projectId = Number(params.id);
  const base = `/dashboard/projects/${projectId}`;

  const [ultra, setUltra] = useState(false);
  const [me, setMe] = useState<MemberMe | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [proj, meRes] = await Promise.all([
        apiFetch<{ subscription?: { plan: string; status: string } }>(
          `/projects/${projectId}`,
        ),
        membersApi.me(projectId).catch(() => null),
      ]);
      setUltra(hasUltimateWorkspaceAccess(proj.subscription));
      setMe(meRes);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <Loader2 className="h-9 w-9 animate-spin text-[#1E3A8A]" />
      </div>
    );
  }

  const visible = CARDS.filter((c) => !c.perm || (me?.permissions[c.perm] ?? false));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((c) => {
          const locked = c.ultra === true && !ultra;
          const href = locked ? "/dashboard/subscriptions" : `${base}/${c.seg}`;
          const Icon = locked ? Lock : c.icon;
          return (
            <Link
              key={c.seg}
              href={href}
              className="group relative flex flex-col gap-3 rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${locked ? "bg-amber-50 text-amber-600" : c.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-base font-black text-slate-900">
                  {c.label}
                  {locked && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase text-amber-700">
                      Ultra
                    </span>
                  )}
                </p>
                <p className="text-[13px] font-medium text-slate-500">{c.desc}</p>
              </div>
              <ArrowRight className="absolute right-5 top-5 h-4 w-4 text-slate-300 transition group-hover:translate-x-1 group-hover:text-[#1E3A8A]" />
            </Link>
          );
        })}

        {/* Прогресс строительства — общий раздел с фильтром по проекту */}
        <Link
          href={`/dashboard/progress?projectId=${projectId}`}
          className="group relative flex flex-col gap-3 rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
            <ListChecks className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-black text-slate-900">Ход строительства</p>
            <p className="text-[13px] font-medium text-slate-500">Этапы и прогресс объекта</p>
          </div>
          <ArrowRight className="absolute right-5 top-5 h-4 w-4 text-slate-300 transition group-hover:translate-x-1 group-hover:text-[#1E3A8A]" />
        </Link>
      </div>

      {me && me.role !== "OWNER" && me.role !== "ADMIN" && (
        <p className="rounded-2xl border border-slate-100 bg-white px-4 py-3 text-[13px] font-medium text-slate-500">
          Вы вошли как <b className="text-slate-800">{me.roleLabel}</b>. Разделы,
          к которым нет доступа, скрыты. Обратитесь к администратору, если нужен
          доступ.
        </p>
      )}
    </div>
  );
}

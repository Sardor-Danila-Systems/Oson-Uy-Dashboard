"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Loader2,
  Shield,
  UserPlus,
  Trash2,
  ChevronDown,
  Copy,
  Check,
  KeyRound,
} from "lucide-react";
import {
  membersApi,
  MemberMe,
  TeamMember,
  MembersCatalog,
  MemberRole,
  PermKey,
  PermMap,
} from "@/lib/crm-api";

const ROLE_STYLE: Record<MemberRole, string> = {
  OWNER: "bg-[#1E3A8A] text-white",
  ADMIN: "bg-indigo-100 text-indigo-700",
  MANAGER: "bg-blue-100 text-blue-700",
  SALES: "bg-orange-100 text-orange-700",
};
const ASSIGNABLE: MemberRole[] = ["ADMIN", "MANAGER", "SALES"];

export default function TeamPage() {
  const params = useParams();
  const projectId = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [me, setMe] = useState<MemberMe | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [catalog, setCatalog] = useState<MembersCatalog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // invite form
  const [invName, setInvName] = useState("");
  const [invEmail, setInvEmail] = useState("");
  const [invRole, setInvRole] = useState<MemberRole>("SALES");
  const [inviting, setInviting] = useState(false);
  const [invResult, setInvResult] = useState<{ email: string; pass: string } | null>(null);

  const flash = (m: string) => {
    setNotice(m);
    setTimeout(() => setNotice(null), 2600);
  };

  const load = useCallback(async () => {
    try {
      const meRes = await membersApi.me(projectId);
      setMe(meRes);
      if (!meRes.permissions.team) {
        setDenied(true);
        return;
      }
      const [list, cat] = await Promise.all([
        membersApi.list(projectId),
        membersApi.catalog(projectId),
      ]);
      setMembers(list);
      setCatalog(cat);
    } catch {
      setDenied(true);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invEmail.trim()) return;
    setInviting(true);
    setInvResult(null);
    try {
      const res = await membersApi.invite(projectId, {
        name: invName.trim() || undefined,
        email: invEmail.trim(),
        role: invRole,
      });
      setInvName("");
      setInvEmail("");
      if (res.tempPassword) {
        setInvResult({ email: res.developer.email ?? invEmail, pass: res.tempPassword });
      } else {
        flash("Существующий сотрудник добавлен в проект");
      }
      setMembers(await membersApi.list(projectId));
    } catch (err) {
      flash(err instanceof Error ? err.message : "Не удалось пригласить");
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (m: TeamMember, role: MemberRole) => {
    await membersApi.updateRole(projectId, m.id, role);
    setMembers(await membersApi.list(projectId));
    flash(`Роль изменена: ${m.developer.name} → ${role}`);
  };

  const togglePerm = async (m: TeamMember, key: PermKey) => {
    const next: PermMap = { ...m.permissions, [key]: !m.permissions[key] };
    // оптимистично
    setMembers((prev) =>
      prev.map((x) => (x.id === m.id ? { ...x, permissions: next, hasOverrides: true } : x)),
    );
    await membersApi.updatePermissions(projectId, m.id, next);
  };

  const remove = async (m: TeamMember) => {
    if (!confirm(`Убрать ${m.developer.name} из проекта?`)) return;
    await membersApi.remove(projectId, m.id);
    setMembers((prev) => prev.filter((x) => x.id !== m.id));
    flash("Сотрудник убран из проекта");
  };

  if (loading) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <Loader2 className="h-9 w-9 animate-spin text-[#1E3A8A]" />
      </div>
    );
  }

  if (denied) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-5 py-16 text-center">
        <Shield className="h-11 w-11 text-slate-300" />
        <h2 className="text-xl font-black text-slate-800">Недостаточно прав</h2>
        <p className="text-sm font-medium text-slate-500">
          Управление командой доступно администраторам проекта. Обратитесь к
          владельцу аккаунта.
        </p>
        <Link href={`/dashboard/projects/${projectId}`} className="text-sm font-bold text-[#1E3A8A] hover:underline">
          ← В рабочую область
        </Link>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-[#1E3A8A]";
  const labelCls = "block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5";

  return (
    <div className="space-y-6">
      {notice && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          {notice}
        </div>
      )}

      {/* Invite */}
      <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
        <p className="mb-4 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[#1E3A8A]">
          <UserPlus className="h-4 w-4" /> Пригласить сотрудника
        </p>
        <form onSubmit={invite} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelCls}>Имя</label>
            <input className={inputCls} value={invName} onChange={(e) => setInvName(e.target.value)} placeholder="Эзоза Рахимова" />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input className={inputCls} type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder="ezoza@company.uz" required />
          </div>
          <div>
            <label className={labelCls}>Роль</label>
            <select className={inputCls} value={invRole} onChange={(e) => setInvRole(e.target.value as MemberRole)}>
              {ASSIGNABLE.map((r) => (
                <option key={r} value={r}>
                  {catalog?.roles.find((x) => x.role === r)?.label ?? r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={inviting}
              className="h-[42px] w-full rounded-xl bg-[#F97316] text-sm font-black text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {inviting ? "…" : "Пригласить"}
            </button>
          </div>
        </form>

        {invResult && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
            <KeyRound className="h-5 w-5 shrink-0 text-[#1E3A8A]" />
            <div className="text-sm font-medium text-slate-700">
              Аккаунт создан. Передайте сотруднику для первого входа:
              <br />
              <b className="text-slate-900">{invResult.email}</b> · пароль{" "}
              <b className="font-mono text-[#1E3A8A]">{invResult.pass}</b>
            </div>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(`${invResult.email} / ${invResult.pass}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:text-[#1E3A8A]"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Скопировано" : "Копировать"}
            </button>
          </div>
        )}
      </div>

      {/* Members */}
      <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h3 className="text-sm font-black text-slate-900">
            Команда проекта · {members.length}
          </h3>
        </div>
        <div className="divide-y divide-slate-50">
          {members.map((m) => (
            <div key={m.id}>
              <div className="flex flex-wrap items-center gap-3 px-6 py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1E3A8A]/10 text-sm font-black text-[#1E3A8A]">
                  {m.developer.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-black text-slate-900">
                    {m.developer.name}
                    {m.isYou && <span className="ml-2 text-[11px] font-bold text-slate-400">(вы)</span>}
                  </p>
                  <p className="text-xs text-slate-400">{m.developer.email ?? "—"}</p>
                </div>

                <div className="ml-auto flex items-center gap-2">
                  {m.role === "OWNER" ? (
                    <span className={`rounded-full px-3 py-1.5 text-[11px] font-black uppercase ${ROLE_STYLE.OWNER}`}>
                      Владелец
                    </span>
                  ) : (
                    <select
                      value={m.role}
                      onChange={(e) => void changeRole(m, e.target.value as MemberRole)}
                      className={`cursor-pointer rounded-full border-0 px-3 py-1.5 text-[11px] font-black uppercase outline-none ${ROLE_STYLE[m.role]}`}
                    >
                      {ASSIGNABLE.map((r) => (
                        <option key={r} value={r} className="bg-white text-slate-800">
                          {catalog?.roles.find((x) => x.role === r)?.label ?? r}
                        </option>
                      ))}
                    </select>
                  )}

                  {m.role !== "OWNER" && (
                    <button
                      onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-black text-slate-600 hover:text-[#1E3A8A]"
                    >
                      Права
                      <ChevronDown className={`h-3.5 w-3.5 transition ${expanded === m.id ? "rotate-180" : ""}`} />
                    </button>
                  )}

                  {m.role !== "OWNER" && !m.isYou && (
                    <button
                      onClick={() => void remove(m)}
                      className="rounded-xl p-2 text-slate-300 hover:bg-red-50 hover:text-red-500"
                      title="Убрать из проекта"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {expanded === m.id && m.role !== "OWNER" && catalog && (
                <div className="border-t border-slate-50 bg-slate-50/60 px-6 py-4">
                  <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Права доступа {m.hasOverrides && <span className="text-amber-600">· индивидуальные</span>}
                  </p>
                  <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {catalog.permissions.map((p) => (
                      <label
                        key={p.key}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                      >
                        <button
                          type="button"
                          onClick={() => void togglePerm(m, p.key)}
                          className={`relative h-5 w-9 shrink-0 rounded-full transition ${m.permissions[p.key] ? "bg-emerald-500" : "bg-slate-300"}`}
                        >
                          <span
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${m.permissions[p.key] ? "left-[18px]" : "left-0.5"}`}
                          />
                        </button>
                        <span className="text-[13px] font-bold text-slate-700">{p.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Roles legend */}
      {catalog && (
        <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-black text-slate-900">Что могут роли по умолчанию</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="py-2 pr-4">Право</th>
                  {catalog.roles.map((r) => (
                    <th key={r.role} className="px-3 py-2 text-center">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] ${ROLE_STYLE[r.role]}`}>{r.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {catalog.permissions.map((p) => (
                  <tr key={p.key}>
                    <td className="py-2.5 pr-4 font-bold text-slate-700">{p.label}</td>
                    {catalog.roles.map((r) => (
                      <td key={r.role} className="px-3 py-2.5 text-center">
                        {r.defaults[p.key] ? (
                          <Check className="mx-auto h-4 w-4 text-emerald-500" />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  Loader2,
  Upload,
  Trash2,
  FileText,
  Copy,
  Check,
  Info,
} from "lucide-react";
import {
  templatesApi,
  ContractTemplate,
  TemplateType,
  TemplateVariable,
} from "@/lib/crm-api";

interface Props {
  projectId: number;
  onClose: () => void;
}

const TYPE_LABEL: Record<TemplateType, string> = {
  CONTRACT: "Договор",
  GUARANTEE_LETTER: "Гарантийное письмо",
  PAYMENT_SCHEDULE: "График платежей",
};

const LANG_LABEL: Record<string, string> = {
  uz: "Узбекский (латиница)",
  uz_cyrillic: "Узбекский (кириллица)",
  ru: "Русский",
};

export default function ContractTemplatesModal({ projectId, onClose }: Props) {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<TemplateType>("CONTRACT");
  const [language, setLanguage] = useState("uz");
  const [isDefault, setIsDefault] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, vars] = await Promise.all([
        templatesApi.list(projectId),
        templatesApi.variables(projectId),
      ]);
      setTemplates(list);
      setVariables(vars);
    } catch {
      setError("Не удалось загрузить шаблоны");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Выберите файл .docx");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await templatesApi.upload(projectId, file, {
        name: name.trim() || undefined,
        type,
        language,
        isDefault,
      });
      setName("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки шаблона");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (id: number) => {
    if (!confirm("Удалить шаблон?")) return;
    try {
      await templatesApi.remove(projectId, id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      setError("Не удалось удалить шаблон");
    }
  };

  const copyVar = async (key: string) => {
    try {
      await navigator.clipboard.writeText(`{${key}}`);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      /* ignore */
    }
  };

  const inputCls =
    "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/15 transition";
  const labelCls =
    "block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5";

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-900">
              Шаблоны документов
            </h2>
            <p className="text-xs font-bold text-slate-400">
              Загрузите образцы .docx — договоры будут заполняться по данным
              покупателя
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {error && (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
              {error}
            </div>
          )}

          {/* Upload form */}
          <form
            onSubmit={handleUpload}
            className="rounded-2xl border border-slate-100 bg-slate-50/80 p-5 space-y-4"
          >
            <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#1E3A8A]">
              <Upload className="h-3.5 w-3.5" /> Загрузить шаблон
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Тип документа</label>
                <select
                  className={inputCls}
                  value={type}
                  onChange={(e) => setType(e.target.value as TemplateType)}
                >
                  {(Object.keys(TYPE_LABEL) as TemplateType[]).map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Язык</label>
                <select
                  className={inputCls}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  {Object.keys(LANG_LABEL).map((l) => (
                    <option key={l} value={l}>
                      {LANG_LABEL[l]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Название (необязательно)</label>
                <input
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Например: Договор купли-продажи"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Файл .docx</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs font-medium text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-[#1E3A8A] file:px-4 file:py-2 file:text-xs file:font-black file:uppercase file:tracking-widest file:text-white hover:file:bg-[#172554]"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A]"
              />
              Использовать по умолчанию для этого типа и языка
            </label>
            <button
              type="submit"
              disabled={uploading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F97316] py-3 text-sm font-black text-white hover:bg-orange-600 disabled:opacity-50 transition"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading ? "Загрузка…" : "Загрузить"}
            </button>
          </form>

          {/* Existing templates */}
          <div>
            <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-slate-500">
              Загруженные шаблоны
            </p>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-7 w-7 animate-spin text-[#1E3A8A]" />
              </div>
            ) : templates.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                Шаблоны ещё не загружены
              </p>
            ) : (
              <ul className="space-y-2">
                {templates.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3"
                  >
                    <FileText className="h-5 w-5 shrink-0 text-[#1E3A8A]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-slate-900">
                        {t.name}
                        {t.isDefault && (
                          <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700">
                            По умолчанию
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">
                        {TYPE_LABEL[t.type]} · {LANG_LABEL[t.language] ?? t.language}
                      </p>
                    </div>
                    <a
                      href={t.templateUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50"
                    >
                      Открыть
                    </a>
                    <button
                      onClick={() => handleRemove(t.id)}
                      className="rounded-xl p-2 text-slate-300 hover:bg-red-50 hover:text-red-500 transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Variables help */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#1E3A8A]">
              <Info className="h-3.5 w-3.5" /> Доступные переменные
            </p>
            <p className="mb-3 text-xs font-medium text-slate-600">
              Вставьте эти метки в ваш .docx (с фигурными скобками). При скачивании
              они заменятся данными договора. Нажмите, чтобы скопировать.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {variables.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  title={v.label}
                  onClick={() => copyVar(v.key)}
                  className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:border-[#1E3A8A]"
                >
                  {copiedKey === v.key ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Copy className="h-3 w-3 text-slate-300" />
                  )}
                  {`{${v.key}}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

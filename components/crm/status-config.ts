import type { ApartmentStatus } from "@/lib/crm-api";

export const STATUS_CONFIG: Record<
  ApartmentStatus,
  { label: string; bg: string; text: string; ring: string }
> = {
  AVAILABLE:   { label: "Свободна",      bg: "bg-emerald-500", text: "text-white", ring: "ring-emerald-500" },
  RESERVED:    { label: "Забронирована", bg: "bg-amber-400",   text: "text-white", ring: "ring-amber-400"   },
  SOLD:        { label: "Продана",       bg: "bg-red-500",     text: "text-white", ring: "ring-red-500"     },
  INSTALLMENT: { label: "В рассрочке",  bg: "bg-blue-500",    text: "text-white", ring: "ring-blue-500"    },
  MORTGAGE:    { label: "В ипотеке",    bg: "bg-purple-500",  text: "text-white", ring: "ring-purple-500"  },
  UNAVAILABLE: { label: "Недоступна",   bg: "bg-slate-400",   text: "text-white", ring: "ring-slate-400"   },
};

export const STATUS_ALL = Object.keys(STATUS_CONFIG) as ApartmentStatus[];

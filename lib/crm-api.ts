import { apiFetch } from "./api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ApartmentStatus =
  | "AVAILABLE"
  | "RESERVED"
  | "SOLD"
  | "INSTALLMENT"
  | "MORTGAGE"
  | "UNAVAILABLE";

export type ContractStatus = "ACTIVE" | "BOOKED" | "COMPLETED" | "CANCELED";
export type PaymentMethod = "CASH" | "INSTALLMENT" | "MORTGAGE" | "FULL";
export type RenovationState =
  | "WITHOUT_RENOVATION"
  | "WITH_RENOVATION"
  | "DESIGNER_RENOVATION";
export type ApartmentClass = "ECONOMY" | "COMFORT" | "BUSINESS" | "PREMIUM";
export type CustomerPaymentType = "DEPOSIT" | "INSTALLMENT" | "FULL" | "OTHER";

export interface Apartment {
  id: number;
  number: string;
  floor: number;
  sectionKey: string;
  rooms: number;
  areaSqm: number;
  priceUzs: number | null;
  pricePerM2Uzs: number | null;
  status: ApartmentStatus;
  renovationState: RenovationState;
  apartmentClass: ApartmentClass;
  layoutImageUrl: string | null;
  model3dUrl: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  passportSeries: string | null;
  passportNumber: string | null;
  passportIssuedBy: string | null;
  passportIssuedAt: string | null;
  pinfl: string | null;
  birthDate: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  email: string | null;
  accessCode: string;
}

export interface PaymentScheduleItem {
  id: number;
  dueDate: string;
  amountUzs: string;
  isPaid: boolean;
  paidAt: string | null;
  sortOrder: number;
}

export interface ContractPayment {
  id: number;
  amountUzs: string;
  paidAt: string;
  type: CustomerPaymentType;
  comment: string | null;
  receiptUrl: string | null;
  createdAt: string;
}

export interface ContractApartment {
  id: number;
  number: string;
  floor: number;
  sectionKey: string;
  rooms: number;
  areaSqm: number;
  priceUzs: number | null;
  pricePerM2Uzs: number | null;
  renovationState: RenovationState;
  layoutImageUrl: string | null;
  status: ApartmentStatus;
  project: { id: number; name: string };
}

export interface Contract {
  id: number;
  number: string;
  status: ContractStatus;
  paymentMethod: PaymentMethod;
  totalPriceUzs: string;
  discountPercent: number;
  firstPaymentUzs: string;
  termMonths: number;
  monthlyAmountUzs: string | null;
  contractDate: string;
  notes: string | null;
  paidUzs: string;
  remainingUzs: string;
  debtUzs?: string;
  apartment: ContractApartment;
  customer: Customer;
  manager: { id: number; name: string; phone: string | null } | null;
  broker: { id: number; name: string; phone: string | null } | null;
  payments: ContractPayment[];
  paymentSchedule: PaymentScheduleItem[];
}

export type ContractListItem = Omit<Contract, "paymentSchedule" | "debtUzs">;

export interface ContractListResponse {
  items: ContractListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ProjectStats {
  totalSalesUzs: string;
  totalCollectedUzs: string;
  totalDebtUzs: string;
  contractsCount: number;
  apartmentsByStatus: Partial<Record<ApartmentStatus, number>>;
  salesByManager: {
    managerId: number;
    name: string;
    count: number;
    totalUzs: string;
  }[];
}

export interface ForecastItem {
  month: string;
  amountUzs: string;
}

// ── Contracts ─────────────────────────────────────────────────────────────────

export const contractsApi = {
  list: (projectId: number, params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<ContractListResponse>(
      `/projects/${projectId}/contracts${qs}`,
    );
  },

  findOne: (projectId: number, id: number) =>
    apiFetch<Contract>(`/projects/${projectId}/contracts/${id}`),

  create: (projectId: number, body: object) =>
    apiFetch<Contract>(`/projects/${projectId}/contracts`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (projectId: number, id: number, body: object) =>
    apiFetch<Contract>(`/projects/${projectId}/contracts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  remove: (projectId: number, id: number) =>
    apiFetch<void>(`/projects/${projectId}/contracts/${id}`, {
      method: "DELETE",
    }),

  addPayment: (projectId: number, contractId: number, body: object) =>
    apiFetch<Contract>(
      `/projects/${projectId}/contracts/${contractId}/payments`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  removePayment: (
    projectId: number,
    contractId: number,
    paymentId: number,
  ) =>
    apiFetch<Contract>(
      `/projects/${projectId}/contracts/${contractId}/payments/${paymentId}`,
      { method: "DELETE" },
    ),

  stats: (projectId: number) =>
    apiFetch<ProjectStats>(`/projects/${projectId}/contracts/stats`),

  forecast: (projectId: number, months = 6) =>
    apiFetch<ForecastItem[]>(
      `/projects/${projectId}/contracts/forecast?months=${months}`,
    ),

  downloadUrl: (
    projectId: number,
    contractId: number,
    type: "contract" | "guarantee-letter" | "payment-schedule",
    lang: "uz" | "uz_cyrillic" | "ru" = "uz",
  ) => {
    const base =
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
    return `${base}/projects/${projectId}/contracts/${contractId}/documents/${type}?lang=${lang}`;
  },
};

// ── Apartments ────────────────────────────────────────────────────────────────

export const apartmentsApi = {
  list: (projectId: number, params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<{ items: Apartment[]; total: number }>(
      `/projects/${projectId}/apartments${qs}`,
    );
  },

  findOne: (projectId: number, id: number) =>
    apiFetch<Apartment>(`/projects/${projectId}/apartments/${id}`),

  update: (projectId: number, id: number, body: object) =>
    apiFetch<Apartment>(`/projects/${projectId}/apartments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};

// ── Customers ─────────────────────────────────────────────────────────────────

export const customersApi = {
  list: (projectId: number, params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<{ items: Customer[]; total: number }>(
      `/projects/${projectId}/customers${qs}`,
    );
  },

  create: (projectId: number, body: object) =>
    apiFetch<Customer>(`/projects/${projectId}/customers`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (projectId: number, id: number, body: object) =>
    apiFetch<Customer>(`/projects/${projectId}/customers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};

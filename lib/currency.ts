export const formatMoneyInput = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

export const parseMoneyInput = (masked: string) =>
  Number(masked.replace(/\s/g, "")) || 0;

export const formatUzs = (value: number) =>
  `${Math.round(value).toLocaleString("ru-RU")} сум`;

export const formatUzsPerM2 = (value: number) =>
  `${Math.round(value).toLocaleString("ru-RU")} сум/м²`;

/** Default label shown when a developer hasn't set a price. */
export const NEGOTIABLE_PRICE_LABEL = "Цена договорная";

/** Price per m² or a "negotiable" label when the price is not set (null/0). */
export const formatUzsPerM2OrNegotiable = (
  value: number | null | undefined,
  negotiableLabel: string = NEGOTIABLE_PRICE_LABEL,
) => (value && value > 0 ? formatUzsPerM2(value) : negotiableLabel);

/** Total price or a "negotiable" label when the price is not set (null/0). */
export const formatUzsOrNegotiable = (
  value: number | null | undefined,
  negotiableLabel: string = NEGOTIABLE_PRICE_LABEL,
) => (value && value > 0 ? formatUzs(value) : negotiableLabel);

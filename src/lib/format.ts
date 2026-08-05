export const formatINR = (n: number | string | null | undefined) => {
  const v = typeof n === "string" ? parseFloat(n) : (n ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(v) ? v : 0);
};

// Always renders DD-MM-YYYY. Date-only strings (YYYY-MM-DD) are read as-is,
// without timezone shifting.
export const formatDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  if (typeof d === "string") {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

// Indian numbering-system amount in words for INR.
// e.g. 123456.78 → "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Seventy Eight Paise Only"
export function toIndianWordsINR(amount: number | string | null | undefined): string {
  const n = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  if (!Number.isFinite(n)) return "";
  const negative = n < 0;
  const abs = Math.abs(n);
  const rupees = Math.floor(abs);
  const paise = Math.round((abs - rupees) * 100);

  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const twoDigit = (num: number): string => {
    if (num < 20) return ones[num];
    const t = Math.floor(num / 10), o = num % 10;
    return tens[t] + (o ? " " + ones[o] : "");
  };
  const threeDigit = (num: number): string => {
    const h = Math.floor(num / 100), rest = num % 100;
    const parts: string[] = [];
    if (h) parts.push(ones[h] + " Hundred");
    if (rest) parts.push(twoDigit(rest));
    return parts.join(" ");
  };

  const inWords = (num: number): string => {
    if (num === 0) return "Zero";
    const crore = Math.floor(num / 10000000); num %= 10000000;
    const lakh = Math.floor(num / 100000); num %= 100000;
    const thousand = Math.floor(num / 1000); num %= 1000;
    const rest = num;
    const parts: string[] = [];
    if (crore) parts.push(twoDigit(crore) + " Crore");
    if (lakh) parts.push(twoDigit(lakh) + " Lakh");
    if (thousand) parts.push(twoDigit(thousand) + " Thousand");
    if (rest) parts.push(threeDigit(rest));
    return parts.join(" ").replace(/\s+/g, " ").trim();
  };

  const rupWords = inWords(rupees);
  let out = "Rupees " + rupWords;
  if (paise > 0) out += " and " + inWords(paise) + " Paise";
  out += " Only";
  return (negative ? "Minus " : "") + out;
}


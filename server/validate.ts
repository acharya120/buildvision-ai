export interface RegisterInput {
  name: string;
  email: string;
  phone: string;
  password: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const normEmail = (v: unknown): string => (typeof v === "string" ? v.trim().toLowerCase() : "");

export function validateRegister(raw: unknown): { ok: true; value: RegisterInput } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim().replace(/\s+/g, " ") : "";
  const email = normEmail(r.email);
  const phone = typeof r.phone === "string" ? r.phone.trim() : "";
  const password = typeof r.password === "string" ? r.password : "";
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Enter your full name (2 to 80 characters)." };
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, error: "Enter a valid email address." };
  const digits = phone.replace(/\D/g, "");
  if (!/^[+\d\s\-()]+$/.test(phone) || digits.length < 7 || digits.length > 15) return { ok: false, error: "Enter a valid phone number (7 to 15 digits, you may start with +)." };
  const pw = validatePassword(password);
  if (pw) return { ok: false, error: pw };
  return { ok: true, value: { name, email, phone, password } };
}

/** returns an error text, or null when fine */
export function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 128) return "Password is too long (128 characters at most).";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Password needs at least one letter and one number.";
  return null;
}

export const validCode = (v: unknown): string | null => (typeof v === "string" && /^\d{6}$/.test(v.trim()) ? v.trim() : null);

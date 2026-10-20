// Keeps what is private out of what goes to a cloud AI (Settings → AI & privacy → Privacy → "Hide from cloud AIs"). The
// words are swapped for a placeholder ([email], [phone], [card], [key]) before the message leaves; a local AI is never
// touched. It is a safety net, not magic: it knows the usual shapes of these things, nothing more.
const KEY_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|hf_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|gsk_[A-Za-z0-9]{20,}|xai-[A-Za-z0-9]{20,}|pplx-[A-Za-z0-9]{20,}|nvapi-[A-Za-z0-9_-]{20,}|csk-[A-Za-z0-9]{20,}|fw_[A-Za-z0-9]{20,})/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/g,
];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE = /(?<![\w.])\+?\(?\d[\d\s().-]{6,}\d(?![\w.])/g;
const CARD = /(?<![\w.])\d(?:[ -]?\d){12,18}(?![\w.])/g;

const digits = (text) => text.replace(/\D/g, "");

// The Luhn check that real card numbers pass
function luhn(number) {
  let sum = 0;
  let double = false;
  for (let i = number.length - 1; i >= 0; i--) {
    let d = Number(number[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// A piece of text with the chosen kinds hidden: options { keys, cards, emails, phones }
function redactText(text, options = {}) {
  let out = String(text ?? "");
  if (!out) return out;
  if (options.keys) for (const pattern of KEY_PATTERNS) out = out.replace(pattern, "[key]");
  if (options.cards) out = out.replace(CARD, (m) => (digits(m).length >= 13 && digits(m).length <= 19 && luhn(digits(m)) ? "[card]" : m));
  if (options.emails) out = out.replace(EMAIL, "[email]");
  if (options.phones) {
    out = out.replace(PHONE, (m) => {
      const n = digits(m).length;
      if (n < 8 || n > 15) return m;
      if (/^\d{4}-\d{2}-\d{2}/.test(m.trim()) || /^\d{1,3}(\.\d{1,3}){3}$/.test(m.trim())) return m; // a date, an address
      // a bare run of digits is a number (an amount, an id), not a phone number: it needs a plus sign or separators
      return /^\+/.test(m.trim()) || /[\s().-]/.test(m.trim()) ? "[phone]" : m;
    });
  }
  return out;
}

const active = (options) => Boolean(options && Object.values(options).some(Boolean));

// The same for anything made of strings (a tool's result)
function redactDeep(value, options) {
  if (typeof value === "string") return redactText(value, options);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, options));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v, options)]));
  return value;
}

// Gemini-shaped contents ({ role, parts: [{ text }] }): text parts are redacted, pictures and files are left alone
function redactContents(contents, options) {
  if (!active(options) || !Array.isArray(contents)) return contents;
  return contents.map((c) => ({ ...c, parts: (c.parts || []).map((p) => (typeof p.text === "string" ? { ...p, text: redactText(p.text, options) } : p)) }));
}

module.exports = { redactText, redactDeep, redactContents, active, luhn };

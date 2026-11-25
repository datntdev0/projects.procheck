/** Locale used to format dates in the UI language. */
export function dateLocale(lang: string): string {
  return lang === 'vi' ? 'vi-VN' : 'en-GB';
}

/** `25 Nov 2026`; empty for a missing or invalid date. */
export function formatDate(iso: string | null | undefined, lang: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(dateLocale(lang), { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

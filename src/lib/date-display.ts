/**
 * iAssetsPro display-only date policy.
 * Day comes FIRST, in every browser locale: DD/MM/YYYY or DD-MM-YYYY.
 * API, database, <input type="date"> and datetime-local values remain ISO.
 */
export type DayFirstDateFormat = 'DD/MM/YYYY' | 'DD-MM-YYYY';

export function normalizeDayFirstDateFormat(input?: string | null): DayFirstDateFormat {
  return input === 'DD-MM-YYYY' || input === 'dd-MM-yyyy' ? 'DD-MM-YYYY' : 'DD/MM/YYYY';
}

export function getDayFirstDateFormat(): DayFirstDateFormat {
  if (typeof window === 'undefined') return 'DD/MM/YYYY';
  try {
    const explicit = window.localStorage.getItem('iassetspro_date_display_format');
    if (explicit === 'DD-MM-YYYY' || explicit === 'DD/MM/YYYY') return explicit;
    const raw = window.localStorage.getItem('eam_user_preferences');
    if (raw) {
      const pref = (JSON.parse(raw) as { dateTime?: { dateFormat?: string } }).dateTime?.dateFormat;
      if (pref === 'DD-MM-YYYY' || pref === 'dd-MM-yyyy') return 'DD-MM-YYYY';
      if (pref === 'DD/MM/YYYY' || pref === 'dd/MM/yyyy') return 'DD/MM/YYYY';
    }
    return normalizeDayFirstDateFormat(window.localStorage.getItem('company_date_format'));
  } catch {
    return 'DD/MM/YYYY';
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Date-only ISO strings are calendar days, NOT instants. Do not construct
 * Date('YYYY-MM-DD') for them, as that moves the date back a day for
 * inspectors viewing the system in UTC-negative time zones.
 */
function validCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function formatUiDate(
  value: Date | string | number | null | undefined,
  dateFormat: DayFirstDateFormat = getDayFirstDateFormat(),
): string {
  if (value == null || value === '') return '—';
  const separator = normalizeDayFirstDateFormat(dateFormat) === 'DD-MM-YYYY' ? '-' : '/';
  if (typeof value === 'string') {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) {
      const year = Number(dateOnly[1]), month = Number(dateOnly[2]), day = Number(dateOnly[3]);
      if (!validCalendarDate(year, month, day)) return '—';
      return [pad(day), pad(month), String(year).padStart(4, '0')].join(separator);
    }
    const dayFirst = /^(\d{2})[\/-](\d{2})[\/-](\d{4})$/.exec(value);
    if (dayFirst) {
      const day = Number(dayFirst[1]), month = Number(dayFirst[2]), year = Number(dayFirst[3]);
      if (!validCalendarDate(year, month, day)) return '—';
      return [pad(day), pad(month), String(year).padStart(4, '0')].join(separator);
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return [pad(date.getDate()), pad(date.getMonth() + 1), String(date.getFullYear()).padStart(4, '0')].join(separator);
}

export function formatUiDateTime(
  value: Date | string | number | null | undefined,
  dateFormat: DayFirstDateFormat = getDayFirstDateFormat(),
): string {
  const day = formatUiDate(value, dateFormat);
  if (day === '—') return day;
  if (typeof value === 'string' && (/^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{2}[\/-]\d{2}[\/-]\d{4}$/.test(value))) return day;
  const date = value instanceof Date ? value : new Date(value!);
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

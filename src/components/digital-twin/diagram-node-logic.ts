export function isInstrumentAlarm(
  value: number | null,
  alarmHigh: number | null,
  alarmLow: number | null,
): boolean {
  if (value === null) return false;
  return (
    (alarmHigh !== null && value > alarmHigh) ||
    (alarmLow !== null && value < alarmLow)
  );
}

export function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysString(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isDateInAllowedWindow(date: string) {
  return date >= todayString() && date <= addDaysString(14);
}

export function getWeekDates() {
  return Array.from({ length: 7 }, (_item, index) => addDaysString(index + 1));
}

export function getPlanningWindowDates({
  startOffsetDays = 0,
  endOffsetDays = 14,
}: {
  startOffsetDays?: number;
  endOffsetDays?: number;
} = {}) {
  return {
    startDate: addDaysString(startOffsetDays),
    endDate: addDaysString(endOffsetDays),
  };
}
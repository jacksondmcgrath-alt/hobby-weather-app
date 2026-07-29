function escapeIcsText(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}

function cleanFilename(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatIcsDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

export function parseWindowToDates(dateString: string, windowString?: string | null) {
  const baseDate = new Date(`${dateString}T12:00:00`);

  if (!windowString || windowString.includes("Not available") || windowString.includes("Full-day")) {
    const endDate = new Date(baseDate.getTime() + 60 * 60 * 1000);
    return { start: baseDate, end: endDate };
  }

  const normalized = windowString.replace("—", "–").replace("-", "–");
  const parts = normalized.split("–").map((part) => part.trim());

  if (parts.length !== 2) {
    const endDate = new Date(baseDate.getTime() + 60 * 60 * 1000);
    return { start: baseDate, end: endDate };
  }

  function parseTime(timeText: string) {
    const date = new Date(`${dateString} ${timeText}`);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  const start = parseTime(parts[0]);
  const end = parseTime(parts[1]);

  if (!start || !end) {
    const endDate = new Date(baseDate.getTime() + 60 * 60 * 1000);
    return { start: baseDate, end: endDate };
  }

  if (end <= start) {
    end.setDate(end.getDate() + 1);
  }

  return { start, end };
}

export function createIcsEvent({
  title,
  start,
  end,
  description,
  location,
}: {
  title: string;
  start: Date;
  end: Date;
  description: string;
  location?: string;
}) {
  const now = new Date();
  const uid = `${now.getTime()}-${Math.random().toString(36).slice(2)}@hobby-weather-app`;

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Hobby Weather Planner//EN
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${formatIcsDate(now)}
DTSTART:${formatIcsDate(start)}
DTEND:${formatIcsDate(end)}
SUMMARY:${escapeIcsText(title)}
DESCRIPTION:${escapeIcsText(description)}
LOCATION:${escapeIcsText(location ?? "")}
END:VEVENT
END:VCALENDAR
`;
}

export function makeIcsDownloadHref(icsText: string) {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(icsText)}`;
}

export function calendarFilename(activity: string, date: string) {
  return `${cleanFilename(activity)}-${date}.ics`;
}
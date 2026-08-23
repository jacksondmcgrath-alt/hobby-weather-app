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

function formatIcsDateUtc(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function fallbackWindow(dateString: string) {
  const start = new Date(`${dateString}T12:00:00`);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  return { start, end };
}

export function parseWindowToDates(
  dateString: string,
  windowString?: string | null
) {
  if (
    !windowString ||
    windowString.includes("Not available") ||
    windowString.includes("Full-day") ||
    windowString.includes("TBD")
  ) {
    return fallbackWindow(dateString);
  }

  const normalized = windowString
    .replace(/—/g, "–")
    .replace(/ - /g, "–")
    .replace(/-/g, "–");

  const parts = normalized.split("–").map((part) => part.trim());

  if (parts.length !== 2) {
    return fallbackWindow(dateString);
  }

  function parseTime(timeText: string) {
    const date = new Date(`${dateString} ${timeText}`);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  const start = parseTime(parts[0]);
  const end = parseTime(parts[1]);

  if (!start || !end) {
    return fallbackWindow(dateString);
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
  const uid = `${now.getTime()}-${Math.random()
    .toString(36)
    .slice(2)}@hobby-weather-app`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lumora//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDateUtc(now)}`,
    `DTSTART:${formatIcsDateUtc(start)}`,
    `DTEND:${formatIcsDateUtc(end)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(location ?? "")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.join("\r\n")}\r\n`;
}

export function makeIcsDownloadHref(icsText: string) {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(icsText)}`;
}

export function calendarFilename(activity: string, date: string) {
  return `${cleanFilename(activity)}-${date}.ics`;
}
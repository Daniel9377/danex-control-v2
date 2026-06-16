import { google } from "googleapis";

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Missing Google credentials");
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
}

export function getCalendarId(): string {
  const id = process.env.GOOGLE_CALENDAR_ID;
  if (!id) throw new Error("Missing GOOGLE_CALENDAR_ID");
  return id;
}

export async function getCalendarEvents(date: string) {
  const auth = getAuth();
  const calendar = google.calendar({ version: "v3", auth });
  const calendarId = getCalendarId();

  const chinaOffset = 8 * 60 * 60 * 1000;
  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);

  const timeMin = new Date(startOfDay.getTime() - chinaOffset).toISOString();
  const timeMax = new Date(endOfDay.getTime() - chinaOffset).toISOString();

  const response = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });

  return response.data.items ?? [];
}

export async function getUpcomingEvents(days: number = 3) {
  const auth = getAuth();
  const calendar = google.calendar({ version: "v3", auth });
  const calendarId = getCalendarId();

  const now = new Date();
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const response = await calendar.events.list({
    calendarId,
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  return response.data.items ?? [];
}

export async function createCalendarEvent(
  title: string,
  date: string,
  description?: string
) {
  const auth = getAuth();
  const calendar = google.calendar({ version: "v3", auth });
  const calendarId = getCalendarId();

  await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: title,
      description: description ?? "",
      start: { date },
      end: { date },
    },
  });
}

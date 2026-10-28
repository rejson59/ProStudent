/**
 * Zamiana odpowiedzi API Hebe (`api/mobile/...`) na format `plecak-import-v1`.
 *
 * Wszystkie funkcje są czyste — można je testować bez dziennika i bez sieci.
 * Kształty danych pochodzą z publicznych klientów (VulcanScope/hebece).
 */

const text = (value, max = 300) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Envelope bywa listą albo obiektem z listą pod kluczem. */
export function asList(envelope) {
  if (Array.isArray(envelope)) return envelope;
  if (envelope && typeof envelope === "object") {
    for (const value of Object.values(envelope)) {
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

const day = (value) => {
  const stamp = text(value, 40);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(stamp);
  return match ? match[1] : "";
};

const clock = (value) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(text(value, 10));
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
};

/** „5+”, „4”, „3-” — reszta (np. „np.”, „zad.”) zostaje jako opis dla aplikacji. */
export function gradeValue(grade) {
  const content = text(grade?.Content, 20);
  if (/^[1-6][+-]?$/.test(content)) return content;
  const value = Number(grade?.Value);
  if (Number.isInteger(value) && value >= 1 && value <= 6) return String(value);
  return content;
}

export function mapGrades(envelope) {
  const out = [];
  for (const grade of asList(envelope)) {
    const subject = text(grade?.Column?.Subject?.Name, 60);
    const value = gradeValue(grade);
    if (!subject || !value) continue;
    out.push({
      externalId: String(grade.Id ?? `${subject}:${value}:${day(grade.CreatedAt ?? grade.DateCreated?.Date)}`),
      subject,
      value,
      weight: Number(grade?.Column?.Weight) || 1,
      category: text(grade?.Column?.Category?.Name, 60) || undefined,
      date: day(grade.CreatedAt ?? grade.DateCreated?.Date) || undefined,
      comment: text(grade.Comment, 200) || undefined,
    });
  }
  return out;
}

export function mapTimetable(envelope) {
  const out = [];
  for (const lesson of asList(envelope)) {
    if (lesson?.Visible === false) continue;
    const date = day(lesson.DateAt);
    const start = clock(lesson?.TimeSlot?.Start);
    const end = clock(lesson?.TimeSlot?.End);
    const subject = text(lesson?.Subject?.Name, 60);
    if (!date || !start || !end || !subject) continue;
    out.push({
      date,
      start,
      end,
      subject,
      room: text(lesson?.Room?.Code, 20) || undefined,
      canceled: Number(lesson?.Change?.Type) === 1 || undefined,
    });
  }
  return out;
}

export function mapExams(envelope) {
  const out = [];
  for (const exam of asList(envelope)) {
    const subject = text(exam?.Subject?.Name, 60);
    const date = day(exam.DeadlineAt ?? exam?.Deadline?.Date);
    if (!subject || !date) continue;
    out.push({
      externalId: String(exam.Id ?? `${subject}:${date}`),
      subject,
      date,
      type: text(exam.Type, 40) || "sprawdzian",
      description: text(exam.Content, 200) || undefined,
    });
  }
  return out;
}

export function mapHomework(envelope) {
  const out = [];
  for (const homework of asList(envelope)) {
    const subject = text(homework?.Subject?.Name, 60);
    const due = day(homework.DeadlineAt ?? homework?.Deadline?.Date);
    const description = text(homework.Content, 200);
    if (!subject || !due || !description) continue;
    out.push({
      externalId: String(homework.Id ?? `${subject}:${due}`),
      subject,
      due,
      description,
    });
  }
  return out;
}

/** Składa gotowy dokument `plecak-import-v1`. */
export function buildSnapshot({ grades, timetable, exams, homework, student, exportedAt = new Date().toISOString() }) {
  return {
    format: "plecak-import",
    version: 1,
    source: "eduvulcan",
    exportedAt,
    ...(student ? { student } : {}),
    grades,
    timetable,
    exams,
    homework,
  };
}

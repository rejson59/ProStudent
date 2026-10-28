import { useCallback } from "react";
import { useLocal } from "../store";
import { decodeBells, decodeSubjects, decodeTasks, decodeTimetable } from "../schema";
import { BELLS, defaultSubjects, defaultTasks, defaultTimetable, type Bells, type Subject, type Task } from "../data";
import { mergeSnapshot, type ImportResult, type ImportSelection } from "./normalize";
import type { JournalSnapshot } from "./types";

export type JournalState = { subjects: Subject[]; tasks: Task[]; timetable: string[][]; bells: Bells };

/**
 * Wspólny dostęp do danych, które import może zmienić.
 * Dzięki temu kreator importu i automatyczna synchronizacja robią dokładnie to samo.
 */
export function useJournal() {
  const [subjects, setSubjects] = useLocal<Subject[]>("subjects", defaultSubjects, decodeSubjects);
  const [tasks, setTasks] = useLocal<Task[]>("tasks", defaultTasks, decodeTasks);
  const [timetable, setTimetable] = useLocal<string[][]>("timetable", defaultTimetable, decodeTimetable);
  const [bells, setBells] = useLocal<Bells>("bells", BELLS, decodeBells);

  /** Podgląd bez zapisywania — do ekranu „co się zmieni”. */
  const preview = useCallback(
    (snapshot: JournalSnapshot, selection: ImportSelection): ImportResult =>
      mergeSnapshot(snapshot, { subjects, tasks, timetable }, selection),
    [subjects, tasks, timetable]
  );

  /** Właściwy import. Zwraca funkcję cofającą całą operację. */
  const apply = useCallback(
    (snapshot: JournalSnapshot, selection: ImportSelection): { result: ImportResult; undo: () => void } => {
      const previous: JournalState = { subjects, tasks, timetable, bells };
      const result = mergeSnapshot(snapshot, { subjects, tasks, timetable }, selection);

      setSubjects(result.subjects);
      setTasks(result.tasks);
      if (result.timetable) setTimetable(result.timetable);
      if (result.bells && result.bells.length) setBells(result.bells);

      const undo = () => {
        setSubjects(previous.subjects);
        setTasks(previous.tasks);
        setTimetable(previous.timetable);
        setBells(previous.bells);
      };

      return { result, undo };
    },
    [subjects, tasks, timetable, bells, setSubjects, setTasks, setTimetable, setBells]
  );

  return { subjects, tasks, timetable, bells, preview, apply };
}

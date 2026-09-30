/**
 * Fotos de los borradores de alta (2026-09-30).
 *
 * localStorage no aguanta imágenes, así que las fotos del borrador (producto,
 * cada tomo del lote, imagen de la preventa) van a IndexedDB en un store
 * propio (`tadaima-drafts`), aparte del caché de React Query. Misma vida que
 * los datos del borrador: 24 horas, y se borran al crear o con "Limpiar datos".
 *
 * Todo es "best effort": si IndexedDB no está disponible (modo privado raro),
 * se pierde la foto del borrador pero el formulario sigue funcionando.
 */
import { createStore, del, get, set, type UseStore } from "idb-keyval";

export const DRAFT_FILES_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Una foto: File/Blob (producto, tomos) o texto (imagen base64 de la preventa). */
export type DraftFile = Blob | string;

interface FilesEnvelope {
  savedAt: number;
  files: Record<string, DraftFile>;
}

export function isDraftFresh(savedAt: number, now: number, maxAgeMs = DRAFT_FILES_MAX_AGE_MS): boolean {
  return now - savedAt <= maxAgeMs;
}

export function filesKeyFor(draftKey: string): string {
  return `${draftKey}:files`;
}

let store: UseStore | null = null;
function draftStore(): UseStore | null {
  if (typeof indexedDB === "undefined") return null;
  store ??= createStore("tadaima-drafts", "files");
  return store;
}

/** Guarda las fotos del borrador (reemplaza todas). Vacío = borra. */
export async function saveDraftFiles(draftKey: string, files: Record<string, DraftFile>): Promise<void> {
  const s = draftStore();
  if (!s) return;
  try {
    if (Object.keys(files).length === 0) {
      await del(filesKeyFor(draftKey), s);
      return;
    }
    const envelope: FilesEnvelope = { savedAt: Date.now(), files };
    await set(filesKeyFor(draftKey), envelope, s);
  } catch {
    // sin espacio / IndexedDB bloqueado — no bloquear la UI
  }
}

/** Fotos del borrador, o null si no hay o ya caducaron (y en ese caso se borran). */
export async function loadDraftFiles(draftKey: string, maxAgeMs = DRAFT_FILES_MAX_AGE_MS): Promise<Record<string, DraftFile> | null> {
  const s = draftStore();
  if (!s) return null;
  try {
    const envelope = await get<FilesEnvelope>(filesKeyFor(draftKey), s);
    if (!envelope) return null;
    if (!isDraftFresh(envelope.savedAt, Date.now(), maxAgeMs)) {
      await del(filesKeyFor(draftKey), s);
      return null;
    }
    return envelope.files;
  } catch {
    return null;
  }
}

export async function clearDraftFiles(draftKey: string): Promise<void> {
  const s = draftStore();
  if (!s) return;
  try {
    await del(filesKeyFor(draftKey), s);
  } catch {
    // no-op
  }
}

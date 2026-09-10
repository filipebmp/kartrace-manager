/**
 * Controlo de expiração de sessão por inatividade.
 * Por defeito a sessão termina após 2 horas sem atividade;
 * a opção "Manter sessão iniciada" no login desativa esse limite.
 */

const LAST_ACTIVITY_KEY = "kart24h-last-activity";
const KEEP_SIGNED_IN_KEY = "kart24h-keep-signed-in";

export const IDLE_LIMIT_MS = 2 * 60 * 60 * 1000; // 2 horas

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignora */
  }
}

export function markSessionActivity() {
  safeSet(LAST_ACTIVITY_KEY, String(Date.now()));
}

export function setKeepSignedIn(keep: boolean) {
  safeSet(KEEP_SIGNED_IN_KEY, keep ? "1" : "0");
}

export function getKeepSignedIn(): boolean {
  return safeGet(KEEP_SIGNED_IN_KEY) === "1";
}

/** Limpa o estado de inatividade (usado no logout). */
export function clearSessionGuard() {
  try {
    window.localStorage.removeItem(LAST_ACTIVITY_KEY);
    window.localStorage.removeItem(KEEP_SIGNED_IN_KEY);
  } catch {
    /* ignora */
  }
}

/**
 * Devolve true quando a sessão deve ser terminada por inatividade.
 * Sem registo de atividade assume-se expirada apenas se existir registo antigo;
 * caso contrário começa a contar agora.
 */
export function isSessionExpiredByInactivity(now = Date.now()): boolean {
  if (getKeepSignedIn()) return false;
  const raw = safeGet(LAST_ACTIVITY_KEY);
  if (!raw) {
    markSessionActivity();
    return false;
  }
  const last = Number(raw);
  if (!Number.isFinite(last)) return false;
  return now - last > IDLE_LIMIT_MS;
}

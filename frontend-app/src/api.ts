// ============================================================
// MiniBank Pro — API Client Sécurisé (Anti-IDOR & Bearer Token)
// ============================================================

// ============================================================
// MiniBank Pro — API Client Sécurisé (Anti-IDOR & Session Timeout 1h)
// Utilise sessionStorage : expiration immédiate à la fermeture de la page
// ============================================================

const API_BASE = "";
const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 heure d'inactivité

function isSessionExpired(): boolean {
  const lastActiveStr = sessionStorage.getItem("minibank_last_activity");
  if (!lastActiveStr) return false;
  const lastActive = parseInt(lastActiveStr, 10);
  return Date.now() - lastActive > SESSION_TIMEOUT_MS;
}

function updateLastActivity() {
  sessionStorage.setItem("minibank_last_activity", String(Date.now()));
}

export function getAuthToken(): string | null {
  if (isSessionExpired()) {
    setAuthToken(null);
    setSavedUser(null);
    window.dispatchEvent(new Event("minibank_logout"));
    return null;
  }
  return sessionStorage.getItem("minibank_token");
}

export function setAuthToken(token: string | null) {
  if (token) {
    sessionStorage.setItem("minibank_token", token);
    updateLastActivity();
  } else {
    sessionStorage.removeItem("minibank_token");
    sessionStorage.removeItem("minibank_last_activity");
  }
}

export function getSavedUser(): any | null {
  if (isSessionExpired()) return null;
  const str = sessionStorage.getItem("minibank_user");
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export function setSavedUser(user: any | null) {
  if (user) {
    sessionStorage.setItem("minibank_user", JSON.stringify(user));
    updateLastActivity();
  } else {
    sessionStorage.removeItem("minibank_user");
  }
}

export async function request<T = any>(
  path: string,
  method: string = "GET",
  body: any = null
): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["X-Session-Token"] = token;
  }

  const opts: RequestInit = {
    method,
    headers,
  };

  if (body) {
    if (token && typeof body === "object" && !Array.isArray(body) && !body.token) {
      body.token = token;
    }
    opts.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(API_BASE + path, opts);
    updateLastActivity();
    if (res.status === 401 && !path.startsWith("/api/login")) {
      setAuthToken(null);
      setSavedUser(null);
      window.dispatchEvent(new Event("minibank_logout"));
      throw new Error("Session expirée. Veuillez vous reconnecter.");
    }
    return (await res.json()) as T;
  } catch (err: any) {
    console.error("API error:", err);
    throw err;
  }
}

export function formatFCFA(montant: number | undefined | null): string {
  const val = Math.round(Number(montant) || 0);
  return new Intl.NumberFormat("fr-FR").format(val) + " FCFA";
}

export function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

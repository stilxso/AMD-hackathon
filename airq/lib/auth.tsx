"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { AuthUser } from "@/types";

const TOKEN_KEY = "airq.token";

type Status = "loading" | "authenticated" | "anonymous";

type Ctx = {
  status: Status;
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  /** fetch() with the bearer token attached; signs out on a 401. */
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const AuthCtx = createContext<Ctx | null>(null);

/**
 * The token lives in localStorage. That is readable by any script on the page,
 * so an XSS bug would leak a session — the tradeoff accepted here for a
 * token the API proxy forwards as an Authorization header. An httpOnly cookie
 * would be the hardening step if this outgrows MVP scope.
 */
function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode / storage disabled — session just won't persist */
  }
}

/** Pull FastAPI's `detail` out of an error body, falling back to the status. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
    // 422 from pydantic gives an array of issues.
    if (Array.isArray(body?.detail) && body.detail[0]?.msg) return body.detail[0].msg;
  } catch {
    /* non-JSON body */
  }
  return `Request failed (HTTP ${res.status})`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Validate any stored token against the API before trusting it, so an
  // expired or revoked session shows the login screen instead of a broken app.
  useEffect(() => {
    const stored = readToken();
    if (!stored) {
      setStatus("anonymous");
      return;
    }

    let active = true;
    fetch("/api/v1/auth/me", { headers: { Authorization: `Bearer ${stored}` } })
      .then(async (res) => {
        if (!active) return;
        if (!res.ok) {
          writeToken(null);
          setStatus("anonymous");
          return;
        }
        setUser((await res.json()) as AuthUser);
        setToken(stored);
        setStatus("authenticated");
      })
      .catch(() => {
        // Backend unreachable — treat as signed out rather than hanging on a
        // loading spinner forever.
        if (active) setStatus("anonymous");
      });

    return () => {
      active = false;
    };
  }, []);

  const submit = useCallback(async (path: "login" | "register", username: string, password: string) => {
    const res = await fetch(`/api/v1/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error(await errorMessage(res));

    const data = (await res.json()) as { access_token: string; user: AuthUser };
    writeToken(data.access_token);
    setToken(data.access_token);
    setUser(data.user);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(() => {
    writeToken(null);
    setToken(null);
    setUser(null);
    setStatus("anonymous");
  }, []);

  const authFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      const current = token ?? readToken();
      if (current) headers.set("Authorization", `Bearer ${current}`);

      const res = await fetch(input, { ...init, headers });
      // A rejected token is dead for every other call too — drop the session
      // once rather than letting each component fail on its own.
      if (res.status === 401) logout();
      return res;
    },
    [token, logout],
  );

  const value = useMemo<Ctx>(
    () => ({
      status,
      user,
      login: (u, p) => submit("login", u, p),
      register: (u, p) => submit("register", u, p),
      logout,
      authFetch,
    }),
    [status, user, submit, logout, authFetch],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

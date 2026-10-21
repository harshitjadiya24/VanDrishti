import { createContext, useContext, useState, type ReactNode } from "react";
import type { Me } from "./api";

// The signed-in person (from /auth/me) and the reserve they are looking at, remembered in
// this browser. The server signs every action with the signed-in user; `reviewer` is their
// username, kept for screens that show who is acting.
interface Ctx {
  reserve: string;
  setReserve: (code: string) => void;
  reviewer: string;
  me: Me | null;
  can: (permission: string) => boolean;
}

const SessionCtx = createContext<Ctx | null>(null);

const read = (key: string) => {
  try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
};
const write = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
};

export function SessionProvider({ children, initial, me = null }: { children: ReactNode; initial?: { reserve?: string; reviewer?: string }; me?: Me | null }) {
  const allowed = (code: string) => !me || me.reserves.includes("*") || me.reserves.includes(code);
  const remembered = initial?.reserve ?? read("vd.reserve");
  const fallback = me && !me.reserves.includes("*") ? me.reserves[0] ?? "" : "";
  const [reserve, setR] = useState(remembered && allowed(remembered) ? remembered : fallback);
  return (
    <SessionCtx.Provider
      value={{
        reserve,
        setReserve: (c) => { setR(c); write("vd.reserve", c); },
        reviewer: me?.username ?? initial?.reviewer ?? "",
        me,
        can: (p) => !me || me.permissions.includes(p),
      }}
    >
      {children}
    </SessionCtx.Provider>
  );
}

export function useSession(): Ctx {
  const v = useContext(SessionCtx);
  if (!v) throw new Error("SessionProvider missing");
  return v;
}

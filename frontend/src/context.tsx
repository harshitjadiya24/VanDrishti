import { createContext, useContext, useState, type ReactNode } from "react";

// Reserve and reviewer are chosen once and remembered in this browser. Until login arrives
// (Phase 8) the reviewer name is how every action in the audit trail is attributed.
interface Ctx {
  reserve: string;
  setReserve: (code: string) => void;
  reviewer: string;
  setReviewer: (name: string) => void;
}

const SessionCtx = createContext<Ctx | null>(null);

const read = (key: string) => {
  try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
};
const write = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
};

export function SessionProvider({ children, initial }: { children: ReactNode; initial?: Partial<Ctx> }) {
  const [reserve, setR] = useState(initial?.reserve ?? read("vd.reserve"));
  const [reviewer, setV] = useState(initial?.reviewer ?? read("vd.reviewer"));
  return (
    <SessionCtx.Provider
      value={{
        reserve,
        setReserve: (c) => { setR(c); write("vd.reserve", c); },
        reviewer,
        setReviewer: (n) => { setV(n); write("vd.reviewer", n); },
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

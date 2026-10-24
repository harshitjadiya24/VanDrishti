import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Taxon } from "../../lib/api";

/** Search SpeciesNet's names (the reserve's own species first). Enter takes the first match. */
export function TaxonPicker({ reserve, onPick, onCancel }: {
  reserve?: string;
  onPick: (t: Taxon) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState("");
  const results = useQuery({
    queryKey: ["taxa", q, reserve],
    queryFn: () => api.taxa(q, reserve),
    enabled: q.trim().length >= 2,
  });
  const list = results.data ?? [];
  return (
    <div className="grid gap-2 rounded-md border border-amber/60 bg-base p-2">
      <input
        autoFocus
        aria-label="Search the right species"
        placeholder="Type a species, e.g. chital"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && list[0]) onPick(list[0]);
        }}
        className="h-9 rounded-md border border-line bg-panel px-2 text-[14px] text-ink"
      />
      <ul className="grid max-h-56 gap-0.5 overflow-y-auto" role="listbox" aria-label="Matching species">
        {list.map((t) => (
          <li key={t.taxon + t.common_name}>
            <button type="button" onClick={() => onPick(t)}
              className="flex w-full justify-between gap-2 rounded px-2 py-1.5 text-left text-[14px] hover:bg-raised">
              <span>{t.common_name}{t.on_reserve_list && <span className="ml-2 text-[11px] text-ok">on reserve list</span>}</span>
              <span className="text-[12px] text-dim">{t.level}</span>
            </button>
          </li>
        ))}
        {q.trim().length >= 2 && results.isSuccess && list.length === 0 && (
          <li className="px-2 py-1.5 text-[13px] text-dim">No species with that name.</li>
        )}
      </ul>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { Button } from "../../design/primitives";
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
    <div className="grid gap-2 rounded-[12px] border border-decide/60 bg-surface-2 p-2.5">
      <div className="flex items-center gap-2 rounded-[8px] border border-edge bg-surface px-2.5">
        <Search size={15} aria-hidden className="text-fg-3" />
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
          className="h-11 flex-1 bg-transparent text-[16px] text-fg outline-none placeholder:text-fg-3 md:h-9 md:text-[14px]"
        />
      </div>
      <ul className="grid max-h-56 gap-0.5 overflow-y-auto" role="listbox" aria-label="Matching species">
        {list.map((t) => (
          <li key={t.taxon + t.common_name}>
            <button type="button" onClick={() => onPick(t)}
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[7px] px-2.5 text-left text-[14px] hover:bg-surface-3 md:min-h-9">
              <span>{t.common_name}{t.on_reserve_list && <span className="ml-2 text-[11.5px] text-settled">on reserve list</span>}</span>
              <span className="text-[12px] text-fg-3">{t.level}</span>
            </button>
          </li>
        ))}
        {q.trim().length >= 2 && results.isSuccess && list.length === 0 && (
          <li className="px-2.5 py-2 text-[13px] text-fg-3">No species with that name.</li>
        )}
      </ul>
      <Button tone="ghost" size="sm" onClick={onCancel} className="justify-self-start">Cancel (Esc)</Button>
    </div>
  );
}

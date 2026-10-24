// Stage 4.2: stripes are compared; a person names the tiger.

import { MEASURED } from "../results";
import { Card, Chapter, StripeFrame, Synthetic } from "../ui";

const REID = MEASURED.find((m) => m.what.startsWith("Tiger re-identification"));

export function IdentityChapter() {
  return (
    <Chapter id="identity" stage="4.2" strip="which tiger is this?" title="Which tiger is this?"
      lede="Every tiger's stripes are its own. VanDrishti compares a new sighting with tigers people have already named and suggests the closest. The model never names a tiger: a person confirms the match or creates a new tiger.">
      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <div className="flex items-center justify-between"><p className="text-[13px] font-medium text-fg-2">New sighting</p><Synthetic /></div>
          <div className="mt-3 overflow-hidden rounded-[10px] border border-edge"><StripeFrame seed={23} label="New sighting's stripe pattern" tilt={2} /></div>
          <p className="data mt-3 text-[10.5px] text-fg-3 uppercase">cam n-02 · 23:58 IST · MegaDescriptor-T</p>
        </Card>
        <Card tone="hot">
          <div className="flex items-center justify-between gap-2"><p className="text-[13px] font-medium text-fg-2">Named tiger T-07 · similarity <span className="data text-heat-5">0.93</span></p><Synthetic /></div>
          <div className="mt-3 overflow-hidden rounded-[10px] border border-edge"><StripeFrame seed={23} label="T-07's stripe pattern, very similar" tilt={-3} /></div>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-heat-4/60 px-2.5 py-1 text-[12.5px] font-medium">
            <span aria-hidden className="size-1.5 rounded-full bg-heat-4 shadow-[0_0_6px_var(--color-heat-4)]" />Possible match: a person checks
          </p>
        </Card>
        <Card>
          <div className="flex items-center justify-between gap-2"><p className="text-[13px] font-medium text-fg-2">Named tiger T-12 · similarity <span className="data">0.41</span></p><Synthetic /></div>
          <div className="mt-3 overflow-hidden rounded-[10px] border border-edge"><StripeFrame seed={58} label="T-12's stripe pattern, different" /></div>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-edge px-2.5 py-1 text-[12.5px] font-medium text-fg-2">
            <span aria-hidden className="size-1.5 rounded-full bg-mark" />Unlike this sighting
          </p>
        </Card>
      </div>
      <p className="mt-5 max-w-[80ch] text-[14px] text-fg-3">
        Synthetic patterns. Measured: {REID?.value} on ATRW, which is optimistic ({REID?.caveat}). This is not a
        cross-scene test, and nothing has been tested on Indian reserves yet.
      </p>
    </Chapter>
  );
}

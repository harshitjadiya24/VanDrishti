// Every number the public story shows, copied from docs/EVALUATION.md with its caveat.
// Change them only together with that file; a test checks they still appear there.
// Nothing here is a claim about Indian reserves: no labelled Indian images exist yet.

export const SAMPLE = {
  frames: 252,
  source: "252 labelled frames from public LILA BC datasets (US), drawn to include vehicles and empty frames",
} as const;

/** Section 7 on the sample. Proportions describe this sample, not a reserve's real stream. */
export const ROUTING = [
  { id: "auto", label: "Auto-accepted", frames: 86, person: 5, note: "5 drawn at random for a spot check" },
  { id: "review", label: "Review (0.6–0.9)", frames: 27, person: 27, note: "a person checks" },
  { id: "uncertain", label: "Uncertain (< 0.6)", frames: 12, person: 12, note: "a person decides" },
  { id: "people", label: "People or vehicles", frames: 66, person: 66, note: "always a person" },
  { id: "blank", label: "Likely blank", frames: 61, person: 7, note: "7 sampled at random" },
] as const;
export const NEEDS_A_PERSON = 117;

export const MEASURED = [
  {
    what: "Detector (MegaDetector V6) at threshold 0.2",
    value: "animal precision 0.94, recall 0.91",
    caveat: "on the LILA sample; the detector was very likely trained on these datasets, so optimistic",
  },
  {
    what: "Night infrared frames",
    value: "animal recall 0.95, precision 0.97 (110 frames)",
    caveat: "same sample and caveat",
  },
  {
    what: "Auto-accept band (≥ 0.9)",
    value: "84 of 86 correct, 2 too general, 0 wrong",
    caveat: "SpeciesNet was very likely trained on these datasets: optimistic, says nothing yet about India",
  },
  {
    what: "Outlines (SAM 2.1 tiny)",
    value: "123 of 125 masks with predicted IoU ≥ 0.7",
    caveat: "the model's own quality estimate",
  },
  {
    what: "Tiger re-identification (MegaDescriptor-T)",
    value: "top-1 0.974 with near-duplicate frames excluded",
    caveat: "ATRW zoo footage of Amur tigers, which the model was most likely trained on: optimistic",
  },
  {
    what: "Speed on an 8 GB laptop (CPU)",
    value: "0.16 s per image for detection; one model in memory at a time",
    caveat: "Apple M3, 8 GB",
  },
] as const;

export const MODELS = [
  { name: "MegaDetector V6 (MIT compact)", job: "finds animals, people and vehicles", licence: "code MIT, weights CC-BY-4.0" },
  { name: "SpeciesNet v4.0.3a", job: "names the species", licence: "Apache-2.0" },
  { name: "OpenCLIP ViT-B/16", job: "second opinion, informational", licence: "MIT" },
  { name: "SAM 2.1 tiny", job: "outlines the animal", licence: "Apache-2.0" },
  { name: "MegaDescriptor-T", job: "stripe embeddings for re-ID", licence: "CC-BY-NC-4.0 (non-commercial)" },
  { name: "FAISS", job: "similarity search", licence: "MIT" },
] as const;

import "./story.css";
import { ActChapter, CloseChapter, EngineeringChapter } from "./chapters/Act";
import { DecideChapter } from "./chapters/Decide";
import { Hero } from "./chapters/Hero";
import { IdentityChapter } from "./chapters/Identity";
import { PipelineChapter } from "./chapters/Pipeline";
import { PrivacyChapter } from "./chapters/Privacy";
import { RiskChapter } from "./chapters/Risk";
import { ForkSection } from "./fork/ForkSection";
import { useSmoothScroll } from "./scroll";
import { StoryStrip } from "./StoryStrip";

/** The public story site: one camera trap's night. No API calls, nothing from third parties. */
export default function StoryPage() {
  useSmoothScroll();
  return (
    <div className="night-scope min-h-dvh font-[family-name:var(--font-ui)]">
      <Hero onSeeHow={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })} />
      <main>
        <PipelineChapter />
        <ForkSection />
        <DecideChapter />
        <PrivacyChapter />
        <IdentityChapter />
        <RiskChapter />
        <ActChapter />
        <EngineeringChapter />
        <CloseChapter />
      </main>
      <StoryStrip />
    </div>
  );
}

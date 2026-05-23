import { Navigation } from "@/components/Navigation";
import { Hero } from "@/components/Hero";
import { ProblemStats } from "@/components/ProblemStats";
import { SolutionLayers } from "@/components/SolutionLayers";
import { Methodology } from "@/components/Methodology";
import { ProductStages } from "@/components/ProductStages";
import { AICopilotShowcase } from "@/components/AICopilotShowcase";
import { Audience } from "@/components/Audience";
import { CTASection } from "@/components/CTASection";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navigation />
      <main id="main" className="relative">
        <Hero />
        <ProblemStats />
        <SolutionLayers />
        <Methodology />
        <ProductStages />
        <AICopilotShowcase />
        <Audience />
        <CTASection />
      </main>
      <Footer />
    </>
  );
}

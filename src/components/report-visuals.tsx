"use client";

import { useState } from "react";
import type { FactorResult, VideoSample } from "@/lib/types";
import { RefractionLens } from "./refraction-lens";
import { FactorBreakdown } from "./factor-breakdown";

export function ReportVisuals({
  factors,
  videos,
}: {
  factors: FactorResult[];
  videos: VideoSample[];
}) {
  const [activeFactor, setActiveFactor] = useState<string | null>(null);

  return (
    <>
      <RefractionLens factors={factors} activeFactor={activeFactor} onSelect={setActiveFactor} />
      <FactorBreakdown factors={factors} videos={videos} />
    </>
  );
}

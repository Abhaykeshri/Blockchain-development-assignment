"use client";

import { MintPanel } from "../components/MintPanel";
import { useConfig } from "../context/ConfigContext";

export function BuyPage() {
  const cfg = useConfig();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <MintPanel cfg={cfg} />
    </div>
  );
}

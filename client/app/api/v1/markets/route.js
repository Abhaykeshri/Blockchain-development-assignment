import { NextResponse } from "next/server";
import { getMarketEngine } from "../../../../lib/engines.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  try {
    return NextResponse.json(getMarketEngine().overview());
  } catch {
    return new NextResponse("MarketEngine not ready", { status: 503 });
  }
}

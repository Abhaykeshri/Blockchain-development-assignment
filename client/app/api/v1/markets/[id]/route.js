import { NextResponse } from "next/server";
import { getMarketEngine, getMatchingEngine } from "../../../../../lib/engines.js";
import { mergeBookWithResting, mergeTrades, quoteDp } from "../../../../../lib/merge.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req, { params }) {
  const id = params.id;
  let d;
  try {
    d = getMarketEngine().detail(id);
  } catch {
    return new NextResponse("MarketEngine not ready", { status: 503 });
  }
  if (!d) return new NextResponse("not found", { status: 404 });

  const qd = quoteDp(d.quote);
  let matching;
  try {
    matching = getMatchingEngine();
  } catch {
    return new NextResponse("MatchingEngine not ready", { status: 503 });
  }
  const { bids: rb, asks: ra } = await matching.restingDepth(id);
  d.book = mergeBookWithResting(d.book, rb, ra, qd, 14);
  const mt = await matching.recentTrades(id, 24);
  d.trades = mergeTrades(mt, d.trades, qd, 48);
  return NextResponse.json(d);
}

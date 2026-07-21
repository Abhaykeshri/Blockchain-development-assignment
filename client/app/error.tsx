"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-white">
      <div className="max-w-lg rounded-2xl border border-white/[0.08] bg-[rgba(12,14,24,0.9)] p-8">
        <h1 className="m-0 text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/65">
          The app hit a runtime error. Reset the page after checking the terminal logs.
        </p>
        <pre className="mt-4 overflow-auto rounded-xl bg-black/30 p-4 text-xs text-red-200 whitespace-pre-wrap">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-5 rounded-xl bg-gradient-to-r from-[#12b886] to-[#38bdf8] px-4 py-2 text-sm font-semibold text-[#050a0f]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

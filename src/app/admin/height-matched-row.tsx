"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Renders `left` and `right` side by side (60/40), with `left` capped to
 * scroll within whatever height `right`'s content naturally takes up.
 *
 * CSS Grid's align-items:stretch only clamps a scrollable sibling to a row
 * height when some ANCESTOR provides an explicit height constraint — with
 * everything here auto-height (both columns just wrap whatever content the
 * page gives them), the grid row instead grows to fit the scrollable
 * item's FULL content, so there's nothing to actually scroll against.
 * Measuring the right column's real rendered height with ResizeObserver
 * and applying it as the left column's max-height is what makes "as many
 * rows as fit the height of the other side" actually work.
 */
export function HeightMatchedRow({ left, right }: { left: ReactNode; right: ReactNode }) {
  const rightRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const el = rightRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setHeight(entries[0].contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[3fr_2fr]">
      <div
        style={height ? { maxHeight: height } : undefined}
        className="overflow-y-auto rounded border border-petal bg-white"
      >
        {left}
      </div>
      <div ref={rightRef} className="flex flex-col gap-4">
        {right}
      </div>
    </div>
  );
}

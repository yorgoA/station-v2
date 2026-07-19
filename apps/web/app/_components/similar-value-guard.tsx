"use client";

import { useEffect, useMemo, useState } from "react";
import { findSimilarValues } from "../../lib/utils/string-similarity";

type SimilarValueGuardProps = {
  label: string;
  value: string;
  candidates: string[];
  onUseExisting: (value: string) => void;
  /** Reports whether this field currently blocks submission (unacknowledged close matches exist). */
  onBlockingChange: (isBlocking: boolean) => void;
};

/**
 * Warns when a "new box/building" (or similar free-text) value is suspiciously
 * close to an existing one -- catches "Tony" vs "Toni" typos that would
 * otherwise silently create a near-duplicate. Never hard-blocks: the employee
 * can always confirm "no, this is genuinely new" and continue.
 */
export function SimilarValueGuard({ label, value, candidates, onUseExisting, onBlockingChange }: SimilarValueGuardProps) {
  const [acknowledgedValue, setAcknowledgedValue] = useState<string | null>(null);

  const matches = useMemo(() => findSimilarValues(value, candidates), [value, candidates]);
  const isBlocking = matches.length > 0 && acknowledgedValue !== value.trim();

  useEffect(() => {
    onBlockingChange(isBlocking);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBlocking]);

  if (matches.length === 0 || acknowledgedValue === value.trim()) return null;

  return (
    <div className="card" style={{ borderColor: "var(--warning)", marginTop: 8, marginBottom: 8 }}>
      <p style={{ margin: 0 }}>
        This looks similar to {matches.length === 1 ? "an existing" : "existing"} {label}
        {matches.length === 1 ? "" : "s"}. Did you mean:
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {matches.map((match) => (
          <button
            key={match.value}
            type="button"
            className="success-btn"
            onClick={() => onUseExisting(match.value)}
          >
            Use &quot;{match.value}&quot;
          </button>
        ))}
        <button type="button" className="warning-btn" onClick={() => setAcknowledgedValue(value.trim())}>
          No, &quot;{value.trim()}&quot; is genuinely new
        </button>
      </div>
    </div>
  );
}

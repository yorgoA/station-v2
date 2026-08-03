"use client";

import { useMemo, useState } from "react";

export type MultiSelectOption = { id: string; label: string; sublabel?: string };

type MultiSelectProps = {
  options: MultiSelectOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
};

/**
 * Searchable checkbox list for picking several items from a list that can
 * grow large (e.g. every customer in the business) -- a plain scrolling
 * checkbox list stops being usable well before that point.
 */
export function MultiSelect({
  options,
  selectedIds,
  onChange,
  searchPlaceholder = "Search...",
  emptyMessage = "No options available.",
}: MultiSelectProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (option) => option.label.toLowerCase().includes(q) || option.sublabel?.toLowerCase().includes(q)
    );
  }, [options, query]);

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((existing) => existing !== id) : [...selectedIds, id]);
  }

  return (
    <div className="multi-select">
      <input
        type="text"
        className="multi-select-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={searchPlaceholder}
      />
      <div className="multi-select-meta">
        <span>{selectedIds.length} selected</span>
        {selectedIds.length > 0 ? (
          <button type="button" className="multi-select-clear" onClick={() => onChange([])}>
            Clear all
          </button>
        ) : null}
      </div>
      <div className="multi-select-list">
        {options.length === 0 ? (
          <p className="muted multi-select-empty">{emptyMessage}</p>
        ) : filtered.length === 0 ? (
          <p className="muted multi-select-empty">No matches for &quot;{query}&quot;.</p>
        ) : (
          filtered.map((option) => {
            const checked = selectedIds.includes(option.id);
            return (
              <label key={option.id} className={`multi-select-row${checked ? " checked" : ""}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(option.id)} />
                <span>
                  {option.label}
                  {option.sublabel ? <span className="muted"> ({option.sublabel})</span> : null}
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

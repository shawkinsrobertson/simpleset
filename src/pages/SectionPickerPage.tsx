import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { DocumentSection } from '../parser/sectionScanner';
import { filterTextToSections } from '../parser/sectionScanner';
import { parsePlanText } from '../parser/textParser';
import { parseCsvText } from '../parser/xlsx';
import type { SourceType } from '../db/types';

interface LocationState {
  sections: DocumentSection[];
  extractedText: string;
  fallbackName: string;
  isCsv?: boolean;
  sourceType: SourceType;
  sourceFileName?: string;
  sourceFileId?: string;
  sourceMimeType?: string;
  sourceModifiedTime?: string | null;
}

export default function SectionPickerPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const [sections, setSections] = useState<DocumentSection[]>(
    state?.sections ?? [],
  );

  if (!state) {
    return (
      <div className="px-5 pt-10 text-center text-text-secondary">
        <p>Nothing to pick from yet.</p>
        <button
          className="mt-4 rounded bg-accent px-4 py-2 text-accent-ink"
          onClick={() => navigate('/import')}
        >
          Import a plan
        </button>
      </div>
    );
  }

  const { extractedText, fallbackName, isCsv, sourceType, sourceFileName, sourceFileId, sourceMimeType, sourceModifiedTime } = state;

  const toggle = (id: string) =>
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, selected: !s.selected } : s)),
    );

  const setAll = (selected: boolean) =>
    setSections((prev) => prev.map((s) => ({ ...s, selected })));

  const setWorkoutsOnly = () =>
    setSections((prev) =>
      prev.map((s) => ({ ...s, selected: s.exerciseCount > 0 })),
    );

  const selectedCount = sections.filter((s) => s.selected).length;

  const handleParse = (useAll = false) => {
    const text = useAll
      ? extractedText
      : filterTextToSections(extractedText, sections);
    const parsed = isCsv
      ? parseCsvText(text, fallbackName)
      : parsePlanText(text, fallbackName);
    navigate('/confirm', {
      state: { parsedPlan: parsed, sourceType, sourceFileName, sourceFileId, sourceMimeType, sourceModifiedTime },
    });
  };

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 56px)' }}>
      {/* Header */}
      <div className="px-5 pt-8 pb-4">
        <h1 className="font-display text-2xl font-semibold text-text">Select sections</h1>
        <p className="mt-1 text-sm text-text-secondary">
          We found {sections.length} section{sections.length === 1 ? '' : 's'}.
          Intro and nutrition pages are unchecked — tap to include anything you want.
        </p>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 px-5 pb-3">
        <button
          onClick={setWorkoutsOnly}
          className="rounded-full border border-accent px-3 py-1 text-xs font-medium text-accent"
        >
          Workouts only
        </button>
        <button
          onClick={() => setAll(true)}
          className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text-secondary"
        >
          Select all
        </button>
        <button
          onClick={() => setAll(false)}
          className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text-secondary"
        >
          None
        </button>
      </div>

      {/* Section list */}
      <div className="flex-1 overflow-y-auto px-5 pb-36">
        <div className="flex flex-col divide-y divide-border rounded border border-border bg-card">
          {sections.map((section) => {
            const hasExercises = section.exerciseCount > 0;
            return (
              <button
                key={section.id}
                onClick={() => toggle(section.id)}
                className={`flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  section.selected ? 'bg-accent/8' : ''
                }`}
              >
                {/* Checkbox */}
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold transition-colors ${
                    section.selected
                      ? 'border-accent bg-accent text-accent-ink'
                      : 'border-border bg-bg text-transparent'
                  }`}
                >
                  ✓
                </span>

                {/* Title */}
                <span
                  className={`flex-1 text-sm leading-snug ${
                    section.selected ? 'font-medium text-text' : 'text-text-secondary'
                  }`}
                >
                  {section.title.length > 60
                    ? section.title.slice(0, 57) + '…'
                    : section.title}
                </span>

                {/* Exercise count pill */}
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    hasExercises
                      ? 'bg-green-100 text-green-700'
                      : 'bg-bg text-text-secondary'
                  }`}
                >
                  {hasExercises
                    ? `${section.exerciseCount} exercise${section.exerciseCount === 1 ? '' : 's'}`
                    : 'none found'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-14 left-0 right-0 border-t border-border bg-card/95 px-5 py-3 backdrop-blur">
        <button
          disabled={selectedCount === 0}
          onClick={() => handleParse(false)}
          className="w-full rounded bg-accent py-3.5 text-center font-semibold text-accent-ink disabled:opacity-40"
        >
          {selectedCount === 0
            ? 'Select at least one section'
            : `Parse ${selectedCount} section${selectedCount === 1 ? '' : 's'} →`}
        </button>
        <button
          onClick={() => handleParse(true)}
          className="mt-2 w-full py-1.5 text-center text-xs text-text-secondary"
        >
          Parse entire document instead
        </button>
      </div>
    </div>
  );
}

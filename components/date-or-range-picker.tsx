"use client";

import * as React from "react";

const CalendarIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

/** Minutes rolling window, or fixed calendar days */
export type PresetValue = number | "today" | "yesterday";
type PresetRange = PresetValue | "custom";

export interface PresetOption {
  value: PresetValue;
  label: string;
}

interface DateOrRangePickerProps {
  startDate?: Date | undefined;
  endDate: Date;
  onDateChange: (startDate: Date | undefined, endDate: Date) => void;
  presets?: PresetOption[];
  /** Initial selected preset (e.g. "today") */
  initialPreset?: PresetRange;
  /** When clear is clicked, apply this instead of "all time" */
  clearToPreset?: PresetValue;
}

function startOfLocalDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function rangeForPreset(preset: PresetValue): { start: Date; end: Date } {
  const end = startOfLocalDay(new Date());
  if (preset === "today") return { start: end, end };
  if (preset === "yesterday") {
    const y = new Date(end);
    y.setDate(y.getDate() - 1);
    return { start: y, end: y };
  }
  const start = new Date(Date.now() - preset * 60 * 1000);
  return { start, end: new Date() };
}

function matchesPreset(preset: PresetValue, start: Date, end: Date): boolean {
  if (preset === "today") {
    const t = startOfLocalDay(new Date());
    return sameDay(start, t) && sameDay(end, t);
  }
  if (preset === "yesterday") {
    const y = startOfLocalDay(new Date());
    y.setDate(y.getDate() - 1);
    return sameDay(start, y) && sameDay(end, y);
  }
  const timeDiff = end.getTime() - start.getTime();
  const tolerance = 60 * 1000;
  const expectedDiff = preset * 60 * 1000;
  return Math.abs(timeDiff - expectedDiff) < tolerance;
}

export function DateOrRangePicker({
  startDate: propStartDate,
  endDate: propEndDate,
  onDateChange,
  presets = [
    { value: 60 * 24 * 7, label: "Last 7 days" },
    { value: 60 * 24 * 30, label: "Last 30 days" },
    { value: 60 * 24 * 90, label: "Last 90 days" },
    { value: 60 * 24 * 365, label: "Last 365 days" },
  ],
  initialPreset = "custom",
  clearToPreset,
}: DateOrRangePickerProps) {
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [presetOpen, setPresetOpen] = React.useState(false);
  const [selectedPreset, setSelectedPreset] = React.useState<PresetRange>(initialPreset);
  const [tempStartDate, setTempStartDate] = React.useState<Date | undefined>(propStartDate);
  const [tempEndDate, setTempEndDate] = React.useState<Date>(propEndDate ?? new Date());

  React.useEffect(() => {
    setTempStartDate(propStartDate);
    setTempEndDate(propEndDate ?? new Date());
  }, [propStartDate, propEndDate]);

  const startDate = propStartDate;
  const endDate = propEndDate ?? new Date();

  const handleApply = () => {
    setCalendarOpen(false);
    setSelectedPreset("custom");
    onDateChange(tempStartDate, tempEndDate);
  };

  const handleCalendarOpen = () => {
    setTempStartDate(propStartDate);
    setTempEndDate(propEndDate ?? new Date());
    setCalendarOpen(true);
    setPresetOpen(false);
  };

  const handlePresetSelect = (preset: PresetValue) => {
    setSelectedPreset(preset);
    setPresetOpen(false);
    setCalendarOpen(false);
    const { start, end } = rangeForPreset(preset);
    onDateChange(start, end);
  };

  const isPresetDateRange =
    !!startDate &&
    !!endDate &&
    selectedPreset !== "custom" &&
    matchesPreset(selectedPreset, startDate, endDate);

  const isCustomMode =
    selectedPreset === "custom" ||
    (startDate && endDate && !isPresetDateRange);

  const clearFilters = () => {
    setCalendarOpen(false);
    setPresetOpen(false);
    if (clearToPreset != null) {
      setSelectedPreset(clearToPreset);
      const { start, end } = rangeForPreset(clearToPreset);
      onDateChange(start, end);
      return;
    }
    setSelectedPreset("custom");
    onDateChange(undefined, new Date());
  };

  const hasFilters = !!startDate || selectedPreset !== "custom";

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".date-picker-container")) {
        setCalendarOpen(false);
        setPresetOpen(false);
      }
    };

    if (calendarOpen || presetOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [calendarOpen, presetOpen]);

  const selectedLabel = !isCustomMode
    ? presets.find((option) => option.value === selectedPreset)?.label
    : null;

  return (
    <div className="flex date-picker-container">
      {/* Calendar opens from the side button */}
      <div className="relative">
        <button
          type="button"
          onClick={handleCalendarOpen}
          className={`px-3 py-2 h-10 border border-gray-300 rounded-l-lg font-normal flex items-center justify-center bg-white text-gray-700 hover:bg-gray-50`}
        >
          <CalendarIcon className="w-4 h-4" />
        </button>

        {calendarOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-4 w-auto min-w-[300px]">
            <div className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">From</label>
                  <input
                    type="date"
                    value={tempStartDate ? tempStartDate.toISOString().split("T")[0] : ""}
                    onChange={(e) => {
                      const date = e.target.value ? new Date(e.target.value + "T12:00:00") : undefined;
                      setTempStartDate(date);
                      setSelectedPreset("custom");
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-nutrafi-primary"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">To</label>
                  <input
                    type="date"
                    value={tempEndDate ? tempEndDate.toISOString().split("T")[0] : ""}
                    onChange={(e) => {
                      const date = e.target.value
                        ? new Date(e.target.value + "T12:00:00")
                        : new Date();
                      setTempEndDate(date);
                      setSelectedPreset("custom");
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-nutrafi-primary"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleApply}
                  className="px-6 py-2 bg-nutrafi-primary hover:bg-nutrafi-dark text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preset dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setPresetOpen(!presetOpen);
            setCalendarOpen(false);
          }}
          className={`px-3 py-2 h-10 border border-l-0 border-gray-300 rounded-r-lg flex items-center justify-between min-w-[180px] bg-white hover:bg-gray-50 ${
            !isCustomMode ? "font-bold text-black" : "font-normal text-gray-700"
          }`}
        >
          <span className={`truncate ${isCustomMode && !startDate ? "text-gray-400 font-normal" : ""}`}>
            {isCustomMode
              ? !startDate
                ? "All time"
                : "Custom range"
              : selectedLabel || "Select range"}
          </span>
          <ChevronDownIcon className="w-4 h-4 ml-2 shrink-0" />
        </button>

        {presetOpen && (
          <div className="absolute top-full right-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-1 w-56">
            {presets.map((option) => (
              <div
                key={String(option.value)}
                className={`flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 rounded ${
                  selectedPreset === option.value ? "bg-gray-100" : ""
                }`}
                onClick={() => handlePresetSelect(option.value)}
              >
                <div className="w-4 h-4 mr-3 flex items-center justify-center">
                  {selectedPreset === option.value && (
                    <div className="w-2 h-2 bg-nutrafi-primary rounded-full" />
                  )}
                </div>
                {option.label}
              </div>
            ))}
          </div>
        )}
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="ml-2 px-2 h-10 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center"
        >
          <XIcon className="w-4 h-4 text-gray-500" />
        </button>
      )}
    </div>
  );
}

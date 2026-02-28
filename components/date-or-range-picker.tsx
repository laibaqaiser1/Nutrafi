"use client";

import * as React from "react";

// Icon components
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

type PresetRange = number | "custom";

interface PresetOption {
  value: number;
  label: string;
}

interface DateOrRangePickerProps {
  startDate?: Date | undefined;
  endDate: Date;
  onDateChange: (startDate: Date | undefined, endDate: Date) => void;
  presets?: PresetOption[];
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
}: DateOrRangePickerProps) {
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [presetOpen, setPresetOpen] = React.useState(false);
  const [activeField, setActiveField] = React.useState<"start" | "end" | null>(null);
  const [selectedPreset, setSelectedPreset] = React.useState<PresetRange>("custom");
  const [tempStartDate, setTempStartDate] = React.useState<Date | undefined>(propStartDate);
  const [tempEndDate, setTempEndDate] = React.useState<Date>(propEndDate ?? new Date());

  React.useEffect(() => {
    setTempStartDate(propStartDate);
    setTempEndDate(propEndDate ?? new Date());
  }, [propStartDate, propEndDate]);

  const startDate = propStartDate;
  const endDate = propEndDate ?? new Date();

  const formatDate = (date: Date | undefined) => {
    if (!date) return "";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleApply = () => {
    setCalendarOpen(false);
    onDateChange(tempStartDate, tempEndDate);
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;

    if (activeField === "start") {
      setTempStartDate(date);
    } else if (activeField === "end") {
      setTempEndDate(date);
    }

    setSelectedPreset("custom");
  };

  const handleFieldClick = (field: "start" | "end") => {
    setActiveField(field);
    if (!calendarOpen) setCalendarOpen(true);
  };

  const handleCalendarOpen = () => {
    setTempStartDate(propStartDate);
    setTempEndDate(propEndDate ?? new Date());
    setActiveField("start");
    setCalendarOpen(true);
  };

  const getSelectedDate = () => {
    if (activeField === "start") return tempStartDate;
    if (activeField === "end") return tempEndDate;
    return undefined;
  };

  const handlePresetSelect = (preset: PresetRange) => {
    setSelectedPreset(preset);
    setPresetOpen(false);

    if (preset === "custom") return;

    const now = new Date();
    const startTime = new Date(now.getTime() - preset * 60 * 1000);

    onDateChange(startTime, now);
  };

  const isPresetDateRange = () => {
    if (!startDate || !endDate || selectedPreset === "custom") return false;

    const timeDiff = endDate.getTime() - startDate.getTime();
    const tolerance = 60 * 1000;
    const expectedDiff = selectedPreset * 60 * 1000;

    return Math.abs(timeDiff - expectedDiff) < tolerance;
  };

  const isCustomMode =
    selectedPreset === "custom" ||
    (startDate && endDate && !isPresetDateRange());

  const clearFilters = () => {
    setSelectedPreset("custom");
    setCalendarOpen(false);
    setPresetOpen(false);
    onDateChange(undefined, new Date());
  };

  const hasFilters = startDate || selectedPreset !== "custom";

  // Close popovers when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.date-picker-container')) {
        setCalendarOpen(false);
        setPresetOpen(false);
      }
    };

    if (calendarOpen || presetOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [calendarOpen, presetOpen]);

  return (
    <div className="flex date-picker-container">
      {/* Calendar Dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={handleCalendarOpen}
          className={`px-3 py-2 h-10 border border-gray-300 rounded-l-lg font-normal flex items-center justify-center ${
            startDate && endDate && isCustomMode
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          <CalendarIcon className="w-4 h-4" />
        </button>
        
        {calendarOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-4 w-auto min-w-[300px]">
            <div className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Start
                  </label>
                  <input
                    type="date"
                    value={tempStartDate ? tempStartDate.toISOString().split("T")[0] : ""}
                    onChange={(e) => {
                      const date = e.target.value ? new Date(e.target.value) : undefined;
                      setTempStartDate(date);
                      setSelectedPreset("custom");
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    End
                  </label>
                  <input
                    type="date"
                    value={tempEndDate ? tempEndDate.toISOString().split("T")[0] : ""}
                    onChange={(e) => {
                      const date = e.target.value ? new Date(e.target.value) : new Date();
                      setTempEndDate(date);
                      setSelectedPreset("custom");
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleApply}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preset Range Dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setPresetOpen(!presetOpen)}
          className={`px-3 py-2 h-10 border border-l-0 border-gray-300 rounded-r-lg font-normal flex items-center justify-between min-w-[180px] ${
            !isCustomMode ? "bg-green-50 border-green-200 text-green-700" : "bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          <span className={`truncate ${isCustomMode && !startDate ? "text-gray-400" : ""}`}>
            {isCustomMode
              ? !startDate
                ? "All time"
                : "Custom range"
              : presets.find((option) => option.value === selectedPreset)
                  ?.label || "Last 30 days"}
          </span>
          <ChevronDownIcon className="w-4 h-4 ml-2 shrink-0" />
        </button>
        
        {presetOpen && (
          <div className="absolute top-full right-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-1 w-56">
            {presets.map((option) => (
              <div
                key={option.value}
                className={`flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 rounded ${
                  selectedPreset === option.value ? "bg-gray-100" : ""
                }`}
                onClick={() => handlePresetSelect(option.value)}
              >
                <div className="w-4 h-4 mr-3 flex items-center justify-center">
                  {selectedPreset === option.value && (
                    <div className="w-2 h-2 bg-blue-600 rounded-full" />
                  )}
                </div>
                {option.label}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Clear Filters Button */}
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

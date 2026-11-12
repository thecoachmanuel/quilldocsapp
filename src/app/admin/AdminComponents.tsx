"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { LucideIcon, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const ORANGE_CARD_CLASS =
  "bg-white rounded-[17px] border-2 border-[#ebebeb] transition-all duration-200 hover:shadow-[0_0_10px_rgb(194,186,186)]";

export const ORANGE_CARD_HEADER_CLASS =
  "px-5 sm:px-6 py-4 border-b-2 border-[#ebebeb] flex flex-wrap items-center justify-between gap-3";

export const ORANGE_GRADIENT_BG =
  "bg-gradient-to-b from-[#FF6F43] to-[#FE1B03]";

export const ORANGE_BTN_CLASS =
  "inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-b from-[#FF6F43] to-[#FE1B03] px-4 py-2 text-xs sm:text-sm font-medium text-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(254,27,3,0.28)] disabled:opacity-60 disabled:hover:translate-y-0";

export const ORANGE_OUTLINE_BTN_CLASS =
  "inline-flex items-center justify-center gap-1.5 rounded-full bg-white border border-[#ebebeb] px-4 py-2 text-xs sm:text-sm font-medium text-[#141010] transition-all duration-200 hover:border-[#FF6F43] hover:text-[#FE1B03] disabled:opacity-60";

export const ORANGE_TABLE_HEAD_ROW_CLASS =
  "bg-[#a9a9a926] text-[#141010] text-[13px] font-semibold border-0";

export const ORANGE_TABLE_BODY_ROW_CLASS =
  "odd:bg-white even:bg-[#fafafa] hover:bg-[#fff5f2]/70 transition-colors border-b border-[#f1f1f1] last:border-b-0";

interface AdminStatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  valueClassName?: string;
  icon: LucideIcon;
  badge?: ReactNode;
}

/**
 * Matches the signature `orange-backend` `.card-statistic-4` card with floating
 * orange-red gradient `.card-icon2` badge.
 */
export function AdminStatCard({
  title,
  value,
  subtitle,
  valueClassName,
  icon: Icon,
  badge,
}: AdminStatCardProps) {
  return (
    <div className={cn(ORANGE_CARD_CLASS, "p-5 flex flex-col justify-between")}>
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="w-[50px] h-[50px] rounded-[10px] bg-gradient-to-b from-[#FF6F43] to-[#FE1B03] shadow-[2px_2px_10px_0_rgba(151,151,151,0.58)] flex items-center justify-center text-white shrink-0">
            <Icon className="h-[22px] w-[22px] text-white" />
          </div>
          {badge}
        </div>

        <h5 className="text-[15px] font-medium text-[#212529] mt-3.5 leading-snug">
          {title}
        </h5>
        <h3
          className={cn(
            "text-2xl font-bold text-[#141010] mt-1 tracking-tight",
            valueClassName
          )}
        >
          {value}
        </h3>
      </div>

      {subtitle && (
        <small className="text-xs text-zinc-500 mt-1.5 block leading-relaxed">
          {subtitle}
        </small>
      )}
    </div>
  );
}

interface FilterOption<T extends string> {
  label: string;
  value: T;
  count?: number;
}

interface AdminFilterPillsProps<T extends string> {
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Matches `orange-backend` `.nav-pills` filter tabs with smooth gradient active state.
 */
export function AdminFilterPills<T extends string>({
  options,
  value,
  onChange,
  className,
}: AdminFilterPillsProps<T>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-full bg-[#f4f6f9] p-1 border border-[#ebebeb]",
        className
      )}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all whitespace-nowrap",
              active
                ? "bg-gradient-to-b from-[#FF6F43] to-[#FE1B03] text-white shadow-[0_2px_6px_rgba(255,111,67,0.38)]"
                : "text-[#141010] hover:bg-white/80 hover:text-[#FE1B03]"
            )}
          >
            <span>{opt.label}</span>
            {typeof opt.count === "number" && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px] font-semibold",
                  active
                    ? "bg-white/25 text-white"
                    : "bg-[#ebebeb] text-zinc-600"
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface AdminTableControlsProps {
  showingLabel: string;
  searchPlaceholder: string;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  extraRight?: ReactNode;
}

/**
 * Matches the `orange-backend` `.dataTables_filter` row: showing count left, pill search right.
 */
export function AdminTableControls({
  showingLabel,
  searchPlaceholder,
  searchQuery,
  onSearchChange,
  extraRight,
}: AdminTableControlsProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 sm:px-6 py-4 border-b border-[#f0f0f0] bg-white">
      <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-zinc-600">
        <span className="inline-block h-2 w-2 rounded-full bg-gradient-to-b from-[#FF6F43] to-[#FE1B03]" />
        <span>{showingLabel}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {extraRight}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full h-9 rounded-full border border-[#CED4DA] bg-[#FAFAFA] pl-9 pr-4 text-xs sm:text-sm text-[#141010] placeholder:text-zinc-400 focus:outline-none focus:border-[#FF6F43] transition-colors"
          />
        </div>
      </div>
    </div>
  );
}

interface AnalyticsChartProps {
  userDates: string[];
  fileDates: string[];
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function buildSmoothCurvePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];

    const tension = 0.2;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return path;
}

/**
 * Pure SVG smooth dual-spline area chart modeled after `orange-backend` ApexCharts
 * (`#000000` + `#FE1B03` strokes, height 350, smooth stroke 3, month/year dropdowns).
 */
export function AdminAnalyticsChart({
  userDates,
  fileDates,
}: AnalyticsChartProps) {
  const currentYear = new Date().getFullYear();

  const availableYears = useMemo(() => {
    const set = new Set<number>([currentYear]);
    [...userDates, ...fileDates].forEach((iso) => {
      const yr = new Date(iso).getFullYear();
      if (!isNaN(yr)) set.add(yr);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [userDates, fileDates, currentYear]);

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<"ALL" | number>("ALL");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const chartSeries = useMemo(() => {
    if (selectedMonth === "ALL") {
      const userCounts = Array(12).fill(0);
      const fileCounts = Array(12).fill(0);

      userDates.forEach((iso) => {
        const d = new Date(iso);
        if (d.getFullYear() === selectedYear) {
          userCounts[d.getMonth()] += 1;
        }
      });
      fileDates.forEach((iso) => {
        const d = new Date(iso);
        if (d.getFullYear() === selectedYear) {
          fileCounts[d.getMonth()] += 1;
        }
      });

      return MONTHS.map((label, idx) => ({
        label: label.slice(0, 3),
        fullLabel: `${label} ${selectedYear}`,
        users: userCounts[idx],
        files: fileCounts[idx],
      }));
    }

    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const userCounts = Array(daysInMonth).fill(0);
    const fileCounts = Array(daysInMonth).fill(0);

    userDates.forEach((iso) => {
      const d = new Date(iso);
      if (d.getFullYear() === selectedYear && d.getMonth() === selectedMonth) {
        userCounts[d.getDate() - 1] += 1;
      }
    });
    fileDates.forEach((iso) => {
      const d = new Date(iso);
      if (d.getFullYear() === selectedYear && d.getMonth() === selectedMonth) {
        fileCounts[d.getDate() - 1] += 1;
      }
    });

    return Array.from({ length: daysInMonth }, (_, i) => ({
      label: String(i + 1),
      fullLabel: `${MONTHS[selectedMonth]} ${i + 1}, ${selectedYear}`,
      users: userCounts[i],
      files: fileCounts[i],
    }));
  }, [userDates, fileDates, selectedYear, selectedMonth]);

  const svgWidth = 860;
  const svgHeight = 310;
  const padLeft = 42;
  const padRight = 22;
  const padTop = 24;
  const padBottom = 38;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const maxValue = useMemo(() => {
    const rawMax = Math.max(
      4,
      ...chartSeries.map((d) => Math.max(d.users, d.files))
    );
    return Math.ceil(rawMax * 1.18);
  }, [chartSeries]);

  const { userPoints, filePoints } = useMemo(() => {
    const count = Math.max(1, chartSeries.length - 1);
    const toPoint = (idx: number, val: number) => {
      const x = padLeft + (chartSeries.length === 1 ? plotW / 2 : (idx / count) * plotW);
      const y = padTop + plotH - (val / maxValue) * plotH;
      return { x, y };
    };
    return {
      userPoints: chartSeries.map((d, i) => toPoint(i, d.users)),
      filePoints: chartSeries.map((d, i) => toPoint(i, d.files)),
    };
  }, [chartSeries, maxValue, plotW, plotH]);

  const userStroke = buildSmoothCurvePath(userPoints);
  const fileStroke = buildSmoothCurvePath(filePoints);

  const baselineY = padTop + plotH;
  const buildAreaPath = (strokePath: string, pts: Array<{ x: number; y: number }>) => {
    if (!strokePath || pts.length === 0) return "";
    const last = pts[pts.length - 1];
    const first = pts[0];
    return `${strokePath} L ${last.x.toFixed(2)} ${baselineY} L ${first.x.toFixed(2)} ${baselineY} Z`;
  };

  const userArea = buildAreaPath(userStroke, userPoints);
  const fileArea = buildAreaPath(fileStroke, filePoints);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    value: Math.round(maxValue * t),
    y: padTop + plotH - t * plotH,
  }));

  const hoveredDatum =
    hoverIndex !== null ? chartSeries[hoverIndex] : null;
  const hoveredX =
    hoverIndex !== null && userPoints[hoverIndex]
      ? userPoints[hoverIndex].x
      : null;

  return (
    <div className={cn(ORANGE_CARD_CLASS, "overflow-hidden")}>
      <div className={ORANGE_CARD_HEADER_CLASS}>
        <div>
          <h4 className="text-[17px] font-bold text-[#212529]">Analytics</h4>
          <p className="text-xs text-zinc-500 mt-0.5">
            New user registrations vs. documents uploaded
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter analytics by month"
            value={selectedMonth}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedMonth(v === "ALL" ? "ALL" : Number(v));
              setHoverIndex(null);
            }}
            className="h-8 rounded-lg border border-[#ebebeb] bg-[#fafafa] px-3 text-xs font-medium text-[#141010] focus:outline-none focus:border-[#FF6F43] cursor-pointer"
          >
            <option value="ALL">All Months</option>
            {MONTHS.map((m, idx) => (
              <option key={m} value={idx}>
                {m}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter analytics by year"
            value={selectedYear}
            onChange={(e) => {
              setSelectedYear(Number(e.target.value));
              setHoverIndex(null);
            }}
            className="h-8 rounded-lg border border-[#ebebeb] bg-[#fafafa] px-3 text-xs font-medium text-[#141010] focus:outline-none focus:border-[#FF6F43] cursor-pointer"
          >
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <div className="relative w-full overflow-hidden">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-[250px] sm:h-[310px] select-none overflow-visible"
            onMouseLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient id="quillUsersFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#000000" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0.01" />
              </linearGradient>
              <linearGradient id="quillDocsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FE1B03" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#FF6F43" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Horizontal grid lines */}
            {yTicks.map((tick, idx) => (
              <g key={idx}>
                <line
                  x1={padLeft}
                  y1={tick.y}
                  x2={svgWidth - padRight}
                  y2={tick.y}
                  stroke="#ebebeb"
                  strokeDasharray={idx === 0 ? undefined : "4 4"}
                  strokeWidth={1}
                />
                <text
                  x={padLeft - 10}
                  y={tick.y + 4}
                  textAnchor="end"
                  className="fill-zinc-400 text-[11px] font-medium"
                >
                  {tick.value}
                </text>
              </g>
            ))}

            {/* Area fills */}
            <path d={userArea} fill="url(#quillUsersFill)" />
            <path d={fileArea} fill="url(#quillDocsFill)" />

            {/* Smooth Spline Strokes */}
            <path
              d={userStroke}
              fill="none"
              stroke="#000000"
              strokeWidth={3}
              strokeLinecap="round"
            />
            <path
              d={fileStroke}
              fill="none"
              stroke="#FE1B03"
              strokeWidth={3}
              strokeLinecap="round"
            />

            {/* X Axis Labels */}
            {chartSeries.map((d, i) => {
              const showLabel =
                selectedMonth === "ALL" ||
                i === 0 ||
                i === chartSeries.length - 1 ||
                (i + 1) % 5 === 0;
              if (!showLabel) return null;
              return (
                <text
                  key={d.label + i}
                  x={userPoints[i]?.x || 0}
                  y={svgHeight - 10}
                  textAnchor="middle"
                  className="fill-zinc-500 text-[11px] font-medium"
                >
                  {d.label}
                </text>
              );
            })}

            {/* Hover crosshair & active dots */}
            {hoverIndex !== null && hoveredX !== null && (
              <g>
                <line
                  x1={hoveredX}
                  y1={padTop}
                  x2={hoveredX}
                  y2={baselineY}
                  stroke="#d4d4d8"
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                />
                <circle
                  cx={userPoints[hoverIndex].x}
                  cy={userPoints[hoverIndex].y}
                  r={5}
                  fill="#000000"
                  stroke="#ffffff"
                  strokeWidth={2}
                />
                <circle
                  cx={filePoints[hoverIndex].x}
                  cy={filePoints[hoverIndex].y}
                  r={5}
                  fill="#FE1B03"
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              </g>
            )}

            {/* Invisible interactive column targets */}
            {chartSeries.map((d, i) => {
              const ptX = userPoints[i]?.x || padLeft;
              const colW = plotW / Math.max(1, chartSeries.length);
              return (
                <rect
                  key={i}
                  x={ptX - colW / 2}
                  y={padTop}
                  width={Math.max(colW, 12)}
                  height={plotH}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverIndex(i)}
                  onClick={() => setHoverIndex(i)}
                />
              );
            })}
          </svg>

          {/* Floating Tooltip */}
          {hoveredDatum && hoveredX !== null && (
            <div
              className="pointer-events-none absolute top-2 z-10 rounded-xl border border-[#ebebeb] bg-[#141010] px-3 py-2 text-xs text-white shadow-lg transition-all duration-150"
              style={{
                left: `${Math.min(Math.max((hoveredX / svgWidth) * 100, 12), 78)}%`,
                transform: "translateX(-50%)",
              }}
            >
              <p className="font-semibold text-zinc-200 mb-1">
                {hoveredDatum.fullLabel}
              </p>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-white border border-zinc-400" />
                  Users: <strong>{hoveredDatum.users}</strong>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#FE1B03]" />
                  Docs: <strong>{hoveredDatum.files}</strong>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Legend */}
        <div className="mt-3 pt-3 border-t border-[#f2f2f2] flex flex-wrap items-center justify-center gap-6 text-xs font-medium text-[#212529]">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-black inline-block" />
            <span>New Users</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FE1B03] inline-block" />
            <span>Documents Uploaded</span>
          </div>
        </div>
      </div>
    </div>
  );
}


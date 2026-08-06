// Recharts panel — default-exported and lazy-loaded so recharts stays out
// of the main chunk (PayDay's pattern). Theming: CSS variables passed
// straight into chart props; the custom tooltip is a Tailwind-classed div
// so it follows light/dark automatically.

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useStore } from '../../store/useStore';
import {
  buildPainSeries,
  buildRomSeries,
  buildWeekBuckets,
} from '../../lib/progress';
import { addDays, formatShort, parseDateKey, todayKey } from '../../lib/dates';
import { Card, SectionLabel } from '../../components/ui/Card';

const MARK = 'var(--chart-mark)';
const PRE = 'var(--danger)';
const POST = 'var(--accent)';
const GRID = 'var(--border-c)';
const TICK = { fill: 'var(--muted)', fontSize: 11 } as const;

const ROM_COLORS = ['var(--chart-mark)', 'var(--warn)', 'var(--danger)'];

interface TooltipRow {
  name?: string;
  value?: number | string | null;
  color?: string;
}

function ChartTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string | number;
  payload?: TooltipRow[];
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((r) => r.value !== null && r.value !== undefined);
  if (!rows.length) return null;
  return (
    <div className="rounded-(--radius-control) border border-line bg-surface px-2.5 py-1.5 text-xs shadow-lg">
      <div className="font-semibold">{label}</div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5 text-muted">
          <span className="size-2 rounded-full" style={{ background: r.color }} />
          {r.name}: <span className="font-medium text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <SectionLabel>{title}</SectionLabel>
      <div className="mt-2 h-44">{children}</div>
    </Card>
  );
}

export default function ChartsPanel() {
  const metrics = useStore((s) => s.metrics);
  const ptSessions = useStore((s) => s.ptSessions);
  const meds = useStore((s) => s.meds);
  const doses = useStore((s) => s.doses);
  const injury = useStore((s) => s.injury);

  const now = Date.now();
  const today = todayKey();
  const from = injury.occurredOn && injury.occurredOn > addDays(today, -90)
    ? injury.occurredOn
    : addDays(today, -30);

  const pain = buildPainSeries(metrics, ptSessions, from, today);
  const rom = buildRomSeries(metrics, ptSessions);
  const weeks = buildWeekBuckets(ptSessions, meds, doses, 8, now);

  const milestoneKeys = Object.values(injury.targetMilestones)
    .filter((m) => m.targetOn >= from && m.targetOn <= today)
    .map((m) => ({ label: m.label, x: formatShort(parseDateKey(m.targetOn)) }));

  const hasPain = pain.some((p) => p.pain !== null || p.ptPre !== null);

  return (
    <div className="space-y-3">
      <Panel title="Pain trend">
        {hasPain ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pain} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis domain={[0, 10]} tick={TICK} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: GRID }} />
              {milestoneKeys.map((m) => (
                <ReferenceLine
                  key={m.label}
                  x={m.x}
                  stroke={GRID}
                  strokeDasharray="4 3"
                  label={{ value: m.label, fill: 'var(--muted)', fontSize: 10, position: 'top' }}
                />
              ))}
              <Line
                type="monotone"
                dataKey="pain"
                name="Daily pain"
                stroke={MARK}
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="ptPre"
                name="PT before"
                stroke={PRE}
                strokeWidth={0}
                dot={{ r: 3, fill: PRE }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="ptPost"
                name="PT after"
                stroke={POST}
                strokeWidth={0}
                dot={{ r: 3, fill: POST }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="pt-6 text-center text-sm text-muted">
            Log daily pain on Today to see the trend.
          </p>
        )}
      </Panel>

      {rom.length > 0 ? (
        <Panel title="Range of motion">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis
                dataKey="label"
                type="category"
                allowDuplicatedCategory={false}
                tick={TICK}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis tick={TICK} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: GRID }} />
              {rom.map((series, i) => (
                <Line
                  key={series.joint}
                  data={series.points}
                  dataKey="degrees"
                  name={series.joint}
                  type="monotone"
                  stroke={ROM_COLORS[i % ROM_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      ) : null}

      <Panel title="PT sessions per week">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weeks} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--accent-soft)' }} />
            <Bar
              dataKey="sessions"
              name="Sessions"
              fill={MARK}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Med adherence by week (%)">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weeks} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} tick={TICK} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--accent-soft)' }} />
            <Bar
              dataKey="adherencePct"
              name="Taken %"
              fill={MARK}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}

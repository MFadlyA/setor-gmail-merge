'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/admin/ui/card';
import { ChartConfig, ChartContainer, ChartTooltip } from '@/components/admin/ui/line-charts-9';
import { RefreshCw, Eye, EyeOff } from 'lucide-react';
import { CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts';

export interface ChartPoint {
  date: string;
  amount: number;
  count: number;
}

const chartConfig = {
  amount: {
    label: 'Nominal',
    color: '#a855f7',
  },
} satisfies ChartConfig;

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: ChartPoint;
  }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, isBalanceHidden }: TooltipProps & { isBalanceHidden?: boolean }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 shadow-xl text-xs">
        <div className="text-zinc-400 mb-1">{data.date}</div>
        <div className="flex items-center gap-2">
          <div className="font-bold text-white font-mono">
            {isBalanceHidden ? 'Rp ***' : `Rp ${Number(data.amount || 0).toLocaleString('id-ID')}`}
          </div>
          <div className="text-[11px] font-semibold text-emerald-400">
            {data.count} Akun
          </div>
        </div>
      </div>
    );
  }
  return null;
};

function formatYAxisTick(value: number, isBalanceHidden: boolean): string {
  if (isBalanceHidden) return '***';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}jt`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return String(value);
}

export function LineChart9({
  className = '',
  onRefresh,
  isRefreshing,
  timeframe = 'All',
  onTimeframeChange,
  gmailDisetor,
  hargaGmail,
  isBalanceHidden = false,
  onToggleHideBalance,
  chartData,
  totalAmount,
}: {
  className?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  timeframe?: string;
  onTimeframeChange?: (period: string) => void;
  gmailDisetor?: number | string;
  hargaGmail?: number | string;
  isBalanceHidden?: boolean;
  onToggleHideBalance?: () => void;
  chartData?: ChartPoint[];
  totalAmount?: number;
}) {
  const [internalTimeframe, setInternalTimeframe] = useState<string>('All');

  const activeTimeframe = timeframe || internalTimeframe;
  const handleTimeframeSelect = (period: string) => {
    setInternalTimeframe(period);
    if (onTimeframeChange) {
      onTimeframeChange(period);
    }
  };

  // Real-time data strictly from database
  const activeData: ChartPoint[] = React.useMemo(() => {
    if (chartData && chartData.length > 0) return chartData;
    return [{ date: 'Hari Ini', amount: 0, count: 0 }];
  }, [chartData]);

  const currentTotal = React.useMemo(() => {
    if (typeof totalAmount === 'number') return totalAmount;
    return activeData.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [totalAmount, activeData]);

  const highVal = Math.max(...activeData.map((d) => d.amount));
  const refItem = activeData[Math.floor(activeData.length / 2)];
  const refDate = refItem?.date;

  const lineColor = '#c084fc';
  const strokeGlow = 'rgba(168, 85, 247, 0.7)';

  return (
    <Card className={`w-full bg-zinc-900/90 border border-zinc-800 shadow-sm ${className}`}>
      <CardContent className="flex flex-col items-stretch gap-5 p-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                {isBalanceHidden ? 'Rp ***' : `Rp ${currentTotal.toLocaleString('id-ID')}`}
              </span>
              {onToggleHideBalance && (
                <button
                  type="button"
                  onClick={onToggleHideBalance}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                  title={isBalanceHidden ? 'Tampilkan Angka' : 'Sembunyikan Angka'}
                >
                  {isBalanceHidden ? (
                    <EyeOff className="w-5 h-5 text-zinc-400 hover:text-zinc-200" />
                  ) : (
                    <Eye className="w-5 h-5 text-zinc-400 hover:text-zinc-200" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Right side: Enlarged Refresh Button with Day Selector underneath */}
          <div className="flex flex-col sm:items-end gap-2 shrink-0">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="h-9 px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-600 text-zinc-100 transition-all cursor-pointer shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            )}

            {/* Timeframe Selector with 1D, 3D, 7D, 14D, 30D, All */}
            <div className="flex items-center gap-1 bg-zinc-950/80 p-0.5 rounded-lg border border-zinc-800">
              {['1D', '3D', '7D', '14D', '30D', 'All'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleTimeframeSelect(d)}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer border ${activeTimeframe === d
                      ? 'bg-zinc-800 text-purple-400 font-semibold border-zinc-700/80 shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border-transparent'
                    }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grow">
          {/* Stats Row */}
          <div className="flex items-center justify-between flex-wrap gap-4 text-xs mb-3 border-y border-zinc-800/80 py-2.5">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400">Gmail Disetor :</span>
                <span className="font-semibold text-white font-mono">
                  {isBalanceHidden
                    ? '*** Akun'
                    : gmailDisetor !== undefined
                    ? typeof gmailDisetor === 'number'
                      ? `${gmailDisetor.toLocaleString('id-ID')} Akun`
                      : gmailDisetor
                    : '2 Akun'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400">Harga Gmail :</span>
                <span className="font-semibold text-emerald-400 font-mono">
                  {isBalanceHidden
                    ? 'Rp ***'
                    : hargaGmail !== undefined
                      ? typeof hargaGmail === 'number'
                        ? `Rp ${hargaGmail.toLocaleString('id-ID')}`
                        : hargaGmail
                      : 'Rp 4.500'}
                </span>
              </div>
            </div>
          </div>

          {/* Chart */}
          <ChartContainer
            config={chartConfig}
            className="h-72 sm:h-80 w-full min-w-0 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-initial"
          >
            <ComposedChart
              data={activeData}
              margin={{
                top: 20,
                right: 15,
                left: 10,
                bottom: 10,
              }}
            >
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
                <pattern id="dotGrid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="10" cy="10" r="1" fill="#3f3f46" fillOpacity="0.4" />
                </pattern>
                <filter id="dotShadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="2" dy="3" stdDeviation="3" floodColor="rgba(0,0,0,0.8)" />
                </filter>
                <filter id="lineShadow" x="-100%" y="-100%" width="300%" height="300%">
                  <feDropShadow dx="2" dy="4" stdDeviation="15" floodColor={strokeGlow} />
                </filter>
              </defs>

              <rect x="0" y="0" width="100%" height="100%" fill="url(#dotGrid)" style={{ pointerEvents: 'none' }} />

              <CartesianGrid
                strokeDasharray="4 8"
                stroke="#27272a"
                strokeOpacity={0.8}
                horizontal={true}
                vertical={false}
              />

              {/* Active tick reference line */}
              {refDate && (
                <ReferenceLine x={refDate} stroke={lineColor} strokeDasharray="4 4" strokeWidth={1} />
              )}

              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                height={30}
                tick={{ fontSize: 11, fill: '#a1a1aa' }}
                tickMargin={8}
                interval="preserveStartEnd"
              />

              <YAxis
                axisLine={false}
                tickLine={false}
                width={52}
                tick={{ fontSize: 11, fill: '#a1a1aa' }}
                tickFormatter={(value) => formatYAxisTick(Number(value), isBalanceHidden)}
                tickMargin={8}
              />

              <ChartTooltip
                content={<CustomTooltip isBalanceHidden={isBalanceHidden} />}
                cursor={{ strokeDasharray: '3 3', stroke: '#71717a', strokeOpacity: 0.5 }}
              />

              <Line
                key={activeTimeframe}
                type="monotone"
                dataKey="amount"
                stroke={lineColor}
                strokeWidth={2.5}
                filter="url(#lineShadow)"
                isAnimationActive={true}
                animationDuration={600}
                animationEasing="ease-in-out"
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (
                    (payload.amount > 0 && payload.amount === highVal) ||
                    payload.date === refDate
                  ) {
                    return (
                      <circle
                        key={`dot-${payload.date}`}
                        cx={cx}
                        cy={cy}
                        r={5}
                        fill={lineColor}
                        stroke="#ffffff"
                        strokeWidth={2}
                        filter="url(#dotShadow)"
                      />
                    );
                  }

                  return <g key={`dot-${payload.date}`} />;
                }}
                activeDot={{
                  r: 6,
                  fill: lineColor,
                  stroke: '#ffffff',
                  strokeWidth: 2,
                  filter: 'url(#dotShadow)',
                }}
              />
            </ComposedChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export default LineChart9;

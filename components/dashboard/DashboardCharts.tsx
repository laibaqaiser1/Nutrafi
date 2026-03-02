'use client'

import {
  LineChart,
  Line,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

// Theme green first, then other colours (for pie chart fallback)
const CHART_COLORS = [
  '#728d53', // nutrafi-primary (theme green)
  '#9eb664', // nutrafi-light
  '#4f6849', // nutrafi-dark
  '#718d55', // nutrafi-primary-alt
  '#0d9488', // teal
  '#f59e0b', // amber
  '#e11d48', // rose
  '#4f46e5', // indigo
  '#7c3aed', // violet
  '#0284c7', // sky
  '#ea580c', // orange
  '#6b7280', // gray
]

// Prominent, distinct colours for each point on the meals line (high contrast)
const MEALS_POINT_COLORS = [
  '#0d9488', // teal
  '#728d53', // theme green
  '#4f46e5', // indigo
  '#f59e0b', // amber
  '#0284c7', // sky
  '#7c3aed', // violet
  '#ea580c', // orange
]

// Semantic colours for customer status (Active, Inactive, Disabled)
const STATUS_COLORS: Record<string, string> = {
  Active: '#728d53',   // theme green
  Inactive: '#64748b', // slate
  Disabled: '#dc2626', // red
}
const STATUS_COLOR_FALLBACK = '#94a3b8'

export type MealsPerDayPoint = { date: string; meals: number; label: string }
export type CountByStatus = { status: string; count: number }

type DashboardChartsProps = {
  mealsPerDay: MealsPerDayPoint[]
  customersByStatus: CountByStatus[]
}

export function DashboardCharts({
  mealsPerDay,
  customersByStatus,
}: DashboardChartsProps) {
  return (
    <div className="mt-6 lg:mt-8 grid grid-cols-1 gap-4 lg:gap-6 lg:grid-cols-2">
      {/* Meals over last 7 days */}
      <div className="bg-white overflow-hidden shadow-sm rounded-xl border border-gray-100 p-5 lg:p-6 border-l-4 border-l-[#728d53]">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Meals (last 7 days)</h2>
        <p className="text-xs text-gray-500 mb-4">Non-skipped meals per day</p>
        <div className="h-64 lg:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={mealsPerDay} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="mealsAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#728d53" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#728d53" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                width={24}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                }}
                formatter={(value: number | undefined) => [value ?? 0, 'Meals']}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.date}
                labelStyle={{ color: '#334155', fontWeight: 600 }}
              />
              <Area
                type="monotone"
                dataKey="meals"
                stroke="none"
                fill="url(#mealsAreaFill)"
              />
              <Line
                type="monotone"
                dataKey="meals"
                name="Meals"
                stroke="#4f6849"
                strokeWidth={2.5}
                dot={(props) => {
                  const { cx, cy, index } = props
                  const fill = MEALS_POINT_COLORS[index % MEALS_POINT_COLORS.length]
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={6}
                      fill={fill}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  )
                }}
                activeDot={(props) => {
                  const { cx, cy, index } = props
                  const fill = MEALS_POINT_COLORS[index % MEALS_POINT_COLORS.length]
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={7}
                      fill={fill}
                      stroke="#4f6849"
                      strokeWidth={2}
                    />
                  )
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Customers by status */}
      <div className="bg-white overflow-hidden shadow-sm rounded-xl border border-gray-100 p-5 lg:p-6 border-l-4 border-l-[#9eb664]">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Customers by status</h2>
        <p className="text-xs text-gray-500 mb-4">Active, Inactive, and Disabled</p>
        <div className="h-64 lg:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={customersByStatus}
                dataKey="count"
                nameKey="status"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                label={({ name, value }) => `${name ?? '—'}: ${value ?? 0}`}
              >
                {customersByStatus.map((row) => (
                  <Cell
                    key={row.status}
                    fill={STATUS_COLORS[row.status] ?? STATUS_COLOR_FALLBACK}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                }}
                formatter={(value: number | undefined) => [value ?? 0, 'Customers']}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

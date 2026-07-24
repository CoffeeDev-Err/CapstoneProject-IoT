import { useMemo, useState } from 'react'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { ANALYTICS_DATA_BY_TIMEFRAME } from '../utils/analyticsChartData'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
)

const TIMEFRAME_OPTIONS = [
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'Monthly' },
]

const CHART_FONT_FAMILY = 'Space Grotesk, Manrope, Segoe UI, sans-serif'

function PatrolIncidentsChart({ chartVariant = 'grouped', dataByTimeframe = ANALYTICS_DATA_BY_TIMEFRAME }) {
  const [timeframe, setTimeframe] = useState('week')

  const selectedData = dataByTimeframe[timeframe] ?? dataByTimeframe.week
  const incidentsType = chartVariant === 'mixed' ? 'line' : 'bar'

  const chartData = useMemo(
    () => ({
      labels: selectedData.labels,
      datasets: [
        {
          type: 'bar',
          label: 'Patrols',
          data: selectedData.patrols,
          backgroundColor: '#2563eb',
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 40,
          barPercentage: 0.72,
          categoryPercentage: 0.64,
          borderColor: 'rgba(37, 99, 235, 0.2)',
          borderWidth: 1,
        },
        {
          type: incidentsType,
          label: 'Incidents',
          data: selectedData.incidents,
          backgroundColor: incidentsType === 'line' ? 'rgba(245, 158, 11, 0.08)' : '#f59e0b',
          borderWidth: incidentsType === 'line' ? 2.5 : 0,
          tension: 0.4,
          pointRadius: incidentsType === 'line' ? 4 : 0,
          pointHoverRadius: incidentsType === 'line' ? 6 : 0,
          pointBackgroundColor: '#f59e0b',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          fill: incidentsType === 'line',
          maxBarThickness: 40,
          barPercentage: 0.72,
          categoryPercentage: 0.64,
          borderColor: incidentsType === 'bar' ? 'rgba(245, 158, 11, 0.2)' : '#f59e0b',
        },
      ],
    }),
    [selectedData, incidentsType],
  )

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 900,
        easing: 'easeOutQuart',
      },
      animations: {
        y: {
          from: 0,
          delay(context) {
            if (context.type !== 'data') return 0
            return context.dataIndex * 55 + context.datasetIndex * 120
          },
        },
      },
      transitions: {
        active: {
          animation: {
            duration: 300,
          },
        },
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'bottom',
          align: 'start',
          labels: {
            color: '#cbd5e1',
            boxWidth: 12,
            boxHeight: 12,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 20,
            font: {
              family: CHART_FONT_FAMILY,
              size: 13,
              weight: 600,
              lineHeight: 1.5,
            },
            generateLabels: (chart) => {
              const datasets = chart.data.datasets
              return datasets.map((dataset, i) => ({
                text: dataset.label,
                fillStyle: dataset.borderColor || dataset.backgroundColor,
                hidden: !chart.isDatasetVisible(i),
                index: i,
                pointStyle: 'circle',
                strokeStyle: dataset.borderColor,
                fontColor: '#cbd5e1',
              }))
            },
          },
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          borderColor: 'rgba(100, 116, 139, 0.3)',
          borderWidth: 1,
          padding: 12,
          titleColor: '#f1f5f9',
          bodyColor: '#cbd5e1',
          titleFont: {
            family: CHART_FONT_FAMILY,
            size: 13,
            weight: 700,
          },
          bodyFont: {
            family: CHART_FONT_FAMILY,
            size: 12,
            weight: 500,
          },
          displayColors: true,
          borderRadius: 8,
          titleSpacing: 6,
          bodySpacing: 8,
          caretPadding: 8,
          boxPadding: 6,
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#94a3b8',
            font: {
              family: CHART_FONT_FAMILY,
              size: 12,
              weight: 500,
              lineHeight: 1.4,
            },
            padding: 8,
            maxRotation: 0,
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.08)',
            drawBorder: false,
            lineWidth: 1,
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: '#94a3b8',
            font: {
              family: CHART_FONT_FAMILY,
              size: 12,
              weight: 500,
              lineHeight: 1.4,
            },
            padding: 8,
            stepSize: undefined,
            callback: function (value) {
              return value.toLocaleString()
            },
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.12)',
            drawBorder: false,
            lineWidth: 1,
          },
        },
      },
    }),
    [],
  )

  return (
    <div className="analytics-chart-panel">
      <div className="analytics-chart-controls">
        <h3 className="widget-title mb-0">Patrol vs Incidents - {selectedData.label}</h3>

        <label className="analytics-chart-filter" htmlFor="analytics-timeframe-filter">
          <span className="analytics-chart-filter__label">Filter:</span>
          <select
            id="analytics-timeframe-filter"
            className="analytics-chart-filter__select"
            value={timeframe}
            onChange={(event) => setTimeframe(event.target.value)}
          >
            {TIMEFRAME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div key={timeframe} className="analytics-chart-canvas-wrap analytics-chart-canvas-wrap--animated">
        <Bar key={`${timeframe}-${incidentsType}`} options={chartOptions} data={chartData} />
      </div>
    </div>
  )
}

export default PatrolIncidentsChart

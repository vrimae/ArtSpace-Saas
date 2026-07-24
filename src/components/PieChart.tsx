import React from 'react';

interface PieChartProps {
  data: { label: string; value: number; color: string }[];
  centerLabel?: string;
  centerValue?: string;
  size?: number;
}

const PieChart: React.FC<PieChartProps> = ({ data, centerLabel, centerValue, size = 180 }) => {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  
  let accumulatedOffset = 0;

  return (
    <div className="chart-container">
      <div className="pie-chart-wrapper" style={{ width: size, height: size }}>
        <svg className="pie-chart-svg" viewBox="0 0 200 200" style={{ width: size, height: size }}>
          {total === 0 ? (
            <circle
              cx="100" cy="100" r={radius}
              fill="none"
              stroke="#e8ede8"
              strokeWidth="20"
            />
          ) : (
            data.map((segment, i) => {
              const percentage = segment.value / total;
              const strokeLength = percentage * circumference;
              const gapSize = data.length > 1 ? 4 : 0;
              const currentOffset = accumulatedOffset;
              accumulatedOffset += strokeLength + gapSize;

              return (
                <circle
                  key={i}
                  cx="100" cy="100" r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="22"
                  strokeDasharray={`${strokeLength - gapSize} ${circumference - strokeLength + gapSize}`}
                  strokeDashoffset={-currentOffset}
                  strokeLinecap="round"
                  style={{
                    transition: 'stroke-dasharray 0.8s ease, stroke-dashoffset 0.8s ease',
                  }}
                />
              );
            })
          )}
        </svg>
        {(centerLabel || centerValue) && (
          <div className="pie-chart-center-label">
            {centerLabel && <div className="label">{centerLabel}</div>}
            {centerValue && <div className="value">{centerValue}</div>}
          </div>
        )}
      </div>
      
      <div className="chart-legend">
        {data.map((segment, i) => (
          <div key={i} className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: segment.color }} />
            <span className="legend-label">{segment.label}</span>
            <span className="legend-value">{
              new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(segment.value)
            }</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PieChart;

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
}

/** Plain SVG polyline sparkline — no chart library needed at this size. */
export default function Sparkline({ values, width = 90, height = 28 }: SparklineProps) {
  if (values.length < 2) {
    return <svg width={width} height={height} aria-hidden />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

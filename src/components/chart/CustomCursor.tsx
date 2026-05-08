export const CustomCursor = ({ points, height, payload, color, isDrak }: any) => {
  if (!points || !payload) return null;
  const x = points[0].x; // x pixel position of tooltip
  const dataValue = payload[0]?.payload.inventory; // your Area Y value
  const chartHeight = height;

  // Map data value to pixel
  const yTop = chartHeight * (1 - dataValue / 100);
  const yBottom = chartHeight;

  return (
    <line
      x1={x}
      y1={yBottom}
      x2={x}
      y2={yTop}
      stroke={isDrak ? payload[2].color : '#071429'}
      strokeWidth={1}
      strokeDasharray="6 3"
    />
  );
};

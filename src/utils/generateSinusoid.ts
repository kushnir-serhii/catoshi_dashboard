export interface SinusoidOptions {
  amplitude: number;
  baseline: number;
  endbaseline?: number;
  pointsPerMonth: number;
  frequency?: number;
  phase: number;
  year?: number;
}

export const generateMonthlySinusoid = (options = {} as SinusoidOptions) => {
  const { amplitude = 30, baseline = 50, phase = 0, frequency = 2, pointsPerMonth = 10 } = options;

  const totalPoints = 12 * pointsPerMonth;
  const data = [];

  for (let i = 0; i < totalPoints; i++) {
    // Map i to month position (0 to 12)
    const monthPosition = (i / totalPoints) * 12;

    // Convert to radians and apply frequency
    const angle = frequency * monthPosition * ((2 * Math.PI) / 12) + phase;
    const value = baseline + amplitude * Math.sin(angle);

    // Round to 2 decimal places
    data.push(Math.round(value * 100) / 100);
  }

  return data;
};

// interface SinusoidOptions {
//   amplitude: number;
//   baseline: number;
//   endbaseline?: number;
//   frequency?: number;
//   phase: number;
//   year?: number;
// }

export const generateSimpleSinusoid = (options = {} as SinusoidOptions) => {
  const { amplitude = 30, baseline = 50, phase = 0, frequency = 1 } = options;

  const data = [];

  for (let month = 0; month < 12; month++) {
    const angle = frequency * month * ((2 * Math.PI) / 12) + phase;
    const value = baseline + amplitude * Math.sin(angle);
    data.push(Math.round(value * 100) / 100);
  }

  return data;
};

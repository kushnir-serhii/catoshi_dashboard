import { ISinusoidOptions } from "@/types/interfaces";

export const generateMonthlySinusoid = (options: ISinusoidOptions) => {
  const { amplitude = 30, baseline = 50, phase = 0, frequency = 2, pointsPerMonth = 10 } = options;

  const totalPoints = 12 * pointsPerMonth;
  const data = [];

  for (let i = 0; i < totalPoints; i++) {
    const monthPosition = (i / totalPoints) * 12;
    const angle = frequency * monthPosition * ((2 * Math.PI) / 12) + phase;
    const value = baseline + amplitude * Math.sin(angle);
    data.push(Math.round(value * 100) / 100);
  }

  return data;
};

export const generateWeeklyDates = (startYear: number = 2025) => {
  const dates = [];
  const startDate = new Date(startYear, 0, 1); // January 1st

  for (let i = 0; i < 48; i++) {
    // 12 months × 4 weeks
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i * 7); // Add 7 days for each week
    dates.push(date);
  }

  return dates;
};

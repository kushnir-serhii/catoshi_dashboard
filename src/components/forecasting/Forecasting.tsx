import { Chart } from '@/components/chart';
import {
  ForecastingHowItWorks,
  ForecastingFeature,
  ForecastingHeader,
} from '@/components/forecasting';

export const Forecasting: React.FC = () => {
  return (
    <div className="flex min-h-full w-full flex-col gap-4 pt-3.5 pr-4 pb-4 pl-4 md:gap-6 md:pl-0">
      <ForecastingHeader />
      <div className="flex h-full w-full flex-col gap-2 2xl:flex-row">
        <div className="flex max-h-full w-full flex-col gap-2">
          {/* Features */}
          <div className="4xl:max-h-auto lg:max-h-[180px]">
            <ForecastingFeature />
          </div>
          {/* Chart */}
          <Chart />
        </div>
        {/* How It Works */}
        <ForecastingHowItWorks />
      </div>
    </div>
  );
};

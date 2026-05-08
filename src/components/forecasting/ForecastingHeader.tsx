import { IconEye } from '@/assets/icons';
import { cn } from '@/utils/cn';
import { dynamicSize } from '@/utils/dynamicSize';
import Link from 'next/link';

export const ForecastingHeader: React.FC = () => {
  return (
    <div className="flex w-full flex-col justify-between gap-3 lg:flex-row xl:items-center">
      {/* Title */}
      <div className="relative flex flex-col items-start justify-start gap-2">
        <h2 className={'dynamic-h2 text-left'}>Location-Based Forecasting</h2>
        <p className="text-description">
          Robust Rate of Sale forecasting with location-aware calculations
        </p>
      </div>
      {/* Buttons */}
      <div className="flex flex-wrap items-center lg:flex-col xl:flex-row xl:gap-6">
        <Link
          href="#"
          className="relative flex items-center justify-start gap-2 px-5 py-[11px] transition hover:opacity-90 active:opacity-80 xl:pr-0"
        >
          <IconEye className="text-blue dark:text-blue/80 size-[18px] mb-0.5" />

          <span className="text-blue dark:text-blue/70 text-left font-[fixelDisplay] text-[15px]/3 font-medium">
            View Forecast Accuracy
          </span>
        </Link>
        <button className="bg-blue dark:bg-blue/50 flex items-center justify-center rounded-full px-5 py-[11px] transition hover:opacity-90 active:opacity-80">
          <p className="text-left font-[fixelDisplay] text-[15px] font-medium text-white">
            Adjust Forecast Settings
          </p>
        </button>
      </div>
    </div>
  );
};

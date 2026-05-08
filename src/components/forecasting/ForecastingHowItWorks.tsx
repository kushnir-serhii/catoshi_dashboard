import {
  IconRobustRate,
  IconLocation,
  IconManual,
  IconEllipse,
  IconEllipse_12,
} from '@/assets/icons';

export const ForecastingHowItWorks: React.FC = () => {
  const features = [
    {
      iconName: IconRobustRate,
      title: 'Robust Rate of Sale',
      description:
        'Consistent forecasting methodology that considers location-specific demand patterns and provides reliable predictions across all inventory items.',
    },
    {
      iconName: IconLocation,
      title: 'Location Awareness',
      description:
        'Forecasts are generated per location, allowing for accurate inventory projections that account for location-specific demand variations.',
    },
    {
      iconName: IconManual,
      title: 'Manual Overrides',
      description:
        'When automatic forecasting needs adjustment, manual overrides can be applied at the variant level for specific time periods.',
    },
  ];

  return (
    <div className="card-bg relative flex w-full flex-col items-center justify-start gap-[22px] overflow-hidden rounded-3xl px-3.5 pt-5 pb-3.5 2xl:min-h-full 2xl:max-w-[440px]">
      <div className="flex w-full flex-col items-center justify-start gap-2 px-1.5">
        <h4 className="dynamic-h4 w-full text-left font-semibold">How Forecasting Works</h4>
        <p className="text-description dynamic-text-sm w-full text-left">
          The forecasting system has been streamlined to use the robust rate of sale method across
          all locations for improved consistency and reliability.
        </p>
      </div>

      <ul className="relative z-20 flex max-h-full w-full flex-1 flex-col items-start justify-center gap-3 lg:grid lg:grid-cols-3 2xl:flex 2xl:flex-col">
        {features.map(({ iconName: Icon, title, description }) => (
          <li key={title} className="flex h-full w-full flex-1 flex-col">
            <div className="flex h-full w-full overflow-hidden rounded-xl">
              <div className="bg-card-bg dark:bg-card-bg-dark flex w-full flex-col items-start justify-between gap-3 p-[18px] xl:h-full">
                <Icon className="size-10" />
                <div className="flex w-full flex-col items-start justify-between gap-2">
                  <h3 className="dynamic-h4 text-left leading-5 font-semibold text-black dark:text-white">
                    {title}
                  </h3>
                  <p className="text-description dynamic-text-xs w-full leading-3.5 text-left">{description}</p>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {/* BG Ellipses */}
      <IconEllipse className="absolute bottom-[-131px] left-[-65px] -z-10 h-auto w-[528px] dark:hidden" />
      <IconEllipse_12 className="absolute top-[210px] right-[-60px] -z-10 h-auto w-[352px] dark:hidden" />
    </div>
  );
};

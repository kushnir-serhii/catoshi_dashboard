import { IconRobust, IconMultilocation, IconAvailable } from '@/assets/icons';

export const ForecastingFeature: React.FC = () => {
  const arrayFeatures = [
    {
      shortDescription: 'Forecasting Method',
      title: 'ROBUST_ROS',
      icon: IconRobust,
      description:
        'A forecasting method that uses sales velocity and demand smoothing to deliver consistent, location-aware predictions across all SKUs.',
    },
    {
      shortDescription: 'Location Support',
      title: 'IconMultiLocation',
      icon: IconMultilocation,
      description:
        'Each location is forecasted independently to prevent overstock and align supply with demand.',
    },
    {
      shortDescription: 'Override Support',
      title: 'Available',
      icon: IconAvailable,
      description:
        'Manual edits can be applied per SKU to adjust forecasts when deviations occur, ensuring more accurate and responsive inventory planning.',
    },
  ];
  return (
    <ul className="4xl:max-h-auto grid h-full w-full gap-2 lg:grid-cols-3">
      {arrayFeatures.map(({ title, icon: Icon, description, shortDescription }) => (
        <li key={title} className="flex w-full flex-1 flex-col">
          <div className="card-bg flex h-[180px] w-full flex-col items-start justify-between gap-2 rounded-[20px] px-[18px] py-4">
            <div className="flex w-full items-center justify-between">
              <div className="flex flex-col items-start justify-start gap-1">
                <p className="dynamic-sm text-left text-black dark:text-white/80">
                  {shortDescription}
                </p>
                <h3 className="dynamic-h3 text-left font-semibold text-black dark:text-white/90">
                  {title}
                </h3>
              </div>
              {/* Icon */}
              <Icon className="size-10.5" />
            </div>
            <p className="text-description dynamic-text-sm text-left">{description}</p>
          </div>
        </li>
      ))}
    </ul>
  );
};

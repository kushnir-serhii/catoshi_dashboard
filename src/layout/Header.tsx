'use client';

import { UserMenu } from '@/components/common';
import { Logo, InputSearch } from '@/components/ui';

export const Header: React.FC = () => {
  return (
    <header className="flex w-full">
      <div className="flex w-full flex-col items-start justify-between gap-3 py-3.5 pr-4 pl-4 sm:flex-row sm:items-center md:gap-0 md:pl-0 lg:flex-row">
        <div className="flex w-full justify-between">
          {/* <!-- Logo mobile --> */}
          <div className="md:hidden">
            <Logo />
          </div>
          {/* <!-- Search --> */}
          <div className="mr-auto ml-2 hidden sm:block">
            <InputSearch />
          </div>

          {/* <!-- User Area --> */}
          <UserMenu />
        </div>
        <div className="sm:hidden">
          <InputSearch />
        </div>
      </div>
    </header>
  );
};

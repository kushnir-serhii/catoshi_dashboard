'use client';

import React, { useState } from 'react';
import { cn } from '@/utils/cn';
import { IconEraser, IconSearch } from '@/assets/icons';

export const InputSearch = () => {
  const [isFocused, setIsFocused] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchValue.trim();
    if (query) {
      //  alert(`Searching for: ${searchValue}`);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div
        className={cn(
          'relative h-[46px] transition-all duration-400 ease-out',
          isFocused ? 'w-[280px]' : 'w-[46px] hover:w-[280px]',
        )}
      >
        <input
          type="text"
          placeholder="Search..."
          value={searchValue}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onChange={handleChange}
          className={cn(
            'h-full w-full rounded-full pl-5 dark:bg-white/5',
            'text-base transition-all duration-400 outline-none',
            'placeholder:text-gray-400 placeholder:transition-opacity placeholder:delay-200 placeholder:duration-200 dark:text-white/70 dark:caret-white/75 dark:placeholder:text-white/65',
            isFocused
              ? 'bg-white placeholder:opacity-100'
              : 'overflow-hidden bg-black/5 placeholder:opacity-0 hover:placeholder:opacity-100',
          )}
        />
        {!!searchValue && isFocused && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setSearchValue('')}
            className="group absolute top-1/2 right-12 z-10 -translate-y-1/2 transform"
          >
            <IconEraser
              className={
                'size-5 text-black transition group-hover:text-red-500 dark:text-white/35 dark:group-hover:text-red-500'
              }
            />
          </button>
        )}
        <button
          type="submit"
          onClick={handleSubmit}
          className="group absolute top-0 right-0 flex size-[46px] items-center justify-center rounded-full bg-black/4 transition-all hover:bg-black/10 dark:bg-white/5"
        >
          <span className="flex size-11 items-center justify-center rounded-full p-0.5">
            <IconSearch
              className={cn(
                'h-5 w-5 text-black transition-transform duration-300 dark:text-white/35',
                isFocused && 'rotate-90',
              )}
            />
          </span>
        </button>
      </div>
    </form>
  );
};

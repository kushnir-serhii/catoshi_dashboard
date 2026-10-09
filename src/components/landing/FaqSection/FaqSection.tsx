'use client';

import { useState } from 'react';

import { FaqItem } from './FaqItem';
import { FAQS } from './faqs';

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="section" id="faq">
      <div className="section-head">
        <div className="kicker">FAQ</div>
        <h2>Questions, with the small print.</h2>
      </div>
      <div className="faq">
        {FAQS.map((item, i) => (
          <FaqItem
            key={item.q}
            id={`faq-${i}`}
            q={item.q}
            a={item.a}
            open={openIndex === i}
            onToggle={() => setOpenIndex(openIndex === i ? null : i)}
          />
        ))}
      </div>
    </section>
  );
}

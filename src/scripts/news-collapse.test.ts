/**
 * Tests for the read-path cluster collapse (spec 027 technical 5.3).
 *
 * Run:  node --import tsx --test src/scripts/news-collapse.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { collapseClusters, type NewsSignalRow } from '@/lib/news/collapse';

function row(over: Partial<NewsSignalRow> & { id: string }): NewsSignalRow {
  return {
    cluster_id: over.id,
    tag: 'NEUTRAL',
    title: `title ${over.id}`,
    body: 'why',
    source: 'coindesk',
    source_url: `https://example.com/${over.id}`,
    published_at: '2026-10-05T10:00:00.000Z',
    expires_at: '2026-10-06T10:00:00.000Z',
    severity: 1,
    scope: 'market',
    magnitude: 'LOW',
    horizon_hours: 24,
    confidence: 0.5,
    content_type: 'event',
    ...over,
  };
}

describe('collapseClusters', () => {
  it('keeps unclustered rows as separate entries, in input order', () => {
    const out = collapseClusters([row({ id: '3' }), row({ id: '2' }), row({ id: '1' })]);
    assert.deepEqual(
      out.map((n) => n.id),
      ['3', '2', '1'],
    );
    assert.equal(out[0].sources.length, 1);
  });

  it('merges a cluster into one entry listing every source', () => {
    const out = collapseClusters([
      row({
        id: '9',
        cluster_id: '5',
        source: 'theblock',
        published_at: '2026-10-06T08:00:00.000Z',
      }),
      row({
        id: '7',
        cluster_id: '5',
        source: 'decrypt',
        published_at: '2026-10-06T07:00:00.000Z',
      }),
      row({
        id: '5',
        cluster_id: '5',
        source: 'coindesk',
        published_at: '2026-10-05T23:00:00.000Z',
      }),
    ]);
    assert.equal(out.length, 1);
    assert.deepEqual(
      out[0].sources.map((s) => s.source),
      ['coindesk', 'decrypt', 'theblock'],
    );
    assert.equal(out[0].sources[0].url, 'https://example.com/5');
  });

  it('picks the highest-severity member as representative', () => {
    const out = collapseClusters([
      row({ id: '9', cluster_id: '5', severity: 1, magnitude: 'LOW' }),
      row({ id: '5', cluster_id: '5', severity: 3, magnitude: 'HIGH' }),
    ]);
    assert.equal(out[0].id, '5');
    assert.equal(out[0].magnitude, 'HIGH');
  });

  it('breaks severity ties by most recent publication, then highest id', () => {
    const byTime = collapseClusters([
      row({ id: '1', cluster_id: '1', published_at: '2026-10-05T10:00:00.000Z' }),
      row({ id: '2', cluster_id: '1', published_at: '2026-10-05T12:00:00.000Z' }),
    ]);
    assert.equal(byTime[0].id, '2');
    const byId = collapseClusters([
      row({ id: '10', cluster_id: '1' }),
      row({ id: '9', cluster_id: '1' }),
    ]);
    assert.equal(byId[0].id, '10');
  });

  it('places a cluster where its first row appears and passes contentType through', () => {
    const out = collapseClusters([
      row({ id: '4', cluster_id: '2', content_type: 'opinion' }),
      row({ id: '3' }),
      row({ id: '2', cluster_id: '2', content_type: 'opinion' }),
      row({ id: '1', content_type: null }),
    ]);
    assert.deepEqual(
      out.map((n) => n.id),
      ['4', '3', '1'],
    );
    assert.equal(out[0].contentType, 'opinion');
    assert.equal(out[2].contentType, null);
  });
});

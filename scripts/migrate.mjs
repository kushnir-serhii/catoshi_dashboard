#!/usr/bin/env node
/**
 * Minimal migration runner for Catoshi.
 *
 *   node --env-file=.env.local scripts/migrate.mjs            # apply every pending file
 *   node --env-file=.env.local scripts/migrate.mjs --dry-run  # list what would run
 *   node --env-file=.env.local scripts/migrate.mjs 0001       # apply one file by prefix
 *
 * Uses DATABASE_URL_UNPOOLED. DDL and CREATE EXTENSION go over a direct
 * connection — the pooler runs in transaction mode and mishandles some of both.
 *
 * Each file runs inside one transaction: it applies whole or not at all.
 * Applied filenames are recorded in schema_migrations, so re-running is safe.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error('No DATABASE_URL_UNPOOLED (or DATABASE_URL) in the environment.');
  console.error('Run with:  node --env-file=.env.local scripts/migrate.mjs');
  process.exit(1);
}
if (process.env.DATABASE_URL_UNPOOLED === undefined) {
  console.warn('! DATABASE_URL_UNPOOLED not set — falling back to the pooled URL.');
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const only = args.find((a) => !a.startsWith('--'));

const client = new pg.Client({ connectionString });
await client.connect();

try {
  await client.query(`
    create table if not exists schema_migrations (
      filename    text primary key,
      applied_at  timestamptz not null default now()
    )
  `);

  const { rows } = await client.query('select filename from schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => (only ? f.startsWith(only) : true))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found in db/migrations.');
    process.exit(0);
  }

  let ran = 0;

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`· ${file} — already applied`);
      continue;
    }
    if (dryRun) {
      console.log(`→ ${file} — would apply`);
      ran += 1;
      continue;
    }

    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    process.stdout.write(`→ ${file} … `);

    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations (filename) values ($1)', [file]);
      await client.query('commit');
      console.log('ok');
      ran += 1;
    } catch (err) {
      await client.query('rollback');
      console.log('FAILED — rolled back, nothing was applied from this file');
      console.error(`\n  ${err.message}`);
      if (err.position) console.error(`  at character ${err.position}`);
      process.exitCode = 1;
      break;
    }
  }

  if (ran === 0 && process.exitCode !== 1) console.log('\nNothing to do — schema is up to date.');
} finally {
  await client.end();
}

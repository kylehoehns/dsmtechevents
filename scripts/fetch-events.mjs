// Fetches every group's events into data/cache/ (see scripts/refresh.mjs).
//
//   node scripts/fetch-events.mjs              the whole refresh
//   node scripts/fetch-events.mjs --only <id>  one group (or luma-<slug> event)
//                                              and nothing else; exits 1 if it fails
import path from 'node:path';
import { refresh } from './refresh.mjs';

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const report = await refresh({ root: path.resolve(import.meta.dirname, '..'), only });
if (only && report.problems.length) process.exit(1);

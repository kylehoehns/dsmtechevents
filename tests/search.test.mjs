import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, queryTerms, matchesAll, matchSpans, excerpt } from '../src/lib/search.mjs';
import { SYNONYMS } from '../src/lib/synonyms.mjs';

const finds = (q, text) => matchesAll(fold(text), queryTerms(q));
const marked = (q, text) => matchSpans(text, queryTerms(q)).map(([a, b]) => text.slice(a, b));

test('the rules from before synonyms still hold', () => {
  assert.ok(finds('ai', 'AI Study Group'));
  assert.ok(!finds('ai', 'as Uncle Bob said'));
  assert.ok(finds('telemetry', 'Tracing with OpenTelemetry'));
  assert.ok(finds('agents', 'the agent that files tickets'));
  assert.ok(!finds('ops', 'Remote DevOps Chat'));
  assert.ok(finds('.net', 'Iowa .NET User Group'));
  assert.ok(finds('net', 'Iowa .NET User Group'));
  assert.ok(!finds('.net', 'networking night'));
  assert.ok(!finds('c#', 'C and C++'));
  assert.ok(finds('c#', 'Records in C#'));
  assert.ok(finds('café', 'Cafe Night') && finds('cafe', 'Café Night'));
  assert.ok(finds('source python', 'Python at Source Allies'));
  assert.ok(!finds('source python', 'Python at Gravitate'));
  assert.ok(!finds('🎉', 'anything'));
  assert.ok(!finds('...', 'anything'));
});

test('a synonym finds what the word itself would not', () => {
  assert.ok(finds('ai', 'Pairing with Copilot'));
  assert.ok(finds('ai', 'Building LLM apps'));
  assert.ok(finds('ai', 'Intro to Machine Learning'));
  assert.ok(finds('ai', 'Intro to machine-learning'));
  assert.ok(finds('ai', 'LLMs in production'));
  assert.ok(finds('otel', 'Tracing with OpenTelemetry'));
  assert.ok(finds('opentelemetry', 'OTel collector deep dive'));
  assert.ok(finds('k8s', 'Kubernetes 101') && finds('kubernetes', 'K8s 101'));
  assert.ok(finds('js', 'JavaScript night') && finds('javascript', 'Node.js night'));
  assert.ok(finds('ts', 'TypeScript tips') && finds('typescript', 'TS tips'));
  assert.ok(finds('devops', 'Our CI/CD pipeline'));
  assert.ok(finds('devops', 'GitHub Actions for CI-CD'));
  assert.ok(finds('devops', 'Infrastructure as Code with Pulumi'));
  assert.ok(finds('web', 'Front-end performance'));
  assert.ok(finds('agents', 'Multi-agent systems'));
  assert.ok(finds('machine learning', 'Computer vision on the edge'));
  assert.ok(finds('ml', 'Neural nets'));
  assert.ok(finds('careers', 'Resume review'));
  assert.ok(finds('mobile', 'React Native at scale'));
  assert.ok(finds('iot', 'Raspberry Pi workshop'));
  assert.ok(finds('data', 'Power BI dashboards'));
});

test('a synonym of a plural key word, and every word still has to match', () => {
  assert.ok(finds('llms', 'ChatGPT tips'));
  assert.ok(finds('ai python', 'Python and Copilot'));
  assert.ok(!finds('ai python', 'Copilot for Java'));
});

test('synonyms are one-way', () => {
  assert.ok(!finds('copilot', 'AI Study Group'));
  assert.ok(!finds('llm', 'AI Study Group'));
  assert.ok(!finds('aws', 'Cloud night'));
  assert.ok(!finds('kubernetes', 'DevOps night'));
  for (const [key, list] of Object.entries(SYNONYMS)) assert.ok(!list.includes(key), `${key} lists itself`);
});

test('short synonyms keep to whole words', () => {
  assert.ok(!finds('ai', 'HTML and CSS')); // ml
  assert.ok(!finds('ai', 'Storage at scale')); // rag
  assert.ok(!finds('ai', 'Drag and drop')); // rag
  assert.ok(!finds('ai', 'Elixir for the MLH crowd')); // ml
  assert.ok(!finds('data', 'Bike to work day')); // bi
  assert.ok(!finds('web', 'Accessible forms')); // "accessibility" is a longer word than "accessible"
  assert.ok(finds('ai', 'RAG over your docs'));
  assert.ok(finds('ai', 'ML ops'));
  assert.ok(finds('ai', 'GPTs we built'));
});

test('a highlight covers just what matched', () => {
  assert.deepEqual(marked('ai', 'AI Study Group'), ['AI']);
  assert.deepEqual(marked('ai', 'Pairing with Copilot and an LLM'), ['Copilot', 'LLM']);
  assert.deepEqual(marked('telemetry', 'Tracing with OpenTelemetry'), ['Telemetry']);
  assert.deepEqual(marked('agent', 'Agents, agentic and multi-agent'), ['Agents', 'agent', 'multi-agent']);
  assert.deepEqual(marked('ai', 'Intro to Machine  Learning'), ['Machine  Learning']);
  assert.deepEqual(marked('ai', 'HTML'), []);
  // Folding keeps the original's positions: accents and apostrophes.
  assert.deepEqual(marked('cafe', 'The Café’s café'), ['Café’s', 'café']);
  assert.deepEqual(marked('dont', 'We don’t stop'), ['don’t']);
});

test('an excerpt shows about a dozen words around the first match', () => {
  const text = 'Bring a laptop and some questions. We will spend the evening pairing with Copilot on a small kata, then talk about what worked and what did not.';
  const x = excerpt(text, queryTerms('ai'));
  assert.equal(x.match, 'Copilot');
  assert.equal(`${x.before}[${x.match}]${x.after}`, '…spend the evening pairing with [Copilot] on a small kata, then talk…');
  const words = `${x.before} ${x.match} ${x.after}`.split(/\s+/).filter(Boolean).length;
  assert.ok(words >= 11 && words <= 13, `${words} words`);
  // Short text: no ellipses. A match inside a word keeps the whole word.
  const y = excerpt('Tracing with OpenTelemetry, and the agent.', queryTerms('telemetry'));
  assert.deepEqual(y, { before: 'Tracing with Open', match: 'Telemetry', after: ', and the agent.' });
  assert.equal(excerpt('Nothing here', queryTerms('ai')), null);
});

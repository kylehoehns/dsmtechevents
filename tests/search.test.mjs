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

// Phrases from real listings (PyOWA, ISSA, CIJUG).
test('"beginner" finds the events that say newcomers are welcome', () => {
  assert.ok(finds('beginner', 'approachable for all experience levels'));
  assert.ok(finds('beginners', 'Whether you’re a newbie or a seasoned pro'));
  assert.ok(finds('newcomer', 'if you have never been to one of our events'));
  assert.ok(finds('beginner', 'Kubernetes 101'));
  assert.ok(finds('beginner', 'An introduction to Rust'));
  assert.ok(!finds('beginner', 'New tools in Java 25'));
  assert.ok(!finds('beginner', 'Hydra 1010 deep dive'));
});

test('"student" and "internship" find campus events and talks about getting hired', () => {
  assert.ok(finds('students', 'Come join ISSA at DMACC as we share IT hiring and career information'));
  assert.ok(finds('student', 'Panel on the current state of hiring in software development'));
  assert.ok(finds('internship', 'IT hiring and career information'));
  assert.ok(!finds('student', 'Carl began his career in IT as an infrastructure engineer'));
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

test('short words are whole words, and a plural "s" comes off longer words only', () => {
  assert.ok(finds('go', 'Go 1.25 generics') && finds('go', 'Intro to Go'));
  assert.ok(!finds('go', 'Good food and Google'));
  assert.ok(!finds('ai', 'Fresh air at Water Works'));
  assert.ok(finds('ai', 'AIs that write tests'));
  assert.ok(finds('.net', 'ASP.NET Core minimal APIs'));
  assert.ok(!finds('news', 'Membership renewal'));
  assert.ok(finds('news', 'News from the board'));
});

test('a longer synonym starts a word and keeps its "s"', () => {
  assert.ok(!finds('internship', 'Internal developer platforms'));
  assert.ok(finds('internship', 'Meet our interns'));
  assert.ok(!finds('observability', 'Blogging for developers'));
  assert.ok(finds('observability', 'Structured logging'));
  assert.ok(!finds('hardware', 'Q&A with a filmmaker'));
  assert.ok(finds('security', 'Cybersecurity awareness month'));
});

test('.NET, C# and Tech Fuse by the other names people type', () => {
  assert.ok(finds('dotnet', 'Iowa .NET User Group'));
  assert.ok(finds('c#', 'Iowa .NET User Group'));
  assert.ok(finds('csharp', 'Records in C#'));
  assert.ok(finds('techfuse', 'Tech Fuse DSM'));
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

const shown = (x) => x.parts.map((p) => (p.mark ? `[${p.text}]` : p.text)).join('');

test('an excerpt shows about a dozen words around the match', () => {
  const text =
    'Bring a laptop and some questions. We will spend the evening pairing with Copilot on a small kata, then talk about what worked and what did not.';
  const x = excerpt(text, queryTerms('ai'));
  assert.equal(shown(x), '…spend the evening pairing with [Copilot] on a small kata, then talk…');
  const words = shown(x).split(/\s+/).length;
  assert.ok(words >= 11 && words <= 13, `${words} words`);
  // Short text: no ellipses. A match inside a word keeps the whole word.
  assert.equal(shown(excerpt('Tracing with OpenTelemetry, and the agent.', queryTerms('telemetry'))), 'Tracing with Open[Telemetry], and the agent.');
  assert.equal(excerpt('Nothing here', queryTerms('ai')), null);
});

test('with several words, the excerpt quotes where most of them appear together, all marked', () => {
  const text =
    'Leaders across industries are working out how to uniquely and durably unlock value with AI, and build reliable agentic systems. Join us as Priya Murthy, AI GTM & Strategic Partnerships with AWS will unpack the state of agents.';
  assert.equal(shown(excerpt(text, queryTerms('partnerships with'))), '…Murthy, AI GTM & Strategic [Partnerships] [with] AWS will unpack the state…');
  // One word alone still quotes its first match.
  assert.match(shown(excerpt(text, queryTerms('with'))), /^…uniquely and durably unlock value \[with\] AI/);
});

// Search synonyms, kept by hand. One-way: searching the word on the left
// also finds events that say any word on its right, never the reverse
// ("ai" finds "Copilot"; "copilot" finds only "Copilot"). A two-way pair is
// two lines. When a search that should work doesn't, add a line here.
// Lowercase; "ci/cd" and "front-end" also match "CI CD" and "front end".
export const SYNONYMS = {
  ai: ['llm', 'gpt', 'genai', 'generative', 'copilot', 'agent', 'agentic', 'mcp', 'rag', 'chatgpt', 'claude', 'gemini', 'openai', 'machine learning', 'ml'],
  agent: ['agentic', 'mcp', 'multi-agent'],
  agents: ['agentic', 'mcp', 'multi-agent'],
  ml: ['data science', 'computer vision', 'neural', 'model training'],
  'machine learning': ['data science', 'computer vision', 'neural', 'model training'],
  llm: ['gpt', 'genai', 'generative', 'chatgpt', 'claude', 'gemini', 'openai'],
  cloud: ['aws', 'azure', 'gcp', 'serverless', 'lambda'],
  devops: ['ci/cd', 'cicd', 'pipeline', 'infrastructure as code', 'iac', 'terraform', 'kubernetes', 'k8s', 'docker', 'platform engineering'],
  k8s: ['kubernetes'],
  kubernetes: ['k8s'],
  observability: ['monitoring', 'opentelemetry', 'otel', 'logging', 'tracing', 'slo', 'sre'],
  otel: ['opentelemetry'],
  opentelemetry: ['otel'],
  security: ['infosec', 'appsec', 'cyber', 'hacking', 'authentication', 'vulnerability'],
  web: ['frontend', 'front-end', 'javascript', 'typescript', 'react', 'css', 'html', 'accessibility'],
  js: ['javascript'],
  javascript: ['js'],
  ts: ['typescript'],
  typescript: ['ts'],
  data: ['analytics', 'data science', 'bi', 'power bi', 'sql', 'database', 'data engineering'],
  career: ['hiring', 'interview', 'jobs', 'skills', 'mentoring', 'resume'],
  careers: ['hiring', 'interview', 'jobs', 'skills', 'mentoring', 'resume'],
  leadership: ['cio', 'cto', 'executive', 'strategy', 'management'],
  product: ['product management', 'user story', 'roadmap', 'discovery'],
  mobile: ['ios', 'android', 'swift', 'kotlin', 'flutter', 'react native'],
  hardware: ['firmware', 'embedded', 'arduino', 'raspberry pi', 'maker'],
  iot: ['firmware', 'embedded', 'arduino', 'raspberry pi', 'maker'],
};

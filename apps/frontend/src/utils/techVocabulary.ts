/**
 * Technical Vocabulary & Phonetic Normalizer
 * Provides a comprehensive software engineering dictionary to boost speech recognition
 * and correct common speech-to-text misrecognitions of technical terminology.
 */

export const TECH_VOCABULARY_TERMS: string[] = [
  // Programming Languages
  'Go', 'Golang', 'TypeScript', 'JavaScript', 'Python', 'Java', 'Rust', 'C++', 'C#',
  'Kotlin', 'Swift', 'Dart', 'PHP', 'Ruby', 'Scala', 'Elixir', 'Haskell', 'HTML', 'CSS', 'SQL',

  // Frontend Frameworks & Libraries
  'React', 'Next.js', 'Vue.js', 'Angular', 'Svelte', 'Remix', 'Gatsby', 'Nuxt.js',
  'Tailwind CSS', 'Bootstrap', 'Vite', 'Webpack', 'Babel', 'Redux', 'Zustand',
  'React Query', 'TanStack', 'Framer Motion', 'WebRTC', 'WebSockets',

  // Backend Frameworks & Runtimes
  'Node.js', 'Express.js', 'NestJS', 'FastAPI', 'Django', 'Flask', 'Spring Boot',
  'Gin', 'Chi', 'Echo', 'Fiber', 'GORM', 'Prisma', 'TypeORM', 'Hibernate',
  'GraphQL', 'gRPC', 'REST API', 'RESTful API', 'REST APIs', 'Apollo',

  // Databases & Caching
  'PostgreSQL', 'Postgres', 'MySQL', 'MongoDB', 'Redis', 'SQLite', 'Cassandra',
  'DynamoDB', 'Elasticsearch', 'Supabase', 'Firebase', 'CouchDB', 'CockroachDB',
  'Neo4j', 'ClickHouse', 'TimescaleDB',

  // DevOps, Cloud & Infrastructure
  'Docker', 'Kubernetes', 'K8s', 'AWS', 'Amazon Web Services', 'S3', 'EC2', 'RDS',
  'Lambda', 'CloudFront', 'Google Cloud', 'GCP', 'Azure', 'Terraform', 'Ansible',
  'Nginx', 'Apache', 'Cloudflare', 'Vercel', 'Netlify', 'Linux', 'Ubuntu',
  'CI/CD', 'GitHub', 'GitLab', 'GitHub Actions', 'GitLab CI', 'Jenkins', 'Docker Compose',

  // Messaging & Streaming
  'Kafka', 'RabbitMQ', 'Apache Kafka', 'SQS', 'SNS', 'Pub/Sub', 'Message Broker', 'Celery',

  // Architecture & Paradigms
  'Microservices', 'Monorepo', 'Monolith', 'Event-Driven Architecture', 'Serverless',
  'Domain-Driven Design', 'Clean Architecture', 'Hexagonal Architecture', 'MVC', 'MVVM',
  'OOP', 'Object-Oriented Programming', 'Functional Programming',
  'Concurrency', 'Goroutines', 'Channels', 'Mutex', 'Deadlock', 'Race Condition',
  'Thread Safety', 'Async/Await', 'Event Loop', 'Non-blocking I/O',
  'ACID', 'CAP Theorem', 'Sharding', 'Replication', 'Database Migration',
  'Load Balancer', 'Reverse Proxy', 'Rate Limiting', 'CDN', 'API Gateway',

  // Security & Auth
  'OAuth', 'OAuth 2.0', 'JWT', 'JSON Web Token', 'CORS', 'CSRF', 'XSS', 'HTTPS', 'TLS', 'SSL',
  'Bcrypt', 'Argon2', 'Session Storage', 'Local Storage', 'Cookies',

  // Testing & Methodologies
  'Unit Testing', 'Integration Testing', 'End-to-End', 'E2E Testing', 'TDD', 'BDD',
  'Jest', 'Vitest', 'Mocha', 'Cypress', 'Playwright', 'Selenium',
  'Agile', 'Scrum', 'Kanban', 'Sprint', 'Pull Request', 'Code Review', 'Git',
];

interface ReplacerRule {
  pattern: RegExp;
  replacement: string;
}

const PHONETIC_TECH_REPLACEMENTS: ReplacerRule[] = [
  // Databases
  { pattern: /\b(?:post\s*gre(?:s(?:ql)?)?|post\s*gre\s*sql|post\s*gres|post\s*gress|post\s*crash|post\s*grease)\b/gi, replacement: 'PostgreSQL' },
  { pattern: /\b(?:my\s*sequel|my-sql|my\s*sql)\b/gi, replacement: 'MySQL' },
  { pattern: /\b(?:no\s*sequel|no-sql|no\s*sql)\b/gi, replacement: 'NoSQL' },
  { pattern: /\b(?:sq\s*lite)\b/gi, replacement: 'SQLite' },
  { pattern: /\b(?:mongo\s*db)\b/gi, replacement: 'MongoDB' },
  { pattern: /\b(?:read\s*is|radish)\b(?=\s+(?:cache|caching|queue|database|store|key|memory|in\s*memory|sentinel|cluster|instance))/gi, replacement: 'Redis' },
  { pattern: /\b(?:redis)\b/gi, replacement: 'Redis' },
  { pattern: /\b(?:supa\s*base)\b/gi, replacement: 'Supabase' },
  { pattern: /\b(?:fire\s*base)\b/gi, replacement: 'Firebase' },

  // Languages
  { pattern: /\b(?:go\s*lang)\b/gi, replacement: 'Golang' },
  { pattern: /\b(?:type\s*script)\b/gi, replacement: 'TypeScript' },
  { pattern: /\b(?:java\s*script)\b/gi, replacement: 'JavaScript' },

  // Frameworks & Runtimes
  { pattern: /\b(?:next\s*js|nextjs)\b/gi, replacement: 'Next.js' },
  { pattern: /\b(?:node\s*js|nodejs)\b/gi, replacement: 'Node.js' },
  { pattern: /\b(?:view\s*js|viewjs|vue\s*js|vuejs)\b/gi, replacement: 'Vue.js' },
  { pattern: /\b(?:react\s*js|reactjs)\b/gi, replacement: 'React' },
  { pattern: /\b(?:react\s*native)\b/gi, replacement: 'React Native' },
  { pattern: /\b(?:express\s*js|expressjs)\b/gi, replacement: 'Express.js' },
  { pattern: /\b(?:nest\s*js|nestjs)\b/gi, replacement: 'NestJS' },
  { pattern: /\b(?:nuxt\s*js|nuxtjs)\b/gi, replacement: 'Nuxt.js' },
  { pattern: /\b(?:spring\s*boot)\b/gi, replacement: 'Spring Boot' },
  { pattern: /\b(?:fast\s*api|fastapi)\b/gi, replacement: 'FastAPI' },
  { pattern: /\b(?:tailwind\s*css|tailwind-css|tail\s*wind\s*css)\b/gi, replacement: 'Tailwind CSS' },
  { pattern: /\b(?:tail\s*wind)\b(?=\s+(?:css|classes|styling|utility|components?))/gi, replacement: 'Tailwind' },

  // Cloud & DevOps
  { pattern: /\b(?:dock\s*are|dock\s*er|darker)\b(?=\s+(?:container|image|compose|file|hub|daemon|build|swarm|k8s|kubernetes|containerize|containerization|deployment))/gi, replacement: 'Docker' },
  { pattern: /\b(?:docker)\b/gi, replacement: 'Docker' },
  { pattern: /\b(?:cube\s*net(?:t?ees|is)|coobernetes|kuber\s*netes|k8s)\b/gi, replacement: 'Kubernetes' },
  { pattern: /\b(?:git\s*hub)\b/gi, replacement: 'GitHub' },
  { pattern: /\b(?:git\s*lab)\b/gi, replacement: 'GitLab' },
  { pattern: /\b(?:c\s*i\s*\/?\s*c\s*d|ci\s*\/?\s*cd)\b/gi, replacement: 'CI/CD' },
  { pattern: /\b(?:a\s*w\s*s)\b/gi, replacement: 'AWS' },
  { pattern: /\b(?:g\s*c\s*p)\b/gi, replacement: 'GCP' },
  { pattern: /\b(?:terra\s*form)\b/gi, replacement: 'Terraform' },
  { pattern: /\b(?:engine\s*x|engine-x)\b/gi, replacement: 'Nginx' },
  { pattern: /\b(?:nginx)\b/gi, replacement: 'Nginx' },

  // APIs & Networking
  { pattern: /\b(?:rest\s*a\s*p\s*i|rest\s*api|rest-api|restful\s*a\s*p\s*i|restful\s*api)\b/gi, replacement: 'REST API' },
  { pattern: /\b(?:rest\s*apis|restful\s*apis)\b/gi, replacement: 'REST APIs' },
  { pattern: /\b(?:graph\s*ql|graph-ql)\b/gi, replacement: 'GraphQL' },
  { pattern: /\b(?:g\s*rpc|g-rpc)\b/gi, replacement: 'gRPC' },
  { pattern: /\b(?:web\s*sockets?)\b/gi, replacement: 'WebSockets' },
  { pattern: /\b(?:web\s*rtc)\b/gi, replacement: 'WebRTC' },

  // Messaging & Queues
  { pattern: /\b(?:kaf\s*ka|kafca)\b(?=\s+(?:topic|producer|consumer|broker|stream|cluster|queue|event))/gi, replacement: 'Kafka' },
  { pattern: /\b(?:rabbit\s*mq)\b/gi, replacement: 'RabbitMQ' },
  { pattern: /\b(?:pub\s*sub|pub-sub|publish\s*subscribe)\b/gi, replacement: 'Pub/Sub' },

  // Architectures & Concepts
  { pattern: /\b(?:micro\s*services)\b/gi, replacement: 'microservices' },
  { pattern: /\b(?:mono\s*repo)\b/gi, replacement: 'monorepo' },
  { pattern: /\b(?:go\s*routines?)\b/gi, replacement: 'goroutines' },
  { pattern: /\b(?:o\s*auth(?:\s*2(?:\.0)?)?)\b/gi, replacement: 'OAuth 2.0' },
  { pattern: /\b(?:j\s*w\s*t|jot\s*token)\b/gi, replacement: 'JWT' },
  { pattern: /\b(?:j\s*son)\b/gi, replacement: 'JSON' },
  { pattern: /\b(?:h\s*t\s*m\s*l)\b/gi, replacement: 'HTML' },
  { pattern: /\b(?:c\s*s\s*s)\b/gi, replacement: 'CSS' },
  { pattern: /\b(?:s\s*q\s*l)\b/gi, replacement: 'SQL' },
  { pattern: /\b(?:o\s*r\s*m)\b/gi, replacement: 'ORM' },
  { pattern: /\b(?:gorm)\b/gi, replacement: 'GORM' },
  { pattern: /\b(?:prisma)\b/gi, replacement: 'Prisma' },
  { pattern: /\b(?:acid)\b(?=\s+(?:compliance|compliant|properties|transactions?|guarantees?))/gi, replacement: 'ACID' },
  { pattern: /\b(?:cap\s*theorem)\b/gi, replacement: 'CAP theorem' },
  { pattern: /\b(?:e\s*2\s*e)\b(?=\s+(?:test|testing|tests))/gi, replacement: 'E2E' },
  { pattern: /\b(?:t\s*d\s*d)\b/gi, replacement: 'TDD' },
  { pattern: /\b(?:p\s*r)\b(?=\s+(?:review|merged|opened|branch))/gi, replacement: 'PR' },
];

/**
 * Normalizes technical vocabulary and fixes common speech-to-text distortions.
 */
export function normalizeTechVocabulary(text: string): string {
  if (!text) return text;

  let normalized = text;
  for (const rule of PHONETIC_TECH_REPLACEMENTS) {
    normalized = normalized.replace(rule.pattern, rule.replacement);
  }

  // Ensure clean spacing
  return normalized.replace(/\s{2,}/g, ' ').trim();
}

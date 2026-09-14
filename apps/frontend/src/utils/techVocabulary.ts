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

const INDONESIAN_TO_ENGLISH_PHONETICS: ReplacerRule[] = [
  // Pronouns & Demonstratives
  { pattern: /\b(?:saya|aku)\b/gi, replacement: 'I' },
  { pattern: /\b(?:anda|kamu)\b/gi, replacement: 'you' },
  { pattern: /\b(?:kami|kita)\b/gi, replacement: 'we' },
  { pattern: /\b(?:mereka)\b/gi, replacement: 'they' },
  { pattern: /\b(?:dia)\b/gi, replacement: 'they' },
  { pattern: /\b(?:ini)\b/gi, replacement: 'this' },
  { pattern: /\b(?:itu)\b/gi, replacement: 'that' },

  // Prepositions & Conjunctions
  { pattern: /\b(?:dan)\b/gi, replacement: 'and' },
  { pattern: /\b(?:dengan)\b/gi, replacement: 'with' },
  { pattern: /\b(?:untuk)\b/gi, replacement: 'for' },
  { pattern: /\b(?:yang)\b/gi, replacement: 'that' },
  { pattern: /\b(?:dari)\b/gi, replacement: 'from' },
  { pattern: /\b(?:pada)\b/gi, replacement: 'at' },
  { pattern: /\b(?:di)\b/gi, replacement: 'in' },
  { pattern: /\b(?:ke)\b/gi, replacement: 'to' },
  { pattern: /\b(?:atau)\b/gi, replacement: 'or' },
  { pattern: /\b(?:tapi|tetapi|namun)\b/gi, replacement: 'but' },
  { pattern: /\b(?:karena)\b/gi, replacement: 'because' },
  { pattern: /\b(?:jadi)\b/gi, replacement: 'so' },
  { pattern: /\b(?:juga)\b/gi, replacement: 'also' },
  { pattern: /\b(?:seperti)\b/gi, replacement: 'like' },
  { pattern: /\b(?:tentang)\b/gi, replacement: 'about' },
  { pattern: /\b(?:ketika|saat)\b/gi, replacement: 'when' },
  { pattern: /\b(?:lalu|kemudian)\b/gi, replacement: 'then' },
  { pattern: /\b(?:setelah)\b/gi, replacement: 'after' },
  { pattern: /\b(?:sebelum)\b/gi, replacement: 'before' },
  { pattern: /\b(?:jika|kalau|bila)\b/gi, replacement: 'if' },

  // Common Verbs & Auxiliary
  { pattern: /\b(?:adalah)\b/gi, replacement: 'is' },
  { pattern: /\b(?:bisa|dapat)\b/gi, replacement: 'can' },
  { pattern: /\b(?:tidak|nggak|enggak|tak)\b/gi, replacement: 'not' },
  { pattern: /\b(?:bukan)\b/gi, replacement: 'not' },
  { pattern: /\b(?:ada)\b/gi, replacement: 'have' },
  { pattern: /\b(?:sudah|telah|udah)\b/gi, replacement: 'already' },
  { pattern: /\b(?:belum|belom)\b/gi, replacement: 'not yet' },
  { pattern: /\b(?:ingin|mau)\b/gi, replacement: 'want to' },
  { pattern: /\b(?:menggunakan|memakai|pake|pakai)\b/gi, replacement: 'using' },
  { pattern: /\b(?:membuat|membangun|bikin)\b/gi, replacement: 'building' },
  { pattern: /\b(?:belajar)\b/gi, replacement: 'learning' },
  { pattern: /\b(?:bekerja)\b/gi, replacement: 'working' },
  { pattern: /\b(?:mengerjakan|kerjain)\b/gi, replacement: 'working on' },
  { pattern: /\b(?:ngoding)\b/gi, replacement: 'coding' },
  { pattern: /\b(?:pikir|memikirkan|berpikir)\b/gi, replacement: 'think' },
  { pattern: /\b(?:tahu|mengetahui)\b/gi, replacement: 'know' },
  { pattern: /\b(?:paham|mengerti)\b/gi, replacement: 'understand' },
  { pattern: /\b(?:ingat|mengingat)\b/gi, replacement: 'remember' },
  { pattern: /\b(?:lihat|melihat)\b/gi, replacement: 'see' },
  { pattern: /\b(?:dengar|mendengar)\b/gi, replacement: 'hear' },
  { pattern: /\b(?:bicara|berbicara)\b/gi, replacement: 'speak' },
  { pattern: /\b(?:bilang|katakan|mengatakan)\b/gi, replacement: 'say' },
  { pattern: /\b(?:tulis|menulis)\b/gi, replacement: 'write' },
  { pattern: /\b(?:baca|membaca)\b/gi, replacement: 'read' },
  { pattern: /\b(?:kirim|mengirim)\b/gi, replacement: 'send' },
  { pattern: /\b(?:terima|menerima)\b/gi, replacement: 'receive' },
  { pattern: /\b(?:ambil|mengambil)\b/gi, replacement: 'take' },
  { pattern: /\b(?:beri|memberi|memberikan)\b/gi, replacement: 'give' },
  { pattern: /\b(?:bantu|membantu)\b/gi, replacement: 'help' },
  { pattern: /\b(?:butuh|membutuhkan|perlu)\b/gi, replacement: 'need' },
  { pattern: /\b(?:coba|mencoba)\b/gi, replacement: 'try' },
  { pattern: /\b(?:mulai|memulai)\b/gi, replacement: 'start' },
  { pattern: /\b(?:selesai|menyelesaikan)\b/gi, replacement: 'finish' },
  { pattern: /\b(?:tambah|menambah|menambahkan)\b/gi, replacement: 'add' },
  { pattern: /\b(?:hapus|menghapus)\b/gi, replacement: 'remove' },
  { pattern: /\b(?:ubah|mengubah)\b/gi, replacement: 'change' },
  { pattern: /\b(?:perbaiki|memperbaiki)\b/gi, replacement: 'fix' },
  { pattern: /\b(?:tingkatkan|meningkatkan)\b/gi, replacement: 'improve' },
  { pattern: /\b(?:kembangkan|mengembangkan)\b/gi, replacement: 'develop' },
  { pattern: /\b(?:kelola|mengelola)\b/gi, replacement: 'manage' },
  { pattern: /\b(?:tangani|menangani)\b/gi, replacement: 'handle' },

  // Adverbs, Modifiers & Fillers
  { pattern: /\b(?:sebenarnya|sebetulnya)\b/gi, replacement: 'actually' },
  { pattern: /\b(?:biasanya)\b/gi, replacement: 'usually' },
  { pattern: /\b(?:selalu)\b/gi, replacement: 'always' },
  { pattern: /\b(?:terkadang|kadang(?:-kadang)?)\b/gi, replacement: 'sometimes' },
  { pattern: /\b(?:tentu\s*saja|tentu)\b/gi, replacement: 'of course' },
  { pattern: /\b(?:artinya|maksudnya)\b/gi, replacement: 'meaning' },
  { pattern: /\b(?:seperti\s*yang|sebagaimana)\b/gi, replacement: 'as' },
  { pattern: /\b(?:sebagai)\b/gi, replacement: 'as' },
  { pattern: /\b(?:menurut\s*saya|menurutku)\b/gi, replacement: 'in my opinion' },
  { pattern: /\b(?:kira-kira)\b/gi, replacement: 'approximately' },
  { pattern: /\b(?:kemarin|tadi)\b/gi, replacement: 'previously' },
  { pattern: /\b(?:dulu|sebelumnya)\b/gi, replacement: 'previously' },
  { pattern: /\b(?:sekarang|saat\s*ini)\b/gi, replacement: 'now' },
  { pattern: /\b(?:nanti)\b/gi, replacement: 'later' },
  { pattern: /\b(?:hanya|cuma)\b/gi, replacement: 'only' },
  { pattern: /\b(?:saja)\b/gi, replacement: 'just' },
  { pattern: /\b(?:masih)\b/gi, replacement: 'still' },
  { pattern: /\b(?:lagi)\b/gi, replacement: 'again' },
  { pattern: /\b(?:lebih)\b/gi, replacement: 'more' },
  { pattern: /\b(?:kurang)\b/gi, replacement: 'less' },
  { pattern: /\b(?:banget|sekali)\b/gi, replacement: 'very' },
  { pattern: /\b(?:cukup)\b/gi, replacement: 'quite' },
  { pattern: /\b(?:gitu|seperti\s*itu)\b/gi, replacement: 'like that' },
  { pattern: /\b(?:kan|ya\s*kan)\b/gi, replacement: 'right' },
  { pattern: /\b(?:nah|terus)\b/gi, replacement: 'then' },

  // Questions
  { pattern: /\b(?:bagaimana|gimana)\b/gi, replacement: 'how' },
  { pattern: /\b(?:apakah|apa)\b/gi, replacement: 'what' },
  { pattern: /\b(?:siapa)\b/gi, replacement: 'who' },
  { pattern: /\b(?:di\s*mana|dimana)\b/gi, replacement: 'where' },
  { pattern: /\b(?:mengapa|kenapa)\b/gi, replacement: 'why' },

  // Nouns, Adjectives & Conversational terms
  { pattern: /\b(?:proyek)\b/gi, replacement: 'project' },
  { pattern: /\b(?:aplikasi)\b/gi, replacement: 'application' },
  { pattern: /\b(?:pengalaman)\b/gi, replacement: 'experience' },
  { pattern: /\b(?:masalah)\b/gi, replacement: 'issue' },
  { pattern: /\b(?:tantangan)\b/gi, replacement: 'challenge' },
  { pattern: /\b(?:solusi)\b/gi, replacement: 'solution' },
  { pattern: /\b(?:sangat)\b/gi, replacement: 'very' },
  { pattern: /\b(?:contoh(?:nya)?)\b/gi, replacement: 'for example' },
  { pattern: /\b(?:terima\s*kasih|makasih)\b/gi, replacement: 'thank you' },
  { pattern: /\b(?:halo|hai)\b/gi, replacement: 'hello' },
  { pattern: /\b(?:perkenalkan)\b/gi, replacement: 'let me introduce' },
  { pattern: /\b(?:nama\s*saya)\b/gi, replacement: 'my name is' },
  { pattern: /\b(?:kuliah|kampus)\b/gi, replacement: 'college' },
  { pattern: /\b(?:jurusan)\b/gi, replacement: 'major' },
  { pattern: /\b(?:lulusan)\b/gi, replacement: 'graduate' },
  { pattern: /\b(?:pekerjaan)\b/gi, replacement: 'job' },
  { pattern: /\b(?:perusahaan)\b/gi, replacement: 'company' },
  { pattern: /\b(?:tim)\b/gi, replacement: 'team' },
  { pattern: /\b(?:bahasa)\b/gi, replacement: 'language' },
  { pattern: /\b(?:fitur)\b/gi, replacement: 'feature' },
  { pattern: /\b(?:sistem)\b/gi, replacement: 'system' },
  { pattern: /\b(?:pengembang)\b/gi, replacement: 'developer' },
  { pattern: /\b(?:pengguna)\b/gi, replacement: 'user' },
  { pattern: /\b(?:basis\s*data)\b/gi, replacement: 'database' },
  { pattern: /\b(?:kode)\b/gi, replacement: 'code' },
  { pattern: /\b(?:fungsi)\b/gi, replacement: 'function' },
  { pattern: /\b(?:kesalahan)\b/gi, replacement: 'error' },
  { pattern: /\b(?:bagian)\b/gi, replacement: 'part' },
  { pattern: /\b(?:cara)\b/gi, replacement: 'way' },
  { pattern: /\b(?:hal)\b/gi, replacement: 'thing' },
  { pattern: /\b(?:orang)\b/gi, replacement: 'person' },
  { pattern: /\b(?:waktu)\b/gi, replacement: 'time' },
  { pattern: /\b(?:hari)\b/gi, replacement: 'day' },
  { pattern: /\b(?:minggu)\b/gi, replacement: 'week' },
  { pattern: /\b(?:bulan)\b/gi, replacement: 'month' },
  { pattern: /\b(?:tahun)\b/gi, replacement: 'year' },
  { pattern: /\b(?:iya|ya)\b/gi, replacement: 'yes' },
  { pattern: /\b(?:benar|betul)\b/gi, replacement: 'correct' },
  { pattern: /\b(?:salah)\b/gi, replacement: 'wrong' },
  { pattern: /\b(?:bagus|baik)\b/gi, replacement: 'good' },
  { pattern: /\b(?:hebat)\b/gi, replacement: 'great' },
  { pattern: /\b(?:penting)\b/gi, replacement: 'important' },
  { pattern: /\b(?:mudah)\b/gi, replacement: 'easy' },
  { pattern: /\b(?:sulit|susah)\b/gi, replacement: 'difficult' },
  { pattern: /\b(?:cepat)\b/gi, replacement: 'fast' },
  { pattern: /\b(?:lambat)\b/gi, replacement: 'slow' },
  { pattern: /\b(?:besar)\b/gi, replacement: 'big' },
  { pattern: /\b(?:kecil)\b/gi, replacement: 'small' },
  { pattern: /\b(?:baru)\b/gi, replacement: 'new' },
  { pattern: /\b(?:lama)\b/gi, replacement: 'old' },
  { pattern: /\b(?:pertama)\b/gi, replacement: 'first' },
  { pattern: /\b(?:kedua)\b/gi, replacement: 'second' },
  { pattern: /\b(?:ketiga)\b/gi, replacement: 'third' },
  { pattern: /\b(?:terakhir)\b/gi, replacement: 'last' },
  { pattern: /\b(?:selanjutnya)\b/gi, replacement: 'next' },
  { pattern: /\b(?:semua)\b/gi, replacement: 'all' },
  { pattern: /\b(?:banyak)\b/gi, replacement: 'many' },
  { pattern: /\b(?:sedikit)\b/gi, replacement: 'few' },
  { pattern: /\b(?:beberapa)\b/gi, replacement: 'several' },
  { pattern: /\b(?:setiap)\b/gi, replacement: 'every' },
  { pattern: /\b(?:antara)\b/gi, replacement: 'between' },
  { pattern: /\b(?:lain(?:nya)?)\b/gi, replacement: 'other' },
  { pattern: /\b(?:sama)\b/gi, replacement: 'same' },
  { pattern: /\b(?:berbeda)\b/gi, replacement: 'different' },
];

/**
 * Normalizes technical vocabulary and fixes common speech-to-text distortions,
 * guaranteeing English transcription output.
 */
export function normalizeTechVocabulary(text: string): string {
  if (!text) return text;

  let normalized = text;
  for (const rule of PHONETIC_TECH_REPLACEMENTS) {
    normalized = normalized.replace(rule.pattern, rule.replacement);
  }

  for (const rule of INDONESIAN_TO_ENGLISH_PHONETICS) {
    normalized = normalized.replace(rule.pattern, rule.replacement);
  }

  // Ensure clean spacing
  return normalized.replace(/\s{2,}/g, ' ').trim();
}

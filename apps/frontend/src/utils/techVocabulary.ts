/**
 * Technical Vocabulary & Phonetic Normalizer
 * Provides an ultra-low-latency dictionary to boost speech recognition
 * and correct common speech-to-text misrecognitions in real time with 0 delay.
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

// Multi-word phrase rules that require cross-word boundary matching
const MULTI_WORD_PHONETICS: ReplacerRule[] = [
  // Technical multi-word terms
  { pattern: /\b(?:post\s*gre(?:s(?:ql)?)?|post\s*gre\s*sql|post\s*gres|post\s*gress|post\s*crash|post\s*grease)\b/gi, replacement: 'PostgreSQL' },
  { pattern: /\b(?:my\s*sequel|my-sql|my\s*sql)\b/gi, replacement: 'MySQL' },
  { pattern: /\b(?:no\s*sequel|no-sql|no\s*sql)\b/gi, replacement: 'NoSQL' },
  { pattern: /\b(?:sq\s*lite)\b/gi, replacement: 'SQLite' },
  { pattern: /\b(?:mongo\s*db)\b/gi, replacement: 'MongoDB' },
  { pattern: /\b(?:read\s*is|radish)\b(?=\s+(?:cache|caching|queue|database|store|key|memory|in\s*memory|sentinel|cluster|instance))/gi, replacement: 'Redis' },
  { pattern: /\b(?:supa\s*base)\b/gi, replacement: 'Supabase' },
  { pattern: /\b(?:fire\s*base)\b/gi, replacement: 'Firebase' },
  { pattern: /\b(?:go\s*lang)\b/gi, replacement: 'Golang' },
  { pattern: /\b(?:type\s*script)\b/gi, replacement: 'TypeScript' },
  { pattern: /\b(?:java\s*script)\b/gi, replacement: 'JavaScript' },
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
  { pattern: /\b(?:dock\s*are|dock\s*er|darker)\b(?=\s+(?:container|image|compose|file|hub|daemon|build|swarm|k8s|kubernetes|containerize|containerization|deployment))/gi, replacement: 'Docker' },
  { pattern: /\b(?:cube\s*net(?:t?ees|is)|coobernetes|kuber\s*netes)\b/gi, replacement: 'Kubernetes' },
  { pattern: /\b(?:git\s*hub)\b/gi, replacement: 'GitHub' },
  { pattern: /\b(?:git\s*lab)\b/gi, replacement: 'GitLab' },
  { pattern: /\b(?:c\s*i\s*\/?\s*c\s*d|ci\s*\/?\s*cd)\b/gi, replacement: 'CI/CD' },
  { pattern: /\b(?:a\s*w\s*s)\b/gi, replacement: 'AWS' },
  { pattern: /\b(?:g\s*c\s*p)\b/gi, replacement: 'GCP' },
  { pattern: /\b(?:terra\s*form)\b/gi, replacement: 'Terraform' },
  { pattern: /\b(?:engine\s*x|engine-x)\b/gi, replacement: 'Nginx' },
  { pattern: /\b(?:rest\s*a\s*p\s*i|rest\s*api|rest-api|restful\s*a\s*p\s*i|restful\s*api)\b/gi, replacement: 'REST API' },
  { pattern: /\b(?:rest\s*apis|restful\s*apis)\b/gi, replacement: 'REST APIs' },
  { pattern: /\b(?:graph\s*ql|graph-ql)\b/gi, replacement: 'GraphQL' },
  { pattern: /\b(?:g\s*rpc|g-rpc)\b/gi, replacement: 'gRPC' },
  { pattern: /\b(?:web\s*sockets?)\b/gi, replacement: 'WebSockets' },
  { pattern: /\b(?:web\s*rtc)\b/gi, replacement: 'WebRTC' },
  { pattern: /\b(?:rabbit\s*mq)\b/gi, replacement: 'RabbitMQ' },
  { pattern: /\b(?:pub\s*sub|pub-sub|publish\s*subscribe)\b/gi, replacement: 'Pub/Sub' },
  { pattern: /\b(?:o\s*auth(?:\s*2(?:\.0)?)?)\b/gi, replacement: 'OAuth 2.0' },
  { pattern: /\b(?:j\s*w\s*t|jot\s*token)\b/gi, replacement: 'JWT' },
  { pattern: /\b(?:e\s*2\s*e)\b(?=\s+(?:test|testing|tests))/gi, replacement: 'E2E' },

  // Conversational multi-word phrases
  { pattern: /\b(?:terima\s*kasih|makasih)\b/gi, replacement: 'thank you' },
  { pattern: /\b(?:nama\s*saya)\b/gi, replacement: 'my name is' },
  { pattern: /\b(?:basis\s*data)\b/gi, replacement: 'database' },
  { pattern: /\b(?:menurut\s*saya|menurutku)\b/gi, replacement: 'in my opinion' },
  { pattern: /\b(?:tentu\s*saja)\b/gi, replacement: 'of course' },
  { pattern: /\b(?:seperti\s*yang|sebagaimana)\b/gi, replacement: 'as' },
  { pattern: /\b(?:kira\s*-\s*kira|kira\s*kira)\b/gi, replacement: 'approximately' },
  { pattern: /\b(?:saat\s*ini)\b/gi, replacement: 'now' },
  { pattern: /\b(?:seperti\s*itu)\b/gi, replacement: 'like that' },
  { pattern: /\b(?:ya\s*kan)\b/gi, replacement: 'right' },
  { pattern: /\b(?:di\s*mana)\b/gi, replacement: 'where' },
];

// O(1) Instant Hash Map for single-word technical terms and Indonesian-to-English phonetic corrections
const SINGLE_WORD_MAP: Record<string, string> = {
  // Technical acronyms & names
  docker: 'Docker',
  kubernetes: 'Kubernetes',
  k8s: 'Kubernetes',
  redis: 'Redis',
  nginx: 'Nginx',
  kafka: 'Kafka',
  jwt: 'JWT',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  sql: 'SQL',
  orm: 'ORM',
  gorm: 'GORM',
  prisma: 'Prisma',
  tdd: 'TDD',
  aws: 'AWS',
  gcp: 'GCP',

  // Pronouns
  saya: 'I',
  aku: 'I',
  anda: 'you',
  kamu: 'you',
  kami: 'we',
  kita: 'we',
  mereka: 'they',
  dia: 'they',
  ini: 'this',
  itu: 'that',

  // Conjunctions & Prepositions
  dan: 'and',
  dengan: 'with',
  untuk: 'for',
  yang: 'that',
  dari: 'from',
  pada: 'at',
  di: 'in',
  ke: 'to',
  atau: 'or',
  tapi: 'but',
  tetapi: 'but',
  namun: 'but',
  karena: 'because',
  jadi: 'so',
  juga: 'also',
  seperti: 'like',
  tentang: 'about',
  ketika: 'when',
  saat: 'when',
  lalu: 'then',
  kemudian: 'then',
  setelah: 'after',
  sebelum: 'before',
  jika: 'if',
  kalau: 'if',
  bila: 'if',

  // Verbs
  adalah: 'is',
  bisa: 'can',
  dapat: 'can',
  tidak: 'not',
  nggak: 'not',
  enggak: 'not',
  tak: 'not',
  bukan: 'not',
  ada: 'have',
  sudah: 'already',
  telah: 'already',
  udah: 'already',
  belum: 'not yet',
  belom: 'not yet',
  ingin: 'want to',
  mau: 'want to',
  menggunakan: 'using',
  memakai: 'using',
  pake: 'using',
  pakai: 'using',
  membuat: 'building',
  membangun: 'building',
  bikin: 'building',
  belajar: 'learning',
  bekerja: 'working',
  mengerjakan: 'working on',
  kerjain: 'working on',
  ngoding: 'coding',
  pikir: 'think',
  memikirkan: 'think',
  berpikir: 'think',
  tahu: 'know',
  mengetahui: 'know',
  paham: 'understand',
  mengerti: 'understand',
  ingat: 'remember',
  mengingat: 'remember',
  lihat: 'see',
  melihat: 'see',
  dengar: 'hear',
  mendengar: 'hear',
  bicara: 'speak',
  berbicara: 'speak',
  bilang: 'say',
  katakan: 'say',
  mengatakan: 'say',
  tulis: 'write',
  menulis: 'write',
  baca: 'read',
  membaca: 'read',
  kirim: 'send',
  mengirim: 'send',
  terima: 'receive',
  menerima: 'receive',
  ambil: 'take',
  mengambil: 'take',
  beri: 'give',
  memberi: 'give',
  memberikan: 'give',
  bantu: 'help',
  membantu: 'help',
  butuh: 'need',
  membutuhkan: 'need',
  perlu: 'need',
  coba: 'try',
  mencoba: 'try',
  mulai: 'start',
  memulai: 'start',
  selesai: 'finish',
  menyelesaikan: 'finish',
  tambah: 'add',
  menambah: 'add',
  menambahkan: 'add',
  hapus: 'remove',
  menghapus: 'remove',
  ubah: 'change',
  mengubah: 'change',
  perbaiki: 'fix',
  memperbaiki: 'fix',
  tingkatkan: 'improve',
  meningkatkan: 'improve',
  kembangkan: 'develop',
  mengembangkan: 'develop',
  kelola: 'manage',
  mengelola: 'manage',
  tangani: 'handle',
  menangani: 'handle',

  // Adverbs, Modifiers & Fillers
  sebenarnya: 'actually',
  sebetulnya: 'actually',
  biasanya: 'usually',
  selalu: 'always',
  terkadang: 'sometimes',
  tentu: 'of course',
  artinya: 'meaning',
  maksudnya: 'meaning',
  sebagai: 'as',
  kemarin: 'previously',
  tadi: 'previously',
  dulu: 'previously',
  sebelumnya: 'previously',
  sekarang: 'now',
  nanti: 'later',
  hanya: 'only',
  cuma: 'only',
  saja: 'just',
  masih: 'still',
  lagi: 'again',
  lebih: 'more',
  kurang: 'less',
  banget: 'very',
  sekali: 'very',
  cukup: 'quite',
  gitu: 'like that',
  kan: 'right',
  nah: 'then',
  terus: 'then',

  // Questions
  bagaimana: 'how',
  gimana: 'how',
  apakah: 'what',
  apa: 'what',
  siapa: 'who',
  dimana: 'where',
  mengapa: 'why',
  kenapa: 'why',

  // Nouns & Common Words
  proyek: 'project',
  aplikasi: 'application',
  pengalaman: 'experience',
  masalah: 'issue',
  tantangan: 'challenge',
  solusi: 'solution',
  sangat: 'very',
  halo: 'hello',
  hai: 'hello',
  perkenalkan: 'let me introduce',
  kuliah: 'college',
  kampus: 'college',
  jurusan: 'major',
  lulusan: 'graduate',
  pekerjaan: 'job',
  perusahaan: 'company',
  tim: 'team',
  bahasa: 'language',
  fitur: 'feature',
  sistem: 'system',
  pengembang: 'developer',
  pengguna: 'user',
  kode: 'code',
  fungsi: 'function',
  kesalahan: 'error',
  bagian: 'part',
  cara: 'way',
  hal: 'thing',
  orang: 'person',
  waktu: 'time',
  hari: 'day',
  minggu: 'week',
  bulan: 'month',
  tahun: 'year',
  iya: 'yes',
  ya: 'yes',
  benar: 'correct',
  betul: 'correct',
  salah: 'wrong',
  bagus: 'good',
  baik: 'good',
  hebat: 'great',
  penting: 'important',
  mudah: 'easy',
  sulit: 'difficult',
  susah: 'difficult',
  cepat: 'fast',
  lambat: 'slow',
  besar: 'big',
  kecil: 'small',
  baru: 'new',
  lama: 'old',
  pertama: 'first',
  kedua: 'second',
  ketiga: 'third',
  terakhir: 'last',
  selanjutnya: 'next',
  semua: 'all',
  banyak: 'many',
  sedikit: 'few',
  beberapa: 'several',
  setiap: 'every',
  antara: 'between',
  sama: 'same',
  berbeda: 'different',
};

/**
 * Ultra-low-latency vocabulary normalizer.
 * Executes in < 0.05ms so live interim speech renders at 60fps with ZERO perceived delay.
 */
export function normalizeTechVocabulary(text: string): string {
  if (!text) return text;

  let normalized = text;

  // 1. Multi-word phrase replacements (~40 rules)
  for (let i = 0; i < MULTI_WORD_PHONETICS.length; i++) {
    normalized = normalized.replace(MULTI_WORD_PHONETICS[i].pattern, MULTI_WORD_PHONETICS[i].replacement);
  }

  // 2. O(1) single-pass token replacement for all single words
  normalized = normalized.replace(/\b([a-zA-Z0-9_-]+)\b/g, (match) => {
    const lower = match.toLowerCase();
    const replacement = SINGLE_WORD_MAP[lower];
    if (!replacement) return match;
    // Preserve uppercase if original was fully capitalized
    if (match === match.toUpperCase() && match.length > 1) {
      return replacement.toUpperCase();
    }
    return replacement;
  });

  return normalized.replace(/\s{2,}/g, ' ').trim();
}

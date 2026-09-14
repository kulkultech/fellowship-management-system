package ai

import (
	"regexp"
	"strings"
)

type techRule struct {
	regex       *regexp.Regexp
	replacement string
}

var techRules = []techRule{
	// Databases
	{regex: regexp.MustCompile(`(?i)\b(?:post\s*gre(?:s(?:ql)?)?|post\s*gre\s*sql|post\s*gres|post\s*gress|post\s*crash|post\s*grease)\b`), replacement: "PostgreSQL"},
	{regex: regexp.MustCompile(`(?i)\b(?:my\s*sequel|my-sql|my\s*sql)\b`), replacement: "MySQL"},
	{regex: regexp.MustCompile(`(?i)\b(?:no\s*sequel|no-sql|no\s*sql)\b`), replacement: "NoSQL"},
	{regex: regexp.MustCompile(`(?i)\b(?:sq\s*lite)\b`), replacement: "SQLite"},
	{regex: regexp.MustCompile(`(?i)\b(?:mongo\s*db)\b`), replacement: "MongoDB"},
	{regex: regexp.MustCompile(`(?i)\b(?:read\s*is|radish)\s+(caches?|caching|queues?|databases?|stores?|keys?|memory|in\s*memory|sentinels?|clusters?|instances?)\b`), replacement: "Redis ${1}"},
	{regex: regexp.MustCompile(`(?i)\b(?:redis)\b`), replacement: "Redis"},
	{regex: regexp.MustCompile(`(?i)\b(?:supa\s*base)\b`), replacement: "Supabase"},
	{regex: regexp.MustCompile(`(?i)\b(?:fire\s*base)\b`), replacement: "Firebase"},

	// Languages
	{regex: regexp.MustCompile(`(?i)\b(?:go\s*lang)\b`), replacement: "Golang"},
	{regex: regexp.MustCompile(`(?i)\b(?:type\s*script)\b`), replacement: "TypeScript"},
	{regex: regexp.MustCompile(`(?i)\b(?:java\s*script)\b`), replacement: "JavaScript"},

	// Frameworks & Runtimes
	{regex: regexp.MustCompile(`(?i)\b(?:next\s*js|nextjs)\b`), replacement: "Next.js"},
	{regex: regexp.MustCompile(`(?i)\b(?:node\s*js|nodejs)\b`), replacement: "Node.js"},
	{regex: regexp.MustCompile(`(?i)\b(?:view\s*js|viewjs|vue\s*js|vuejs)\b`), replacement: "Vue.js"},
	{regex: regexp.MustCompile(`(?i)\b(?:react\s*js|reactjs)\b`), replacement: "React"},
	{regex: regexp.MustCompile(`(?i)\b(?:react\s*native)\b`), replacement: "React Native"},
	{regex: regexp.MustCompile(`(?i)\b(?:express\s*js|expressjs)\b`), replacement: "Express.js"},
	{regex: regexp.MustCompile(`(?i)\b(?:nest\s*js|nestjs)\b`), replacement: "NestJS"},
	{regex: regexp.MustCompile(`(?i)\b(?:spring\s*boot)\b`), replacement: "Spring Boot"},
	{regex: regexp.MustCompile(`(?i)\b(?:fast\s*api|fastapi)\b`), replacement: "FastAPI"},
	{regex: regexp.MustCompile(`(?i)\b(?:tailwind\s*css|tailwind-css|tail\s*wind\s*css)\b`), replacement: "Tailwind CSS"},

	// Cloud & DevOps
	{regex: regexp.MustCompile(`(?i)\b(?:dock\s*are|dock\s*er|darker)\s+(containers?|images?|compose|files?|hub|daemon|build|swarm|k8s|kubernetes|containerize|containerization|deployment)\b`), replacement: "Docker ${1}"},
	{regex: regexp.MustCompile(`(?i)\b(?:docker)\b`), replacement: "Docker"},
	{regex: regexp.MustCompile(`(?i)\b(?:cube\s*net(?:t?ees|is)|coobernetes|kuber\s*netes|k8s)\b`), replacement: "Kubernetes"},
	{regex: regexp.MustCompile(`(?i)\b(?:git\s*hub)\b`), replacement: "GitHub"},
	{regex: regexp.MustCompile(`(?i)\b(?:git\s*lab)\b`), replacement: "GitLab"},
	{regex: regexp.MustCompile(`(?i)\b(?:c\s*i\s*\/?\s*c\s*d|ci\s*\/?\s*cd)\b`), replacement: "CI/CD"},
	{regex: regexp.MustCompile(`(?i)\b(?:a\s*w\s*s)\b`), replacement: "AWS"},
	{regex: regexp.MustCompile(`(?i)\b(?:g\s*c\s*p)\b`), replacement: "GCP"},
	{regex: regexp.MustCompile(`(?i)\b(?:terra\s*form)\b`), replacement: "Terraform"},
	{regex: regexp.MustCompile(`(?i)\b(?:engine\s*x|engine-x)\b`), replacement: "Nginx"},
	{regex: regexp.MustCompile(`(?i)\b(?:nginx)\b`), replacement: "Nginx"},

	// APIs & Networking
	{regex: regexp.MustCompile(`(?i)\b(?:rest\s*a\s*p\s*i|rest\s*api|rest-api|restful\s*a\s*p\s*i|restful\s*api)\b`), replacement: "REST API"},
	{regex: regexp.MustCompile(`(?i)\b(?:rest\s*apis|restful\s*apis)\b`), replacement: "REST APIs"},
	{regex: regexp.MustCompile(`(?i)\b(?:graph\s*ql|graph-ql)\b`), replacement: "GraphQL"},
	{regex: regexp.MustCompile(`(?i)\b(?:g\s*rpc|g-rpc)\b`), replacement: "gRPC"},
	{regex: regexp.MustCompile(`(?i)\b(?:web\s*sockets?)\b`), replacement: "WebSockets"},
	{regex: regexp.MustCompile(`(?i)\b(?:web\s*rtc)\b`), replacement: "WebRTC"},

	// Messaging & Queues
	{regex: regexp.MustCompile(`(?i)\b(?:kaf\s*ka|kafca)\s+(topics?|producers?|consumers?|brokers?|streams?|clusters?|queues?|events?)\b`), replacement: "Kafka ${1}"},
	{regex: regexp.MustCompile(`(?i)\b(?:rabbit\s*mq)\b`), replacement: "RabbitMQ"},
	{regex: regexp.MustCompile(`(?i)\b(?:pub\s*sub|pub-sub|publish\s*subscribe)\b`), replacement: "Pub/Sub"},

	// Architectures & Concepts
	{regex: regexp.MustCompile(`(?i)\b(?:micro\s*services)\b`), replacement: "microservices"},
	{regex: regexp.MustCompile(`(?i)\b(?:mono\s*repo)\b`), replacement: "monorepo"},
	{regex: regexp.MustCompile(`(?i)\b(?:go\s*routines?)\b`), replacement: "goroutines"},
	{regex: regexp.MustCompile(`(?i)\b(?:o\s*auth(?:\s*2(?:\.0)?)?)\b`), replacement: "OAuth 2.0"},
	{regex: regexp.MustCompile(`(?i)\b(?:j\s*w\s*t|jot\s*token)\b`), replacement: "JWT"},
	{regex: regexp.MustCompile(`(?i)\b(?:j\s*son)\b`), replacement: "JSON"},
	{regex: regexp.MustCompile(`(?i)\b(?:h\s*t\s*m\s*l)\b`), replacement: "HTML"},
	{regex: regexp.MustCompile(`(?i)\b(?:c\s*s\s*s)\b`), replacement: "CSS"},
	{regex: regexp.MustCompile(`(?i)\b(?:s\s*q\s*l)\b`), replacement: "SQL"},
	{regex: regexp.MustCompile(`(?i)\b(?:o\s*r\s*m)\b`), replacement: "ORM"},
	{regex: regexp.MustCompile(`(?i)\b(?:gorm)\b`), replacement: "GORM"},
	{regex: regexp.MustCompile(`(?i)\b(?:prisma)\b`), replacement: "Prisma"},
	{regex: regexp.MustCompile(`(?i)\b(?:acid)\s+(compliance|compliant|properties|transactions?|guarantees?)\b`), replacement: "ACID ${1}"},
	{regex: regexp.MustCompile(`(?i)\b(?:cap\s*theorem)\b`), replacement: "CAP theorem"},
	{regex: regexp.MustCompile(`(?i)\b(?:e\s*2\s*e)\s+(tests?|testing)\b`), replacement: "E2E ${1}"},
	{regex: regexp.MustCompile(`(?i)\b(?:t\s*d\s*d)\b`), replacement: "TDD"},
	{regex: regexp.MustCompile(`(?i)\b(?:p\s*r)\s+(reviews?|merged|opened|branch)\b`), replacement: "PR ${1}"},
}

// NormalizeTechVocabulary normalizes technical terms and fixes speech-to-text distortions.
func NormalizeTechVocabulary(text string) string {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return ""
	}

	result := trimmed
	for _, rule := range techRules {
		result = rule.regex.ReplaceAllString(result, rule.replacement)
	}

	spaceRegex := regexp.MustCompile(`\s{2,}`)
	return strings.TrimSpace(spaceRegex.ReplaceAllString(result, " "))
}

import { InMemoryFellowRepository } from './InMemoryFellowRepository.js';
import { NetlifyBlobFellowRepository } from './NetlifyBlobFellowRepository.js';

export function getFellowRepository() {
	// Check if running in a Netlify production/preview environment
	if (process.env.NETLIFY) {
		return new NetlifyBlobFellowRepository();
	}
	// Default to local in-memory database for dev and testing
	return new InMemoryFellowRepository();
}

import { getFellowRepository } from './lib/FellowRepository.js';

export default async (req, context) => {
	const url = new URL(req.url);
	// Handle local Dev redirects or Netlify production paths
	const path = url.pathname.replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/api/, '');
	const repo = getFellowRepository();

	// Set CORS headers for local/cross-origin testing
	const headers = {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Headers': 'Content-Type',
		'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
	};

	// Handle preflight requests
	if (req.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers });
	}

	try {
		// Route: POST /applications (Submit new application)
		if (path === '/applications' && req.method === 'POST') {
			const body = await req.json();
			const result = await repo.saveApplication(body);
			return new Response(JSON.stringify(result), { status: 201, headers });
		}

		// Route: GET /fellows (List all fellows)
		if (path === '/fellows' && req.method === 'GET') {
			const result = await repo.getApplications();
			return new Response(JSON.stringify(result), { status: 200, headers });
		}

		// Route: GET /fellows/:id (Retrieve specific fellow details)
		const fellowMatch = path.match(/^\/fellows\/([a-zA-Z0-9\-]+)$/);
		if (fellowMatch && req.method === 'GET') {
			const id = fellowMatch[1];
			const fellow = await repo.getFellow(id);
			if (!fellow) {
				return new Response(JSON.stringify({ error: 'Fellow not found' }), { status: 404, headers });
			}
			return new Response(JSON.stringify(fellow), { status: 200, headers });
		}

		// Route: PUT /fellows/:id/progress (Update 10-step progress checkboxes)
		const progressMatch = path.match(/^\/fellows\/([a-zA-Z0-9\-]+)\/progress$/);
		if (progressMatch && req.method === 'PUT') {
			const id = progressMatch[1];
			const body = await req.json();
			const result = await repo.updateProgress(id, body);
			return new Response(JSON.stringify(result), { status: 200, headers });
		}

		// Route: POST /fellows/:id/graduate (Mark fellow as graduated & generate cert)
		const graduateMatch = path.match(/^\/fellows\/([a-zA-Z0-9\-]+)\/graduate$/);
		if (graduateMatch && req.method === 'POST') {
			const id = graduateMatch[1];
			const result = await repo.graduateFellow(id);
			return new Response(JSON.stringify(result), { status: 200, headers });
		}

		// Default 404 for unknown endpoints
		return new Response(JSON.stringify({ error: `Not Found: ${path}` }), { status: 404, headers });
	} catch (error) {
		console.error("API Gateway Error:", error);
		return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
	}
};

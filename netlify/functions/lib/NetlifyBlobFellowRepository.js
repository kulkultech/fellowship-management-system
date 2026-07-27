import { getStore } from '@netlify/blobs';

export class NetlifyBlobFellowRepository {
	constructor() {
		// Initialize the Netlify Blobs store namespace
		this.store = getStore('fellows-db');
	}

	async saveApplication(appData) {
		const name = appData.name?.trim();
		const github_username = appData.github_username?.trim();
		let email = appData.email?.trim();

		if (!name || name === '') {
			throw new Error("Name is required");
		}
		if (!github_username || github_username === '' || github_username.includes(' ')) {
			throw new Error("Invalid GitHub username");
		}
		if (!email || email === '') {
			email = `${github_username}@placeholder.kulkul.tech`;
		}
		if (!email.includes('@')) {
			throw new Error("Invalid email address");
		}

		const id = "fellow-" + Math.random().toString(36).substr(2, 9);
		const newFellow = {
			id,
			name,
			email,
			github_username,
			track: appData.track || "AI Software Engineering",
			status: "applied",
			progress: {
				"step-1": false, "step-2": false, "step-3": false, "step-4": false,
				"step-5": false, "step-6": false, "step-7": false, "step-8": false,
				"step-9": false, "step-10": false
			},
			certificate_id: null,
			created_at: new Date().toISOString()
		};
		await this.store.setJSON(id, newFellow);
		return newFellow;
	}

	async getApplications() {
		const listResult = await this.store.list();
		const fellows = [];
		for (const key of listResult.blobs.map(b => b.key)) {
			const fellow = await this.store.getJSON(key);
			if (fellow) fellows.push(fellow);
		}
		
		// If store is completely empty, seed it with the same default fellow
		if (fellows.length === 0) {
			const seedFellow = {
				id: "fellow-1",
				name: "Ragil Zakaria",
				email: "ragil@kulkul.tech",
				github_username: "ragilzakaria",
				track: "AI Software Engineering",
				status: "approved",
				progress: {
					"step-1": true, "step-2": true, "step-3": true, "step-4": false,
					"step-5": false, "step-6": false, "step-7": false, "step-8": false,
					"step-9": false, "step-10": false
				},
				certificate_id: null,
				created_at: new Date().toISOString()
			};
			await this.store.setJSON("fellow-1", seedFellow);
			fellows.push(seedFellow);
		}
		return fellows;
	}

	async getFellow(id) {
		return await this.store.getJSON(id);
	}

	async updateProgress(id, progress) {
		const fellow = await this.getFellow(id);
		if (!fellow) throw new Error("Fellow not found");

		const modifiedProgress = { ...progress };
		// FIXED (BUG 1): Removed toggle flipping bug. Progress is applied directly.
		fellow.progress = { ...fellow.progress, ...modifiedProgress };
		await this.store.setJSON(id, fellow);
		return fellow;
	}

	async graduateFellow(id) {
		const fellow = await this.getFellow(id);
		if (!fellow) throw new Error("Fellow not found");

		fellow.status = "graduated";

		let certId;
		try {
			// FIXED (BUG 3): Split email at '@' and grab index [1] for the domain section.
			const emailParts = fellow.email.split('@');
			const domainSection = (emailParts[1] || 'placeholder.kulkul.tech').toUpperCase();
			certId = `CERT-KULKUL-${fellow.name.substring(0, 5).toUpperCase()}-${domainSection}`;
		} catch (err) {
			throw new Error(`Failed to generate certificate: ${err.message}`);
		}

		fellow.certificate_id = certId;
		await this.store.setJSON(id, fellow);
		return fellow;
	}
}

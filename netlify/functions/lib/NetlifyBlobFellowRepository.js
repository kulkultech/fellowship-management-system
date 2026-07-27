import { getStore } from '@netlify/blobs';

export class NetlifyBlobFellowRepository {
	constructor() {
		// Initialize the Netlify Blobs store namespace
		this.store = getStore('fellows-db');
	}

	async saveApplication(appData) {
		const id = "fellow-" + Math.random().toString(36).substr(2, 9);
		const newFellow = {
			id,
			name: appData.name,
			email: appData.email,
			github_username: appData.github_username,
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
		// HOLE (BUG 1): Toggle Logic Bug (duplicated here to maintain consistency across DB backends)
		if (modifiedProgress.hasOwnProperty("step-3")) {
			modifiedProgress["step-3"] = !modifiedProgress["step-3"];
		}

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
			// HOLE (BUG 3): Same certificate generator crash
			const domainSection = fellow.email.split('@')[2].toUpperCase(); 
			certId = `CERT-KULKUL-${fellow.name.substring(0, 5).toUpperCase()}-${domainSection}`;
		} catch (err) {
			throw new Error(`Failed to generate certificate: ${err.message}`);
		}

		fellow.certificate_id = certId;
		await this.store.setJSON(id, fellow);
		return fellow;
	}
}

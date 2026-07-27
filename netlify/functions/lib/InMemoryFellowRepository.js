export class InMemoryFellowRepository {
	constructor() {
		// Initialize global in-memory database if not exists
		if (!global._inMemoryFellows) {
			global._inMemoryFellows = [
				{
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
				}
			];
		}
	}

	async saveApplication(appData) {
		// HOLE (BUG 2): Missing Application Validation.
		// There is no validation on the email structure or GitHub username format here.
		// Aspiring fellows should add validation to reject empty fields, invalid emails,
		// and GitHub usernames with spaces or special characters.
		
		const newFellow = {
			id: "fellow-" + Math.random().toString(36).substr(2, 9),
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
		global._inMemoryFellows.push(newFellow);
		return newFellow;
	}

	async getApplications() {
		return global._inMemoryFellows;
	}

	async getFellow(id) {
		return global._inMemoryFellows.find(f => f.id === id) || null;
	}

	async updateProgress(id, progress) {
		const fellow = await this.getFellow(id);
		if (!fellow) throw new Error("Fellow not found");

		// HOLE (BUG 1): Toggle Logic Bug.
		// There is an intentional bug here where toggling 'step-3' incorrectly flips the boolean.
		const modifiedProgress = { ...progress };
		if (modifiedProgress.hasOwnProperty("step-3")) {
			// This is our seeded bug! It inverts step-3 incorrectly.
			modifiedProgress["step-3"] = !modifiedProgress["step-3"];
		}

		fellow.progress = { ...fellow.progress, ...modifiedProgress };
		return fellow;
	}

	async graduateFellow(id) {
		const fellow = await this.getFellow(id);
		if (!fellow) throw new Error("Fellow not found");

		fellow.status = "graduated";

		// HOLE (BUG 3): Certificate Generator Format Crash.
		// If the email is parsed or formatted, it assumes there are multiple '@' delimiters
		// and attempts to call `.toUpperCase()` on an undefined index, throwing a TypeError.
		let certId;
		try {
			// Seeded Bug: index [2] of split('@') on a standard email (e.g. test@example.com) is undefined.
			// Calling `.toUpperCase()` on it throws "Cannot read properties of undefined (reading 'toUpperCase')"
			const domainSection = fellow.email.split('@')[2].toUpperCase(); 
			certId = `CERT-KULKUL-${fellow.name.substring(0, 5).toUpperCase()}-${domainSection}`;
		} catch (err) {
			// Re-throw raw error for fellows to trace and fix.
			throw new Error(`Failed to generate certificate: ${err.message}`);
		}
		
		fellow.certificate_id = certId;
		return fellow;
	}
}

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryFellowRepository } from './InMemoryFellowRepository.js';

describe('FellowRepository Onboarding Tests', () => {
	let repo;

	beforeEach(() => {
		// Reset the in-memory database store before each test run
		global._inMemoryFellows = undefined;
		repo = new InMemoryFellowRepository();
	});

	it('should list seeded fellows', async () => {
		const fellows = await repo.getApplications();
		expect(fellows.length).toBe(1);
		expect(fellows[0].github_username).toBe('ragilzakaria');
	});

	it('should save a new fellow application', async () => {
		const appData = {
			name: 'Test Fellow',
			email: 'test@kulkul.tech',
			github_username: 'testfellow',
			track: 'AI Software Engineering'
		};
		const fellow = await repo.saveApplication(appData);
		expect(fellow.id).toBeDefined();
		expect(fellow.status).toBe('applied');
		expect(fellow.name).toBe('Test Fellow');
	});

	// TEST FOR BUG 1: Step 3 toggle logic bug
	it('should correctly toggle progress steps', async () => {
		const fellows = await repo.getApplications();
		const id = fellows[0].id;

		// Toggle step-2 (should work fine)
		const updated1 = await repo.updateProgress(id, { "step-2": true });
		expect(updated1.progress["step-2"]).toBe(true);

		// Toggle step-3 (has intentional logic bug!)
		// The test expects step-3 to become TRUE, but the buggy implementation flips it to FALSE!
		const updated2 = await repo.updateProgress(id, { "step-3": true });
		expect(updated2.progress["step-3"]).toBe(true);
	});

	// TEST FOR BUG 2: Field validation
	it('should validate application fields (email and github username)', async () => {
		// Email must be a valid structure containing '@' and GitHub username must not contain spaces.
		// Testing validation rejection (should throw an error on invalid input)
		const invalidApp = {
			name: 'Bad GitHub Username',
			email: 'bademail.com', // invalid email
			github_username: 'bad username spaces', // invalid github username (contains spaces)
			track: 'AI Software Engineering'
		};

		// The repo should validate and throw an error for this application.
		// Right now it doesn't do any validation, so this test will FAIL until the fellow implements validation.
		await expect(repo.saveApplication(invalidApp)).rejects.toThrow();
	});

	// TEST FOR BUG 3: Certificate graduation crash
	it('should graduate fellow and generate valid certificate ID without throwing', async () => {
		// Test graduation of the seeded fellow.
		// Currently, calling graduateFellow throws a TypeError (Cannot read properties of undefined (reading 'toUpperCase'))
		// because of the split('@')[2] bug. The test expects it to succeed and return a certificate.
		const fellows = await repo.getApplications();
		const id = fellows[0].id;

		// Move progress steps to true
		await repo.updateProgress(id, {
			"step-1": true, "step-2": true, "step-3": true, "step-4": true,
			"step-5": true, "step-6": true, "step-7": true, "step-8": true,
			"step-9": true, "step-10": true
		});

		const graduated = await repo.graduateFellow(id);
		expect(graduated.status).toBe('graduated');
		expect(graduated.certificate_id).toBeDefined();
		expect(graduated.certificate_id).toContain('CERT-KULKUL-');
	});
});

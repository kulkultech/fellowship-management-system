import { useState, useEffect } from 'react';
import { User, Mail, Github, Award, CheckCircle, Clock, AlertTriangle, Play } from 'lucide-react';
import './App.css';

const TRACKS = [
	"AI Software Engineering",
	"AI Mobile Engineering",
	"AI & ML Research"
];

const STEPS = [
	{ id: "step-1", label: "Step 1: Community Setup" },
	{ id: "step-2", label: "Step 2: OS Setup" },
	{ id: "step-3", label: "Step 3: Setup Coding Agents" },
	{ id: "step-4", label: "Step 4: Select AI Stack" },
	{ id: "step-5", label: "Step 5: Fork & Clone Sandbox" },
	{ id: "step-6", label: "Step 6: Sandbox Architecture" },
	{ id: "step-7", label: "Step 7: Solve Sandbox Issue" },
	{ id: "step-8", label: "Step 8: Prompt Test suite" },
	{ id: "step-9", label: "Step 9: Deploy Application" },
	{ id: "step-10", label: "Step 10: Submit & Review" }
];

function App() {
	const [fellows, setFellows] = useState([]);
	const [selectedFellow, setSelectedFellow] = useState(null);
	const [error, setError] = useState(null);
	const [success, setSuccess] = useState(null);
	
	// Form state
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [github, setGithub] = useState('');
	const [track, setTrack] = useState(TRACKS[0]);

	// Fetch fellows on mount
	useEffect(() => {
		fetchFellows();
	}, []);

	const fetchFellows = async () => {
		try {
			const res = await fetch('/api/fellows');
			if (!res.ok) throw new Error('Failed to load fellows');
			const data = await res.json();
			setFellows(data);
			if (data.length > 0 && !selectedFellow) {
				setSelectedFellow(data[0]);
			}
		} catch (err) {
			setError(err.message);
		}
	};

	const handleApply = async (e) => {
		e.preventDefault();
		setError(null);
		setSuccess(null);

		try {
			const res = await fetch('/api/applications', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, email, github_username: github, track })
			});

			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Failed to submit application');

			setSuccess(`Application submitted successfully! Welcome, ${data.name}!`);
			setName('');
			setEmail('');
			setGithub('');
			
			// Refresh list and select the new fellow
			await fetchFellows();
			setSelectedFellow(data);
		} catch (err) {
			setError(err.message);
		}
	};

	const handleToggleStep = async (stepId) => {
		if (!selectedFellow) return;
		setError(null);
		setSuccess(null);

		// Prepare updated progress payload
		const updatedProgress = {
			[stepId]: !selectedFellow.progress[stepId]
		};

		try {
			const res = await fetch(`/api/fellows/${selectedFellow.id}/progress`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updatedProgress)
			});

			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Failed to update progress');

			// Refresh lists and select updated fellow
			setFellows(prev => prev.map(f => f.id === data.id ? data : f));
			setSelectedFellow(data);
		} catch (err) {
			setError(err.message);
		}
	};

	const handleGraduate = async () => {
		if (!selectedFellow) return;
		setError(null);
		setSuccess(null);

		try {
			const res = await fetch(`/api/fellows/${selectedFellow.id}/graduate`, {
				method: 'POST'
			});

			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Graduation failed');

			setSuccess(`${selectedFellow.name} has graduated! Certificate issued.`);
			setFellows(prev => prev.map(f => f.id === data.id ? data : f));
			setSelectedFellow(data);
		} catch (err) {
			setError(err.message);
		}
	};

	return (
		<main>
			<header style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
				<h1 className="text-gradient">KulKul Fellowship</h1>
				<p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
					Manage applicants, track 10-step AI challenge progress, and issue graduation certificates.
				</p>
			</header>

			{/* Alert Notifications */}
			{error && (
				<div style={{
					background: 'var(--error-bg)',
					border: '1px solid var(--error-border)',
					color: 'var(--error)',
					padding: '1rem',
					borderRadius: '8px',
					marginBottom: '1.5rem',
					display: 'flex',
					alignItems: 'center',
					gap: '0.75rem',
					textAlign: 'left'
				}}>
					<AlertTriangle size={20} />
					<div><strong>Error:</strong> {error}</div>
				</div>
			)}

			{success && (
				<div style={{
					background: 'var(--success-bg)',
					border: '1px solid var(--success-border)',
					color: 'var(--success)',
					padding: '1rem',
					borderRadius: '8px',
					marginBottom: '1.5rem',
					display: 'flex',
					alignItems: 'center',
					gap: '0.75rem',
					textAlign: 'left'
				}}>
					<CheckCircle size={20} />
					<div>{success}</div>
				</div>
			)}

			<div className="dashboard-grid">
				{/* Sidebar Panels: Apply Form & Fellow Picker */}
				<div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
					
					{/* Application Form Card */}
					<div className="glass-panel">
						<h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
							<User size={18} className="text-gradient" /> Apply for Fellowship
						</h3>
						<form onSubmit={handleApply}>
							<div className="form-group">
								<label>Full Name</label>
								<input
									type="text"
									className="form-control"
									value={name}
									onChange={e => setName(e.target.value)}
									placeholder="e.g. John Doe"
									required
								/>
							</div>
							<div className="form-group">
								<label>Email Address</label>
								<input
									type="email"
									className="form-control"
									value={email}
									onChange={e => setEmail(e.target.value)}
									placeholder="e.g. name@kulkul.tech"
									required
								/>
							</div>
							<div className="form-group">
								<label>GitHub Username</label>
								<input
									type="text"
									className="form-control"
									value={github}
									onChange={e => setGithub(e.target.value)}
									placeholder="e.g. github_username"
									required
								/>
							</div>
							<div className="form-group">
								<label>Target Track</label>
								<select
									className="form-control"
									value={track}
									onChange={e => setTrack(e.target.value)}
								>
									{TRACKS.map(t => <option key={t} value={t}>{t}</option>)}
								</select>
							</div>
							<button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
								Submit Application
							</button>
						</form>
					</div>

					{/* Fellows Selector List */}
					<div className="glass-panel" style={{ flexGrow: 1 }}>
						<h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
							<User size={18} className="text-gradient" /> Registered Fellows ({fellows.length})
						</h3>
						<div className="fellows-list">
							{fellows.map(f => (
								<div
									key={f.id}
									className={`fellow-item ${selectedFellow?.id === f.id ? 'active' : ''}`}
									onClick={() => setSelectedFellow(f)}
								>
									<div style={{ textAlign: 'left' }}>
										<div style={{ fontWeight: 700, color: 'var(--text-title)' }}>{f.name}</div>
										<div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@{f.github_username}</div>
									</div>
									<span className={`badge badge-${f.status}`}>
										{f.status}
									</span>
								</div>
							))}
						</div>
					</div>

				</div>

				{/* Main Detail Panel */}
				<div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
					{selectedFellow ? (
						<>
							{/* Fellow Header Info */}
							<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1.5rem' }}>
								<div style={{ textAlign: 'left' }}>
									<h2 style={{ margin: '0 0 0.5rem 0' }}>{selectedFellow.name}</h2>
									<div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
										<span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
											<Mail size={14} /> {selectedFellow.email}
										</span>
										<a
											href={`https://github.com/${selectedFellow.github_username}`}
											target="_blank"
											rel="noopener noreferrer"
											style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', color: 'var(--primary-light)', textDecoration: 'none' }}
										>
											<Github size={14} /> @{selectedFellow.github_username}
										</a>
									</div>
								</div>
								<div style={{ textAlign: 'right' }}>
									<div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>CURRENT STATUS</div>
									<span className={`badge badge-${selectedFellow.status}`} style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}>
										{selectedFellow.status}
									</span>
								</div>
							</div>

							{/* Track and Details */}
							<div style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-glass)', textAlign: 'left' }}>
								<Award className="text-gradient" size={24} />
								<div>
									<div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ENROLLED TRACK</div>
									<div style={{ fontWeight: 700, color: 'var(--text-title)', fontSize: '1.05rem' }}>{selectedFellow.track}</div>
								</div>
							</div>

							{/* Checklist progress tracker */}
							<div style={{ textAlign: 'left' }}>
								<h3 style={{ margin: '0 0 0.25rem 0' }}>10-Step AI Challenge Progress</h3>
								<p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
									Track and check off steps completed by the fellow. Note that changes update instantly in the database.
								</p>
								
								<div className="steps-checklist">
									{STEPS.map(step => {
										const isChecked = selectedFellow.progress[step.id];
										return (
											<div
												key={step.id}
												className={`step-check-item ${isChecked ? 'checked' : ''}`}
												onClick={() => handleToggleStep(step.id)}
											>
												<input
													type="checkbox"
													checked={isChecked || false}
													readOnly
													style={{ pointerEvents: 'none', accentColor: 'var(--success)' }}
												/>
												<span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{step.label}</span>
											</div>
										);
									})}
								</div>
							</div>

							{/* Action Area: Graduation & Certificate */}
							<div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '2rem', marginTop: 'auto', textAlign: 'left' }}>
								{selectedFellow.status === 'graduated' ? (
									/* Show Certificate */
									<div className="certificate-card">
										<div className="certificate-seal">🏆</div>
										<h2 style={{ color: 'hsl(45, 90%, 50%)', margin: '0 0 0.5rem 0', fontFamily: 'var(--heading)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
											Certificate of Graduation
										</h2>
										<p style={{ color: 'hsl(45, 20%, 80%)', fontStyle: 'italic', margin: '0 0 1.5rem 0' }}>
											This is proudly presented to
										</p>
										<h1 style={{ background: 'linear-gradient(135deg, #fff 0%, hsl(45, 90%, 75%) 100%)', webkitBackgroundClip: 'text', webkitTextFillColor: 'transparent', margin: '0 0 1rem 0' }}>
											{selectedFellow.name}
										</h1>
										<p style={{ maxWidth: '600px', margin: '0 auto 1.5rem', color: 'hsl(45, 10%, 70%)', fontSize: '0.95rem', lineHeight: '150%' }}>
											For successfully completing the rigorous 3-month peer-to-peer facilitated learning journey, masterminding AI-first software patterns, local sandbox test coverage, and publishing production deployments.
										</p>
										<div style={{ borderTop: '1px dashed hsl(45, 40%, 30%)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'hsl(45, 20%, 60%)' }}>
											<div>TRACK: {selectedFellow.track.toUpperCase()}</div>
											<div>ID: {selectedFellow.certificate_id}</div>
										</div>
									</div>
								) : (
									/* Show Graduation Button */
									<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
										<div>
											<h4 style={{ margin: '0 0 0.25rem 0' }}>Graduate & Issue Certificate</h4>
											<p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
												If this fellow has finished all tasks, click here to finalize graduation and auto-generate their certificate hash.
											</p>
										</div>
										<button
											onClick={handleGraduate}
											className="btn btn-primary"
											style={{ background: 'linear-gradient(135deg, hsl(45, 90%, 50%) 0%, hsl(38, 92%, 45%) 100%)', color: '#1a1a1a' }}
										>
											<Award size={18} /> Graduate Fellow
										</button>
									</div>
								)}
							</div>
						</>
					) : (
						<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px', color: 'var(--text-muted)' }}>
							<User size={48} strokeWidth={1} style={{ marginBottom: '1rem' }} />
							<h3>No Fellow Selected</h3>
							<p>Select a registered fellow from the list or fill out the application form to create one.</p>
						</div>
					)}
				</div>
			</div>
		</main>
	);
}

export default App;

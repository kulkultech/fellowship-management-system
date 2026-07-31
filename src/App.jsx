import { useState, useEffect } from "react";
import {
  User,
  Mail,
  Github,
  Award,
  CheckCircle,
  Clock,
  AlertTriangle,
  Shield,
  LogOut,
  Search,
  ArrowRight,
} from "lucide-react";
import "./App.css";

const TRACKS = [
  "AI Software Engineering",
  "AI Mobile Engineering",
  "AI & ML Research",
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
  { id: "step-10", label: "Step 10: Submit & Review" },
];

function App() {
  // Authentication & Navigation view states
  const [view, setView] = useState("login"); // 'login' | 'register' | 'portal'
  const [role, setRole] = useState(null); // 'admin' | 'fellow'
  const [currentUser, setCurrentUser] = useState(null); // Selected fellow object if role === 'fellow'
  const [token, setToken] = useState(localStorage.getItem("adminToken") || "");
  const [githubInput, setGithubInput] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  // Dashboard/Fellows data states
  const [fellows, setFellows] = useState([]);
  const [selectedFellow, setSelectedFellow] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Error / Success messaging
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Registration Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [github, setGithub] = useState("");
  const [track, setTrack] = useState(TRACKS[0]);

  // Auto load fellows on load or when role changes
  useEffect(() => {
    if (role === "admin") {
      fetchFellows();
    }
  }, [role]);

  const fetchFellows = async () => {
    try {
      const res = await fetch("/api/fellows");
      if (!res.ok) throw new Error("Failed to fetch fellows registry");
      const data = await res.json();
      setFellows(data);
      if (data.length > 0 && !selectedFellow) {
        setSelectedFellow(data[0]);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLogout = () => {
    setRole(null);
    setCurrentUser(null);
    setToken("");
    localStorage.removeItem("adminToken");
    setView("login");
    setError(null);
    setSuccess(null);
  };

  // Admin Login
  const handleAdminLogin = (e) => {
    e.preventDefault();
    setError(null);
    if (adminPassword === "admin123") {
      setToken("admin123");
      localStorage.setItem("adminToken", "admin123");
      setRole("admin");
      setView("portal");
      setAdminPassword("");
    } else {
      setError("Invalid Admin password key.");
    }
  };

  // Fellow Login (Search by GitHub username)
  const handleFellowLogin = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/fellows");
      if (!res.ok) throw new Error("Could not verify credentials.");
      const allFellows = await res.json();
      const match = allFellows.find(
        (f) =>
          f.github_username.toLowerCase() === githubInput.trim().toLowerCase(),
      );

      if (match) {
        setCurrentUser(match);
        setRole("fellow");
        setView("portal");
        setGithubInput("");
      } else {
        setError(
          `GitHub username "${githubInput}" is not registered in the fellowship yet.`,
        );
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // Public registration handler
  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const submissionEmail =
      email.trim() || `${github.trim()}@placeholder.kulkul.tech`;

    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: submissionEmail,
          github_username: github,
          track,
        }),
      });

      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to submit application");

      setSuccess(`Welcome, ${data.name}! You are registered.`);

      // Directly sign-in as the registered fellow
      setCurrentUser(data);
      setRole("fellow");
      setView("portal");

      // Reset fields
      setName("");
      setEmail("");
      setGithub("");
    } catch (err) {
      setError(err.message);
    }
  };

  // Admin checklists toggle
  const handleToggleStep = async (stepId) => {
    if (role !== "admin" || !selectedFellow) return;
    setError(null);
    setSuccess(null);

    const updatedProgress = {
      [stepId]: !selectedFellow.progress[stepId],
    };

    try {
      const res = await fetch(`/api/fellows/${selectedFellow.id}/progress`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updatedProgress),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update progress");

      setFellows((prev) => prev.map((f) => (f.id === data.id ? data : f)));
      setSelectedFellow(data);
    } catch (err) {
      setError(err.message);
    }
  };

  // Admin trigger graduation
  const handleGraduate = async () => {
    if (role !== "admin" || !selectedFellow) return;
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/fellows/${selectedFellow.id}/graduate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Graduation failed");

      setSuccess(`${selectedFellow.name} has graduated! Certificate issued.`);
      setFellows((prev) => prev.map((f) => (f.id === data.id ? data : f)));
      setSelectedFellow(data);
    } catch (err) {
      setError(err.message);
    }
  };

  // Search filter
  const filteredFellows = fellows.filter(
    (f) =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.github_username.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <main>
      <header
        style={{
          marginBottom: "2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid var(--border-glass)",
          paddingBottom: "1rem",
        }}
      >
        <div>
          <h1 className="text-gradient" style={{ margin: 0, fontSize: "2rem" }}>
            KulKul Fellowship
          </h1>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "0.9rem",
              margin: 0,
            }}
          >
            Portal Sandbox Management
          </p>
        </div>
        {role && (
          <button
            onClick={handleLogout}
            className="btn btn-secondary"
            style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}
          >
            <LogOut size={14} /> Log Out ({role})
          </button>
        )}
      </header>

      {/* Notifications Alerts */}
      {error && (
        <div
          style={{
            background: "var(--error-bg)",
            border: "1px solid var(--error-border)",
            color: "var(--error)",
            padding: "0.8rem 1.2rem",
            borderRadius: "8px",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            textAlign: "left",
          }}
        >
          <AlertTriangle size={18} />
          <div style={{ fontSize: "0.9rem" }}>
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}

      {success && (
        <div
          style={{
            background: "var(--success-bg)",
            border: "1px solid var(--success-border)",
            color: "var(--success)",
            padding: "0.8rem 1.2rem",
            borderRadius: "8px",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            textAlign: "left",
          }}
        >
          <CheckCircle size={18} />
          <div style={{ fontSize: "0.9rem" }}>{success}</div>
        </div>
      )}

      {/* ==================== VIEW: LOGIN SELECTOR ==================== */}
      {view === "login" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "1.5rem",
            marginTop: "2rem",
          }}
        >
          {/* Registration Form trigger */}
          <div
            className="glass-panel"
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h3
                style={{
                  marginTop: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <User size={20} className="text-gradient" /> Register
              </h3>
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.9rem",
                  lineHeight: "145%",
                }}
              >
                Are you an aspiring fellow? Submit your application form to
                create your challenge profile and track your onboarding tasks.
              </p>
            </div>
            <button
              onClick={() => setView("register")}
              className="btn btn-primary"
              style={{ width: "100%", marginTop: "1.5rem" }}
            >
              Apply Now <ArrowRight size={16} />
            </button>
          </div>

          {/* Candidate Portal Login */}
          <div className="glass-panel">
            <h3
              style={{
                marginTop: 0,
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Github size={20} className="text-gradient" /> Fellow Access
            </h3>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "0.9rem",
                marginBottom: "1.2rem",
                lineHeight: "145%",
              }}
            >
              Already registered? Enter your GitHub username to review your
              personal 10-step progress and view your graduation certificate.
            </p>
            <form onSubmit={handleFellowLogin}>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. your_github"
                value={githubInput}
                onChange={(e) => setGithubInput(e.target.value)}
                style={{ marginBottom: "1rem" }}
                required
              />
              <button
                type="submit"
                className="btn btn-secondary"
                style={{ width: "100%" }}
              >
                View Progress Checklist
              </button>
            </form>
          </div>

          {/* Admin Portal Login */}
          <div className="glass-panel">
            <h3
              style={{
                marginTop: 0,
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Shield size={20} className="text-gradient" /> Mentor Portal
            </h3>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "0.9rem",
                marginBottom: "1.2rem",
                lineHeight: "145%",
              }}
            >
              Administrative area for KulKul mentors to verify applicants,
              update step checklists, and generate graduation certificates.
            </p>
            <form onSubmit={handleAdminLogin}>
              <input
                type="password"
                className="form-control"
                placeholder="Enter admin password (admin123)"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                style={{ marginBottom: "1rem" }}
                required
              />
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: "100%" }}
              >
                Log In as Admin
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==================== VIEW: REGISTRATION FORM ==================== */}
      {view === "register" && (
        <div
          className="glass-panel"
          style={{ maxWidth: "500px", margin: "2rem auto" }}
        >
          <h2 style={{ marginTop: 0 }} className="text-gradient">
            Submit Fellowship Application
          </h2>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "0.9rem",
              marginBottom: "1.5rem",
            }}
          >
            Fill in the details below. This will register you in the system,
            allow mentors to track your steps, and issue certificates.
          </p>

          <form onSubmit={handleRegister}>
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                className="form-control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. John Doe"
                required
              />
            </div>
            <div className="form-group">
              <label>Email Address (Optional)</label>
              <input
                type="email"
                className="form-control"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Defaults to username@placeholder.kulkul.tech"
              />
            </div>
            <div className="form-group">
              <label>GitHub Username</label>
              <input
                type="text"
                className="form-control"
                value={github}
                onChange={(e) => setGithub(e.target.value)}
                placeholder="e.g. github_username"
                required
              />
            </div>
            <div className="form-group">
              <label>Target Track</label>
              <select
                className="form-control"
                value={track}
                onChange={(e) => setTrack(e.target.value)}
              >
                {TRACKS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
              <button
                type="button"
                onClick={() => setView("login")}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Back
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                Submit Apply
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================== VIEW: FELLOW PORTAL (Candidate View) ==================== */}
      {view === "portal" && role === "fellow" && currentUser && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: "2rem",
            marginTop: "1rem",
          }}
        >
          <div className="glass-panel" style={{ textAlign: "left" }}>
            {/* Header Details */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                borderBottom: "1px solid var(--border-glass)",
                paddingBottom: "1.5rem",
                marginBottom: "1.5rem",
              }}
            >
              <div>
                <h2 style={{ margin: "0 0 0.5rem 0" }}>{currentUser.name}</h2>
                <div style={{ display: "flex", gap: "1.5rem" }}>
                  <span
                    style={{
                      fontSize: "0.9rem",
                      color: "var(--text-muted)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    <Mail size={14} /> {currentUser.email}
                  </span>
                  <span
                    style={{
                      fontSize: "0.9rem",
                      color: "var(--primary-light)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    <Github size={14} /> @{currentUser.github_username}
                  </span>
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--text-muted)",
                    marginBottom: "0.25rem",
                  }}
                >
                  APPLICATION STATUS
                </div>
                <span
                  className={`badge badge-${currentUser.status}`}
                  style={{ padding: "0.4rem 1rem" }}
                >
                  {currentUser.status}
                </span>
              </div>
            </div>

            {/* Track Enrolled */}
            <div
              style={{
                display: "flex",
                gap: "1rem",
                alignItems: "center",
                background: "rgba(255,255,255,0.02)",
                padding: "1rem",
                borderRadius: "8px",
                border: "1px solid var(--border-glass)",
                marginBottom: "2rem",
              }}
            >
              <Award className="text-gradient" size={24} />
              <div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  ENROLLED FELLOWSHIP TRACK
                </div>
                <div style={{ fontWeight: 700, color: "var(--text-title)" }}>
                  {currentUser.track}
                </div>
              </div>
            </div>

            {/* Read Only Checklist */}
            <h3 style={{ margin: "0 0 0.25rem 0" }}>
              Your Onboarding Progress
            </h3>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "0.85rem",
                marginBottom: "1.2rem",
              }}
            >
              Mentors check off items as they verify your pull requests and
              challenges. (Read-only view).
            </p>

            <div className="steps-checklist">
              {STEPS.map((step) => {
                const isChecked = currentUser.progress[step.id];
                return (
                  <div
                    key={step.id}
                    className={`step-check-item ${isChecked ? "checked" : ""}`}
                    style={{
                      cursor: "not-allowed",
                      opacity: isChecked ? 1 : 0.6,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked || false}
                      disabled
                      style={{ accentColor: "var(--success)" }}
                    />
                    <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Graduation Certificate */}
            {currentUser.status === "graduated" && (
              <div className="certificate-card" style={{ marginTop: "2.5rem" }}>
                <div className="certificate-seal">🏆</div>
                <h2
                  style={{
                    color: "hsl(45, 90%, 50%)",
                    margin: "0 0 0.5rem 0",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Certificate of Graduation
                </h2>
                <p
                  style={{
                    color: "hsl(45, 20%, 80%)",
                    fontStyle: "italic",
                    margin: "0 0 1.5rem 0",
                  }}
                >
                  This is proudly presented to
                </p>
                <h1
                  style={{
                    background:
                      "linear-gradient(135deg, #fff 0%, hsl(45, 90%, 75%) 100%)",
                    webkitBackgroundClip: "text",
                    webkitTextFillColor: "transparent",
                    margin: "0 0 1rem 0",
                  }}
                >
                  {currentUser.name}
                </h1>
                <p
                  style={{
                    maxWidth: "600px",
                    margin: "0 auto 1.5rem",
                    color: "hsl(45, 10%, 70%)",
                    fontSize: "0.95rem",
                    lineHeight: "150%",
                  }}
                >
                  For successfully completing the peer-facilitated study tracks,
                  publishing operational serverless logic, and demonstrating
                  AI-native code engineering workflows.
                </p>
                <div
                  style={{
                    borderTop: "1px dashed hsl(45, 40%, 30%)",
                    paddingTop: "1rem",
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.8rem",
                    color: "hsl(45, 20%, 60%)",
                  }}
                >
                  <div>TRACK: {currentUser.track.toUpperCase()}</div>
                  <div>ID: {currentUser.certificate_id}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== VIEW: ADMIN PORTAL (Mentor View) ==================== */}
      {view === "portal" && role === "admin" && (
        <div className="dashboard-grid">
          {/* Left Sidebar: Registered Fellows list & Search */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
          >
            <div className="glass-panel">
              <h3
                style={{
                  marginTop: 0,
                  marginBottom: "1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <User size={18} className="text-gradient" /> Registered Fellows
                ({fellows.length})
              </h3>

              {/* Search input */}
              <div style={{ position: "relative", marginBottom: "1.25rem" }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search name or github..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: "2.5rem" }}
                />
                <Search
                  size={16}
                  style={{
                    position: "absolute",
                    left: "0.85rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-muted)",
                  }}
                />
              </div>

              <div className="fellows-list">
                {filteredFellows.map((f) => (
                  <div
                    key={f.id}
                    className={`fellow-item ${selectedFellow?.id === f.id ? "active" : ""}`}
                    onClick={() => setSelectedFellow(f)}
                  >
                    <div style={{ textAlign: "left" }}>
                      <div
                        style={{ fontWeight: 700, color: "var(--text-title)" }}
                      >
                        {f.name}
                      </div>
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        @{f.github_username}
                      </div>
                    </div>
                    <span className={`badge badge-${f.status}`}>
                      {f.status}
                    </span>
                  </div>
                ))}
                {filteredFellows.length === 0 && (
                  <p
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "0.9rem",
                      padding: "1rem",
                    }}
                  >
                    No matching candidates found.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Right Area: Selected Fellow Details & Admin Actions */}
          <div
            className="glass-panel"
            style={{ display: "flex", flexDirection: "column", gap: "2rem" }}
          >
            {selectedFellow ? (
              <>
                {/* Details Header */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    borderBottom: "1px solid var(--border-glass)",
                    paddingBottom: "1.5rem",
                    textAlign: "left",
                  }}
                >
                  <div>
                    <h2 style={{ margin: "0 0 0.5rem 0" }}>
                      {selectedFellow.name}
                    </h2>
                    <div style={{ display: "flex", gap: "1.5rem" }}>
                      <span
                        style={{
                          fontSize: "0.9rem",
                          color: "var(--text-muted)",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.3rem",
                        }}
                      >
                        <Mail size={14} /> {selectedFellow.email}
                      </span>
                      <a
                        href={`https://github.com/${selectedFellow.github_username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: "0.9rem",
                          color: "var(--primary-light)",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          textDecoration: "none",
                        }}
                      >
                        <Github size={14} /> @{selectedFellow.github_username}
                      </a>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text-muted)",
                        marginBottom: "0.25rem",
                      }}
                    >
                      STATUS
                    </div>
                    <span
                      className={`badge badge-${selectedFellow.status}`}
                      style={{ fontSize: "0.85rem", padding: "0.4rem 1rem" }}
                    >
                      {selectedFellow.status}
                    </span>
                  </div>
                </div>

                {/* Track Badge */}
                <div
                  style={{
                    display: "flex",
                    gap: "1rem",
                    alignItems: "center",
                    background: "rgba(255,255,255,0.02)",
                    padding: "1rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-glass)",
                    textAlign: "left",
                  }}
                >
                  <Award className="text-gradient" size={24} />
                  <div>
                    <div
                      style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}
                    >
                      ENROLLED TRACK
                    </div>
                    <div
                      style={{ fontWeight: 700, color: "var(--text-title)" }}
                    >
                      {selectedFellow.track}
                    </div>
                  </div>
                </div>

                {/* Interactive Checklist progress */}
                <div style={{ textAlign: "left" }}>
                  <h3 style={{ margin: "0 0 0.25rem 0" }}>
                    Verify Challenge Progress Checklist
                  </h3>
                  <p
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "0.85rem",
                      marginBottom: "1.25rem",
                    }}
                  >
                    Click checkboxes to toggle task completion states in the
                    database.
                  </p>

                  <div className="steps-checklist">
                    {STEPS.map((step) => {
                      const isChecked = selectedFellow.progress[step.id];
                      return (
                        <div
                          key={step.id}
                          className={`step-check-item ${isChecked ? "checked" : ""}`}
                          onClick={() => handleToggleStep(step.id)}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked || false}
                            readOnly
                            style={{
                              pointerEvents: "none",
                              accentColor: "var(--success)",
                            }}
                          />
                          <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Graduation trigger area */}
                <div
                  style={{
                    borderTop: "1px solid var(--border-glass)",
                    paddingTop: "2rem",
                    marginTop: "auto",
                    textAlign: "left",
                  }}
                >
                  {selectedFellow.status === "graduated" ? (
                    /* Show Certificate */
                    <div className="certificate-card">
                      <div className="certificate-seal">🏆</div>
                      <h2
                        style={{
                          color: "hsl(45, 90%, 50%)",
                          margin: "0 0 0.5rem 0",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        Certificate of Graduation
                      </h2>
                      <p
                        style={{
                          color: "hsl(45, 20%, 80%)",
                          fontStyle: "italic",
                          margin: "0 0 1.5rem 0",
                        }}
                      >
                        This is proudly presented to
                      </p>
                      <h1
                        style={{
                          background:
                            "linear-gradient(135deg, #fff 0%, hsl(45, 90%, 75%) 100%)",
                          webkitBackgroundClip: "text",
                          webkitTextFillColor: "transparent",
                          margin: "0 0 1rem 0",
                        }}
                      >
                        {selectedFellow.name}
                      </h1>
                      <p
                        style={{
                          maxWidth: "600px",
                          margin: "0 auto 1.5rem",
                          color: "hsl(45, 10%, 70%)",
                          fontSize: "0.95rem",
                          lineHeight: "150%",
                        }}
                      >
                        For successfully completing the peer-facilitated study
                        tracks, publishing operational serverless logic, and
                        demonstrating AI-native code engineering workflows.
                      </p>
                      <div
                        style={{
                          borderTop: "1px dashed hsl(45, 40%, 30%)",
                          paddingTop: "1rem",
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "0.8rem",
                          color: "hsl(45, 20%, 60%)",
                        }}
                      >
                        <div>TRACK: {selectedFellow.track.toUpperCase()}</div>
                        <div>ID: {selectedFellow.certificate_id}</div>
                      </div>
                    </div>
                  ) : (
                    /* Show Graduation action */
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "1rem",
                      }}
                    >
                      <div>
                        <h4 style={{ margin: "0 0 0.25rem 0" }}>
                          Graduate & Issue Certificate
                        </h4>
                        <p
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "0.85rem",
                          }}
                        >
                          If this fellow has finished all tasks, click here to
                          finalize graduation and auto-generate their
                          certificate hash.
                        </p>
                      </div>
                      <button
                        onClick={handleGraduate}
                        className="btn btn-primary"
                        style={{
                          background:
                            "linear-gradient(135deg, hsl(45, 90%, 50%) 0%, hsl(38, 92%, 45%) 100%)",
                          color: "#1a1a1a",
                        }}
                      >
                        <Award size={18} /> Graduate Fellow
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  minHeight: "300px",
                  color: "var(--text-muted)",
                }}
              >
                <User
                  size={48}
                  strokeWidth={1}
                  style={{ marginBottom: "1rem" }}
                />
                <h3>No Fellow Selected</h3>
                <p>
                  Select a fellow from the sidebar list to modify details or
                  toggle checklists.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

export default App;

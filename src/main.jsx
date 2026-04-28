import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import {
  BarChart3,
  Bell,
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  Copy,
  HelpCircle,
  Home,
  Layers,
  LogOut,
  Play,
  Plus,
  Radio,
  Search,
  Settings,
  Sparkles,
  Trophy,
  UserRound,
  Users,
  X
} from 'lucide-react';
import './styles.css';

const landingTabs = {
  explore: {
    label: 'New: Live Quiz Rooms',
    title: 'Level Up Your Learning Flow',
    text: 'Create high-energy quizzes in minutes. Engage your audience, track realtime analytics, and make learning addictive.'
  },
  library: {
    label: 'Question banks and collections',
    title: 'Build From Reusable Quiz Sets',
    text: 'Organize questions by category, reuse rounds, and publish polished sessions without rebuilding every event from scratch.'
  },
  reports: {
    label: 'Instant results and history',
    title: 'Turn Every Session Into Insight',
    text: 'See winner tables, response history, participation trends, and the exact questions that kept players engaged.'
  },
  marketplace: {
    label: 'Ready-to-run templates',
    title: 'Launch Faster With Formats',
    text: 'Use quiz formats for training, events, lessons, and team games while keeping your own scoring and timing rules.'
  }
};

const emptyQuestion = () => ({
  prompt: '',
  media_type: 'text',
  image_url: '',
  answer_mode: 'single',
  time_limit: 30,
  points: 1000,
  options: [
    { label: '', is_correct: true },
    { label: '', is_correct: false },
    { label: '', is_correct: false },
    { label: '', is_correct: false }
  ]
});

const emptyQuiz = () => ({
  title: '',
  description: '',
  category: 'General',
  default_time_limit: 30,
  status: 'draft',
  rules: { shuffleQuestions: false, showCorrectAfterQuestion: true, speedBonus: true },
  questions: [emptyQuestion()]
});

function useLocalSession() {
  const [token, setToken] = useState(localStorage.getItem('quizflow-token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('quizflow-user') || 'null'));
  function save(next) {
    localStorage.setItem('quizflow-token', next.token);
    localStorage.setItem('quizflow-user', JSON.stringify(next.user));
    setToken(next.token);
    setUser(next.user);
  }
  function clear() {
    localStorage.removeItem('quizflow-token');
    localStorage.removeItem('quizflow-user');
    setToken('');
    setUser(null);
  }
  return { token, user, save, clear };
}

async function api(path, options = {}, token = '') {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function Shell({ user, view, setView, logout, children, setBuilderQuiz, switchToPublic }) {
  const isOrganizer = user?.role === 'organizer';
  function openBuilder() {
    setBuilderQuiz(null);
    setView('builder');
  }
  return (
    <div className="app-shell">
      {user && (
        <aside className="sidebar">
          <div className="brand-block">
            <div className="brand-mark">QF</div>
            <div>
              <strong>QuizFlow Pro</strong>
              <span>{isOrganizer ? 'Organizer Mode' : 'Player Mode'}</span>
            </div>
          </div>
          <nav>
            <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}><Home size={18} /> Dashboard</button>
            {isOrganizer && <button className={view === 'quizzes' || view === 'builder' ? 'active' : ''} onClick={() => setView('quizzes')}><BookOpen size={18} /> My Quizzes</button>}
            {!isOrganizer && <button className={view === 'join' ? 'active' : ''} onClick={() => setView('join')}><Radio size={18} /> Join Room</button>}
            <button className={view === 'profile' ? 'active' : ''} onClick={() => setView('profile')}><UserRound size={18} /> Profile</button>
            <button className={view === 'analytics' ? 'active' : ''} onClick={() => setView('analytics')}><BarChart3 size={18} /> Analytics</button>
            <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}><Settings size={18} /> Settings</button>
            {isOrganizer && <button onClick={openBuilder}><Plus size={18} /> New Quiz</button>}
            <button onClick={switchToPublic}><Layers size={18} /> Public Platform</button>
          </nav>
          <div className="sidebar-bottom">
            <button className={view === 'help' ? 'active' : ''} onClick={() => setView('help')}><HelpCircle size={17} /> Help Center</button>
            <button onClick={logout}><LogOut size={17} /> Sign Out</button>
          </div>
        </aside>
      )}
      <main className={user ? 'workspace with-sidebar' : 'workspace'}>
        {children}
      </main>
    </div>
  );
}

function Notice({ notice, onClose }) {
  if (!notice) return null;
  return (
    <div className={`toast ${notice.type || 'success'}`}>
      <span>{notice.text}</span>
      <button onClick={onClose}><X size={14} /></button>
    </div>
  );
}

function Landing({ onAuth, onJoin, setNotice }) {
  const [code, setCode] = useState('');
  const [tab, setTab] = useState('explore');
  const content = landingTabs[tab];
  function submitCode() {
    if (code.length !== 6) {
      setNotice({ type: 'error', text: 'Enter a 6-digit room code.' });
      return;
    }
    onJoin(code);
  }
  return (
    <section className="landing">
      <header className="topbar">
        <button className="logo button-logo" onClick={() => setTab('explore')}>QuizFlow</button>
        <nav>
          {Object.entries(landingTabs).map(([key]) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{key[0].toUpperCase() + key.slice(1)}</button>
          ))}
        </nav>
        <div className="top-actions">
          <button className="primary small" onClick={() => onAuth('organizer')}>Create Quiz</button>
          <button className="icon-plain" onClick={() => setNotice({ text: 'Sign in to manage notifications.' })}><Bell size={18} /></button>
          <button className="icon-plain" onClick={() => onAuth('participant')}><UserRound size={18} /></button>
          <button className="avatar-button" onClick={() => onAuth('participant')}>A</button>
        </div>
      </header>
      <div className="glow glow-violet" />
      <div className="glow glow-blue" />
      <div className="landing-grid">
        <div className="hero-copy">
          <div className="pill"><span /> {content.label}</div>
          <h1>{content.title}</h1>
          <p>{content.text}</p>
          <div className="join-card">
            <h2>Join a Quiz</h2>
            <div className="join-row">
              <div className="pin-input">
                <Radio size={18} />
                <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="enter 6-digit pin" onKeyDown={(event) => event.key === 'Enter' && submitCode()} />
              </div>
              <button className="accent" onClick={submitCode}>Enter Room</button>
            </div>
          </div>
          <div className="organizer-link">
            <span>Or are you an organizer?</span>
            <button onClick={() => onAuth('organizer')}>Create a Quiz <ChevronRight size={14} /></button>
          </div>
        </div>
        <div className="bento">
          <button className="metric-card wide interactive-card" onClick={() => setTab('reports')}>
            <div className="metric-head"><span>Live Engagement</span><b>+12%</b></div>
            <strong>87%</strong>
            <div className="bars">{[28, 48, 38, 76, 58, 67].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
          </button>
          <button className="metric-card interactive-card" onClick={() => setNotice({ text: 'Active players appear here after a room starts.' })}>
            <Sparkles size={26} />
            <span>Active Players</span>
            <strong>2,401</strong>
            <div className="mini-avatars"><i>JD</i><i>AK</i><i>MR</i><i>+</i></div>
          </button>
          <button className="feature-card interactive-card" onClick={() => setTab('library')}>
            <img src="/quiz-geometry.svg" alt="Kinetic Flow" />
            <span><Sparkles size={14} /> Kinetic Flow</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function AuthPanel({ initialRole, session, setView }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: initialRole || 'participant' });
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      const payload = await api(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify(form) });
      session.save(payload);
      setView('dashboard');
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <div className="auth-wrap">
      <form className="panel auth-panel" onSubmit={submit}>
        <div className="panel-heading">
          <span className="pill"><span /> {mode === 'login' ? 'Welcome back' : 'New account'}</span>
          <h1>{mode === 'login' ? 'Sign in to QuizFlow' : 'Create account'}</h1>
          <p>{mode === 'login' ? 'Use your organizer or participant account to continue.' : 'Choose a role and start running or playing quizzes.'}</p>
        </div>
        {mode === 'register' && <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" /></label>}
        <label>Email<input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" /></label>
        <label>Password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        {mode === 'register' && (
          <div className="segmented">
            <button type="button" className={form.role === 'participant' ? 'selected' : ''} onClick={() => setForm({ ...form, role: 'participant' })}>Participant</button>
            <button type="button" className={form.role === 'organizer' ? 'selected' : ''} onClick={() => setForm({ ...form, role: 'organizer' })}>Organizer</button>
          </div>
        )}
        {error && <div className="error">{error}</div>}
        <button className="accent full">{mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="ghost full" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Create a new account' : 'I already have an account'}
        </button>
      </form>
    </div>
  );
}

function PublicPortal({ session, setAuthRole, setView, onJoin, setNotice, switchToPro }) {
  const [page, setPage] = useState('explore');
  return (
    <section className="landing public-portal">
      <header className="topbar">
        <button className="logo button-logo" onClick={() => setPage('explore')}>QuizFlow</button>
        <nav>
          {['explore', 'library', 'reports', 'marketplace'].map((item) => (
            <button key={item} className={page === item ? 'active' : ''} onClick={() => setPage(item)}>{item[0].toUpperCase() + item.slice(1)}</button>
          ))}
        </nav>
        <div className="top-actions">
          {session.user ? <button className="primary small" onClick={switchToPro}>Pro Mode</button> : <button className="primary small" onClick={() => { setAuthRole('participant'); setView('auth'); }}>Sign In</button>}
          <button className="icon-plain" onClick={() => setNotice({ text: session.user ? 'Notifications are enabled for live rooms.' : 'Sign in to manage notifications.' })}><Bell size={18} /></button>
          <button className="avatar-button" onClick={() => session.user ? setPage('marketplace') : setView('auth')}>{session.user?.name?.[0] || 'A'}</button>
        </div>
      </header>
      {page === 'explore' && <ExplorePage onJoin={onJoin} setPage={setPage} session={session} switchToPro={switchToPro} />}
      {page === 'library' && <PublicLibrary onJoin={onJoin} setNotice={setNotice} session={session} setPage={setPage} />}
      {page === 'reports' && <PublicReports token={session.token} user={session.user} setView={setView} />}
      {page === 'marketplace' && <Marketplace token={session.token} user={session.user} setView={setView} setAuthRole={setAuthRole} setNotice={setNotice} />}
    </section>
  );
}

function ExplorePage({ onJoin, setPage, session, switchToPro }) {
  const [code, setCode] = useState('');
  return (
    <div className="public-page">
      <div className="glow glow-violet" />
      <div className="glow glow-blue" />
      <div className="landing-grid">
        <div className="hero-copy">
          <div className="pill"><span /> Public platform</div>
          <h1>Play, win, unlock room flair</h1>
          <p>Join live quiz rooms, earn victory points for podium finishes, and spend them on name emojis and visible reactions.</p>
          <div className="join-card">
            <h2>Join a Quiz</h2>
            <div className="join-row">
              <div className="pin-input">
                <Radio size={18} />
                <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="enter 6-digit pin" />
              </div>
              <button className="accent" onClick={() => onJoin(code)}>Enter Room</button>
            </div>
          </div>
          <div className="organizer-link">
            <span>{session.user ? 'Need organizer tools?' : 'Have an organizer account?'}</span>
            <button onClick={switchToPro}>Open Pro Mode <ChevronRight size={14} /></button>
          </div>
        </div>
        <div className="bento">
          <button className="metric-card wide interactive-card" onClick={() => setPage('reports')}>
            <div className="metric-head"><span>Podium economy</span><b>3 / 2 / 1</b></div>
            <strong>Wins pay</strong>
            <p className="muted">First place earns 3 points, second earns 2, third earns 1.</p>
          </button>
          <button className="metric-card interactive-card" onClick={() => setPage('marketplace')}>
            <Sparkles size={26} />
            <span>Emoji cost</span>
            <strong>10</strong>
            <p className="muted">Buy one name emoji or reaction for 10 victory points.</p>
          </button>
          <button className="feature-card interactive-card" onClick={() => setPage('library')}>
            <img src="/quiz-geometry.svg" alt="Public quiz library" />
            <span><Layers size={14} /> Public Library</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function PublicLibrary({ onJoin, setNotice }) {
  const [quizzes, setQuizzes] = useState([]);
  const [query, setQuery] = useState('');
  useEffect(() => { api('/api/public/quizzes').then(setQuizzes).catch((err) => setNotice({ type: 'error', text: err.message })); }, []);
  const filtered = quizzes.filter((quiz) => `${quiz.title} ${quiz.category} ${quiz.owner_name}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="public-page narrow-page">
      <div className="screen-head">
        <div><h1>Library</h1><p>Public quizzes published by organizers across the platform.</p></div>
      </div>
      <div className="toolbar panel">
        <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search public quizzes" /></label>
      </div>
      <div className="quiz-grid">
        {filtered.map((quiz) => (
          <article className="quiz-card" key={quiz.id}>
            <button className="quiz-cover cover-button" onClick={() => setNotice({ text: 'Ask the organizer for a live room code to play this quiz.' })}>
              <img src="/quiz-geometry.svg" alt="" />
              <span>{quiz.category}</span>
            </button>
            <div className="quiz-body">
              <h3>{quiz.title}</h3>
              <p>{quiz.description || `By ${quiz.owner_name}`}</p>
              <div className="quiz-meta">
                <span><Users size={14} /> {quiz.questionCount} Qs</span>
                <span><Clock size={14} /> {quiz.default_time_limit} sec</span>
              </div>
              <button className="ghost full" onClick={() => onJoin('')}>Join by room code</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function PublicReports({ token, user, setView }) {
  const [reports, setReports] = useState({ rooms: [] });
  const [error, setError] = useState('');
  useEffect(() => {
    if (!token) return;
    api('/api/reports', {}, token).then(setReports).catch((err) => setError(err.message));
  }, [token]);
  if (!user) return <AuthRequired title="Reports" text="Sign in to see statistics for every quiz you played or hosted." setView={setView} />;
  return (
    <div className="public-page narrow-page">
      <div className="screen-head"><div><h1>Reports</h1><p>Statistics for each completed or hosted quiz room.</p></div></div>
      {error && <div className="error">{error}</div>}
      <ReportList reports={reports.rooms} user={user} />
    </div>
  );
}

function ReportList({ reports, user }) {
  if (!reports.length) return <div className="empty-state panel"><BarChart3 size={30} /><h3>No reports yet</h3><p>Finished rooms will appear here with per-quiz statistics.</p></div>;
  return (
    <div className="report-list">
      {reports.map((room) => (
        <article className="panel report-card" key={`${room.id}-${room.code}`}>
          <div>
            <span className="pill"><span /> {room.status}</span>
            <h2>{room.title}</h2>
            <p>{room.code} · {room.category}</p>
          </div>
          <div className="report-metrics">
            <b>{user.role === 'organizer' ? room.participants : room.score}<span>{user.role === 'organizer' ? 'players' : 'score'}</span></b>
            <b>{user.role === 'organizer' ? room.averageScore : `${room.correct}/${room.answered}`}<span>{user.role === 'organizer' ? 'avg score' : 'correct'}</span></b>
            <b>{room.topScore ?? room.leaderboard?.[0]?.score ?? 0}<span>top score</span></b>
          </div>
          <div className="leaderboard mini-board">
            {(room.leaderboard || []).slice(0, 5).map((entry) => <div className="leader-row" key={entry.id}><b>{entry.rank}</b><span>{entry.emoji || ''} {entry.display_name}</span><strong>{entry.score}</strong></div>)}
          </div>
        </article>
      ))}
    </div>
  );
}

function Marketplace({ token, user, setView, setAuthRole, setNotice }) {
  const [state, setState] = useState({ wallet: 0, items: [] });
  const [filter, setFilter] = useState('all');
  async function load() {
    if (!token) return;
    setState(await api('/api/marketplace', {}, token));
  }
  useEffect(() => { load().catch((err) => setNotice({ type: 'error', text: err.message })); }, [token]);
  async function buy(item) {
    if (!token) {
      setAuthRole('participant');
      setView('auth');
      return;
    }
    try {
      setState(await api(`/api/marketplace/${item.id}/buy`, { method: 'POST' }, token));
      setNotice({ text: item.owned ? 'Already owned.' : `${item.name} purchased.` });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  }
  async function equip(item) {
    try {
      setState(await api(`/api/marketplace/${item.id}/equip`, { method: 'POST' }, token));
      setNotice({ text: `${item.name} equipped.` });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  }
  const items = state.items.filter((item) => filter === 'all' || item.kind === filter);
  if (!user) return <AuthRequired title="Marketplace" text="Sign in to spend victory points on emoji badges and live reactions." setView={setView} />;
  return (
    <div className="public-page narrow-page">
      <div className="screen-head">
        <div><h1>Marketplace</h1><p>Spend victory points earned from quiz podium finishes.</p></div>
        <div className="wallet-pill"><Trophy size={18} /> {state.wallet} VP</div>
      </div>
      <div className="toolbar panel">
        <div className="segmented compact">
          {['all', 'emoji', 'reaction'].map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}</button>)}
        </div>
        <p className="muted">1st = 3 VP, 2nd = 2 VP, 3rd = 1 VP. Each item costs 10 VP.</p>
      </div>
      <div className="market-grid">
        {items.map((item) => (
          <article className="panel market-card" key={item.id}>
            <div className="market-symbol">{item.value}</div>
            <h3>{item.name}</h3>
            <p>{item.description}</p>
            <div className="quiz-meta"><span>{item.kind}</span><strong>{item.cost} VP</strong></div>
            {item.owned ? (
              <button className="ghost full" disabled={item.equipped || item.kind !== 'emoji'} onClick={() => equip(item)}>{item.equipped ? 'Equipped' : item.kind === 'emoji' ? 'Equip' : 'Owned'}</button>
            ) : (
              <button className="accent full" onClick={() => buy(item)}>Buy</button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function AuthRequired({ title, text, setView }) {
  return (
    <div className="public-page narrow-page">
      <div className="empty-state panel">
        <UserRound size={32} />
        <h1>{title}</h1>
        <p>{text}</p>
        <button className="accent" onClick={() => setView('auth')}>Sign in</button>
      </div>
    </div>
  );
}

function Dashboard({ token, user, setView, setBuilderQuiz, setHostCode, setNotice }) {
  const [quizzes, setQuizzes] = useState([]);
  const [history, setHistory] = useState({});
  const [reports, setReports] = useState({ rooms: [] });
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const isOrganizer = user.role === 'organizer';
  async function load() {
    setQuizzes(await api('/api/quizzes', {}, token));
    setHistory(await api('/api/profile/history', {}, token));
    setReports(await api('/api/reports', {}, token));
  }
  useEffect(() => { load().catch((err) => setError(err.message)); }, []);
  function createNew() {
    setBuilderQuiz(null);
    setView('builder');
  }
  async function startQuiz(id) {
    try {
      const state = await api(`/api/quizzes/${id}/start`, { method: 'POST' }, token);
      setHostCode(state.room.code);
      setView('host');
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  }
  async function editQuiz(id) {
    try {
      setBuilderQuiz(await api(`/api/quizzes/${id}`, {}, token));
      setView('builder');
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  }
  const totalParticipants = isOrganizer ? (history.hosted || []).reduce((sum, item) => sum + Number(item.participants || 0), 0) : (history.played || []).length;
  const activeCount = quizzes.filter((quiz) => quiz.status === 'published').length;
  const visibleQuizzes = showAll ? quizzes : quizzes.slice(0, 3);
  const finishedReports = reports.rooms.filter((room) => room.status === 'finished');
  const totalScore = finishedReports.reduce((sum, room) => sum + Number(isOrganizer ? room.averageScore : room.score || 0), 0);
  const averageScore = finishedReports.length ? Math.round(totalScore / finishedReports.length) : 0;
  const completedRooms = finishedReports.length;
  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <h1>Welcome back, {user.name.split(' ')[0]}</h1>
          <p>{isOrganizer ? "Here's what's happening with your quizzes today." : 'Join active rooms and keep track of your quiz history.'}</p>
        </div>
        {isOrganizer && <button className="accent" onClick={createNew}><Plus size={18} /> Create New Quiz</button>}
      </div>
      {error && <div className="error">{error}</div>}
      <div className="stats">
        <button className="stat-card interactive-card" onClick={() => setView('profile')}><StatContent title={isOrganizer ? 'TOTAL PARTICIPANTS' : 'PLAYED QUIZZES'} value={totalParticipants || 0} trend="0" /></button>
        <button className="stat-card interactive-card" onClick={() => setView('analytics')}><StatContent title="AVERAGE SCORE" value={averageScore} trend="0" green /></button>
        <button className="stat-card interactive-card" onClick={() => setView(isOrganizer ? 'quizzes' : 'join')}><StatContent title={isOrganizer ? 'ACTIVE QUIZZES' : 'AVAILABLE QUIZZES'} value={activeCount} badges={[`${completedRooms} finished`, `${quizzes.length} total`]} /></button>
      </div>
      <section className="list-section">
        <div className="section-title"><h2>{isOrganizer ? 'Recent Quizzes' : 'Available Quizzes'}</h2><button className="ghost" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show Less' : 'View All'}</button></div>
        <QuizGrid quizzes={visibleQuizzes} isOrganizer={isOrganizer} startQuiz={startQuiz} editQuiz={editQuiz} setView={setView} />
      </section>
    </div>
  );
}

function StatContent({ title, value, trend, green, badges }) {
  return (
    <>
      <span>{title}</span>
      <div className="stat-value"><strong>{value}</strong>{trend && <b className={green ? 'green' : ''}>{trend}</b>}</div>
      {badges ? <div className="badges">{badges.map((badge) => <i key={badge}>{badge}</i>)}</div> : <div className="progress"><i style={{ width: green ? '78%' : '70%' }} /></div>}
    </>
  );
}

function QuizGrid({ quizzes, isOrganizer, startQuiz, editQuiz, setView }) {
  if (!quizzes.length) {
    return (
      <div className="empty-state panel">
        <Sparkles size={30} />
        <h3>No quizzes yet</h3>
        <p>{isOrganizer ? 'Create a quiz to start hosting realtime rooms.' : 'Ask an organizer for a room code to join a live quiz.'}</p>
      </div>
    );
  }
  return (
    <div className="quiz-grid">
      {quizzes.map((quiz) => (
        <article className="quiz-card" key={quiz.id}>
          <button className="quiz-cover cover-button" onClick={() => isOrganizer ? editQuiz(quiz.id) : setView('join')}>
            <img src="/quiz-geometry.svg" alt="" />
            <span>{quiz.status}</span>
          </button>
          <div className="quiz-body">
            <h3>{quiz.title}</h3>
            <p>{quiz.description || quiz.category}</p>
            <div className="quiz-meta">
              <span><Users size={14} /> {quiz.questionCount} Qs</span>
              <span><Clock size={14} /> {quiz.default_time_limit} sec</span>
            </div>
            {isOrganizer ? (
              <div className="card-actions">
                <button className="primary" onClick={() => startQuiz(quiz.id)}><Play size={15} /> Start</button>
                <button className="ghost" onClick={() => editQuiz(quiz.id)}>Edit</button>
              </div>
            ) : (
              <button className="ghost full" onClick={() => setView('join')}>Join by code</button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function QuizLibrary({ token, setView, setBuilderQuiz, setHostCode, setNotice }) {
  const [quizzes, setQuizzes] = useState([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  useEffect(() => { api('/api/quizzes', {}, token).then(setQuizzes).catch((err) => setNotice({ type: 'error', text: err.message })); }, []);
  const filtered = quizzes.filter((quiz) => (filter === 'all' || quiz.status === filter) && quiz.title.toLowerCase().includes(query.toLowerCase()));
  async function startQuiz(id) {
    const state = await api(`/api/quizzes/${id}/start`, { method: 'POST' }, token);
    setHostCode(state.room.code);
    setView('host');
  }
  async function editQuiz(id) {
    setBuilderQuiz(await api(`/api/quizzes/${id}`, {}, token));
    setView('builder');
  }
  return (
    <div className="screen">
      <div className="screen-head">
        <div><h1>My Quizzes</h1><p>Search, edit, publish, and launch your quiz rooms.</p></div>
        <button className="accent" onClick={() => { setBuilderQuiz(null); setView('builder'); }}><Plus size={18} /> New Quiz</button>
      </div>
      <div className="toolbar panel">
        <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search quizzes" /></label>
        <div className="segmented compact">
          {['all', 'published', 'draft'].map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}</button>)}
        </div>
      </div>
      <QuizGrid quizzes={filtered} isOrganizer startQuiz={startQuiz} editQuiz={editQuiz} setView={setView} />
    </div>
  );
}

function Builder({ token, initialQuiz, setView, setBuilderQuiz, setNotice }) {
  const [quiz, setQuiz] = useState(initialQuiz || emptyQuiz());
  const [message, setMessage] = useState('');
  useEffect(() => setQuiz(initialQuiz || emptyQuiz()), [initialQuiz]);
  function updateQuestion(index, patch) {
    setQuiz({ ...quiz, questions: quiz.questions.map((question, current) => current === index ? { ...question, ...patch } : question) });
  }
  function updateOption(questionIndex, optionIndex, patch) {
    setQuiz({
      ...quiz,
      questions: quiz.questions.map((question, current) => current === questionIndex ? {
        ...question,
        options: question.options.map((option, index) => index === optionIndex ? { ...option, ...patch } : option)
      } : question)
    });
  }
  function markCorrect(questionIndex, optionIndex, checked) {
    const question = quiz.questions[questionIndex];
    const options = question.options.map((option, index) => {
      if (question.answer_mode === 'single') return { ...option, is_correct: index === optionIndex };
      return index === optionIndex ? { ...option, is_correct: checked } : option;
    });
    updateQuestion(questionIndex, { options });
  }
  async function save() {
    setMessage('');
    try {
      const method = quiz.id ? 'PUT' : 'POST';
      const path = quiz.id ? `/api/quizzes/${quiz.id}` : '/api/quizzes';
      const saved = await api(path, { method, body: JSON.stringify(quiz) }, token);
      setQuiz(saved);
      setBuilderQuiz(saved);
      setMessage('Quiz saved');
      setNotice({ text: 'Quiz saved successfully.' });
    } catch (err) {
      setMessage(err.message);
      setNotice({ type: 'error', text: err.message });
    }
  }
  return (
    <div className="screen builder-screen">
      <div className="screen-head">
        <div><h1>Quiz Builder</h1><p>Set categories, timing, rules, and mixed question types.</p></div>
        <div className="head-actions">
          <button className="ghost" onClick={() => setView('quizzes')}>Back</button>
          <button className="accent" onClick={save}><Check size={18} /> Save Quiz</button>
        </div>
      </div>
      {message && <div className={message === 'Quiz saved' ? 'success' : 'error'}>{message}</div>}
      <div className="builder-layout">
        <section className="panel form-grid">
          <label>Title<input value={quiz.title} onChange={(event) => setQuiz({ ...quiz, title: event.target.value })} placeholder="Team onboarding quiz" /></label>
          <label>Category<input value={quiz.category} onChange={(event) => setQuiz({ ...quiz, category: event.target.value })} /></label>
          <label>Default time<input type="number" min="5" value={quiz.default_time_limit} onChange={(event) => setQuiz({ ...quiz, default_time_limit: Number(event.target.value) })} /></label>
          <label>Status<select value={quiz.status} onChange={(event) => setQuiz({ ...quiz, status: event.target.value })}><option value="draft">draft</option><option value="published">published</option></select></label>
          <label className="wide-field">Description<input value={quiz.description} onChange={(event) => setQuiz({ ...quiz, description: event.target.value })} placeholder="Short context for participants" /></label>
          <div className="rule-row">
            <label><input type="checkbox" checked={quiz.rules.showCorrectAfterQuestion} onChange={(event) => setQuiz({ ...quiz, rules: { ...quiz.rules, showCorrectAfterQuestion: event.target.checked } })} /> Show review after question</label>
            <label><input type="checkbox" checked={quiz.rules.speedBonus} onChange={(event) => setQuiz({ ...quiz, rules: { ...quiz.rules, speedBonus: event.target.checked } })} /> Speed bonus</label>
            <label><input type="checkbox" checked={quiz.rules.shuffleQuestions} onChange={(event) => setQuiz({ ...quiz, rules: { ...quiz.rules, shuffleQuestions: event.target.checked } })} /> Shuffle questions</label>
          </div>
        </section>
        <section className="questions">
          {quiz.questions.map((question, questionIndex) => (
            <div className="panel question-card" key={questionIndex}>
              <div className="question-top">
                <h3>Question {questionIndex + 1}</h3>
                <button className="icon-button" disabled={quiz.questions.length === 1} onClick={() => setQuiz({ ...quiz, questions: quiz.questions.filter((_, index) => index !== questionIndex) })}><X size={16} /></button>
              </div>
              <label>Question text<textarea value={question.prompt} onChange={(event) => updateQuestion(questionIndex, { prompt: event.target.value })} /></label>
              <div className="two-col">
                <label>Media type<select value={question.media_type} onChange={(event) => updateQuestion(questionIndex, { media_type: event.target.value })}><option value="text">Text</option><option value="image">Image</option></select></label>
                <label>Answer mode<select value={question.answer_mode} onChange={(event) => updateQuestion(questionIndex, { answer_mode: event.target.value, options: question.options.map((option, index) => ({ ...option, is_correct: index === 0 })) })}><option value="single">Single choice</option><option value="multiple">Multiple choice</option></select></label>
              </div>
              {question.media_type === 'image' && <label>Image URL<input value={question.image_url} onChange={(event) => updateQuestion(questionIndex, { image_url: event.target.value })} placeholder="/quiz-geometry.svg" /></label>}
              <div className="two-col">
                <label>Time<input type="number" min="5" value={question.time_limit} onChange={(event) => updateQuestion(questionIndex, { time_limit: Number(event.target.value) })} /></label>
                <label>Points<input type="number" min="100" value={question.points} onChange={(event) => updateQuestion(questionIndex, { points: Number(event.target.value) })} /></label>
              </div>
              <div className="options">
                {question.options.map((option, optionIndex) => (
                  <div className="option-edit" key={optionIndex}>
                    <input type={question.answer_mode === 'single' ? 'radio' : 'checkbox'} name={`correct-${questionIndex}`} checked={option.is_correct} onChange={(event) => markCorrect(questionIndex, optionIndex, event.target.checked)} />
                    <input value={option.label} onChange={(event) => updateOption(questionIndex, optionIndex, { label: event.target.value })} placeholder={`Option ${optionIndex + 1}`} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button className="primary add-question" onClick={() => setQuiz({ ...quiz, questions: [...quiz.questions, emptyQuestion()] })}><Plus size={18} /> Add question</button>
        </section>
      </div>
    </div>
  );
}

function HostRoom({ token, code, setView, setNotice }) {
  const [state, setState] = useState(null);
  const [socket, setSocket] = useState(null);
  const [reactions, setReactions] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const next = io();
    setSocket(next);
    next.emit('organizer:join', { code, token }, (response) => {
      if (response?.error) setError(response.error);
      else setState(response.state);
    });
    next.on('room:state', setState);
    next.on('room:reaction', (reaction) => setReactions((items) => [reaction, ...items].slice(0, 5)));
    return () => next.disconnect();
  }, [code, token]);
  const current = state?.room?.current_question_index ?? -1;
  const total = state?.quiz?.questionCount ?? 0;
  function emit(event, payload = {}) {
    socket?.emit(event, { code, ...payload }, (response) => {
      if (response?.error) {
        setError(response.error);
        setNotice({ type: 'error', text: response.error });
      }
      if (response?.state) setState(response.state);
    });
  }
  return (
    <RoomLayout title={state?.quiz?.title || 'Live Room'} code={code} setView={setView} error={error} setNotice={setNotice}>
      <div className="host-grid">
        <section className="panel live-question">
          <ReactionFeed reactions={reactions} />
          <div className="room-status"><span>{state?.room?.status || 'waiting'}</span><b>{current + 1 > 0 ? `${current + 1}/${total}` : `0/${total}`}</b></div>
          {state?.question ? <QuestionPreview question={state.question} endsAt={state.room.question_ends_at} /> : <div className="waiting-card"><Radio size={40} /><h2>{state?.room?.status === 'finished' ? 'Quiz finished' : 'Waiting to launch a question'}</h2><p>Participants join with the room code and can answer only while a question is live.</p></div>}
          <div className="host-actions">
            <button className="accent" onClick={() => emit('organizer:start-question')} disabled={state?.room?.status === 'active' || state?.room?.status === 'finished' || current + 1 >= total}><Play size={18} /> Next Question</button>
            <button className="primary" onClick={() => emit('organizer:end-question')} disabled={state?.room?.status !== 'active'}>End Question</button>
            <button className="ghost" onClick={() => emit('organizer:finish')} disabled={state?.room?.status === 'finished'}><Trophy size={18} /> Finish Quiz</button>
          </div>
        </section>
        <Leaderboard state={state} />
      </div>
    </RoomLayout>
  );
}

function JoinRoom({ token, code: initialCode, setView, setNotice }) {
  const [code, setCode] = useState(initialCode || '');
  const [name, setName] = useState('');
  const [state, setState] = useState(null);
  const [socket, setSocket] = useState(null);
  const [selected, setSelected] = useState([]);
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState('');
  const [marketplace, setMarketplace] = useState({ items: [] });
  const [reactions, setReactions] = useState([]);
  useEffect(() => {
    if (token) api('/api/marketplace', {}, token).then(setMarketplace).catch(() => {});
  }, [token]);
  useEffect(() => {
    if (!state?.question) setSelected([]);
  }, [state?.question?.id]);
  function join() {
    if (code.length !== 6) {
      setError('Enter a 6-digit room code');
      return;
    }
    const next = io();
    setSocket(next);
    next.emit('room:join', { code, token, displayName: name }, (response) => {
      if (response?.error) setError(response.error);
      else {
        setState(response.state);
        setError('');
      }
    });
    next.on('room:state', (payload) => {
      setState(payload);
      setAnswer(null);
    });
    next.on('room:reaction', (reaction) => setReactions((items) => [reaction, ...items].slice(0, 5)));
  }
  function pick(question, id) {
    if (question.answer_mode === 'single') setSelected([id]);
    else setSelected(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }
  function submit() {
    socket?.emit('participant:answer', { code, optionIds: selected }, (response) => {
      if (response?.error) {
        setError(response.error);
        setNotice({ type: 'error', text: response.error });
      } else setAnswer(response);
    });
  }
  function sendReaction(item) {
    socket?.emit('participant:reaction', { code, itemId: item.id }, (response) => {
      if (response?.error) setNotice({ type: 'error', text: response.error });
    });
  }
  if (!state) {
    return (
      <div className="auth-wrap">
        <div className="panel auth-panel">
          <div className="panel-heading"><span className="pill"><span /> Live room</span><h1>Join a quiz</h1><p>Enter the room code shown by the organizer.</p></div>
          <label>Room code<input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={(event) => event.key === 'Enter' && join()} /></label>
          {!token && <label>Display name<input value={name} onChange={(event) => setName(event.target.value)} /></label>}
          {error && <div className="error">{error}</div>}
          <button className="accent full" onClick={join}>Join Room</button>
          <button className="ghost full" onClick={() => setView(token ? 'dashboard' : 'landing')}>Back</button>
        </div>
      </div>
    );
  }
  const question = state.question;
  return (
    <RoomLayout title={state.quiz.title} code={code} setView={setView} error={error} setNotice={setNotice}>
      <div className="host-grid">
        <section className="panel live-question">
          <ReactionFeed reactions={reactions} />
          {question ? (
            <>
              <QuestionPreview question={question} endsAt={state.room.question_ends_at} />
              <div className="answer-options">
                {question.options.map((option) => (
                  <button key={option.id} className={selected.includes(option.id) ? 'selected' : ''} onClick={() => pick(question, option.id)}>
                    <span>{selected.includes(option.id) && <Check size={16} />}</span>
                    {option.label}
                  </button>
                ))}
              </div>
              {answer ? <div className={answer.isCorrect ? 'success' : 'error'}>{answer.isCorrect ? `Correct, +${answer.earned} points` : 'Answer accepted, but it was not correct'}</div> : <button className="accent full" onClick={submit} disabled={selected.length === 0}>Submit answer</button>}
              <div className="reaction-deck">
                {marketplace.items.filter((item) => item.kind === 'reaction' && item.owned).map((item) => <button key={item.id} onClick={() => sendReaction(item)}>{item.value}</button>)}
              </div>
            </>
          ) : (
            <div className="waiting-card"><Clock size={42} /><h2>{state.room.status === 'finished' ? 'Quiz finished' : 'Waiting for the next question'}</h2><p>You can answer only while the organizer is showing a question.</p></div>
          )}
        </section>
        <Leaderboard state={state} />
      </div>
    </RoomLayout>
  );
}

function ReactionFeed({ reactions }) {
  if (!reactions.length) return null;
  return (
    <div className="reaction-feed">
      {reactions.map((reaction, index) => <div key={`${reaction.at}-${index}`}><strong>{reaction.value}</strong><span>{reaction.from}</span></div>)}
    </div>
  );
}

function RoomLayout({ title, code, setView, error, children, setNotice }) {
  async function copyCode() {
    await navigator.clipboard?.writeText(code);
    setNotice({ text: 'Room code copied.' });
  }
  return (
    <div className="screen">
      <div className="screen-head">
        <div><h1>{title}</h1><p>Room code <strong className="room-code">{code}</strong></p></div>
        <div className="head-actions">
          <button className="ghost" onClick={copyCode}><Copy size={17} /> Copy</button>
          <button className="ghost" onClick={() => setView('dashboard')}>Exit</button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {children}
    </div>
  );
}

function QuestionPreview({ question, endsAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return (
    <div className="question-preview">
      <div className="timer"><Clock size={18} /> {left}s</div>
      {question.media_type === 'image' && question.image_url && <img className="question-image" src={question.image_url} alt="" />}
      <h2>{question.prompt}</h2>
      <p>{question.answer_mode === 'multiple' ? 'Multiple answers may be correct' : 'One answer is correct'}</p>
    </div>
  );
}

function Leaderboard({ state }) {
  return (
    <aside className="panel leaderboard">
      <div className="section-title"><h2>Leaderboard</h2><Trophy size={20} /></div>
      {(state?.leaderboard || []).length === 0 && <p className="muted">No players connected yet.</p>}
      {(state?.leaderboard || []).map((item) => (
        <div className="leader-row" key={item.id}>
          <b>{item.rank}</b>
          <span>{item.emoji || ''} {item.display_name}</span>
          <strong>{item.score}</strong>
        </div>
      ))}
    </aside>
  );
}

function Profile({ token, user }) {
  const [history, setHistory] = useState({});
  useEffect(() => { api('/api/profile/history', {}, token).then(setHistory); }, [token]);
  const items = user.role === 'organizer' ? history.hosted || [] : history.played || [];
  return (
    <div className="screen">
      <div className="screen-head"><div><h1>Profile</h1><p>Participation and hosted quiz history is saved in the database.</p></div></div>
      <div className="panel history">
        {items.length === 0 && <p className="muted">History is empty.</p>}
        {items.map((item) => (
          <div className="history-row" key={`${item.code}-${item.created_at}`}>
            <div><strong>{item.title}</strong><span>{item.code} · {item.status}</span></div>
            <b>{user.role === 'organizer' ? `${item.participants} players` : `${item.score} pts`}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function Analytics({ token, user }) {
  const [history, setHistory] = useState({});
  useEffect(() => { api('/api/profile/history', {}, token).then(setHistory); }, [token]);
  const hosted = history.hosted || [];
  const played = history.played || [];
  const totalRooms = user.role === 'organizer' ? hosted.length : played.length;
  const totalPlayers = hosted.reduce((sum, item) => sum + Number(item.participants || 0), 0);
  const totalScore = played.reduce((sum, item) => sum + Number(item.score || 0), 0);
  return (
    <div className="screen">
      <div className="screen-head"><div><h1>Analytics</h1><p>Quick operational readout from saved quiz activity.</p></div></div>
      <div className="stats">
        <div className="stat-card"><StatContent title="ROOMS" value={totalRooms} trend="+live" /></div>
        <div className="stat-card"><StatContent title={user.role === 'organizer' ? 'PLAYERS' : 'TOTAL SCORE'} value={user.role === 'organizer' ? totalPlayers : totalScore} trend="+saved" green /></div>
        <div className="stat-card"><StatContent title="COMPLETION" value={user.role === 'organizer' ? `${hosted.filter((item) => item.status === 'finished').length}` : `${played.filter((item) => item.status === 'finished').length}`} badges={['History', 'Realtime']} /></div>
      </div>
      <div className="panel insight-panel">
        <BarChart3 size={32} />
        <h2>Realtime answers feed the leaderboard instantly.</h2>
        <p>After each room finishes, the profile history and analytics cards update from persisted room and participant data.</p>
      </div>
    </div>
  );
}

function SettingsPage({ user, setNotice }) {
  const [prefs, setPrefs] = useState({ compact: localStorage.getItem('quizflow-compact') === 'true', notifications: true, autoReview: true });
  function update(next) {
    setPrefs(next);
    localStorage.setItem('quizflow-compact', String(next.compact));
    setNotice({ text: 'Settings updated.' });
  }
  return (
    <div className="screen">
      <div className="screen-head"><div><h1>Settings</h1><p>Local workspace preferences for {user.name}.</p></div></div>
      <div className="panel settings-panel">
        <label><input type="checkbox" checked={prefs.notifications} onChange={(event) => update({ ...prefs, notifications: event.target.checked })} /> Room notifications</label>
        <label><input type="checkbox" checked={prefs.autoReview} onChange={(event) => update({ ...prefs, autoReview: event.target.checked })} /> Show review after each question</label>
        <label><input type="checkbox" checked={prefs.compact} onChange={(event) => update({ ...prefs, compact: event.target.checked })} /> Compact dashboard cards</label>
      </div>
    </div>
  );
}

function HelpPage() {
  const [open, setOpen] = useState('host');
  const items = {
    host: ['Create or edit a quiz in My Quizzes.', 'Press Start on a published quiz.', 'Share the room code and launch questions one by one.'],
    join: ['Open Join Room.', 'Enter the 6-digit room code.', 'Select answers only while the current question timer is active.'],
    scoring: ['Correct answers receive question points.', 'Fast answers can receive a speed bonus.', 'The leaderboard updates after every accepted answer.']
  };
  return (
    <div className="screen">
      <div className="screen-head"><div><h1>Help Center</h1><p>Fast answers for the main QuizFlow workflows.</p></div></div>
      <div className="help-layout">
        <div className="panel help-tabs">
          {Object.keys(items).map((key) => <button key={key} className={open === key ? 'active' : ''} onClick={() => setOpen(key)}>{key}</button>)}
        </div>
        <div className="panel help-content">
          <h2>{open[0].toUpperCase() + open.slice(1)}</h2>
          {items[open].map((item) => <p key={item}><Check size={16} /> {item}</p>)}
        </div>
      </div>
    </div>
  );
}

function App() {
  const session = useLocalSession();
  const [appMode, setAppMode] = useState('public');
  const [view, setView] = useState(session.user ? 'dashboard' : 'landing');
  const [authRole, setAuthRole] = useState('participant');
  const [joinCode, setJoinCode] = useState('');
  const [builderQuiz, setBuilderQuiz] = useState(null);
  const [hostCode, setHostCode] = useState('');
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(timer);
  }, [notice]);
  const content = useMemo(() => {
    if (appMode === 'public' && view !== 'auth' && view !== 'join') return <PublicPortal session={session} setAuthRole={setAuthRole} setView={setView} onJoin={(code) => { setJoinCode(code); setView('join'); }} setNotice={setNotice} switchToPro={() => { setAppMode('pro'); setView('dashboard'); }} />;
    if (view === 'landing') return <Landing onAuth={(role) => { setAuthRole(role); setView('auth'); }} onJoin={(code) => { setJoinCode(code); setView('join'); }} setNotice={setNotice} />;
    if (view === 'auth') return <AuthPanel initialRole={authRole} session={session} setView={setView} />;
    if (view === 'join') return <JoinRoom token={session.token} code={joinCode} setView={setView} setNotice={setNotice} />;
    if (!session.user) return <AuthPanel initialRole={authRole} session={session} setView={setView} />;
    if (view === 'quizzes') return <QuizLibrary token={session.token} setView={setView} setBuilderQuiz={setBuilderQuiz} setHostCode={setHostCode} setNotice={setNotice} />;
    if (view === 'builder') return <Builder token={session.token} initialQuiz={builderQuiz} setView={setView} setBuilderQuiz={setBuilderQuiz} setNotice={setNotice} />;
    if (view === 'host') return <HostRoom token={session.token} code={hostCode} setView={setView} setNotice={setNotice} />;
    if (view === 'profile') return <Profile token={session.token} user={session.user} />;
    if (view === 'analytics') return <Analytics token={session.token} user={session.user} />;
    if (view === 'settings') return <SettingsPage user={session.user} setNotice={setNotice} />;
    if (view === 'help') return <HelpPage />;
    return <Dashboard token={session.token} user={session.user} setView={setView} setBuilderQuiz={setBuilderQuiz} setHostCode={setHostCode} setNotice={setNotice} />;
  }, [appMode, view, session.user, session.token, authRole, joinCode, builderQuiz, hostCode]);
  if (appMode === 'public' || !session.user || view === 'auth' || view === 'join') {
    return (
      <main className="workspace">
        <Notice notice={notice} onClose={() => setNotice(null)} />
        {content}
      </main>
    );
  }
  return (
    <Shell user={session.user} view={view} setView={setView} logout={() => { session.clear(); setAppMode('public'); setView('landing'); }} setBuilderQuiz={setBuilderQuiz} switchToPublic={() => setAppMode('public')}>
      <Notice notice={notice} onClose={() => setNotice(null)} />
      {content}
    </Shell>
  );
}

createRoot(document.getElementById('root')).render(<App />);

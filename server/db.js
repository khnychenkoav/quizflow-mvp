import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(root, 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, 'quizflow.sqlite'));

db.exec(`
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('participant', 'organizer')),
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS quizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'General',
  default_time_limit INTEGER NOT NULL DEFAULT 30,
  rules TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK(media_type IN ('text', 'image')),
  image_url TEXT NOT NULL DEFAULT '',
  answer_mode TEXT NOT NULL CHECK(answer_mode IN ('single', 'multiple')),
  time_limit INTEGER NOT NULL,
  points INTEGER NOT NULL DEFAULT 1000
);
CREATE TABLE IF NOT EXISTS options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('waiting', 'active', 'review', 'finished')),
  current_question_index INTEGER NOT NULL DEFAULT -1,
  question_started_at INTEGER,
  question_ends_at INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS room_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(room_id, user_id)
);
CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  participant_id INTEGER NOT NULL REFERENCES room_participants(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_options TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  earned_points INTEGER NOT NULL,
  answered_at INTEGER NOT NULL,
  UNIQUE(room_id, participant_id, question_id)
);
CREATE TABLE IF NOT EXISTS marketplace_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('emoji', 'reaction')),
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  cost INTEGER NOT NULL DEFAULT 10,
  description TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS user_items (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
  equipped INTEGER NOT NULL DEFAULT 0,
  purchased_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item_id)
);
CREATE TABLE IF NOT EXISTS wallet_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

function addColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

addColumn('users', 'wallet_points', 'INTEGER NOT NULL DEFAULT 0');

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const left = Buffer.from(hash, 'hex');
  const right = scryptSync(password, salt, 64);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createToken(userId) {
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  return token;
}

export function getUserByToken(token) {
  if (!token) return null;
  return db.prepare(`
    SELECT users.id, users.name, users.email, users.role, users.wallet_points
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
  `).get(token) ?? null;
}

export function authFromHeader(header) {
  const value = header || '';
  const token = value.startsWith('Bearer ') ? value.slice(7) : value;
  return getUserByToken(token);
}

export function readQuiz(id) {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(id);
  if (!quiz) return null;
  quiz.rules = JSON.parse(quiz.rules || '{}');
  quiz.questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY position ASC').all(id).map((question) => ({
    ...question,
    options: db.prepare('SELECT id, label, is_correct FROM options WHERE question_id = ? ORDER BY id ASC').all(question.id).map((option) => ({
      ...option,
      is_correct: Boolean(option.is_correct)
    }))
  }));
  return quiz;
}

export function publicQuestion(question) {
  if (!question) return null;
  return {
    id: question.id,
    position: question.position,
    prompt: question.prompt,
    media_type: question.media_type,
    image_url: question.image_url,
    answer_mode: question.answer_mode,
    time_limit: question.time_limit,
    points: question.points,
    options: question.options.map((option) => ({ id: option.id, label: option.label }))
  };
}

export function makeRoomCode() {
  let code = '';
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (db.prepare('SELECT id FROM rooms WHERE code = ?').get(code));
  return code;
}

export function saveQuiz(ownerId, payload, quizId = null) {
  const rules = JSON.stringify({
    shuffleQuestions: Boolean(payload.rules?.shuffleQuestions),
    showCorrectAfterQuestion: payload.rules?.showCorrectAfterQuestion !== false,
    speedBonus: payload.rules?.speedBonus !== false
  });
  if (quizId) {
    db.prepare(`
      UPDATE quizzes
      SET title = ?, description = ?, category = ?, default_time_limit = ?, rules = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND owner_id = ?
    `).run(payload.title, payload.description || '', payload.category || 'General', Number(payload.default_time_limit || 30), rules, payload.status || 'draft', quizId, ownerId);
    db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(quizId);
  } else {
    const result = db.prepare(`
      INSERT INTO quizzes (owner_id, title, description, category, default_time_limit, rules, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(ownerId, payload.title, payload.description || '', payload.category || 'General', Number(payload.default_time_limit || 30), rules, payload.status || 'draft');
    quizId = Number(result.lastInsertRowid);
  }
  const insertQuestion = db.prepare(`
    INSERT INTO questions (quiz_id, position, prompt, media_type, image_url, answer_mode, time_limit, points)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertOption = db.prepare('INSERT INTO options (question_id, label, is_correct) VALUES (?, ?, ?)');
  payload.questions.forEach((question, index) => {
    const result = insertQuestion.run(
      quizId,
      index,
      question.prompt,
      question.media_type || 'text',
      question.image_url || '',
      question.answer_mode || 'single',
      Number(question.time_limit || payload.default_time_limit || 30),
      Number(question.points || 1000)
    );
    const questionId = Number(result.lastInsertRowid);
    question.options.forEach((option) => insertOption.run(questionId, option.label, option.is_correct ? 1 : 0));
  });
  return readQuiz(quizId);
}

export function getRoomByCode(code) {
  return db.prepare(`
    SELECT rooms.*, quizzes.title, quizzes.owner_id, quizzes.default_time_limit
    FROM rooms
    JOIN quizzes ON quizzes.id = rooms.quiz_id
    WHERE rooms.code = ?
  `).get(code) ?? null;
}

export function leaderboard(roomId) {
  return db.prepare(`
    SELECT room_participants.id, room_participants.user_id, room_participants.display_name, room_participants.score, room_participants.joined_at,
    marketplace_items.value AS emoji
    FROM room_participants
    LEFT JOIN user_items ON user_items.user_id = room_participants.user_id AND user_items.equipped = 1
    LEFT JOIN marketplace_items ON marketplace_items.id = user_items.item_id AND marketplace_items.kind = 'emoji'
    WHERE room_id = ?
    ORDER BY score DESC, room_participants.joined_at ASC
  `).all(roomId).map((row, index) => ({ ...row, rank: index + 1 }));
}

export function awardVictoryPoints(roomId) {
  const room = db.prepare('SELECT status FROM rooms WHERE id = ?').get(roomId);
  if (!room || room.status !== 'finished') return;
  const already = db.prepare("SELECT id FROM wallet_events WHERE room_id = ? AND reason = 'placement' LIMIT 1").get(roomId);
  if (already) return;
  const awards = [3, 2, 1];
  leaderboard(roomId).slice(0, 3).forEach((entry, index) => {
    if (!entry.user_id) return;
    const amount = awards[index];
    db.prepare('UPDATE users SET wallet_points = wallet_points + ? WHERE id = ?').run(amount, entry.user_id);
    db.prepare('INSERT INTO wallet_events (user_id, room_id, amount, reason) VALUES (?, ?, ?, ?)').run(entry.user_id, roomId, amount, 'placement');
  });
}

export function marketplaceState(userId) {
  const items = db.prepare(`
    SELECT marketplace_items.*, CASE WHEN user_items.user_id IS NULL THEN 0 ELSE 1 END AS owned,
    COALESCE(user_items.equipped, 0) AS equipped
    FROM marketplace_items
    LEFT JOIN user_items ON user_items.item_id = marketplace_items.id AND user_items.user_id = ?
    ORDER BY marketplace_items.kind ASC, marketplace_items.cost ASC, marketplace_items.id ASC
  `).all(userId).map((item) => ({ ...item, owned: Boolean(item.owned), equipped: Boolean(item.equipped) }));
  const wallet = db.prepare('SELECT wallet_points FROM users WHERE id = ?').get(userId)?.wallet_points ?? 0;
  return { wallet, items };
}

export function publicQuizzes() {
  return db.prepare(`
    SELECT quizzes.id, quizzes.title, quizzes.description, quizzes.category, quizzes.default_time_limit, quizzes.updated_at, users.name AS owner_name,
    (SELECT COUNT(*) FROM questions WHERE questions.quiz_id = quizzes.id) AS questionCount,
    (SELECT COUNT(*) FROM rooms WHERE rooms.quiz_id = quizzes.id) AS roomCount
    FROM quizzes
    JOIN users ON users.id = quizzes.owner_id
    WHERE quizzes.status = 'published'
    ORDER BY quizzes.updated_at DESC
  `).all();
}

export function userReports(user) {
  if (user.role === 'organizer') {
    const rooms = db.prepare(`
      SELECT rooms.id, rooms.code, rooms.status, rooms.created_at, rooms.finished_at, quizzes.title, quizzes.category,
      COUNT(room_participants.id) AS participants,
      COALESCE(ROUND(AVG(room_participants.score)), 0) AS averageScore,
      COALESCE(MAX(room_participants.score), 0) AS topScore
      FROM rooms
      JOIN quizzes ON quizzes.id = rooms.quiz_id
      LEFT JOIN room_participants ON room_participants.room_id = rooms.id
      WHERE quizzes.owner_id = ?
      GROUP BY rooms.id
      ORDER BY rooms.created_at DESC
    `).all(user.id);
    return { rooms: rooms.map((room) => ({ ...room, leaderboard: leaderboard(room.id) })) };
  }
  const rooms = db.prepare(`
    SELECT rooms.id, rooms.code, rooms.status, rooms.created_at, rooms.finished_at, quizzes.title, quizzes.category,
    room_participants.score,
    (SELECT COUNT(*) FROM responses WHERE responses.room_id = rooms.id AND responses.participant_id = room_participants.id) AS answered,
    (SELECT COUNT(*) FROM responses WHERE responses.room_id = rooms.id AND responses.participant_id = room_participants.id AND responses.is_correct = 1) AS correct
    FROM room_participants
    JOIN rooms ON rooms.id = room_participants.room_id
    JOIN quizzes ON quizzes.id = rooms.quiz_id
    WHERE room_participants.user_id = ?
    ORDER BY room_participants.joined_at DESC
  `).all(user.id);
  return { rooms: rooms.map((room) => ({ ...room, leaderboard: leaderboard(room.id) })) };
}

export function roomState(code) {
  const room = getRoomByCode(code);
  if (!room) return null;
  const quiz = readQuiz(room.quiz_id);
  const current = quiz?.questions?.[room.current_question_index] ?? null;
  return {
    room: {
      id: room.id,
      code: room.code,
      status: room.status,
      current_question_index: room.current_question_index,
      question_started_at: room.question_started_at,
      question_ends_at: room.question_ends_at,
      title: room.title
    },
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      category: quiz.category,
      questionCount: quiz.questions.length,
      rules: quiz.rules
    },
    question: room.status === 'active' ? publicQuestion(current) : null,
    leaderboard: leaderboard(room.id)
  };
}

function seed() {
  const itemCount = db.prepare('SELECT COUNT(*) AS count FROM marketplace_items').get().count;
  if (itemCount === 0) {
    [
      ['emoji', 'Rocket Name Badge', '🚀', 10, 'Shown next to your name in rooms and leaderboards.'],
      ['emoji', 'Crown Name Badge', '👑', 10, 'A winner-style marker beside your display name.'],
      ['emoji', 'Spark Name Badge', '✨', 10, 'Adds a bright marker to your room presence.'],
      ['reaction', 'Fire Reaction', '🔥', 10, 'Send a visible fire reaction during live quizzes.'],
      ['reaction', 'Clap Reaction', '👏', 10, 'Celebrate a great answer for everyone in the room.'],
      ['reaction', 'Mindblown Reaction', '🤯', 10, 'React when a question gets intense.']
    ].forEach((item) => db.prepare('INSERT INTO marketplace_items (kind, name, value, cost, description) VALUES (?, ?, ?, ?, ?)').run(...item));
  }
  const rich = db.prepare('SELECT id FROM users WHERE email = ?').get('rich@quizflow.test');
  if (!rich) {
    db.prepare('INSERT INTO users (name, email, role, password_hash, wallet_points) VALUES (?, ?, ?, ?, ?)').run(
      'Rich Tester',
      'rich@quizflow.test',
      'participant',
      hashPassword('rich12345'),
      120
    );
  } else {
    db.prepare('UPDATE users SET wallet_points = MAX(wallet_points, 120) WHERE id = ?').run(rich.id);
  }
  const count = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (count > 1) return;
  const organizer = db.prepare('INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, ?)').run(
    'Alex Organizer',
    'organizer@quizflow.test',
    'organizer',
    hashPassword('demo12345')
  );
  db.prepare('INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, ?)').run(
    'Demo Participant',
    'player@quizflow.test',
    'participant',
    hashPassword('demo12345')
  );
  saveQuiz(Number(organizer.lastInsertRowid), {
    title: 'Advanced React Patterns',
    description: 'Frontend Engineering Dept',
    category: 'Frontend',
    default_time_limit: 30,
    status: 'published',
    rules: { shuffleQuestions: false, showCorrectAfterQuestion: true, speedBonus: true },
    questions: [
      {
        prompt: 'Какой хук используют для мемоизации вычисленного значения в React?',
        media_type: 'text',
        answer_mode: 'single',
        time_limit: 25,
        points: 1000,
        options: [
          { label: 'useMemo', is_correct: true },
          { label: 'useEffect', is_correct: false },
          { label: 'useRef', is_correct: false },
          { label: 'useReducer', is_correct: false }
        ]
      },
      {
        prompt: 'Выберите признаки корректной realtime-викторины',
        media_type: 'text',
        answer_mode: 'multiple',
        time_limit: 35,
        points: 1400,
        options: [
          { label: 'Ограниченное время ответа', is_correct: true },
          { label: 'Общий код комнаты', is_correct: true },
          { label: 'Ответы после завершения вопроса', is_correct: false },
          { label: 'Лидерборд после раунда', is_correct: true }
        ]
      },
      {
        prompt: 'Что изображено на карточке?',
        media_type: 'image',
        image_url: '/quiz-geometry.svg',
        answer_mode: 'single',
        time_limit: 30,
        points: 1200,
        options: [
          { label: 'Абстрактная сцена обучения', is_correct: true },
          { label: 'Схема базы данных', is_correct: false },
          { label: 'Страница авторизации', is_correct: false },
          { label: 'Форма профиля', is_correct: false }
        ]
      }
    ]
  });
}

seed();

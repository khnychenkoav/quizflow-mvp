import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  authFromHeader,
  awardVictoryPoints,
  createToken,
  db,
  getRoomByCode,
  getUserByToken,
  hashPassword,
  leaderboard,
  makeRoomCode,
  marketplaceState,
  publicQuizzes,
  readQuiz,
  roomState,
  saveQuiz,
  userReports,
  verifyPassword
} from './db.js';

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: true } });
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const timers = new Map();

app.use(express.json({ limit: '5mb' }));
app.use(express.static(join(root, 'public')));

function requireAuth(req, res, next) {
  const user = authFromHeader(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Нужна авторизация' });
  req.user = user;
  next();
}

function requireOrganizer(req, res, next) {
  if (req.user.role !== 'organizer') return res.status(403).json({ error: 'Доступно только организатору' });
  next();
}

function cleanQuizPayload(body) {
  const questions = Array.isArray(body.questions) ? body.questions : [];
  if (!body.title?.trim()) throw new Error('Укажите название квиза');
  if (questions.length === 0) throw new Error('Добавьте хотя бы один вопрос');
  questions.forEach((question) => {
    if (!question.prompt?.trim()) throw new Error('У каждого вопроса должен быть текст');
    if (!['text', 'image'].includes(question.media_type)) throw new Error('Некорректный тип вопроса');
    if (!['single', 'multiple'].includes(question.answer_mode)) throw new Error('Некорректный режим ответа');
    if (!Array.isArray(question.options) || question.options.length < 2) throw new Error('У вопроса должно быть минимум два варианта');
    if (question.options.filter((option) => option.is_correct).length === 0) throw new Error('Отметьте правильный ответ');
    if (question.answer_mode === 'single' && question.options.filter((option) => option.is_correct).length !== 1) throw new Error('Для одиночного выбора нужен один правильный ответ');
  });
  return {
    title: body.title.trim(),
    description: body.description?.trim() || '',
    category: body.category?.trim() || 'General',
    default_time_limit: Number(body.default_time_limit || 30),
    rules: body.rules || {},
    status: body.status || 'draft',
    questions: questions.map((question) => ({
      prompt: question.prompt.trim(),
      media_type: question.media_type,
      image_url: question.image_url?.trim() || '',
      answer_mode: question.answer_mode,
      time_limit: Number(question.time_limit || body.default_time_limit || 30),
      points: Number(question.points || 1000),
      options: question.options.map((option) => ({
        label: String(option.label || '').trim(),
        is_correct: Boolean(option.is_correct)
      })).filter((option) => option.label)
    }))
  };
}

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Заполните имя, email и пароль' });
  if (!['participant', 'organizer'].includes(role)) return res.status(400).json({ error: 'Выберите роль' });
  try {
    const result = db.prepare('INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, ?)').run(
      name.trim(),
      email.trim().toLowerCase(),
      role,
      hashPassword(password)
    );
    const user = db.prepare('SELECT id, name, email, role, wallet_points FROM users WHERE id = ?').get(Number(result.lastInsertRowid));
    res.json({ user, token: createToken(user.id) });
  } catch {
    res.status(409).json({ error: 'Пользователь с таким email уже есть' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
  if (!row || !verifyPassword(password || '', row.password_hash)) return res.status(401).json({ error: 'Неверный email или пароль' });
  const user = { id: row.id, name: row.name, email: row.email, role: row.role, wallet_points: row.wallet_points };
  res.json({ user, token: createToken(user.id) });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/quizzes', requireAuth, (req, res) => {
  const rows = req.user.role === 'organizer'
    ? db.prepare('SELECT * FROM quizzes WHERE owner_id = ? ORDER BY updated_at DESC').all(req.user.id)
    : db.prepare("SELECT * FROM quizzes WHERE status = 'published' ORDER BY updated_at DESC").all();
  res.json(rows.map((row) => ({
    ...row,
    rules: JSON.parse(row.rules || '{}'),
    questionCount: db.prepare('SELECT COUNT(*) AS count FROM questions WHERE quiz_id = ?').get(row.id).count
  })));
});

app.get('/api/public/quizzes', (req, res) => {
  res.json(publicQuizzes());
});

app.get('/api/marketplace', requireAuth, (req, res) => {
  res.json(marketplaceState(req.user.id));
});

app.post('/api/marketplace/:id/buy', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM marketplace_items WHERE id = ?').get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const owned = db.prepare('SELECT item_id FROM user_items WHERE user_id = ? AND item_id = ?').get(req.user.id, item.id);
  if (owned) return res.json(marketplaceState(req.user.id));
  const wallet = db.prepare('SELECT wallet_points FROM users WHERE id = ?').get(req.user.id).wallet_points;
  if (wallet < item.cost) return res.status(400).json({ error: 'Not enough victory points' });
  db.prepare('UPDATE users SET wallet_points = wallet_points - ? WHERE id = ?').run(item.cost, req.user.id);
  db.prepare('INSERT INTO user_items (user_id, item_id, equipped) VALUES (?, ?, ?)').run(req.user.id, item.id, item.kind === 'emoji' ? 1 : 0);
  if (item.kind === 'emoji') db.prepare('UPDATE user_items SET equipped = CASE WHEN item_id = ? THEN 1 ELSE 0 END WHERE user_id = ? AND item_id IN (SELECT id FROM marketplace_items WHERE kind = ?)').run(item.id, req.user.id, 'emoji');
  db.prepare('INSERT INTO wallet_events (user_id, amount, reason) VALUES (?, ?, ?)').run(req.user.id, -item.cost, `buy:${item.name}`);
  res.json(marketplaceState(req.user.id));
});

app.post('/api/marketplace/:id/equip', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM marketplace_items WHERE id = ?').get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const owned = db.prepare('SELECT item_id FROM user_items WHERE user_id = ? AND item_id = ?').get(req.user.id, item.id);
  if (!owned) return res.status(400).json({ error: 'Buy this item first' });
  if (item.kind === 'emoji') {
    db.prepare('UPDATE user_items SET equipped = CASE WHEN item_id = ? THEN 1 ELSE 0 END WHERE user_id = ? AND item_id IN (SELECT id FROM marketplace_items WHERE kind = ?)').run(item.id, req.user.id, 'emoji');
  }
  res.json(marketplaceState(req.user.id));
});

app.get('/api/reports', requireAuth, (req, res) => {
  res.json(userReports(req.user));
});

app.get('/api/quizzes/:id', requireAuth, (req, res) => {
  const quiz = readQuiz(Number(req.params.id));
  if (!quiz) return res.status(404).json({ error: 'Квиз не найден' });
  if (req.user.role === 'organizer' && quiz.owner_id !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });
  res.json(quiz);
});

app.post('/api/quizzes', requireAuth, requireOrganizer, (req, res) => {
  try {
    res.json(saveQuiz(req.user.id, cleanQuizPayload(req.body)));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/quizzes/:id', requireAuth, requireOrganizer, (req, res) => {
  const quiz = readQuiz(Number(req.params.id));
  if (!quiz || quiz.owner_id !== req.user.id) return res.status(404).json({ error: 'Квиз не найден' });
  try {
    res.json(saveQuiz(req.user.id, cleanQuizPayload(req.body), quiz.id));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/quizzes/:id/start', requireAuth, requireOrganizer, (req, res) => {
  const quiz = readQuiz(Number(req.params.id));
  if (!quiz || quiz.owner_id !== req.user.id) return res.status(404).json({ error: 'Квиз не найден' });
  const code = makeRoomCode();
  db.prepare('INSERT INTO rooms (quiz_id, code, status) VALUES (?, ?, ?)').run(quiz.id, code, 'waiting');
  res.json(roomState(code));
});

app.get('/api/rooms/:code', requireAuth, (req, res) => {
  const state = roomState(req.params.code);
  if (!state) return res.status(404).json({ error: 'Комната не найдена' });
  res.json(state);
});

app.get('/api/profile/history', requireAuth, (req, res) => {
  if (req.user.role === 'organizer') {
    const hosted = db.prepare(`
      SELECT rooms.code, rooms.status, rooms.created_at, rooms.finished_at, quizzes.title,
      (SELECT COUNT(*) FROM room_participants WHERE room_id = rooms.id) AS participants
      FROM rooms
      JOIN quizzes ON quizzes.id = rooms.quiz_id
      WHERE quizzes.owner_id = ?
      ORDER BY rooms.created_at DESC
    `).all(req.user.id);
    return res.json({ hosted });
  }
  const played = db.prepare(`
    SELECT rooms.code, rooms.status, rooms.created_at, rooms.finished_at, quizzes.title, room_participants.score
    FROM room_participants
    JOIN rooms ON rooms.id = room_participants.room_id
    JOIN quizzes ON quizzes.id = rooms.quiz_id
    WHERE room_participants.user_id = ?
    ORDER BY room_participants.joined_at DESC
  `).all(req.user.id);
  res.json({ played });
});

function emitRoom(code) {
  const state = roomState(code);
  if (state) io.to(code).emit('room:state', state);
}

function finishQuestion(code) {
  const room = getRoomByCode(code);
  if (!room || room.status !== 'active') return;
  db.prepare("UPDATE rooms SET status = 'review', question_started_at = NULL, question_ends_at = NULL WHERE id = ?").run(room.id);
  emitRoom(code);
}

function scheduleQuestionEnd(code, ms) {
  clearTimeout(timers.get(code));
  timers.set(code, setTimeout(() => {
    finishQuestion(code);
    timers.delete(code);
  }, Math.max(1000, ms)));
}

io.on('connection', (socket) => {
  socket.on('room:join', ({ code, token, displayName }, done) => {
    const room = getRoomByCode(String(code || '').trim());
    if (!room) return done?.({ error: 'Комната не найдена' });
    if (room.status === 'finished') return done?.({ error: 'Квиз уже завершен' });
    const user = getUserByToken(token);
    const name = user?.name || String(displayName || '').trim() || 'Участник';
    let participant = user
      ? db.prepare('SELECT * FROM room_participants WHERE room_id = ? AND user_id = ?').get(room.id, user.id)
      : null;
    if (!participant) {
      const result = db.prepare('INSERT INTO room_participants (room_id, user_id, display_name) VALUES (?, ?, ?)').run(room.id, user?.id || null, name);
      participant = db.prepare('SELECT * FROM room_participants WHERE id = ?').get(Number(result.lastInsertRowid));
    }
    socket.join(room.code);
    socket.data = { ...socket.data, participantId: participant.id, user, code: room.code };
    emitRoom(room.code);
    done?.({ participant, state: roomState(room.code) });
  });

  socket.on('organizer:join', ({ code, token }, done) => {
    const room = getRoomByCode(String(code || '').trim());
    const user = getUserByToken(token);
    if (!room) return done?.({ error: 'Комната не найдена' });
    if (!user || user.id !== room.owner_id) return done?.({ error: 'Нет доступа к комнате' });
    socket.join(room.code);
    socket.data = { ...socket.data, organizer: true, user, code: room.code };
    done?.({ state: roomState(room.code) });
  });

  socket.on('organizer:start-question', ({ code, index }, done) => {
    const room = getRoomByCode(String(code || '').trim());
    if (!room || !socket.data.organizer || socket.data.user?.id !== room.owner_id) return done?.({ error: 'Нет доступа' });
    const quiz = readQuiz(room.quiz_id);
    const nextIndex = Number.isInteger(index) ? index : room.current_question_index + 1;
    const question = quiz.questions[nextIndex];
    if (!question) return done?.({ error: 'Вопрос не найден' });
    const started = Date.now();
    const ends = started + question.time_limit * 1000;
    db.prepare('UPDATE rooms SET status = ?, current_question_index = ?, question_started_at = ?, question_ends_at = ? WHERE id = ?').run('active', nextIndex, started, ends, room.id);
    scheduleQuestionEnd(room.code, ends - Date.now());
    emitRoom(room.code);
    done?.({ state: roomState(room.code) });
  });

  socket.on('organizer:end-question', ({ code }, done) => {
    const room = getRoomByCode(String(code || '').trim());
    if (!room || !socket.data.organizer || socket.data.user?.id !== room.owner_id) return done?.({ error: 'Нет доступа' });
    clearTimeout(timers.get(room.code));
    timers.delete(room.code);
    finishQuestion(room.code);
    done?.({ state: roomState(room.code) });
  });

  socket.on('organizer:finish', ({ code }, done) => {
    const room = getRoomByCode(String(code || '').trim());
    if (!room || !socket.data.organizer || socket.data.user?.id !== room.owner_id) return done?.({ error: 'Нет доступа' });
    clearTimeout(timers.get(room.code));
    timers.delete(room.code);
    db.prepare("UPDATE rooms SET status = 'finished', current_question_index = -1, question_started_at = NULL, question_ends_at = NULL, finished_at = CURRENT_TIMESTAMP WHERE id = ?").run(room.id);
    awardVictoryPoints(room.id);
    emitRoom(room.code);
    done?.({ state: roomState(room.code) });
  });

  socket.on('participant:reaction', ({ code, itemId }, done) => {
    const room = getRoomByCode(String(code || '').trim());
    if (!room || !socket.data.participantId) return done?.({ error: 'Room connection required' });
    const participant = db.prepare('SELECT * FROM room_participants WHERE id = ?').get(socket.data.participantId);
    const item = db.prepare(`
      SELECT marketplace_items.*
      FROM marketplace_items
      JOIN user_items ON user_items.item_id = marketplace_items.id
      WHERE marketplace_items.id = ? AND marketplace_items.kind = 'reaction' AND user_items.user_id = ?
    `).get(Number(itemId), participant.user_id);
    if (!item) return done?.({ error: 'Buy this reaction first' });
    io.to(room.code).emit('room:reaction', { value: item.value, name: item.name, from: participant.display_name, at: Date.now() });
    done?.({ ok: true });
  });

  socket.on('participant:answer', ({ code, optionIds }, done) => {
    const room = getRoomByCode(String(code || '').trim());
    if (!room || room.status !== 'active') return done?.({ error: 'Вопрос сейчас недоступен' });
    if (!socket.data.participantId) return done?.({ error: 'Сначала подключитесь к комнате' });
    if (Date.now() > room.question_ends_at) return done?.({ error: 'Время вышло' });
    const quiz = readQuiz(room.quiz_id);
    const question = quiz.questions[room.current_question_index];
    const selected = Array.from(new Set((optionIds || []).map(Number))).sort((a, b) => a - b);
    const correct = question.options.filter((option) => option.is_correct).map((option) => option.id).sort((a, b) => a - b);
    const isCorrect = selected.length === correct.length && selected.every((id, index) => id === correct[index]);
    const remainingRatio = Math.max(0, (room.question_ends_at - Date.now()) / (question.time_limit * 1000));
    const earned = isCorrect ? Math.round(question.points * (0.5 + remainingRatio * 0.5)) : 0;
    try {
      db.prepare(`
        INSERT INTO responses (room_id, participant_id, question_id, selected_options, is_correct, earned_points, answered_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(room.id, socket.data.participantId, question.id, JSON.stringify(selected), isCorrect ? 1 : 0, earned, Date.now());
      db.prepare('UPDATE room_participants SET score = score + ? WHERE id = ?').run(earned, socket.data.participantId);
    } catch {
      return done?.({ error: 'Ответ уже принят' });
    }
    emitRoom(room.code);
    done?.({ isCorrect, earned, leaderboard: leaderboard(room.id) });
  });
});

app.use(express.static(join(root, 'dist')));
app.get(/.*/, (req, res) => {
  res.sendFile(join(root, 'dist', 'index.html'));
});

server.listen(3001, () => {
  console.log('QuizFlow server: http://localhost:3001');
});

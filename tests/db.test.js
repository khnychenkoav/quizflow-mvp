import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, makeRoomCode, verifyPassword } from '../server/db.js';

test('password hashing verifies only the original password', () => {
  const stored = hashPassword('demo12345');
  assert.equal(verifyPassword('demo12345', stored), true);
  assert.equal(verifyPassword('wrong-password', stored), false);
});

test('room code is six numeric characters', () => {
  const code = makeRoomCode();
  assert.match(code, /^\d{6}$/);
});

import { describe, it, expect } from 'vitest';
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  queueDocId,
  sortQueuePlayers,
  isQueueLeader,
  selectPlayersForMatch,
  shouldFormMatch,
} from '../src/matchmaking.js';

describe('matchmaking helpers', () => {
  it('queueDocId combines map and mode', () => {
    expect(queueDocId('factory', 'standard')).toBe('factory_standard');
  });

  it('sortQueuePlayers orders by joinedAt', () => {
    const sorted = sortQueuePlayers([
      { uid: 'b', joinedAt: 200 },
      { uid: 'a', joinedAt: 100 },
    ]);
    expect(sorted.map((p) => p.uid)).toEqual(['a', 'b']);
  });

  it('isQueueLeader picks earliest joiner', () => {
    const players = [
      { uid: 'a', joinedAt: 100 },
      { uid: 'b', joinedAt: 200 },
    ];
    expect(isQueueLeader(players, 'a')).toBe(true);
    expect(isQueueLeader(players, 'b')).toBe(false);
  });

  it('selectPlayersForMatch requires minimum and caps at max', () => {
    const players = [
      { uid: '1', joinedAt: 1 },
      { uid: '2', joinedAt: 2 },
      { uid: '3', joinedAt: 3 },
      { uid: '4', joinedAt: 4 },
      { uid: '5', joinedAt: 5 },
    ];
    expect(selectPlayersForMatch(players.slice(0, 1))).toEqual([]);
    expect(selectPlayersForMatch(players.slice(0, 2))).toHaveLength(2);
    expect(selectPlayersForMatch(players)).toHaveLength(MAX_PLAYERS);
  });

  it('shouldFormMatch waits for fill deadline unless full', () => {
    const now = 10000;
    const players = new Array(MIN_PLAYERS).fill({ uid: 'x' });
    expect(shouldFormMatch(players, 0, now)).toBe(false);
    expect(shouldFormMatch(players, 15000, now)).toBe(false);
    expect(shouldFormMatch(players, 9000, now)).toBe(true);
    const full = new Array(MAX_PLAYERS).fill({ uid: 'x' });
    expect(shouldFormMatch(full, 0, now)).toBe(true);
  });

  it('exports min 2 max 4', () => {
    expect(MIN_PLAYERS).toBe(2);
    expect(MAX_PLAYERS).toBe(4);
  });
});

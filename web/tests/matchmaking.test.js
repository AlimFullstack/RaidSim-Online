import { describe, it, expect } from 'vitest';
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  FILL_WAIT_MS,
  queueDocId,
  sortQueuePlayers,
  isQueueLeader,
  selectPlayersForMatch,
  shouldFormMatch,
  countdownSeconds,
  getMatchmakingPhase,
} from '../src/matchmaking.js';

describe('matchmaking helpers', () => {
  it('queueDocId keys queue by mode', () => {
    expect(queueDocId('standard')).toBe('mm_standard');
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

  it('exports min 2 max 4 and 30s fill window', () => {
    expect(MIN_PLAYERS).toBe(2);
    expect(MAX_PLAYERS).toBe(4);
    expect(FILL_WAIT_MS).toBe(30000);
  });

  it('countdownSeconds rounds up remaining time', () => {
    expect(countdownSeconds(10500, 10000)).toBe(1);
    expect(countdownSeconds(10000, 10000)).toBe(0);
  });

  it('getMatchmakingPhase uses countdown after minimum players', () => {
    const two = [{ uid: 'a' }, { uid: 'b' }];
    const three = [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }];
    expect(getMatchmakingPhase(two, 0)).toBe('waiting');
    expect(getMatchmakingPhase(two, 40000, 10000)).toBe('countdown');
    expect(getMatchmakingPhase(three, 40000, 10000)).toBe('countdown');
    expect(getMatchmakingPhase(two, 5000, 10000)).toBe('starting');
    const four = new Array(4).fill({ uid: 'x' });
    expect(getMatchmakingPhase(four, 0)).toBe('full');
  });

  it('selectPlayersForMatch includes third player during countdown window', () => {
    const three = [
      { uid: 'a', joinedAt: 1 },
      { uid: 'b', joinedAt: 2 },
      { uid: 'c', joinedAt: 3 },
    ];
    expect(selectPlayersForMatch(three)).toHaveLength(3);
  });
});

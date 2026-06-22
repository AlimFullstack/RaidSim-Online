import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  runTransaction,
  getDocs,
} from 'firebase/firestore';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const FILL_WAIT_MS = 12000;

export function queueDocId(mapId, mode) {
  return `${mapId}_${mode}`;
}

export function sortQueuePlayers(players) {
  return [...players].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
}

export function isQueueLeader(players, uid) {
  const sorted = sortQueuePlayers(players);
  return sorted.length > 0 && sorted[0].uid === uid;
}

/** @returns {typeof players} */
export function selectPlayersForMatch(players, min = MIN_PLAYERS, max = MAX_PLAYERS) {
  const sorted = sortQueuePlayers(players);
  if (sorted.length < min) return [];
  return sorted.slice(0, Math.min(max, sorted.length));
}

export function shouldFormMatch(players, fillDeadline, now = Date.now()) {
  if (players.length >= MAX_PLAYERS) return true;
  if (players.length < MIN_PLAYERS) return false;
  return fillDeadline > 0 && now >= fillDeadline;
}

export class Matchmaking {
  /**
   * @param {import('firebase/firestore').Firestore} db
   * @param {{ uid: string, displayName: string }} identity
   */
  constructor(db, identity) {
    this.db = db;
    this.uid = identity.uid;
    this.displayName = identity.displayName;
    this.queueKey = null;
    this.mapId = null;
    this.mode = null;
    this.unsubQueue = null;
    this.unsubAssignment = null;
    this.fillTimer = null;
    this.fillDeadline = 0;
    this.forming = false;
    this.cancelled = false;
    this.onStatus = null;
    this.onReady = null;
    this.onError = null;
  }

  async search(mapId, mode) {
    this.cancelled = false;
    this.mapId = mapId;
    this.mode = mode;
    this.queueKey = queueDocId(mapId, mode);

    const waitingRef = doc(this.db, 'matchQueues', this.queueKey, 'waiting', this.uid);
    await setDoc(waitingRef, {
      uid: this.uid,
      displayName: this.displayName,
      mapId,
      mode,
      joinedAt: Date.now(),
    });

    this.unsubAssignment = onSnapshot(doc(this.db, 'playerMatches', this.uid), (snap) => {
      if (!snap.exists() || this.cancelled) return;
      const data = snap.data();
      if (!data?.matchId) return;
      this.cleanupQueueOnly();
      this.onReady?.({
        matchId: data.matchId,
        mapId: data.mapId,
        mode: data.mode,
        players: data.players || [],
      });
    });

    const waitingCol = collection(this.db, 'matchQueues', this.queueKey, 'waiting');
    this.unsubQueue = onSnapshot(waitingCol, (snap) => {
      if (this.cancelled) return;
      const players = snap.docs.map((d) => d.data());
      this.emitStatus(players);

      if (players.length >= MIN_PLAYERS && isQueueLeader(players, this.uid)) {
        this.scheduleFill(players);
      } else if (players.length < MIN_PLAYERS) {
        this.clearFillTimer();
        this.fillDeadline = 0;
      }
    });
  }

  emitStatus(players) {
    this.onStatus?.({
      phase: 'searching',
      count: players.length,
      min: MIN_PLAYERS,
      max: MAX_PLAYERS,
      players: sortQueuePlayers(players),
      fillDeadline: this.fillDeadline || null,
    });
  }

  scheduleFill(players) {
    if (!this.fillDeadline) {
      this.fillDeadline = Date.now() + FILL_WAIT_MS;
      this.emitStatus(players);
    }

    if (shouldFormMatch(players, this.fillDeadline)) {
      this.tryFormMatch(players);
      return;
    }

    if (!this.fillTimer) {
      const wait = Math.max(0, this.fillDeadline - Date.now());
      this.fillTimer = setTimeout(() => {
        this.fillTimer = null;
        if (this.cancelled || this.forming) return;
        getDocs(collection(this.db, 'matchQueues', this.queueKey, 'waiting'))
          .then((snap) => {
            const fresh = snap.docs.map((d) => d.data());
            if (isQueueLeader(fresh, this.uid) && shouldFormMatch(fresh, this.fillDeadline)) {
              this.tryFormMatch(fresh);
            }
          })
          .catch((e) => this.onError?.(e));
      }, wait + 50);
    }
  }

  async tryFormMatch(players) {
    if (this.forming || this.cancelled) return;
    const picked = selectPlayersForMatch(players);
    if (picked.length < MIN_PLAYERS) return;

    this.forming = true;
    this.clearFillTimer();

    try {
      const matchId = crypto.randomUUID();
      const matchPlayers = picked.map((p, i) => ({
        uid: p.uid,
        displayName: p.displayName || 'Оператор',
        slot: i,
      }));

      await runTransaction(this.db, async (tx) => {
        const verified = [];
        for (const p of picked) {
          const ref = doc(this.db, 'matchQueues', this.queueKey, 'waiting', p.uid);
          const s = await tx.get(ref);
          if (s.exists()) verified.push(s.data());
        }
        const livePicked = selectPlayersForMatch(verified);
        if (livePicked.length < MIN_PLAYERS) return;
        if (!livePicked.some((p) => p.uid === this.uid)) return;
        if (livePicked[0].uid !== this.uid) return;

        const finalPlayers = livePicked.map((p, i) => ({
          uid: p.uid,
          displayName: p.displayName || 'Оператор',
          slot: i,
        }));

        const matchRef = doc(this.db, 'matches', matchId);
        tx.set(matchRef, {
          matchId,
          mapId: this.mapId,
          mode: this.mode,
          players: finalPlayers,
          status: 'starting',
          createdAt: Date.now(),
        });

        for (const p of finalPlayers) {
          tx.set(doc(this.db, 'playerMatches', p.uid), {
            matchId,
            mapId: this.mapId,
            mode: this.mode,
            players: finalPlayers,
            at: Date.now(),
          });
          tx.delete(doc(this.db, 'matchQueues', this.queueKey, 'waiting', p.uid));
        }
      });
    } catch (e) {
      this.forming = false;
      this.onError?.(e);
    }
  }

  clearFillTimer() {
    if (this.fillTimer) {
      clearTimeout(this.fillTimer);
      this.fillTimer = null;
    }
  }

  cleanupQueueOnly() {
    this.clearFillTimer();
    this.unsubQueue?.();
    this.unsubQueue = null;
  }

  async cancel() {
    this.cancelled = true;
    this.clearFillTimer();
    this.unsubQueue?.();
    this.unsubAssignment?.();
    this.unsubQueue = null;
    this.unsubAssignment = null;

    if (this.queueKey) {
      try {
        await deleteDoc(doc(this.db, 'matchQueues', this.queueKey, 'waiting', this.uid));
      } catch {
        /* already removed */
      }
    }
    this.queueKey = null;
    this.forming = false;
    this.fillDeadline = 0;
  }
}

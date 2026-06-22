import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDoc,
  runTransaction,
  getDocs,
} from 'firebase/firestore';
import { pickRandomMapId } from './map-loader.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const FILL_WAIT_MS = 30000;

export function queueDocId(mode) {
  return `mm_${mode}`;
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

export function countdownSeconds(fillDeadline, now = Date.now()) {
  if (!fillDeadline || fillDeadline <= now) return 0;
  return Math.ceil((fillDeadline - now) / 1000);
}

export function getMatchmakingPhase(players, fillDeadline, now = Date.now()) {
  if (players.length < MIN_PLAYERS) return 'searching';
  if (players.length >= MAX_PLAYERS) return 'full';
  if (fillDeadline > now) return 'countdown';
  if (fillDeadline > 0) return 'starting';
  return 'waiting';
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
    this.mode = null;
    this.unsubQueue = null;
    this.unsubAssignment = null;
    this.unsubMeta = null;
    this.fillTimer = null;
    this.tickTimer = null;
    this.fillDeadline = 0;
    this.lastPlayers = [];
    this.forming = false;
    this.cancelled = false;
    this.onStatus = null;
    this.onReady = null;
    this.onError = null;
  }

  async search(mode) {
    this.cancelled = false;
    this.mode = mode;
    this.queueKey = queueDocId(mode);

    const waitingRef = doc(this.db, 'matchQueues', this.queueKey, 'waiting', this.uid);
    await setDoc(waitingRef, {
      uid: this.uid,
      displayName: this.displayName,
      mode,
      joinedAt: Date.now(),
    });

    this.unsubAssignment = onSnapshot(doc(this.db, 'playerMatches', this.uid), (snap) => {
      if (!snap.exists() || this.cancelled) return;
      const data = snap.data();
      if (!data?.matchId) return;
      this.forming = false;
      this.cleanupQueueOnly();
      this.onReady?.({
        matchId: data.matchId,
        mapId: data.mapId,
        mode: data.mode,
        players: data.players || [],
      });
    });

    const waitingCol = collection(this.db, 'matchQueues', this.queueKey, 'waiting');
    const metaRef = doc(this.db, 'matchQueues', this.queueKey, 'meta', 'state');

    this.unsubMeta = onSnapshot(metaRef, (snap) => {
      if (this.cancelled) return;
      if (snap.exists() && snap.data()?.fillDeadline) {
        this.fillDeadline = snap.data().fillDeadline;
      }
      if (this.lastPlayers.length) this.emitStatus(this.lastPlayers);
    });

    this.unsubQueue = onSnapshot(waitingCol, (snap) => {
      if (this.cancelled) return;
      const players = snap.docs.map((d) => d.data());
      void this.onQueueUpdate(players, metaRef);
    });

    this.startCountdownTick();
  }

  startCountdownTick() {
    this.clearCountdownTick();
    this.tickTimer = setInterval(() => {
      if (this.cancelled || !this.fillDeadline || this.lastPlayers.length < MIN_PLAYERS) return;
      this.emitStatus(this.lastPlayers);
      if (isQueueLeader(this.lastPlayers, this.uid) && shouldFormMatch(this.lastPlayers, this.fillDeadline)) {
        void this.tryFormMatch();
      }
    }, 1000);
  }

  async onQueueUpdate(players, metaRef) {
    if (players.length >= MIN_PLAYERS && !this.fillDeadline) {
      await this.syncFillDeadline(metaRef);
    }

    this.emitStatus(players);

    if (players.length >= MIN_PLAYERS && isQueueLeader(players, this.uid)) {
      await this.scheduleFill(players);
    } else if (players.length < MIN_PLAYERS) {
      this.clearFillTimer();
      this.fillDeadline = 0;
      if (isQueueLeader(players, this.uid)) {
        deleteDoc(metaRef).catch(() => {});
      }
    }
  }

  async syncFillDeadline(metaRef) {
    try {
      const snap = await getDoc(metaRef);
      if (snap.exists() && snap.data()?.fillDeadline) {
        this.fillDeadline = snap.data().fillDeadline;
      }
    } catch {
      /* ignore */
    }
  }

  clearCountdownTick() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  async ensureFillDeadline() {
    const metaRef = doc(this.db, 'matchQueues', this.queueKey, 'meta', 'state');
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(metaRef);
      if (snap.exists() && snap.data().fillDeadline) {
        this.fillDeadline = snap.data().fillDeadline;
        return;
      }
      const deadline = Date.now() + FILL_WAIT_MS;
      tx.set(metaRef, { fillDeadline: deadline, setAt: Date.now() });
      this.fillDeadline = deadline;
    });
  }

  async clearFillDeadlineMeta() {
    try {
      await deleteDoc(doc(this.db, 'matchQueues', this.queueKey, 'meta', 'state'));
    } catch {
      /* ignore */
    }
    this.fillDeadline = 0;
  }

  emitStatus(players) {
    this.lastPlayers = players;
    const phase = getMatchmakingPhase(players, this.fillDeadline);
    this.onStatus?.({
      phase,
      count: players.length,
      min: MIN_PLAYERS,
      max: MAX_PLAYERS,
      players: sortQueuePlayers(players),
      fillDeadline: this.fillDeadline || null,
      countdownSec: countdownSeconds(this.fillDeadline),
    });
  }

  async scheduleFill(players) {
    if (!this.fillDeadline) {
      await this.ensureFillDeadline();
      this.emitStatus(players);
    }

    if (shouldFormMatch(players, this.fillDeadline)) {
      await this.tryFormMatch();
      return;
    }

    if (!this.fillTimer) {
      const wait = Math.max(0, this.fillDeadline - Date.now());
      this.fillTimer = setTimeout(() => {
        this.fillTimer = null;
        if (this.cancelled || this.forming) return;
        void this.tryFormMatch();
      }, wait + 50);
    }
  }

  async fetchWaitingPlayers() {
    const snap = await getDocs(collection(this.db, 'matchQueues', this.queueKey, 'waiting'));
    return sortQueuePlayers(snap.docs.map((d) => d.data()));
  }

  async tryFormMatch() {
    if (this.forming || this.cancelled) return;

    const allPlayers = await this.fetchWaitingPlayers();
    if (allPlayers.length < MIN_PLAYERS) return;
    if (!isQueueLeader(allPlayers, this.uid)) return;
    if (!shouldFormMatch(allPlayers, this.fillDeadline)) return;

    const picked = selectPlayersForMatch(allPlayers);
    if (picked.length < MIN_PLAYERS) return;

    this.forming = true;
    this.clearFillTimer();

    let matched = false;
    try {
      const matchId = crypto.randomUUID();
      const mapId = pickRandomMapId();

      await runTransaction(this.db, async (tx) => {
        const verified = [];
        for (const p of picked) {
          const ref = doc(this.db, 'matchQueues', this.queueKey, 'waiting', p.uid);
          const s = await tx.get(ref);
          if (s.exists()) verified.push(s.data());
        }
        const livePicked = selectPlayersForMatch(verified);
        if (livePicked.length < MIN_PLAYERS) return;
        if (livePicked[0].uid !== this.uid) return;

        const finalPlayers = livePicked.map((p, i) => ({
          uid: p.uid,
          displayName: p.displayName || 'Оператор',
          slot: i,
        }));

        const matchRef = doc(this.db, 'matches', matchId);
        tx.set(matchRef, {
          matchId,
          mapId,
          mode: this.mode,
          players: finalPlayers,
          status: 'starting',
          createdAt: Date.now(),
        });

        for (const p of finalPlayers) {
          tx.set(doc(this.db, 'playerMatches', p.uid), {
            matchId,
            mapId,
            mode: this.mode,
            players: finalPlayers,
            at: Date.now(),
          });
          tx.delete(doc(this.db, 'matchQueues', this.queueKey, 'waiting', p.uid));
        }
        tx.delete(doc(this.db, 'matchQueues', this.queueKey, 'meta', 'state'));
        matched = true;
      });
    } catch (e) {
      this.onError?.(e);
    } finally {
      if (!matched) this.forming = false;
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
    this.clearCountdownTick();
    this.unsubQueue?.();
    this.unsubMeta?.();
    this.unsubQueue = null;
    this.unsubMeta = null;
  }

  async cancel() {
    this.cancelled = true;
    this.clearFillTimer();
    this.clearCountdownTick();
    this.unsubQueue?.();
    this.unsubAssignment?.();
    this.unsubMeta?.();
    this.unsubQueue = null;
    this.unsubAssignment = null;
    this.unsubMeta = null;

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

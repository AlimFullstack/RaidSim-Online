import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { RemotePlayer, PlayerCorpse } from './entities.js';
import { stackItems } from './inventory-core.js';

const SYNC_INTERVAL = 0.1;
const HIT_DEDUPE_MS = 8000;

export class RaidMultiplayer {
  /**
   * @param {import('firebase/firestore').Firestore} db
   * @param {string} matchId
   * @param {string} myUid
   * @param {import('./game.js').Game} game
   */
  constructor(db, matchId, myUid, game) {
    this.db = db;
    this.matchId = matchId;
    this.myUid = myUid;
    this.game = game;
    this.remotePlayers = new Map();
    this.unsubs = [];
    this.syncTimer = 0;
    this.processedHits = new Map();
    this.lastHitAt = 0;
    this.walls = [];
    this.playersMeta = [];
    this.publishing = false;
    this.hitsUseOrderBy = true;
    this.hitsSubscribed = false;
  }

  async start(players, walls) {
    this.walls = walls;
    this.playersMeta = players;

    for (const p of players) {
      if (p.uid === this.myUid) continue;
      const rp = new RemotePlayer(p.uid, p.displayName, 0, 0, walls);
      this.remotePlayers.set(p.uid, rp);
    }

    const playersCol = collection(this.db, 'matches', this.matchId, 'players');
    this.unsubs.push(
      onSnapshot(playersCol, (snap) => {
        const seen = new Set();
        for (const d of snap.docs) {
          if (d.id === this.myUid) continue;
          seen.add(d.id);
          const data = d.data();
          let rp = this.remotePlayers.get(d.id);
          if (!rp) {
            rp = new RemotePlayer(d.id, data.name || 'Оператор', data.x || 0, data.y || 0, walls);
            this.remotePlayers.set(d.id, rp);
          }
          rp.applyState(data);
          this.syncRemoteCorpse(d.id, rp, data);
        }
        for (const uid of [...this.remotePlayers.keys()]) {
          if (!seen.has(uid)) this.remotePlayers.delete(uid);
        }
      })
    );

    this.subscribeHits();

    const corpsesCol = collection(this.db, 'matches', this.matchId, 'corpses');
    this.unsubs.push(
      onSnapshot(corpsesCol, (snap) => {
        for (const d of snap.docs) {
          if (d.id === this.myUid) continue;
          const data = d.data();
          this.upsertCorpse(d.id, data.x, data.y, data.loot || [], data.looted);
        }
      })
    );

    await this.publishState(true);
  }

  subscribeHits() {
    if (this.hitsSubscribed) return;
    this.hitsSubscribed = true;
    const hitsCol = collection(this.db, 'matches', this.matchId, 'hits');
    const hitsQ = this.hitsUseOrderBy
      ? query(hitsCol, orderBy('at', 'desc'), limit(40))
      : query(hitsCol, limit(40));

    this.unsubs.push(
      onSnapshot(
        hitsQ,
        (snap) => {
          for (const d of snap.docs) {
            const hit = d.data();
            if (hit.targetUid !== this.myUid) continue;
            const key = d.id;
            if (this.processedHits.has(key)) continue;
            this.processedHits.set(key, Date.now());
            this.applyIncomingHit(hit);
          }
          this.pruneHits();
        },
        (err) => {
          if (this.hitsUseOrderBy) {
            console.warn('Hits index missing, falling back', err);
            this.hitsUseOrderBy = false;
            this.hitsSubscribed = false;
            this.subscribeHits();
          }
        }
      )
    );
  }

  pruneHits() {
    const now = Date.now();
    for (const [k, t] of this.processedHits) {
      if (now - t > HIT_DEDUPE_MS) this.processedHits.delete(k);
    }
  }

  applyIncomingHit(hit) {
    const p = this.game.player;
    if (!p || p.dead) return;
    const armorBefore = p.armor;
    p.takeDamage(hit.damage || 0);
    this.game.fx?.hitSparks(p.x, p.y);
    if (armorBefore > p.armor) this.game.audio?.play('hitArmor');
    else this.game.audio?.play('hit');
    this.game.fx?.damageScreen(hit.damage || 0);
    this.game.fx?.floatText(p.x, p.y - 18, `-${hit.damage}`, '#ff6b6b');
    this.publishState(true);
  }

  syncRemoteCorpse(uid, rp, data) {
    if (!data.dead) return;
    rp.dead = true;
  }

  upsertCorpse(uid, x, y, loot, looted = false) {
    let corpse = this.game.pmcCorpses.find((c) => c.ownerUid === uid);
    if (!corpse) {
      const meta = this.playersMeta.find((p) => p.uid === uid);
      const rp = this.remotePlayers.get(uid);
      corpse = new PlayerCorpse(x, y, loot, {
        ownerUid: uid,
        label: rp?.name || meta?.displayName || 'PMC',
      });
      this.game.pmcCorpses.push(corpse);
    } else {
      corpse.x = x;
      corpse.y = y;
      if (loot.length) corpse.loot = loot;
    }
    if (looted) corpse.looted = true;
  }

  update(dt) {
    this.syncTimer += dt;
    for (const rp of this.remotePlayers.values()) rp.update(dt);
    if (this.syncTimer >= SYNC_INTERVAL) {
      this.syncTimer = 0;
      this.publishState();
    }
  }

  publishState(force = false) {
    const p = this.game.player;
    if (!p || this.publishing) return;
    const payload = {
      x: Math.round(p.x),
      y: Math.round(p.y),
      angle: p.angle,
      hp: p.hp,
      maxHp: p.maxHp,
      dead: p.dead,
      name: this.game.mpDisplayName || 'Оператор',
      weaponId: p.weaponId || null,
      at: Date.now(),
    };
    if (p.dead) {
      payload.loot = stackItems(p.getCarriedLoot());
    }
    this.publishing = true;
    return setDoc(doc(this.db, 'matches', this.matchId, 'players', this.myUid), payload, { merge: true })
      .catch((e) => {
        if (force) console.warn('MP sync failed', e);
      })
      .finally(() => {
        this.publishing = false;
      });
  }

  async reportHit(targetUid, damage) {
    const now = Date.now();
    if (now - this.lastHitAt < 80) return;
    this.lastHitAt = now;
    try {
      await addDoc(collection(this.db, 'matches', this.matchId, 'hits'), {
        targetUid,
        fromUid: this.myUid,
        damage: Math.round(damage),
        at: now,
      });
    } catch (e) {
      console.warn('Hit report failed', e);
    }
  }

  async publishDeath(x, y, loot) {
    const stacked = stackItems(loot);
    try {
      await setDoc(
        doc(this.db, 'matches', this.matchId, 'corpses', this.myUid),
        { x, y, loot: stacked, looted: false, at: Date.now() },
        { merge: true }
      );
      this.publishState(true);
    } catch (e) {
      console.warn('Death sync failed', e);
    }
  }

  markCorpseLooted(uid) {
    setDoc(doc(this.db, 'matches', this.matchId, 'corpses', uid), { looted: true }, { merge: true }).catch(
      () => {}
    );
  }

  getRemotePlayer(uid) {
    return this.remotePlayers.get(uid);
  }

  values() {
    return this.remotePlayers.values();
  }

  async destroy() {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    this.remotePlayers.clear();
    try {
      await deleteDoc(doc(this.db, 'matches', this.matchId, 'players', this.myUid));
      await deleteDoc(doc(this.db, 'playerMatches', this.myUid));
    } catch {
      /* ignore */
    }
  }
}

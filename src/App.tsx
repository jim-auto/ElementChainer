import {
  Activity,
  CircleHelp,
  Crosshair,
  Flame,
  Hammer,
  LucideIcon,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
  Waves,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type StatusKey = "heat" | "shock" | "resonance" | "fragile" | "overload";
type SkillId =
  | "heat-shot"
  | "conduct"
  | "pulse"
  | "break"
  | "flashover"
  | "echo-pulse"
  | "rift-break";
type ReactionId = "flash-conduct" | "overload" | "wave-spread" | "shatter" | "core-echo";
type UpgradeId = "kindling" | "static-field" | "echo-chamber" | "fracture-map" | "chain-guard";
type FxKind = StatusKey | "hit" | "flash" | "enemy";
type Result = "victory" | "defeat" | null;

type Statuses = Record<StatusKey, number>;

type Enemy = {
  id: number;
  name: string;
  art: string;
  maxHp: number;
  hp: number;
  statuses: Statuses;
};

const ENEMY_ART: Record<number, string> = {
  1: "./images/enemy-heat.png",
  2: "./images/enemy-shock.png",
  3: "./images/enemy-glass.png",
};

type FxEvent = {
  id: number;
  targetId: number | "player" | "all";
  kind: FxKind;
  label: string;
  chain: number;
};

type LogEntry = {
  id: number;
  text: string;
  kind: FxKind;
  chain: number;
};

type SaveData = {
  unlocked: SkillId[];
  discovered: ReactionId[];
  upgrades: UpgradeId[];
  bestChain: number;
  wins: number;
};

type SkillDef = {
  id: SkillId;
  name: string;
  Icon: LucideIcon;
  accent: FxKind;
  chip: string;
};

const STORAGE_KEY = "elementchainer.save.v1";
const BASE_SKILLS: SkillId[] = ["heat-shot", "conduct", "pulse", "break"];
const EXTRA_SKILLS: SkillId[] = ["flashover", "echo-pulse", "rift-break"];
const REACTION_ORDER: ReactionId[] = [
  "flash-conduct",
  "overload",
  "wave-spread",
  "shatter",
  "core-echo",
];
const UPGRADE_ORDER: UpgradeId[] = [
  "kindling",
  "static-field",
  "echo-chamber",
  "fracture-map",
  "chain-guard",
];

const emptyStatuses = (): Statuses => ({
  heat: 0,
  shock: 0,
  resonance: 0,
  fragile: 0,
  overload: 0,
});

const SKILLS: Record<SkillId, SkillDef> = {
  "heat-shot": {
    id: "heat-shot",
    name: "Heat Shot",
    Icon: Flame,
    accent: "heat",
    chip: "+Heat",
  },
  conduct: {
    id: "conduct",
    name: "Conduct",
    Icon: Zap,
    accent: "shock",
    chip: "+Shock",
  },
  pulse: {
    id: "pulse",
    name: "Pulse",
    Icon: Waves,
    accent: "resonance",
    chip: "Spread",
  },
  break: {
    id: "break",
    name: "Break",
    Icon: Hammer,
    accent: "fragile",
    chip: "Crack",
  },
  flashover: {
    id: "flashover",
    name: "Flashover",
    Icon: Activity,
    accent: "overload",
    chip: "Heat x Shock",
  },
  "echo-pulse": {
    id: "echo-pulse",
    name: "Echo Pulse",
    Icon: Waves,
    accent: "resonance",
    chip: "All Pulse",
  },
  "rift-break": {
    id: "rift-break",
    name: "Rift Break",
    Icon: Hammer,
    accent: "fragile",
    chip: "Shatter",
  },
};

const STATUS_META: Record<StatusKey, { label: string; Icon: LucideIcon }> = {
  heat: { label: "Heat", Icon: Flame },
  shock: { label: "Shock", Icon: Zap },
  resonance: { label: "Resonance", Icon: Waves },
  fragile: { label: "Fragile", Icon: Hammer },
  overload: { label: "Overload", Icon: Sparkles },
};

const REACTION_META: Record<ReactionId, { label: string; Icon: LucideIcon; kind: FxKind }> = {
  "flash-conduct": { label: "Flash Conduct", Icon: Zap, kind: "shock" },
  overload: { label: "Overload", Icon: Flame, kind: "overload" },
  "wave-spread": { label: "Wave Spread", Icon: Waves, kind: "resonance" },
  shatter: { label: "Shatter", Icon: Hammer, kind: "fragile" },
  "core-echo": { label: "Core Echo", Icon: Sparkles, kind: "overload" },
};

const UPGRADE_META: Record<UpgradeId, { label: string; chip: string; Icon: LucideIcon; kind: FxKind }> = {
  kindling: { label: "Kindling", chip: "Heat +1", Icon: Flame, kind: "heat" },
  "static-field": { label: "Static Field", chip: "Arc +1", Icon: Zap, kind: "shock" },
  "echo-chamber": { label: "Echo Chamber", chip: "Pulse +1", Icon: Waves, kind: "resonance" },
  "fracture-map": { label: "Fracture Map", chip: "Break +", Icon: Hammer, kind: "fragile" },
  "chain-guard": { label: "Chain Guard", chip: "x2 Guard", Icon: Sparkles, kind: "overload" },
};

type ReactionGuideEntry = {
  id: ReactionId;
  trigger: string;
  effect: string;
  ready: (statuses: Statuses) => boolean;
  hint: (statuses: Statuses) => string;
};

const REACTION_GUIDE: ReactionGuideEntry[] = [
  {
    id: "flash-conduct",
    trigger: "Shock 1+ & Heat 2+",
    effect: "放電ダメージ + Resonance",
    ready: (s) => s.shock > 0 && s.heat >= 2,
    hint: (s) => {
      const needs: string[] = [];
      if (s.shock <= 0) {
        needs.push("Conduct");
      }
      if (s.heat < 2) {
        needs.push(`Heat あと ${2 - s.heat}`);
      }
      return needs.join(" / ");
    },
  },
  {
    id: "overload",
    trigger: "Heat 4+",
    effect: "大爆発、隣へ伝播",
    ready: (s) => s.heat >= 4,
    hint: (s) => `Heat あと ${Math.max(0, 4 - s.heat)}`,
  },
  {
    id: "wave-spread",
    trigger: "Resonance 3+",
    effect: "全体に波動",
    ready: (s) => s.resonance >= 3,
    hint: (s) => `Resonance あと ${Math.max(0, 3 - s.resonance)}`,
  },
  {
    id: "shatter",
    trigger: "Fragile 3+",
    effect: "大ダメ、隣へひび",
    ready: (s) => s.fragile >= 3,
    hint: (s) => `Fragile あと ${Math.max(0, 3 - s.fragile)}`,
  },
  {
    id: "core-echo",
    trigger: "Overload & Resonance",
    effect: "全員に貫通ダメ",
    ready: (s) => s.overload > 0 && s.resonance > 0,
    hint: (s) => {
      const needs: string[] = [];
      if (s.overload <= 0) {
        needs.push("Overload 後");
      }
      if (s.resonance <= 0) {
        needs.push("Pulse");
      }
      return needs.join(" / ");
    },
  },
];

const SKILL_PRIMED_HINT: Partial<Record<SkillId, string>> = {
  "heat-shot": "Heat が高いほど反応しやすい",
  conduct: "Heat があると感電が強化",
  pulse: "Resonance を積んで Wave Spread へ",
  break: "Fragile 済みなら追加ダメ大",
  flashover: "Heat と Shock を同時投入",
  "echo-pulse": "全体の Resonance を底上げ",
  "rift-break": "Fragile を広げて Shatter へ",
};

const rewardOptions = (owned: Set<UpgradeId>, wins: number) => {
  const pool = UPGRADE_ORDER.filter((id) => !owned.has(id));
  if (pool.length <= 3) {
    return pool;
  }
  const start = wins % pool.length;
  return Array.from({ length: 3 }, (_, index) => pool[(start + index) % pool.length]);
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const cloneEnemies = (enemies: Enemy[]) =>
  enemies.map((enemy) => ({
    ...enemy,
    statuses: { ...enemy.statuses },
  }));

const aliveEnemies = (enemies: Enemy[]) => enemies.filter((enemy) => enemy.hp > 0);

const loadSave = (): SaveData => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { unlocked: [], discovered: [], upgrades: [], bestChain: 0, wins: 0 };
    }
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      unlocked: (parsed.unlocked ?? []).filter((id): id is SkillId =>
        EXTRA_SKILLS.includes(id as SkillId),
      ),
      discovered: (parsed.discovered ?? []).filter((id): id is ReactionId =>
        REACTION_ORDER.includes(id as ReactionId),
      ),
      upgrades: (parsed.upgrades ?? []).filter((id): id is UpgradeId =>
        UPGRADE_ORDER.includes(id as UpgradeId),
      ),
      bestChain: Number(parsed.bestChain ?? 0),
      wins: Number(parsed.wins ?? 0),
    };
  } catch {
    return { unlocked: [], discovered: [], upgrades: [], bestChain: 0, wins: 0 };
  }
};

const createEnemies = (wave: number): Enemy[] => {
  const lift = Math.min(30, Math.max(0, wave - 1) * 7);
  return [
    {
      id: 1,
      name: "赤熱核",
      art: ENEMY_ART[1],
      maxHp: 72 + lift,
      hp: 72 + lift,
      statuses: { ...emptyStatuses(), heat: 2 },
    },
    {
      id: 2,
      name: "導電殻",
      art: ENEMY_ART[2],
      maxHp: 82 + lift,
      hp: 82 + lift,
      statuses: { ...emptyStatuses(), shock: 1, resonance: 2 },
    },
    {
      id: 3,
      name: "硝子兵",
      art: ENEMY_ART[3],
      maxHp: 68 + lift,
      hp: 68 + lift,
      statuses: { ...emptyStatuses(), fragile: 1 },
    },
  ];
};

function MatchupGuide({
  enemy,
  primedSkills,
}: {
  enemy: Enemy | undefined;
  primedSkills: Set<SkillId>;
}) {
  const statuses = enemy?.statuses ?? emptyStatuses();
  const activeStatuses = (Object.keys(statuses) as StatusKey[]).filter((key) => statuses[key] > 0);
  const primedList = [...primedSkills].map((id) => SKILLS[id]);

  return (
    <aside className="matchup-guide" aria-label="相性ガイド">
      <div className="guide-header">
        <CircleHelp size={16} />
        <strong>相性ガイド</strong>
      </div>

      <section className="guide-block">
        <h3>いまのターゲット</h3>
        {enemy ? (
          <>
            <p className="guide-target-name">{enemy.name}</p>
            <div className="guide-status-row">
              {activeStatuses.length > 0 ? (
                activeStatuses.map((key) => {
                  const meta = STATUS_META[key];
                  const Icon = meta.Icon;
                  return (
                    <span className={`guide-status-pill ${key}`} key={key}>
                      <Icon size={12} />
                      {meta.label} {statuses[key]}
                    </span>
                  );
                })
              ) : (
                <span className="guide-muted">状態なし — まず Heat / Shock / Pulse / Break を重ねる</span>
              )}
            </div>
          </>
        ) : (
          <p className="guide-muted">生きている敵を選んでください</p>
        )}
      </section>

      {primedList.length > 0 && (
        <section className="guide-block">
          <h3>おすすめ技</h3>
          <ul className="guide-list">
            {primedList.map((skill) => {
              const Icon = skill.Icon;
              return (
                <li className={`guide-primed ${skill.accent}`} key={skill.id}>
                  <Icon size={14} />
                  <span>
                    <b>{skill.name}</b>
                    <small>{SKILL_PRIMED_HINT[skill.id]}</small>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="guide-note">キラキラ光るボタン = 今の相性が良い</p>
        </section>
      )}

      <section className="guide-block">
        <h3>リアクション早見</h3>
        <ul className="guide-list">
          {REACTION_GUIDE.map((entry) => {
            const meta = REACTION_META[entry.id];
            const Icon = meta.Icon;
            const ready = enemy ? entry.ready(statuses) : false;
            return (
              <li className={`guide-reaction ${meta.kind} ${ready ? "ready" : ""}`} key={entry.id}>
                <Icon size={14} />
                <span>
                  <b>{meta.label}</b>
                  <small>{entry.trigger}</small>
                  <small>{entry.effect}</small>
                  {enemy && (
                    <em className={ready ? "ready" : ""}>
                      {ready ? "今すぐ発動可能" : entry.hint(statuses)}
                    </em>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </aside>
  );
}

function EnemyCard({
  enemy,
  selected,
  events,
  onSelect,
}: {
  enemy: Enemy;
  selected: boolean;
  events: FxEvent[];
  onSelect: () => void;
}) {
  const activeStatuses = (Object.keys(enemy.statuses) as StatusKey[]).filter(
    (key) => enemy.statuses[key] > 0,
  );
  const dead = enemy.hp <= 0;
  const hpPct = clamp((enemy.hp / enemy.maxHp) * 100, 0, 100);

  return (
    <button
      className={[
        "enemy-card",
        selected ? "selected" : "",
        dead ? "dead" : "",
        activeStatuses.map((key) => `status-${key}`).join(" "),
      ].join(" ")}
      onClick={onSelect}
      type="button"
      aria-label={`${enemy.name}を狙う`}
      disabled={dead}
    >
      <div className="card-effects" aria-hidden="true">
        <span className="heat-aura" />
        <span className="spark spark-a" />
        <span className="spark spark-b" />
        <span className="ring ring-a" />
        <span className="ring ring-b" />
        <span className="crack crack-a" />
        <span className="crack crack-b" />
      </div>
      <div className="target-mark" aria-hidden="true">
        <Crosshair size={18} />
      </div>
      <div className={`enemy-core enemy-core-${enemy.id}`} aria-hidden="true">
        <img className="enemy-art" src={enemy.art} alt="" />
      </div>
      <div className="enemy-info">
        <strong>{enemy.name}</strong>
        <div className="hp-track" aria-label={`HP ${enemy.hp}`}>
          <span style={{ width: `${hpPct}%` }} />
        </div>
      </div>
      <div className="status-row">
        {activeStatuses.map((key) => {
          const meta = STATUS_META[key];
          const Icon = meta.Icon;
          return (
            <span className={`status-pill ${key}`} key={key}>
              <Icon size={14} />
              {enemy.statuses[key]}
            </span>
          );
        })}
      </div>
      {events.map((event) => (
        <span className={`fx-burst ${event.kind}`} key={event.id}>
          {event.label}
        </span>
      ))}
    </button>
  );
}

export default function App() {
  const initialSave = useMemo(loadSave, []);
  const [enemies, setEnemies] = useState(() => createEnemies(initialSave.wins + 1));
  const [selectedId, setSelectedId] = useState(1);
  const [turn, setTurn] = useState(1);
  const [playerHp, setPlayerHp] = useState(84);
  const [busy, setBusy] = useState(false);
  const [chain, setChain] = useState(0);
  const [bestChain, setBestChain] = useState(initialSave.bestChain);
  const [wins, setWins] = useState(initialSave.wins);
  const [result, setResult] = useState<Result>(null);
  const [muted, setMuted] = useState(false);
  const [impact, setImpact] = useState<FxKind | null>(null);
  const [events, setEvents] = useState<FxEvent[]>([]);
  const [chainFlash, setChainFlash] = useState(0);
  const [reactionFlash, setReactionFlash] = useState<ReactionId | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 1, text: "Heat / Shock / Pulse / Break", kind: "hit", chain: 0 },
  ]);
  const [flash, setFlash] = useState<SkillId | null>(null);
  const [guideOpen, setGuideOpen] = useState(true);
  const [unlocked, setUnlocked] = useState<Set<SkillId>>(
    () => new Set([...BASE_SKILLS, ...initialSave.unlocked]),
  );
  const [discovered, setDiscovered] = useState<Set<ReactionId>>(
    () => new Set(initialSave.discovered),
  );
  const [upgrades, setUpgrades] = useState<Set<UpgradeId>>(
    () => new Set(initialSave.upgrades),
  );
  const [rewardChoices, setRewardChoices] = useState<UpgradeId[]>([]);
  const audioRef = useRef<AudioContext | null>(null);
  const discoveredRef = useRef(discovered);

  const availableSkills = useMemo(
    () => [...BASE_SKILLS, ...EXTRA_SKILLS.filter((id) => unlocked.has(id))],
    [unlocked],
  );
  const selectedEnemy = enemies.find((enemy) => enemy.id === selectedId && enemy.hp > 0);
  const primedSkills = useMemo(() => {
    const primed = new Set<SkillId>();
    if (!selectedEnemy) {
      return primed;
    }
    if (selectedEnemy.statuses.heat >= 2) {
      primed.add("heat-shot");
    }
    if (selectedEnemy.statuses.heat > 0) {
      primed.add("conduct");
      primed.add("flashover");
    }
    if (
      selectedEnemy.statuses.resonance > 0 ||
      enemies.some(
        (enemy) => enemy.id !== selectedId && enemy.hp > 0 && enemy.statuses.resonance >= 2,
      )
    ) {
      primed.add("pulse");
      primed.add("echo-pulse");
    }
    if (selectedEnemy.statuses.fragile > 0 || selectedEnemy.statuses.overload > 0) {
      primed.add("break");
      primed.add("rift-break");
    }
    return primed;
  }, [enemies, selectedEnemy]);

  useEffect(() => {
    const openTarget = aliveEnemies(enemies)[0]?.id;
    if (!enemies.some((enemy) => enemy.id === selectedId && enemy.hp > 0) && openTarget) {
      setSelectedId(openTarget);
    }
  }, [enemies, selectedId]);

  useEffect(() => {
    const unlockedExtras = [...unlocked].filter((id) => EXTRA_SKILLS.includes(id));
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        unlocked: unlockedExtras,
        discovered: [...discovered],
        upgrades: [...upgrades],
        bestChain,
        wins,
      }),
    );
  }, [bestChain, discovered, unlocked, upgrades, wins]);

  useEffect(() => {
    discoveredRef.current = discovered;
  }, [discovered]);

  const playTone = (kind: FxKind, level = 0) => {
    if (muted) {
      return;
    }
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }
    const ctx = audioRef.current ?? new AudioContextCtor();
    audioRef.current = ctx;
    void ctx.resume();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const baseFreq: Record<FxKind, number> = {
      heat: 180,
      shock: 330,
      resonance: 260,
      fragile: 120,
      overload: 520,
      hit: 210,
      flash: 740,
      enemy: 95,
    };
    oscillator.type = kind === "shock" || kind === "flash" ? "square" : "sine";
    oscillator.frequency.setValueAtTime(baseFreq[kind] + level * 24, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      baseFreq[kind] * 1.6 + level * 28,
      ctx.currentTime + 0.08,
    );
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(kind === "flash" ? 0.11 : 0.065, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.2);
  };

  const fireImpact = (kind: FxKind) => {
    setImpact(kind);
    window.setTimeout(() => setImpact(null), kind === "flash" ? 720 : 360);
  };

  const pushEvent = (event: Omit<FxEvent, "id">) => {
    const next = { ...event, id: Date.now() + Math.random() };
    setEvents((current) => [...current, next]);
    window.setTimeout(() => {
      setEvents((current) => current.filter((item) => item.id !== next.id));
    }, 900);
  };

  const pushLog = (entry: Omit<LogEntry, "id">) => {
    setLogs((current) => [{ ...entry, id: Date.now() + Math.random() }, ...current].slice(0, 7));
  };

  const discoverReaction = (id: ReactionId, chainCount = chain) => {
    if (discoveredRef.current.has(id)) {
      return;
    }
    const next = new Set([...discoveredRef.current, id]);
    discoveredRef.current = next;
    setDiscovered(next);
    setReactionFlash(id);
    fireImpact("flash");
    playTone("flash", 5);
    pushLog({ text: `DISCOVER: ${REACTION_META[id].label}`, kind: "flash", chain: chainCount });
    window.setTimeout(() => {
      setReactionFlash((current) => (current === id ? null : current));
    }, 980);
  };

  const maybeInspire = async (skillId: SkillId, chainCount: number, draft: Enemy[]) => {
    if (chainCount < 2) {
      return;
    }
    const candidates: Array<{ id: SkillId; chance: number }> = [];
    const anyHotAndWired = draft.some(
      (enemy) => enemy.hp > 0 && enemy.statuses.heat > 0 && enemy.statuses.shock > 0,
    );
    if (!unlocked.has("flashover") && anyHotAndWired) {
      candidates.push({ id: "flashover", chance: 0.38 });
    }
    if (!unlocked.has("echo-pulse") && (skillId === "pulse" || chainCount >= 3)) {
      candidates.push({ id: "echo-pulse", chance: 0.32 });
    }
    if (
      !unlocked.has("rift-break") &&
      draft.some((enemy) => enemy.statuses.fragile > 0 || enemy.statuses.overload > 0)
    ) {
      candidates.push({ id: "rift-break", chance: 0.3 });
    }
    const firstFlash = [...unlocked].every((id) => BASE_SKILLS.includes(id));
    const found = firstFlash
      ? candidates[0]
      : candidates.find((candidate) => Math.random() < candidate.chance);
    if (!found) {
      return;
    }
    setUnlocked((current) => new Set([...current, found.id]));
    setFlash(found.id);
    fireImpact("flash");
    playTone("flash", chainCount);
    pushLog({ text: `閃き: ${SKILLS[found.id].name}`, kind: "flash", chain: chainCount });
    await sleep(1100);
    setFlash(null);
  };

  const runSkill = async (skillId: SkillId) => {
    if (busy || result) {
      return;
    }
    const targetId = enemies.find((enemy) => enemy.id === selectedId && enemy.hp > 0)
      ? selectedId
      : aliveEnemies(enemies)[0]?.id;
    if (!targetId) {
      return;
    }

    setBusy(true);
    setChain(0);
    setChainFlash(0);
    const draft = cloneEnemies(enemies);
    let localChain = 0;

    const commit = () => setEnemies(cloneEnemies(draft));
    const getEnemy = (id: number) => draft.find((enemy) => enemy.id === id);
    const liveTargets = () => draft.filter((enemy) => enemy.hp > 0);
    const neighborOf = (id: number) => liveTargets().find((enemy) => enemy.id !== id);

    const emit = async (
      target: number | "player" | "all",
      kind: FxKind,
      label: string,
      strong = false,
      displayChain = localChain,
    ) => {
      pushEvent({ targetId: target, kind, label, chain: displayChain });
      pushLog({ text: label, kind, chain: displayChain });
      fireImpact(strong ? kind : "hit");
      playTone(kind, localChain);
      setChain(localChain);
      commit();
      await sleep(strong ? 460 : 260);
    };

    const damage = async (
      id: number,
      amount: number,
      kind: FxKind,
      label: string,
      strong = false,
    ) => {
      const enemy = getEnemy(id);
      if (!enemy || enemy.hp <= 0) {
        return;
      }
      enemy.hp = clamp(enemy.hp - amount, 0, enemy.maxHp);
      await emit(id, kind, `${label} -${amount}`, strong);
    };

    const status = async (
      id: number,
      key: StatusKey,
      amount: number,
      kind: FxKind,
      label: string,
      strong = false,
    ) => {
      const enemy = getEnemy(id);
      if (!enemy || enemy.hp <= 0) {
        return;
      }
      enemy.statuses[key] = clamp(enemy.statuses[key] + amount, 0, 9);
      await emit(id, kind, label, strong);
    };

    const chainUp = () => {
      localChain += 1;
      const flashedChain = localChain;
      setBestChain((current) => Math.max(current, localChain));
      setChainFlash(flashedChain);
      window.setTimeout(() => {
        setChainFlash((current) => (current === flashedChain ? 0 : current));
      }, 720);
    };

    const resolveReactions = async () => {
      let guard = 0;
      let reacted = true;
      while (reacted && guard < 14) {
        reacted = false;
        guard += 1;

        for (const enemy of [...draft]) {
          if (enemy.hp <= 0) {
            continue;
          }

          if (enemy.statuses.shock > 0 && enemy.statuses.heat >= 2) {
            chainUp();
            discoverReaction("flash-conduct", localChain);
            enemy.statuses.shock -= 1;
            enemy.statuses.heat += 1;
            enemy.statuses.resonance += 1;
            await damage(enemy.id, 10 + enemy.statuses.heat * 2, "shock", "Flash Conduct", true);
            reacted = true;
            continue;
          }

          if (enemy.statuses.heat >= 4) {
            chainUp();
            discoverReaction("overload", localChain);
            enemy.statuses.heat -= 3;
            enemy.statuses.overload = clamp(enemy.statuses.overload + 1, 0, 3);
            enemy.statuses.fragile = clamp(enemy.statuses.fragile + 1, 0, 9);
            enemy.statuses.resonance = clamp(enemy.statuses.resonance + 1, 0, 9);
            await damage(enemy.id, 24 + chainUpDamage(localChain), "overload", "OVERLOAD", true);
            const jump = neighborOf(enemy.id);
            if (jump && enemy.statuses.overload > 0) {
              jump.statuses.shock = clamp(jump.statuses.shock + 1, 0, 9);
              jump.statuses.heat = clamp(jump.statuses.heat + 1, 0, 9);
              await emit(jump.id, "shock", "Arc Jump", true);
            }
            reacted = true;
            continue;
          }

          if (enemy.statuses.resonance >= 3) {
            chainUp();
            discoverReaction("wave-spread", localChain);
            enemy.statuses.resonance -= 3;
            await damage(enemy.id, 9 + localChain, "resonance", "Resonance Pulse", true);
            for (const other of draft) {
              if (other.id !== enemy.id && other.hp > 0) {
                other.statuses.resonance = clamp(other.statuses.resonance + 1, 0, 9);
              }
            }
            await emit("all", "resonance", "Wave Spread", true);
            reacted = true;
            continue;
          }

          if (enemy.statuses.fragile >= 3) {
            chainUp();
            discoverReaction("shatter", localChain);
            enemy.statuses.fragile -= 3;
            enemy.statuses.heat = clamp(enemy.statuses.heat + 1, 0, 9);
            await damage(enemy.id, 18 + localChain * 2, "fragile", "Shatter", true);
            const jump = neighborOf(enemy.id);
            if (jump) {
              jump.statuses.fragile = clamp(jump.statuses.fragile + 1, 0, 9);
              await emit(jump.id, "fragile", "Crack Spread", true);
            }
            reacted = true;
            continue;
          }

          if (enemy.statuses.overload > 0 && enemy.statuses.resonance > 0) {
            chainUp();
            discoverReaction("core-echo", localChain);
            enemy.statuses.overload -= 1;
            enemy.statuses.resonance -= 1;
            for (const target of liveTargets()) {
              target.hp = clamp(target.hp - (7 + localChain), 0, target.maxHp);
            }
            await emit("all", "overload", "Core Echo", true);
            reacted = true;
          }
        }
      }
    };

    const base = SKILLS[skillId];
    pushLog({ text: base.name, kind: base.accent, chain: 0 });

    if (skillId === "heat-shot") {
      await damage(targetId, upgrades.has("kindling") ? 15 : 11, "heat", "Heat Shot");
      await status(targetId, "heat", upgrades.has("kindling") ? 3 : 2, "heat", "+Heat");
    }

    if (skillId === "conduct") {
      await damage(targetId, upgrades.has("static-field") ? 11 : 7, "shock", "Conduct");
      await status(targetId, "shock", 2, "shock", "+Shock");
      const target = getEnemy(targetId);
      if (target && target.statuses.heat > 0) {
        target.statuses.heat += 1;
        await emit(targetId, "shock", "Heat catches", true);
      }
      if (upgrades.has("static-field")) {
        const jump = neighborOf(targetId);
        if (jump) {
          jump.statuses.shock = clamp(jump.statuses.shock + 1, 0, 9);
          if (target?.statuses.heat) {
            jump.statuses.heat = clamp(jump.statuses.heat + 1, 0, 9);
          }
          await emit(jump.id, "shock", "Static Field", true);
        }
      }
    }

    if (skillId === "pulse") {
      await damage(targetId, 6, "resonance", "Pulse");
      await status(
        targetId,
        "resonance",
        upgrades.has("echo-chamber") ? 3 : 2,
        "resonance",
        "+Resonance",
      );
      for (const enemy of liveTargets()) {
        if (enemy.id !== targetId) {
          enemy.statuses.resonance = clamp(
            enemy.statuses.resonance + (upgrades.has("echo-chamber") ? 2 : 1),
            0,
            9,
          );
        }
      }
      await emit("all", "resonance", "Pulse Spread", true);
    }

    if (skillId === "break") {
      const target = getEnemy(targetId);
      const crack = target?.statuses.fragile ?? 0;
      await damage(targetId, 12, "fragile", "Break");
      if (crack > 0) {
        await damage(
          targetId,
          16 + crack * 9 + (upgrades.has("fracture-map") ? 10 : 0),
          "fragile",
          "Glass Hit",
          true,
        );
        const targetNow = getEnemy(targetId);
        if (targetNow) {
          targetNow.statuses.fragile = Math.max(0, targetNow.statuses.fragile - 1);
          targetNow.statuses.resonance = clamp(targetNow.statuses.resonance + 1, 0, 9);
        }
        if (upgrades.has("fracture-map")) {
          for (const enemy of liveTargets()) {
            if (enemy.id !== targetId) {
              enemy.statuses.fragile = clamp(enemy.statuses.fragile + 1, 0, 9);
            }
          }
        }
        await emit(targetId, "fragile", "Crack rings", true);
      } else {
        await status(
          targetId,
          "fragile",
          upgrades.has("fracture-map") ? 2 : 1,
          "fragile",
          "+Fragile",
        );
      }
    }

    if (skillId === "flashover") {
      await status(targetId, "heat", 2, "overload", "Flash Heat", true);
      await status(targetId, "shock", 2, "shock", "Flash Shock", true);
      for (const enemy of liveTargets()) {
        if (enemy.id !== targetId && (enemy.statuses.heat > 0 || enemy.statuses.shock > 0)) {
          enemy.statuses.heat = clamp(enemy.statuses.heat + 1, 0, 9);
          enemy.statuses.shock = clamp(enemy.statuses.shock + 1, 0, 9);
          await damage(enemy.id, 8, "shock", "Side Arc", true);
        }
      }
    }

    if (skillId === "echo-pulse") {
      for (const enemy of liveTargets()) {
        enemy.statuses.resonance = clamp(enemy.statuses.resonance + 1, 0, 9);
      }
      await emit("all", "resonance", "Echo Pulse", true);
      await status(targetId, "resonance", 2, "resonance", "Deep Echo", true);
    }

    if (skillId === "rift-break") {
      await status(targetId, "fragile", 2, "fragile", "Rift Mark", true);
      await damage(targetId, 18, "fragile", "Rift Break", true);
      for (const enemy of liveTargets()) {
        if (enemy.id !== targetId) {
          enemy.statuses.fragile = clamp(enemy.statuses.fragile + 1, 0, 9);
        }
      }
      await emit("all", "fragile", "Rift Spread", true);
    }

    await resolveReactions();
    await maybeInspire(skillId, localChain, draft);

    if (liveTargets().length === 0) {
      const nextWins = wins + 1;
      setWins(nextWins);
      setRewardChoices(rewardOptions(upgrades, nextWins));
      setResult("victory");
      pushLog({ text: "CHAIN CLEAR", kind: "flash", chain: localChain });
      fireImpact("flash");
      playTone("flash", localChain + 4);
      setBusy(false);
      return;
    }

    await sleep(220);
    const attackers = liveTargets();
    const incomingRaw = attackers.reduce((sum, enemy) => {
      const dampen = Math.min(3, enemy.statuses.shock + enemy.statuses.fragile);
      return sum + Math.max(2, 6 - dampen);
    }, 0);
    const guard = upgrades.has("chain-guard") && localChain >= 2 ? 5 + localChain : 0;
    const incoming = Math.max(0, incomingRaw - guard);
    if (guard > 0) {
      await emit("player", "overload", "Chain Guard", true, localChain);
    }
    setPlayerHp((current) => clamp(current - incoming, 0, 84));
    await emit("player", "enemy", `Enemy Pulse -${incoming}`, false, 0);

    for (const enemy of draft) {
      enemy.statuses.shock = Math.max(0, enemy.statuses.shock - 1);
      enemy.statuses.resonance = Math.max(0, enemy.statuses.resonance - 1);
      enemy.statuses.overload = Math.max(0, enemy.statuses.overload - 1);
    }
    commit();

    if (playerHp - incoming <= 0) {
      setResult("defeat");
      fireImpact("enemy");
    } else {
      setTurn((current) => current + 1);
    }
    setBusy(false);
  };

  const nextBattle = () => {
    const wave = wins + 1;
    setEnemies(createEnemies(wave));
    setSelectedId(1);
    setPlayerHp((current) => Math.min(84, current + 24));
    setTurn(1);
    setChain(0);
    setChainFlash(0);
    setRewardChoices([]);
    setResult(null);
    setLogs([{ id: Date.now(), text: `WAVE ${wave}`, kind: "hit", chain: 0 }]);
  };

  const chooseUpgrade = (id: UpgradeId) => {
    const upgrade = UPGRADE_META[id];
    setUpgrades((current) => new Set([...current, id]));
    setRewardChoices([]);
    fireImpact("flash");
    playTone("flash", 4);
    nextBattle();
    window.setTimeout(() => {
      pushLog({ text: `TUNE: ${upgrade.label}`, kind: upgrade.kind, chain: 0 });
    }, 0);
  };

  const restart = () => {
    setEnemies(createEnemies(wins + 1));
    setSelectedId(1);
    setPlayerHp(84);
    setTurn(1);
    setChain(0);
    setChainFlash(0);
    setRewardChoices([]);
    setResult(null);
    setBusy(false);
    setLogs([{ id: Date.now(), text: "RESTART", kind: "hit", chain: 0 }]);
  };

  const playerHpPct = clamp((playerHp / 84) * 100, 0, 100);

  return (
    <main className={["game-shell", impact ? `impact-${impact}` : "", busy ? "is-busy" : ""].join(" ")}>
      <section className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>ElementChainer</h1>
            <p>Turn {turn}</p>
            <div className="reaction-strip" aria-label="発見済みリアクション">
              {REACTION_ORDER.map((id) => {
                const reaction = REACTION_META[id];
                const Icon = reaction.Icon;
                const active = discovered.has(id);
                return (
                  <span className={`reaction-chip ${reaction.kind} ${active ? "active" : ""}`} key={id}>
                    <Icon size={13} />
                    {active ? reaction.label : "???"}
                  </span>
                );
              })}
            </div>
            {upgrades.size > 0 && (
              <div className="upgrade-strip" aria-label="現象強化">
                {[...upgrades].map((id) => {
                  const upgrade = UPGRADE_META[id];
                  const Icon = upgrade.Icon;
                  return (
                    <span className={`upgrade-chip ${upgrade.kind}`} key={id}>
                      <Icon size={13} />
                      {upgrade.label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="meters">
          <div className="player-meter">
            <span>CORE</span>
            <div className="hp-track player">
              <span style={{ width: `${playerHpPct}%` }} />
            </div>
          </div>
          <div className="chain-meter">
            <b>{chain}</b>
            <span>CHAIN</span>
          </div>
          <div className="chain-meter best">
            <b>{bestChain}</b>
            <span>BEST</span>
          </div>
          <button
            className={`icon-button ${guideOpen ? "active" : ""}`}
            type="button"
            aria-label={guideOpen ? "相性ガイドを閉じる" : "相性ガイドを開く"}
            aria-pressed={guideOpen}
            onClick={() => setGuideOpen((current) => !current)}
          >
            <CircleHelp size={19} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label={muted ? "音を出す" : "ミュート"}
            onClick={() => setMuted((current) => !current)}
          >
            {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
          </button>
          <button className="icon-button" type="button" aria-label="リスタート" onClick={restart}>
            <RotateCcw size={19} />
          </button>
        </div>
      </section>

      <section className="arena">
        <div className="enemy-grid">
          {enemies.map((enemy) => (
            <EnemyCard
              enemy={enemy}
              events={events.filter(
                (event) => event.targetId === enemy.id || event.targetId === "all",
              )}
              key={enemy.id}
              onSelect={() => setSelectedId(enemy.id)}
              selected={selectedId === enemy.id}
            />
          ))}
        </div>
        <div className="arena-side">
          {guideOpen && <MatchupGuide enemy={selectedEnemy} primedSkills={primedSkills} />}
          <aside className="timeline" aria-live="polite">
            {logs.map((log) => (
              <div className={`timeline-entry ${log.kind}`} key={log.id}>
                <span>{log.chain > 0 ? `x${log.chain}` : ">"}</span>
                <b>{log.text}</b>
              </div>
            ))}
          </aside>
        </div>
      </section>

      <section className="command-dock">
        {availableSkills.map((id) => {
          const skill = SKILLS[id];
          const Icon = skill.Icon;
          return (
            <button
              className={`skill-button ${skill.accent} ${primedSkills.has(id) ? "primed" : ""}`}
              disabled={busy || !!result}
              key={id}
              onClick={() => void runSkill(id)}
              type="button"
            >
              <Icon size={22} />
              <span>{skill.name}</span>
              <small>{skill.chip}</small>
              {primedSkills.has(id) && <Sparkles className="prime-spark" size={15} />}
            </button>
          );
        })}
      </section>

      {flash && (
        <div className="flash-layer" role="status">
          <Sparkles size={42} />
          <span>閃き</span>
          <strong>{SKILLS[flash].name}</strong>
        </div>
      )}

      {chainFlash >= 2 && (
        <div className="chain-surge" aria-hidden="true">
          <span>CHAIN</span>
          <strong>x{chainFlash}</strong>
        </div>
      )}

      {reactionFlash && (
        <div className="reaction-flash" role="status">
          {(() => {
            const reaction = REACTION_META[reactionFlash];
            const Icon = reaction.Icon;
            return (
              <>
                <Icon size={34} />
                <span>DISCOVER</span>
                <strong>{reaction.label}</strong>
              </>
            );
          })()}
        </div>
      )}

      {result && (
        <div className="result-layer">
          <div className={`result-panel ${result}`}>
            <Sparkles size={34} />
            <strong>{result === "victory" ? "CHAIN CLEAR" : "CORE DOWN"}</strong>
            <span>{result === "victory" ? `Wins ${wins}` : "もう一度、連鎖へ"}</span>
            {result === "victory" && rewardChoices.length > 0 ? (
              <div className="reward-grid">
                {rewardChoices.map((id) => {
                  const reward = UPGRADE_META[id];
                  const Icon = reward.Icon;
                  return (
                    <button
                      className={`reward-button ${reward.kind}`}
                      key={id}
                      onClick={() => chooseUpgrade(id)}
                      type="button"
                    >
                      <Icon size={22} />
                      <span>{reward.label}</span>
                      <small>{reward.chip}</small>
                    </button>
                  );
                })}
              </div>
            ) : (
              <button type="button" onClick={result === "victory" ? nextBattle : restart}>
                {result === "victory" ? "NEXT WAVE" : "RETRY"}
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function chainUpDamage(chain: number) {
  return Math.min(18, chain * 3);
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

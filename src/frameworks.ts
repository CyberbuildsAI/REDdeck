// The Frameworks check: did the game change since the last deploy, and which frameworks have a
// newer file on Nexus? A game patch is the usual reason a modded game stops starting, so the
// Frameworks group says so in one line the moment the executable's version differs from the one
// recorded in the manifest.

import type { Manifest } from "./deploy";
import { families } from "./families";
import type { Library, ModInfo } from "./library";

export interface FrameworkCheck {
  /** The game's version now, when the executable was found. */
  game?: string;
  /** The game's version at the last deploy, once a deploy has recorded it. */
  deployed?: string;
  /** True when the game changed since the last deploy. */
  changed: boolean;
  /** The active version of every framework in the library. */
  frameworks: ModInfo[];
  /** Frameworks with a newer file on Nexus. */
  updates: { mod: ModInfo; version: string }[];
  /** Frameworks the Nexus check cannot see: no Nexus id, or never checked. */
  unchecked: ModInfo[];
}

export function checkFrameworks(lib: Library, game: string | undefined, manifest: Pick<Manifest, "gameVersion"> | undefined): FrameworkCheck {
  const fams = families(lib).filter((f) => f.active.kinds.includes("framework"));
  const deployed = manifest?.gameVersion;
  return {
    game,
    deployed,
    changed: !!game && !!deployed && game !== deployed,
    frameworks: fams.map((f) => f.active),
    updates: fams.filter((f) => f.update).map((f) => ({ mod: f.active, version: f.update!.version })),
    unchecked: fams.filter((f) => !f.nexusId || !f.mods.some((m) => m.nexus?.checked)).map((f) => f.active),
  };
}

/** The short phrase after the group's count: "game 2.31", "game updated to 2.31 · 2 updates". */
export function frameworkSummary(c: FrameworkCheck): string {
  if (!c.game) return "";
  const ups = c.updates.length ? `${c.updates.length} update${c.updates.length === 1 ? "" : "s"}` : "";
  if (c.changed) {
    const allUnchecked = c.unchecked.length === c.frameworks.length;
    return `game updated to ${c.game}${ups ? ` · ${ups}` : allUnchecked ? "" : " · no newer files on Nexus"}`;
  }
  return ups ? `game ${c.game} · ${ups}` : `game ${c.game}`;
}

/** The longer explanation, one line per point, for a tooltip. */
export function frameworkDetail(c: FrameworkCheck): string[] {
  const lines: string[] = [];
  if (c.changed) lines.push(`The game is ${c.game} now and was ${c.deployed} at the last deploy. A game patch is the usual reason a modded game stops starting, so each framework needs a build for ${c.game}.`);
  else if (c.game && c.deployed) lines.push(`The game is ${c.game}, the same as at the last deploy.`);
  else if (c.game) lines.push(`The game is ${c.game}. The next deploy records it, so a later patch shows up here.`);
  for (const u of c.updates) lines.push(`${u.mod.name}: ${u.version} is on Nexus, the library has ${u.mod.version}.`);
  if (c.unchecked.length) lines.push(`Not checked on Nexus: ${c.unchecked.map((m) => m.name).join(", ")}.`);
  return lines;
}

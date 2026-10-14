// Sections: how the list is grouped. Frameworks and Mods are built in; a user adds sections of
// their own between them and puts mods in. A section holds families, not versions, so a new version
// stays where the old one was. Sections are display only: the order in library.json still decides
// who wins a conflict, and moving a mod within a section moves it past its neighbour there.

import { families, familyKey, type Family } from "./families";
import { placeAbove, saveLibrary, saveMod, type Library, type ModInfo } from "./library";

export const FrameworksSection = "Frameworks";
export const ModsSection = "Mods";

export interface Section {
  name: string;
  /** False for Frameworks and Mods, which cannot be renamed, moved or deleted. */
  user: boolean;
  families: Family[];
}

function isBuiltIn(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === FrameworksSection.toLowerCase() || n === ModsSection.toLowerCase();
}

/** The section a family sits in: the one it was put in, else Frameworks or Mods by its kinds. */
export function sectionNameOf(lib: Library, fam: Family): string {
  const put = lib.info.sectionOf?.[fam.key];
  if (put === FrameworksSection || put === ModsSection || (put && lib.info.sections?.includes(put))) return put;
  return fam.active.kinds.includes("framework") ? FrameworksSection : ModsSection;
}

/** Every section in display order, each with its families in library order. Frameworks shows only when it has any. */
export function sectionsOf(lib: Library, fams: Family[] = families(lib)): Section[] {
  const names = [FrameworksSection, ...(lib.info.sections ?? []), ModsSection];
  const out = names.map((name) => ({ name, user: !isBuiltIn(name), families: [] as Family[] }));
  const byName = new Map(out.map((s) => [s.name, s]));
  for (const f of fams) byName.get(sectionNameOf(lib, f))!.families.push(f);
  return out.filter((s) => s.name !== FrameworksSection || s.families.length);
}

/** Why a name cannot be a new section's, or undefined when it can. */
export function sectionNameProblem(lib: Library, name: string, renaming?: string): string | undefined {
  const n = name.trim();
  if (!n) return "Give the section a name.";
  if (isBuiltIn(n)) return `${n} is already a section.`;
  if ((lib.info.sections ?? []).some((s) => s.toLowerCase() === n.toLowerCase() && s !== renaming)) return `There is already a section called ${n}.`;
  return undefined;
}

export function addSection(lib: Library, name: string): void {
  const problem = sectionNameProblem(lib, name);
  if (problem) throw new Error(problem);
  lib.info.sections = [...(lib.info.sections ?? []), name.trim()];
  saveLibrary(lib);
}

export function renameSection(lib: Library, from: string, to: string): void {
  const problem = sectionNameProblem(lib, to, from);
  if (problem) throw new Error(problem);
  const name = to.trim();
  lib.info.sections = (lib.info.sections ?? []).map((s) => (s === from ? name : s));
  for (const [k, v] of Object.entries(lib.info.sectionOf ?? {})) if (v === from) lib.info.sectionOf![k] = name;
  saveLibrary(lib);
}

/** Deletes a section; its mods go back to Frameworks or Mods. */
export function deleteSection(lib: Library, name: string): void {
  lib.info.sections = (lib.info.sections ?? []).filter((s) => s !== name);
  for (const [k, v] of Object.entries(lib.info.sectionOf ?? {})) if (v === name) delete lib.info.sectionOf![k];
  saveLibrary(lib);
}

/** Moves a user section up or down among the user sections. */
export function moveSection(lib: Library, name: string, delta: -1 | 1): void {
  const list = [...(lib.info.sections ?? [])];
  const i = list.indexOf(name);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  lib.info.sections = list;
  saveLibrary(lib);
}

/** Puts a mod's family in a section. Putting it back where its kinds would put it clears the entry. */
export function putInSection(lib: Library, mod: ModInfo, name: string): void {
  const key = familyKey(mod);
  const map = { ...(lib.info.sectionOf ?? {}) };
  delete map[key];
  const natural = mod.kinds.includes("framework") ? FrameworksSection : ModsSection;
  if (name !== natural) map[key] = name;
  lib.info.sectionOf = map;
  saveLibrary(lib);
}

/**
 * Moves a mod past its neighbour in its section: up wins against the mod shown above it, down
 * loses to the mod shown below it. Returns false at the edge of the section.
 */
export function moveInSection(lib: Library, mod: ModInfo, delta: -1 | 1): boolean {
  const key = familyKey(mod);
  const fams = families(lib);
  const section = sectionsOf(lib, fams).find((s) => s.families.some((f) => f.key === key));
  if (!section) return false;
  const i = section.families.findIndex((f) => f.key === key);
  const other = section.families[i + delta];
  if (!other) return false;
  const me = section.families[i];
  if (delta < 0) placeAbove(lib, me.active, other.active);
  else placeAbove(lib, other.active, me.active);
  return true;
}

/** Puts a mod directly above or below another in the order, and in that mod's section. */
export function placeNextTo(lib: Library, mod: ModInfo, target: ModInfo, below: boolean): void {
  const fams = families(lib);
  const targetFam = fams.find((f) => f.key === familyKey(target));
  if (targetFam) putInSection(lib, mod, sectionNameOf(lib, targetFam));
  if (familyKey(mod) === familyKey(target)) return;
  const order = lib.info.order.filter((id) => id !== mod.id);
  const t = order.indexOf(target.id);
  if (t < 0) return;
  order.splice(below ? t + 1 : t, 0, mod.id);
  lib.info.order = order;
  const rank = new Map(order.map((id, k) => [id, k]));
  lib.mods.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
  saveLibrary(lib);
}

/** Turns every mod in a section on or off: on is the version the row shows, off is every version. Returns how many changed. */
export function setSectionOn(lib: Library, name: string, on: boolean): number {
  const section = sectionsOf(lib).find((s) => s.name === name);
  let changed = 0;
  for (const f of section?.families ?? []) {
    for (const m of f.mods) {
      const want = on ? m.enabled || m.id === f.active.id : false;
      if (m.enabled !== want) {
        m.enabled = want;
        saveMod(lib, m);
        changed++;
      }
    }
  }
  return changed;
}

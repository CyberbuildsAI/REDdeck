// Extracts mod archives. zip and 7z come through the bundled 7za.exe; rar needs a system 7-Zip or
// WinRAR, because 7za has no rar support and bundling one has license strings attached.

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const ArchiveExtensions = [".zip", ".7z", ".rar"];

export function isArchiveFile(file: string): boolean {
  return ArchiveExtensions.includes(path.extname(file).toLowerCase());
}

/** Where the bundled 7za.exe lives: next to the built extension, or in node_modules during development. */
export function findSevenZip(extensionRoot: string): string | undefined {
  const candidates = [
    path.join(extensionRoot, "bin", "7za.exe"),
    path.join(extensionRoot, "node_modules", "7zip-bin", "win", "x64", "7za.exe"),
  ];
  return candidates.find((c) => fs.existsSync(c));
}

function findRarTool(): { exe: string; args: (file: string, dest: string) => string[] } | undefined {
  const pf = process.env.ProgramFiles ?? "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const sevenZip = [path.join(pf, "7-Zip", "7z.exe"), path.join(pf86, "7-Zip", "7z.exe")].find((p) => fs.existsSync(p));
  if (sevenZip) return { exe: sevenZip, args: (file, dest) => ["x", "-y", `-o${dest}`, file] };
  const unrar = [path.join(pf, "WinRAR", "UnRAR.exe"), path.join(pf86, "WinRAR", "UnRAR.exe")].find((p) => fs.existsSync(p));
  if (unrar) return { exe: unrar, args: (file, dest) => ["x", "-y", "-o+", file, dest + path.sep] };
  return undefined;
}

/** Extracts `file` into `dest` (created if needed). Throws with a readable message when it cannot. */
/**
 * Gets a file ready to classify in `dest`: a zip, 7z or rar is unpacked, any other file (a loose
 * .archive, .reds, .lua and so on) is copied in as it is, for the classifier to place by its type.
 */
export async function unpackOrCopy(file: string, dest: string, sevenZa: string | undefined): Promise<void> {
  if (isArchiveFile(file)) return extractArchive(file, dest, sevenZa);
  fs.mkdirSync(dest, { recursive: true });
  fs.copyFileSync(file, path.join(dest, path.basename(file)));
}

export async function extractArchive(file: string, dest: string, sevenZa: string | undefined): Promise<void> {
  fs.mkdirSync(dest, { recursive: true });
  const ext = path.extname(file).toLowerCase();
  if (ext === ".rar") {
    const tool = findRarTool();
    if (!tool) {
      throw new Error("This is a .rar file. EDGEdeck can open it when 7-Zip (https://7-zip.org) or WinRAR is installed; or re-pack it as .zip.");
    }
    await run(tool.exe, tool.args(file, dest), { windowsHide: true, maxBuffer: 1 << 24 });
    return;
  }
  if (!sevenZa) throw new Error("The bundled 7za.exe is missing. Rebuild the extension (npm run build) to restore it.");
  await run(sevenZa, ["x", "-y", `-o${dest}`, file], { windowsHide: true, maxBuffer: 1 << 24 });
}

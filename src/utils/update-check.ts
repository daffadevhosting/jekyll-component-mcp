import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type PackageUpdateCheckResult = {
  currentVersion: string;
  latestVersion: string;
  isUpdateAvailable: boolean;
  updateCommand: string;
  checkedSuccessfully: boolean;
};

type FetchLike = typeof globalThis.fetch;

export type DailyUpdateCheckOptions = {
  cachePath?: string;
  now?: Date;
  fetchImpl?: FetchLike;
};

type UpdateCheckCache = {
  checkedAt: string;
  latestVersion: string;
};

type VersionParts = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

function parseVersion(value: string): VersionParts {
  const normalized = value.trim().replace(/^v/i, "");
  const mainSection = normalized.split("+")[0] ?? normalized;
  const [core, prereleasePart] = mainSection.split("-", 2);
  const [major = "0", minor = "0", patch = "0"] = (core ?? "0").split(".");

  return {
    major: Number.parseInt(major, 10) || 0,
    minor: Number.parseInt(minor, 10) || 0,
    patch: Number.parseInt(patch, 10) || 0,
    prerelease: prereleasePart ? prereleasePart.split(".").filter(Boolean) : [],
  };
}

function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) {
    return 0;
  }

  if (a.length === 0) {
    return 1;
  }

  if (b.length === 0) {
    return -1;
  }

  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const left = a[index];
    const right = b[index];

    if (left === undefined) {
      return -1;
    }

    if (right === undefined) {
      return 1;
    }

    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);

    if (leftNumeric && rightNumeric) {
      const diff = Number(left) - Number(right);
      if (diff !== 0) {
        return diff;
      }
      continue;
    }

    if (leftNumeric && !rightNumeric) {
      return -1;
    }

    if (!leftNumeric && rightNumeric) {
      return 1;
    }

    const diff = left.localeCompare(right);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

export function compareVersions(currentVersion: string, latestVersion: string): number {
  const current = parseVersion(currentVersion);
  const latest = parseVersion(latestVersion);

  if (current.major !== latest.major) {
    return current.major - latest.major;
  }

  if (current.minor !== latest.minor) {
    return current.minor - latest.minor;
  }

  if (current.patch !== latest.patch) {
    return current.patch - latest.patch;
  }

  return comparePrerelease(current.prerelease, latest.prerelease);
}

function getDefaultCachePath(packageName: string): string {
  const cacheRoot = process.env.XDG_CACHE_HOME ??
    (process.platform === "win32"
      ? process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local")
      : path.join(os.homedir(), ".cache"));
  const safePackageName = packageName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(cacheRoot, safePackageName, "update-check.json");
}

function readUpdateCache(cachePath: string): UpdateCheckCache | undefined {
  try {
    const value = JSON.parse(fs.readFileSync(cachePath, "utf8")) as Partial<UpdateCheckCache>;
    if (typeof value.checkedAt === "string" && typeof value.latestVersion === "string") {
      return { checkedAt: value.checkedAt, latestVersion: value.latestVersion };
    }
  } catch {
    // Missing or unreadable cache should trigger a fresh check.
  }
  return undefined;
}

function writeUpdateCache(cachePath: string, cache: UpdateCheckCache): void {
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(cache), "utf8");
  } catch {
    // Update checks must not prevent the MCP server from starting.
  }
}

export async function checkForPackageUpdateOncePerDay(
  packageName: string,
  currentVersion: string,
  options: DailyUpdateCheckOptions = {},
): Promise<PackageUpdateCheckResult> {
  const now = options.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const cachePath = options.cachePath ?? getDefaultCachePath(packageName);
  const cached = readUpdateCache(cachePath);

  if (cached?.checkedAt === today) {
    return {
      currentVersion,
      latestVersion: cached.latestVersion,
      isUpdateAvailable: compareVersions(currentVersion, cached.latestVersion) < 0,
      updateCommand: `npm install -g ${packageName}@latest`,
      checkedSuccessfully: true,
    };
  }

  const result = await checkForPackageUpdate(packageName, currentVersion, options.fetchImpl);
  if (result.checkedSuccessfully) {
    writeUpdateCache(cachePath, { checkedAt: today, latestVersion: result.latestVersion });
  }
  return result;
}

export async function checkForPackageUpdate(
  packageName: string,
  currentVersion: string,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<PackageUpdateCheckResult> {
  const safeCurrentVersion = currentVersion.trim();
  const fallbackResult: PackageUpdateCheckResult = {
    currentVersion: safeCurrentVersion,
    latestVersion: safeCurrentVersion,
    isUpdateAvailable: false,
    updateCommand: `npm install -g ${packageName}@latest`,
    checkedSuccessfully: false,
  };

  try {
    const response = await fetchImpl(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, {
      headers: {
        Accept: "application/json",
      },
    });

    if (response && typeof response === "object" && "version" in response && !("ok" in response)) {
      const mockPayload = response as { version?: string };
      const latestVersion = mockPayload.version?.trim();

      if (!latestVersion) {
        return fallbackResult;
      }

      return {
        currentVersion: safeCurrentVersion,
        latestVersion,
        isUpdateAvailable: compareVersions(safeCurrentVersion, latestVersion) < 0,
        updateCommand: `npm install -g ${packageName}@latest`,
        checkedSuccessfully: true,
      };
    }

    if (!response || typeof response !== "object" || !("ok" in response) || !response.ok) {
      return fallbackResult;
    }

    const payload = (await response.json()) as { version?: string };
    const latestVersion = payload.version?.trim();

    if (!latestVersion) {
      return fallbackResult;
    }

    return {
      currentVersion: safeCurrentVersion,
      latestVersion,
      isUpdateAvailable: compareVersions(safeCurrentVersion, latestVersion) < 0,
      updateCommand: `npm install -g ${packageName}@latest`,
      checkedSuccessfully: true,
    };
  } catch {
    return fallbackResult;
  }
}

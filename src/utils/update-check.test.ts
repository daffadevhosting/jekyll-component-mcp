import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkForPackageUpdate,
  checkForPackageUpdateOncePerDay,
  compareVersions,
} from "./update-check.js";

describe("version update checks", () => {
  it("detects a newer npm version than the installed package", async () => {
    const result = await checkForPackageUpdate(
      "jekyll-component-mcp",
      "1.1.1",
      async () => ({ version: "1.2.0" }),
    );

    expect(result.isUpdateAvailable).toBe(true);
    expect(result.currentVersion).toBe("1.1.1");
    expect(result.latestVersion).toBe("1.2.0");
  });

  it("compares semver values correctly", () => {
    expect(compareVersions("1.1.1", "1.2.0")).toBeLessThan(0);
    expect(compareVersions("1.2.0", "1.1.1")).toBeGreaterThan(0);
    expect(compareVersions("1.2.0", "1.2.0")).toBe(0);
  });

  it("reuses the update result for the rest of the day and refreshes tomorrow", async () => {
    const cachePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jekyll-mcp-update-")), "cache.json");
    let fetchCount = 0;
    const fetchImpl = async () => {
      fetchCount += 1;
      return { version: "1.2.0" };
    };

    const first = await checkForPackageUpdateOncePerDay("jekyll-component-mcp", "1.1.1", {
      cachePath,
      now: new Date("2026-10-10T08:00:00.000Z"),
      fetchImpl,
    });
    const sameDay = await checkForPackageUpdateOncePerDay("jekyll-component-mcp", "1.1.1", {
      cachePath,
      now: new Date("2026-10-10T18:00:00.000Z"),
      fetchImpl,
    });
    const nextDay = await checkForPackageUpdateOncePerDay("jekyll-component-mcp", "1.1.1", {
      cachePath,
      now: new Date("2026-10-11T08:00:00.000Z"),
      fetchImpl,
    });

    expect(first.isUpdateAvailable).toBe(true);
    expect(sameDay.latestVersion).toBe("1.2.0");
    expect(nextDay.latestVersion).toBe("1.2.0");
    expect(fetchCount).toBe(2);
    fs.rmSync(path.dirname(cachePath), { recursive: true, force: true });
  });

  it("retries on the same day when the registry check fails", async () => {
    const cachePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jekyll-mcp-update-")), "cache.json");
    let fetchCount = 0;
    const fetchImpl = async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        throw new Error("offline");
      }
      return { version: "1.2.0" };
    };
    const options = {
      cachePath,
      now: new Date("2026-10-10T08:00:00.000Z"),
      fetchImpl,
    };

    const failed = await checkForPackageUpdateOncePerDay("jekyll-component-mcp", "1.1.1", options);
    const retried = await checkForPackageUpdateOncePerDay("jekyll-component-mcp", "1.1.1", options);

    expect(failed.isUpdateAvailable).toBe(false);
    expect(retried.isUpdateAvailable).toBe(true);
    expect(fetchCount).toBe(2);
    fs.rmSync(path.dirname(cachePath), { recursive: true, force: true });
  });
});

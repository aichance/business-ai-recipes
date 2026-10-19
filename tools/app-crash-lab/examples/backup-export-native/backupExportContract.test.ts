// App Crash Lab native regression for JobApplicationTracker issue #128.
// Copy this file beside backups.ts and run the project's existing Vitest suite.
// Synthetic PDF-signature fixtures; this does not exercise a PDF renderer/R2.
import { describe, expect, it } from "vitest";
import type { StorageSnapshot } from "../storage/StorageAdapter";
import type { ResumeMetadata } from "../types/application";
import { createBackupFile, parseBackupFile } from "./backups";
import {
  DEFAULT_ANALYTICS_SETTINGS,
  DEFAULT_NOTIFICATION_STATE,
  DEFAULT_USER_SETTINGS,
} from "./domain";
import {
  createResumeUploadResult,
  MAX_RESUME_FILE_BYTES,
} from "./resumeFiles";

async function makeLibrary(count: number, fileBytes: number) {
  const resumes: ResumeMetadata[] = [];
  const resumeFiles: {
    dataBase64: string;
    mimeType: string;
    storageKey: string;
  }[] = [];
  for (let index = 0; index < count; index += 1) {
    const header = `%PDF-1.7\n% Synthetic regression ${index}\n`;
    const contents = header + "0".repeat(fileBytes - header.length);
    const file = new File([contents], `synthetic-${index}.pdf`, {
      type: "application/pdf",
    });
    // Real validator + hash + metadata path; never overwrite File.size.
    const { resume, duplicateOf } = await createResumeUploadResult({
      existingResumes: resumes,
      file,
      options: { displayName: `Synthetic ${index}` },
    });
    expect(duplicateOf).toBeUndefined();
    expect(file.size).toBe(fileBytes);
    resumes.push(resume);
    resumeFiles.push({
      dataBase64: btoa(contents),
      mimeType: "application/pdf",
      storageKey: resume.storageKey,
    });
  }
  const snapshot: StorageSnapshot = {
    activities: [],
    analyticsSettings: DEFAULT_ANALYTICS_SETTINGS,
    applications: [],
    contacts: [],
    coverLetters: [],
    interviews: [],
    notificationState: DEFAULT_NOTIFICATION_STATE,
    resumes,
    settings: DEFAULT_USER_SETTINGS,
    tablePreferences: null,
  };
  return { snapshot, resumeFiles };
}

describe("full backup export/import contract (#128)", () => {
  it.each([
    ["small control", 1, 128],
    ["seven allowed 10 MiB files", 7, MAX_RESUME_FILE_BYTES],
    ["eight allowed 10 MiB files", 8, MAX_RESUME_FILE_BYTES],
  ] as const)("round-trips %s without losing a file", async (label, count, size) => {
    const input = await makeLibrary(count, size);
    const exported = await createBackupFile(input);
    console.info(JSON.stringify({
      case: label,
      rawFileBytes: count * size,
      exportedBytes: exported.size,
    }));
    const file = new File([exported], "synthetic-tracker-backup.json", {
      type: "application/json",
    });
    // Use the real exported Blob, not a hand-built JSON or fake size property.
    const restored = await parseBackupFile(file);
    expect(restored.snapshot.resumes).toEqual(input.snapshot.resumes);
    expect(restored.resumeFiles.length).toBe(input.resumeFiles.length);
    for (const original of input.resumeFiles) {
      const recovered = restored.resumeFiles.find(
        (entry) => entry.storageKey === original.storageKey,
      );
      expect(recovered?.mimeType).toBe(original.mimeType);
      // Boolean comparison avoids printing a 14 MiB payload on a failure.
      expect(recovered?.dataBase64 === original.dataBase64).toBe(true);
    }
  }, 30_000);
});

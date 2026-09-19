export const LECTURE_BUCKET = "lectures";
export const MAX_BYTES = 50 * 1024 * 1024;
export const MAX_TITLE = 120;

// Browsers report MIME types inconsistently (m4a and mov especially), so the
// extension decides. Each maps to a type the bucket allows.
const TYPE_BY_EXT: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  webm: "video/webm",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

// Types only the in-browser recorder produces. Kept out of TYPE_BY_EXT so the file picker's
// accepted list and the on-screen formats label stay as they were.
const RECORDED_TYPE_BY_EXT: Record<string, string> = {
  weba: "audio/webm",
};

export function contentTypeForPath(path: string): string | undefined {
  const ext = extensionOf(path);
  return TYPE_BY_EXT[ext] ?? RECORDED_TYPE_BY_EXT[ext];
}

export const ACCEPT_ATTR = Object.keys(TYPE_BY_EXT).map((e) => `.${e}`).join(",");
export const FORMATS_LABEL = "MP3, M4A, WAV, OGG, WebM, MP4 or MOV";

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function titleFromFilename(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, MAX_TITLE);
}

export type FileCheck =
  | { ok: true; contentType: string; ext: string }
  | { ok: false; message: string };

export function checkFile(file: File): FileCheck {
  const ext = extensionOf(file.name);
  const contentType = contentTypeForPath(file.name);
  if (!contentType) {
    return {
      ok: false,
      message: `“${file.name}” is ${ext ? `a .${ext}` : "an unrecognised"} file. Choose a recording in ${FORMATS_LABEL} format.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, message: `“${file.name}” is empty. Choose a different recording.` };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      message: `“${file.name}” is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_BYTES)}. Trim the recording or export it at a lower quality, then try again.`,
    };
  }
  return { ok: true, contentType, ext };
}

import { Buffer } from "node:buffer";
import type { Dirent, Stats } from "node:fs";
import {
  lstat,
  mkdir,
  readFile as readNodeFile,
  readdir,
  rm,
  writeFile as writeNodeFile
} from "node:fs/promises";
import { FileSystemError, FileType, Uri } from "./types.js";

export interface FileStat {
  type: FileType;
  ctime: number;
  mtime: number;
  size: number;
}

export interface WorkspaceFsApi {
  readFile(uri: unknown): Promise<Uint8Array>;
  writeFile(uri: unknown, content: unknown): Promise<void>;
  stat(uri: unknown): Promise<FileStat>;
  readDirectory(uri: unknown): Promise<Array<[string, FileType]>>;
  createDirectory(uri: unknown): Promise<void>;
  delete(uri: unknown, options?: unknown): Promise<void>;
}

export function createWorkspaceFsApi(): WorkspaceFsApi {
  return {
    async readFile(uri) {
      const filePath = toFilePath(uri);
      try {
        const buffer = await readNodeFile(filePath);
        return new Uint8Array(buffer);
      } catch (error) {
        throw mapNodeFileSystemError(error, uri);
      }
    },

    async writeFile(uri, content) {
      const filePath = toFilePath(uri);
      const bytes = toUint8Array(content);
      try {
        await writeNodeFile(filePath, bytes);
      } catch (error) {
        throw mapNodeFileSystemError(error, uri);
      }
    },

    async stat(uri) {
      const filePath = toFilePath(uri);
      try {
        const stats = await lstat(filePath);
        return {
          type: fileTypeFromStats(stats),
          ctime: stats.ctimeMs,
          mtime: stats.mtimeMs,
          size: stats.size
        };
      } catch (error) {
        throw mapNodeFileSystemError(error, uri);
      }
    },

    async readDirectory(uri) {
      const filePath = toFilePath(uri);
      try {
        const entries = await readdir(filePath, { withFileTypes: true });
        return entries.map((entry): [string, FileType] => [entry.name, fileTypeFromDirent(entry)]);
      } catch (error) {
        throw mapNodeFileSystemError(error, uri);
      }
    },

    async createDirectory(uri) {
      const filePath = toFilePath(uri);
      try {
        await mkdir(filePath, { recursive: true });
      } catch (error) {
        throw mapNodeFileSystemError(error, uri);
      }
    },

    async delete(uri, options) {
      const filePath = toFilePath(uri);
      const recursive = readRecursiveDeleteOption(options);
      try {
        await rm(filePath, { recursive, force: false });
      } catch (error) {
        throw mapNodeFileSystemError(error, uri);
      }
    }
  };
}

function toFilePath(uri: unknown): string {
  if (!(uri instanceof Uri)) {
    throw FileSystemError.Unavailable("workspace.fs expects a Uri");
  }
  if (uri.scheme !== "file") {
    throw FileSystemError.Unavailable(`Not implemented in standalone host: workspace.fs(${uri.scheme})`);
  }
  return uri.fsPath;
}

function toUint8Array(content: unknown): Uint8Array {
  if (content instanceof Uint8Array) {
    return content;
  }
  if (Buffer.isBuffer(content)) {
    return new Uint8Array(content);
  }
  if (isArrayLikeBytes(content)) {
    const bytes = new Uint8Array(content.length);
    for (let index = 0; index < content.length; index += 1) {
      bytes[index] = content[index];
    }
    return bytes;
  }
  throw FileSystemError.Unavailable("workspace.fs.writeFile expects Uint8Array content");
}

function isArrayLikeBytes(value: unknown): value is { length: number; [index: number]: number } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const length = (value as { length?: unknown }).length;
  if (typeof length !== "number" || !Number.isInteger(length) || length < 0) {
    return false;
  }

  const indexed = value as Record<number, unknown>;
  for (let index = 0; index < length; index += 1) {
    const byte = indexed[index];
    if (typeof byte !== "number" || !Number.isInteger(byte) || byte < 0 || byte > 255) {
      return false;
    }
  }

  return true;
}

function readRecursiveDeleteOption(options: unknown): boolean {
  if (typeof options !== "object" || options === null) {
    return false;
  }
  return Boolean((options as { recursive?: unknown }).recursive);
}

function fileTypeFromStats(stats: Stats): FileType {
  if (stats.isFile()) {
    return FileType.File;
  }
  if (stats.isDirectory()) {
    return FileType.Directory;
  }
  if (stats.isSymbolicLink()) {
    return FileType.SymbolicLink;
  }
  return FileType.Unknown;
}

function fileTypeFromDirent(entry: Dirent): FileType {
  if (entry.isFile()) {
    return FileType.File;
  }
  if (entry.isDirectory()) {
    return FileType.Directory;
  }
  if (entry.isSymbolicLink()) {
    return FileType.SymbolicLink;
  }
  return FileType.Unknown;
}

function mapNodeFileSystemError(error: unknown, uri: unknown): FileSystemError {
  if (isNodeFileSystemError(error)) {
    if (error.code === "ENOENT") {
      return FileSystemError.FileNotFound(uri);
    }
    if (error.code === "EEXIST") {
      return FileSystemError.FileExists(uri);
    }
    if (error.code === "EACCES" || error.code === "EPERM") {
      return FileSystemError.NoPermissions(uri);
    }
    if (error.code === "ENOTDIR" || error.code === "EISDIR") {
      return FileSystemError.FileNotADirectory(uri);
    }
    return new FileSystemError(error.message, "Unknown");
  }

  if (error instanceof Error) {
    return new FileSystemError(error.message, "Unknown");
  }
  return new FileSystemError(String(error), "Unknown");
}

function isNodeFileSystemError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && typeof (error as { code?: unknown }).code === "string";
}

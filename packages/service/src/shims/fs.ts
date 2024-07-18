/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from "fs";
import { promises as fsPromises } from "fs";
import type * as vscode from "vscode";

export enum FileType {
  /**
   * File is unknown (neither file, directory nor symbolic link).
   */
  Unknown = 0,

  /**
   * File is a normal file.
   */
  File = 1,

  /**
   * File is a directory.
   */
  Directory = 2,

  /**
   * File is a symbolic link.
   *
   * Note: even when the file is a symbolic link, you can test for
   * `FileType.File` and `FileType.Directory` to know the type of
   * the target the link points to.
   */
  SymbolicLink = 64,
}

export enum FilePermission {
  /**
   * File is readonly.
   */
  Readonly = 1,
}

export interface FileStat {
  /**
   * The file type.
   */
  readonly type: FileType;

  /**
   * The last modification date represented as millis from unix epoch.
   */
  readonly mtime: number;

  /**
   * The creation date represented as millis from unix epoch.
   */
  readonly ctime: number;

  /**
   * The size of the file in bytes.
   */
  readonly size: number;

  /**
   * The file permissions.
   */
  readonly permissions?: FilePermission;
}

// from vscode/src/vs/base/node/pfs.ts
async function symLinkStat(path: string) {
  // First stat the link
  let lstats: fs.Stats | undefined;
  try {
    lstats = await fsPromises.lstat(path);

    // Return early if the stat is not a symbolic link at all
    if (!lstats.isSymbolicLink()) {
      return { stat: lstats };
    }
  } catch (error) {
    /* ignore - use stat() instead */
  }

  // If the stat is a symbolic link or failed to stat, use fs.stat()
  // which for symbolic links will stat the target they point to
  try {
    const stats = await fsPromises.stat(path);

    return {
      stat: stats,
      symbolicLink: lstats?.isSymbolicLink() ? { dangling: false } : undefined,
    };
  } catch (error) {
    // If the link points to a nonexistent file we still want
    // to return it as result while setting dangling: true flag
    if (error.code === "ENOENT" && lstats) {
      return { stat: lstats, symbolicLink: { dangling: true } };
    }

    // Windows: workaround a node.js bug where reparse points
    // are not supported (https://github.com/nodejs/node/issues/36790)
    if (process.platform === "win32" && error.code === "EACCES") {
      try {
        const stats = await fsPromises.stat(await fsPromises.readlink(path));

        return { stat: stats, symbolicLink: { dangling: false } };
      } catch (error) {
        // If the link points to a nonexistent file we still want
        // to return it as result while setting dangling: true flag
        if (error.code === "ENOENT" && lstats) {
          return { stat: lstats, symbolicLink: { dangling: true } };
        }

        throw error;
      }
    }

    throw error;
  }
}

function toType(entry: fs.Stats, symbolicLink?: { dangling: boolean }): FileType {
  // Signal file type by checking for file / directory, except:
  // - symbolic links pointing to nonexistent files are FileType.Unknown
  // - files that are neither file nor directory are FileType.Unknown
  let type: FileType;
  if (symbolicLink?.dangling) {
    type = FileType.Unknown;
  } else if (entry.isFile()) {
    type = FileType.File;
  } else if (entry.isDirectory()) {
    type = FileType.Directory;
  } else {
    type = FileType.Unknown;
  }

  // Always signal symbolic link as file type additionally
  if (symbolicLink) {
    type |= FileType.SymbolicLink;
  }

  return type;
}

export function createFileSystemShim() {
  return {
    async stat(uri: vscode.Uri): Promise<FileStat> {
      const { stat, symbolicLink } = await symLinkStat(uri.fsPath); // cannot use fs.stat() here to support links properly
      return {
        type: toType(stat, symbolicLink),
        ctime: stat.birthtime.getTime(), // intentionally not using ctime here, we want the creation time
        mtime: stat.mtime.getTime(),
        size: stat.size,
      };
    },
  };
}

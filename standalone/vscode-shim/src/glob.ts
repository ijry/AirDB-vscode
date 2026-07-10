import path from "node:path";

export function createGlobMatcher(basePath: string, globPattern: string): (filePath: string) => boolean {
  const normalizedBasePath = normalizePath(path.resolve(basePath));
  const expression = globToRegExp(normalizePath(globPattern || "**/*"));

  return (filePath: string): boolean => {
    const normalizedPath = normalizePath(path.resolve(filePath));
    if (normalizedPath !== normalizedBasePath && !normalizedPath.startsWith(`${normalizedBasePath}/`)) {
      return false;
    }
    const relativePath = normalizePath(path.relative(basePath, filePath));
    return relativePath.length > 0 && expression.test(relativePath);
  };
}

function globToRegExp(globPattern: string): RegExp {
  let source = "";

  for (let index = 0; index < globPattern.length; index += 1) {
    const char = globPattern[index];
    if (char === "*" && globPattern.slice(index, index + 3) === "**/") {
      source += "(?:.*/)?";
      index += 2;
      continue;
    }
    if (char === "*" && globPattern[index + 1] === "*") {
      source += ".*";
      index += 1;
      continue;
    }
    if (char === "*") {
      source += "[^/]*";
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    if (char === "{") {
      const end = globPattern.indexOf("}", index + 1);
      if (end !== -1) {
        source += braceAlternationToRegExp(globPattern.slice(index + 1, end));
        index = end;
        continue;
      }
    }
    if (char === "[") {
      const end = globPattern.indexOf("]", index + 1);
      if (end !== -1) {
        source += characterGroupToRegExp(globPattern.slice(index + 1, end));
        index = end;
        continue;
      }
    }
    source += escapeRegExp(char);
  }

  return new RegExp(`^${source}$`);
}

function braceAlternationToRegExp(value: string): string {
  const alternatives = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(escapeRegExp);
  return alternatives.length > 0 ? `(?:${alternatives.join("|")})` : "\\{\\}";
}

function characterGroupToRegExp(value: string): string {
  if (!value) {
    return "\\[\\]";
  }
  const negated = value.startsWith("!");
  const body = negated ? value.slice(1) : value;
  return `[${negated ? "^" : ""}${body.replace(/\\/g, "\\\\").replace(/\]/g, "\\]")}]`;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

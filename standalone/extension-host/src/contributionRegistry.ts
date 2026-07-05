import { createNotification } from "@airdb-standalone/protocol";
import type { ExtensionManifest } from "./manifest.js";
import { getExtensionId } from "./manifest.js";

export interface RegisteredContribution {
  extensionId: string;
  manifest: ExtensionManifest;
}

export class ContributionRegistry {
  private readonly contributions: RegisteredContribution[] = [];

  register(manifest: ExtensionManifest): RegisteredContribution {
    const contribution = {
      extensionId: getExtensionId(manifest),
      manifest
    };
    this.contributions.push(contribution);
    return contribution;
  }

  all(): RegisteredContribution[] {
    return [...this.contributions];
  }

  toNotification() {
    return createNotification("extension.registerContributions", {
      extensions: this.contributions
    });
  }
}

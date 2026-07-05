import type { HostResponse } from "./messages";

interface PendingRequest<TPayload> {
  resolve: (value: TPayload) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class RequestStore {
  private pending = new Map<string, PendingRequest<unknown>>();

  register<TPayload>(id: string, timeoutMs: number): Promise<TPayload> {
    return new Promise<TPayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for host response ${id}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer
      });
    });
  }

  resolve(response: HostResponse): boolean {
    const pending = this.pending.get(response.id);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timer);
    this.pending.delete(response.id);

    if (response.ok) {
      pending.resolve(response.payload);
    } else {
      pending.reject(new Error(response.error ?? `Host request failed: ${response.id}`));
    }

    return true;
  }

  size(): number {
    return this.pending.size;
  }
}

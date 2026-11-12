export interface PendingPageJump {
  fileId?: string;
  page: number;
  type?: string;
  timestamp: number;
}

const JUMP_TTL_MS = 15000;
let pendingJump: PendingPageJump | null = null;

function isFresh(jump: PendingPageJump | null): jump is PendingPageJump {
  if (!jump) return false;
  if (Date.now() - jump.timestamp > JUMP_TTL_MS) {
    pendingJump = null;
    return false;
  }
  return true;
}

/**
 * Records a pending citation jump target and broadcasts `quill:jump-to-page`
 * so both already-mounted renderers and async-mounting/loading renderers jump accurately.
 */
export function dispatchPageJump(params: {
  fileId?: string;
  page: number;
  type?: string;
}) {
  if (typeof window === "undefined") return;
  const page = Math.max(1, Math.floor(params.page));
  if (!Number.isFinite(page) || page < 1) return;

  pendingJump = {
    fileId: params.fileId || undefined,
    page,
    type: params.type || "page",
    timestamp: Date.now(),
  };

  window.dispatchEvent(
    new CustomEvent("quill:jump-to-page", {
      detail: {
        fileId: params.fileId || undefined,
        page,
        type: params.type || "page",
      },
    })
  );
}

/**
 * Checks without clearing whether there is an active pending jump for this renderer.
 */
export function peekPendingPageJump(fileId?: string): PendingPageJump | null {
  if (!isFresh(pendingJump)) return null;
  if (pendingJump.fileId && fileId && pendingJump.fileId !== fileId) {
    return null;
  }
  return pendingJump;
}

/**
 * Reads and clears any pending citation jump once the target renderer has finished
 * loading its pages/slides and can clamp and navigate to the exact page/slide.
 */
export function consumePendingPageJump(fileId?: string): PendingPageJump | null {
  const match = peekPendingPageJump(fileId);
  if (!match) return null;
  pendingJump = null;
  return match;
}

/**
 * Clears a pending jump explicitly (e.g., when a jump event is handled synchronously).
 */
export function clearPendingPageJump(fileId?: string) {
  if (!pendingJump) return;
  if (!pendingJump.fileId || !fileId || pendingJump.fileId === fileId) {
    pendingJump = null;
  }
}


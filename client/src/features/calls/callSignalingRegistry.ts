import type { CallSignalPayload } from "@linkr/shared";

/** Lets SocketProvider early handlers invoke CallProvider logic before/without socket bind (3.1.11). */
export interface CallSignalingHandlers {
  onAccept?: (payload: CallSignalPayload) => void;
  onRinging?: (payload: CallSignalPayload) => void;
}

let handlers: CallSignalingHandlers = {};

export function setCallSignalingHandlers(next: CallSignalingHandlers): void {
  handlers = next;
}

export function clearCallSignalingHandlers(): void {
  handlers = {};
}

export function dispatchCallAccept(payload: CallSignalPayload): void {
  handlers.onAccept?.(payload);
}

export function dispatchCallRinging(payload: CallSignalPayload): void {
  handlers.onRinging?.(payload);
}

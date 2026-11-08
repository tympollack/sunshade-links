/**
 * Ambient type definitions for Cloudflare Workers runtime
 */

declare interface KVNamespace {
  get(key: string, options?: { type?: "text" | "json" | "arrayBuffer" | "stream" }): Promise<any>;
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expirationTtl?: number; expiration?: number; metadata?: any }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: Array<{ name: string; expiration?: number; metadata?: any }>; list_complete: boolean; cursor?: string }>;
}

declare interface Queue<T = any> {
  send(message: T, options?: { contentType?: string; delaySeconds?: number }): Promise<void>;
  sendBatch(messages: Array<{ body: T; delaySeconds?: number }>): Promise<void>;
}

declare interface Message<T = any> {
  readonly id: string;
  readonly timestamp: Date;
  readonly body: T;
  retry(): void;
  ack(): void;
}

declare interface MessageBatch<T = any> {
  readonly queue: string;
  readonly messages: readonly Message<T>[];
  retryAll(): void;
  ackAll(): void;
}

declare interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

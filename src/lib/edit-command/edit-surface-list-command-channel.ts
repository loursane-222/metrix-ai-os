export type ListEditSurfaceDescriptor<TState> = Readonly<{ token: string; entityId: string; state: TState }>;

export function createEditSurfaceListCommandChannel<TCommand, TResult, TState, TRuntime extends { getState(): TState }>(params: {
  domain: string; tokenPrefix: string; applyCommand: (command: TCommand, runtime: TRuntime) => Promise<TResult> | TResult;
  notFoundResult: () => TResult; staleResult: () => TResult; failureResult: (message: string) => TResult;
}) {
  if (!params.domain.trim()) throw new Error("Edit surface list channel domain is required.");
  const targets = new Map<string, { token: string; runtime: TRuntime }>(); let tokenCounter = 0;
  return Object.freeze({
    register(input: { entityId: string; runtime: TRuntime }): string { tokenCounter += 1; const token = `${params.tokenPrefix}_${tokenCounter}`; targets.set(input.entityId, { token, runtime: input.runtime }); return token; },
    unregister(token: string): void { for (const [entityId, target] of targets) if (target.token === token) { targets.delete(entityId); return; } },
    invalidate(): void { targets.clear(); },
    getDescriptors(): ReadonlyArray<ListEditSurfaceDescriptor<TState>> { return [...targets].map(([entityId, target]) => ({ token: target.token, entityId, state: target.runtime.getState() })); },
    resetForTests(): void { targets.clear(); tokenCounter = 0; },
    async dispatchByEntityId(entityId: string, command: TCommand, expectedToken?: string): Promise<TResult> { const target = targets.get(entityId); if (!target) return params.notFoundResult(); if (expectedToken && target.token !== expectedToken) return params.staleResult(); try { return await params.applyCommand(command, target.runtime); } catch (error) { return params.failureResult(error instanceof Error ? error.message : "Bilinmeyen hata."); } },
  });
}

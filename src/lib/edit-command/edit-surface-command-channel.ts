export type EditSurfaceDescriptor = Readonly<{ token: string; entityId: string; activeTab: string }>;

export function createEditSurfaceCommandChannel<TCommand, TResult, TRuntime extends { getState(): { activeTab: string } }>(params: {
  domain: string;
  tokenPrefix: string;
  applyCommand: (command: TCommand, runtime: TRuntime) => Promise<TResult> | TResult;
  staleResult: () => TResult;
  failureResult: (message: string) => TResult;
}) {
  if (!params.domain.trim()) throw new Error("Edit surface channel domain is required.");
  let activeTarget: { token: string; entityId: string; runtime: TRuntime } | null = null;
  let tokenCounter = 0;
  return Object.freeze({
    register(input: { entityId: string; runtime: TRuntime }): string {
      tokenCounter += 1;
      const token = `${params.tokenPrefix}_${tokenCounter}`;
      activeTarget = { token, entityId: input.entityId, runtime: input.runtime };
      return token;
    },
    unregister(token: string): void { if (activeTarget?.token === token) activeTarget = null; },
    invalidate(): void { activeTarget = null; },
    getDescriptor(): EditSurfaceDescriptor | null {
      if (!activeTarget) return null;
      return { token: activeTarget.token, entityId: activeTarget.entityId, activeTab: activeTarget.runtime.getState().activeTab };
    },
    resetForTests(): void { activeTarget = null; tokenCounter = 0; },
    async dispatch(token: string, command: TCommand): Promise<TResult> {
      const target = activeTarget;
      if (!target || target.token !== token) return params.staleResult();
      try { return await params.applyCommand(command, target.runtime); }
      catch (error) { return params.failureResult(error instanceof Error ? error.message : "Bilinmeyen hata."); }
    },
  });
}

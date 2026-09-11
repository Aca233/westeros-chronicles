import type { ItemSystemState } from './types';

/**
 * Item-system reducer for consuming one or more units/charges from an existing
 * instance. Callers are responsible for domain-specific access and purpose
 * validation before invoking it. The input state is never mutated.
 */
export function consumeItemInstance(
  state: ItemSystemState,
  instanceId: string,
  amount = 1,
): ItemSystemState {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('消耗数量必须是正整数');
  const current = state.instances[instanceId];
  if (!current) throw new Error(`物品实例不存在：${instanceId}`);
  const next = structuredClone(state);
  const instance = next.instances[instanceId];
  if (instance.charges !== undefined) {
    if (instance.charges < amount) throw new Error('物品剩余次数不足');
    instance.charges -= amount;
    return next;
  }
  if (instance.quantity < amount) throw new Error('物品数量不足');
  instance.quantity -= amount;
  if (instance.quantity === 0) {
    delete next.instances[instanceId];
    delete next.placements[instanceId];
  }
  return next;
}

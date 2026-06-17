import { invoke } from '@tauri-apps/api/core';

export type TauriCommandArgs = Record<string, unknown> | undefined;

export async function runTauriCommand<T = unknown>(
  command: string,
  args?: TauriCommandArgs,
): Promise<T> {
  return invoke<T>(command, args);
}

export async function runNativeBridgeCommand<T = unknown>(
  command: string,
  payload?: unknown,
): Promise<T> {
  return runTauriCommand<T>(
    `plugin:native-bridge|${command}`,
    payload === undefined ? undefined : { payload },
  );
}

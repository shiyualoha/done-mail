import { reactive } from 'vue';

export type ConfirmIntent = 'primary' | 'danger';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  intent?: ConfirmIntent;
}

interface ConfirmState extends Required<ConfirmOptions> {
  open: boolean;
  resolver: ((confirmed: boolean) => void) | null;
}

export const confirmState = reactive<ConfirmState>({
  open: false,
  title: '',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  intent: 'primary',
  resolver: null
});

export function confirmDialog(options: ConfirmOptions) {
  if (confirmState.resolver) confirmState.resolver(false);
  confirmState.open = true;
  confirmState.title = options.title;
  confirmState.message = options.message;
  confirmState.confirmText = options.confirmText || '确定';
  confirmState.cancelText = options.cancelText || '取消';
  confirmState.intent = options.intent || 'primary';

  return new Promise<boolean>((resolve) => {
    confirmState.resolver = (confirmed) => {
      resolve(confirmed);
    };
  });
}

export function resolveConfirm(confirmed: boolean) {
  const resolver = confirmState.resolver;
  confirmState.open = false;
  confirmState.resolver = null;
  resolver?.(confirmed);
}

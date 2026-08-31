export interface ToastMessage {
  id: number;
  text: string;
  tone: 'error' | 'success';
}

type Listener = (toast: ToastMessage) => void;

let nextId = 1;
const listeners = new Set<Listener>();

export function onToast(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function showToast(text: string, tone: ToastMessage['tone'] = 'error') {
  const toast: ToastMessage = { id: nextId++, text, tone };
  listeners.forEach((fn) => fn(toast));
}

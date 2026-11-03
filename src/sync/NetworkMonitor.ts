export class NetworkMonitor {
  private listeners: ((online: boolean) => void)[] = [];
  private online = navigator.onLine;

  constructor() {
    window.addEventListener('online', () => this.notify(true));
    window.addEventListener('offline', () => this.notify(false));
    this.initCapacitor();
  }

  private async initCapacitor() {
    const cap = (window as any).Capacitor;
    const Network = cap?.Plugins?.Network;
    if (!Network) return; // web-режим
    try {
      const status = await Network.getStatus();
      this.online = status.connected;
      this.notify(status.connected);
      Network.addListener('networkStatusChange', (s: any) => {
        this.online = s.connected;
        this.notify(s.connected);
      });
    } catch {
      // ignore
    }
  }

  isOnline(): boolean {
    return this.online;
  }

  subscribe(cb: (online: boolean) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify(online: boolean) {
    this.online = online;
    this.listeners.forEach((cb) => cb(online));
  }
}

export const networkMonitor = new NetworkMonitor();
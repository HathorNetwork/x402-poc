export {};

declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: <T = any>(args: {
        method: string;
        params?: any;
      }) => Promise<T>;
      on?: (eventName: string, handler: (...args: any[]) => void) => void;
      removeListener?: (eventName: string, handler: (...args: any[]) => void) => void;
    };
  }
}

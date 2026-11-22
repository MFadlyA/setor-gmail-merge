declare module "@opennextjs/cloudflare" {
  export function initOpenNextCloudflareForDev(options?: any): Promise<void>;
  export function defineCloudflareConfig(config?: any): any;
  export function getCloudflareContext(options?: any): Promise<any>;
  export function getDeploymentId(): string | undefined;
}

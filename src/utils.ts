export const rpcUrl = (): string => {
    const productionApi = 'https://rpc.particle.network';
    const developmentApi = 'https://rpc-debug.particle.network';
    //@ts-ignore
    const dev = typeof window !== 'undefined' && window.__PARTICLE_ENVIRONMENT__ === 'development';
    return dev ? developmentApi : productionApi;
};

export function payloadId(): number {
    const date = Date.now() * Math.pow(10, 3);
    const extra = Math.floor(Math.random() * Math.pow(10, 3));
    return date + extra;
}

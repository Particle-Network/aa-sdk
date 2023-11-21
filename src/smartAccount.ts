import axios from 'axios';
import type {
    Account,
    AccountConfig,
    FeeQuotesResponse,
    IEthereumProvider,
    RequestArguments,
    SendTransactionParams,
    SmartAccountConfig,
    Transaction,
    UserOp,
    UserOpBundle,
    UserOpParams,
} from './types';
import { SmartAccountType } from './types';
import { payloadId, rpcUrl } from './utils';

export class SmartAccount {
    private connection;

    private smartAccountType = SmartAccountType.BICONOMY;

    constructor(public provider: IEthereumProvider, private config: SmartAccountConfig) {
        if (this.config.aaOptions.biconomy && this.config.aaOptions.biconomy.length > 0) {
            this.smartAccountType = SmartAccountType.BICONOMY;
        } else if (this.config.aaOptions.cyberConnect && this.config.aaOptions.cyberConnect.length > 0) {
            this.smartAccountType = SmartAccountType.CYBERCONNECT;
        } else if (this.config.aaOptions.simple && this.config.aaOptions.simple.length > 0) {
            this.smartAccountType = SmartAccountType.SIMPLE;
        } else {
            throw new Error('aaOptions is not configured correctly');
        }

        this.connection = axios.create({
            baseURL: `${rpcUrl()}/evm-chain`,
            timeout: 60_000,
        });

        this.connection.interceptors.request.use((config) => {
            if (config?.data?.method) {
                config.baseURL = `${config.baseURL}${config.baseURL?.includes('?') ? '&' : '?'}method=${
                    config?.data?.method
                }`;
            }
            return config;
        });
    }

    setSmartAccountType(type: SmartAccountType) {
        this.smartAccountType = type;
    }

    private getChainId = async (): Promise<string> => {
        return await this.provider.request({ method: 'eth_chainId' });
    };

    private async getAccountConfig(): Promise<AccountConfig> {
        const chainId = await this.getChainId();
        const apiKey = await this.getPaymasterApiKey();
        const ownerAddress = (await this.provider.request({ method: 'eth_accounts' }))[0];
        if (this.smartAccountType === SmartAccountType.BICONOMY) {
            const networkConfig = this.config.aaOptions.biconomy?.find((item) => item.chainId === Number(chainId));
            if (networkConfig) {
                return {
                    name: SmartAccountType.BICONOMY,
                    version: networkConfig.version,
                    biconomyApiKey: apiKey,
                    ownerAddress,
                };
            }
        } else if (this.smartAccountType === SmartAccountType.CYBERCONNECT) {
            const networkConfig = this.config.aaOptions.cyberConnect?.find((item) => item.chainId === Number(chainId));
            if (networkConfig) {
                return {
                    name: SmartAccountType.CYBERCONNECT,
                    version: networkConfig.version,
                    biconomyApiKey: apiKey,
                    ownerAddress,
                };
            }
        } else if (this.smartAccountType === SmartAccountType.SIMPLE) {
            const networkConfig = this.config.aaOptions.simple?.find((item) => item.chainId === Number(chainId));
            if (networkConfig) {
                return {
                    name: SmartAccountType.SIMPLE,
                    version: networkConfig.version,
                    biconomyApiKey: apiKey,
                    ownerAddress,
                };
            }
        } else {
            throw new Error(`smart account type error, unsupport type: ${this.smartAccountType}`);
        }
        throw new Error(`Current chain is not supported, chainId: ${chainId}, please configure it first`);
    }

    async getPaymasterApiKey(): Promise<string | undefined> {
        const chainId = await this.getChainId();
        const apiKeyConfig = this.config.aaOptions.paymasterApiKeys?.find((item) => item.chainId === Number(chainId));
        return apiKeyConfig?.apiKey;
    }

    async getFeeQuotes(tx: Transaction | Transaction[]): Promise<FeeQuotesResponse> {
        const accountConfig = await this.getAccountConfig();
        return this.sendRpc<FeeQuotesResponse>({
            method: 'particle_aa_getFeeQuotes',
            params: [accountConfig, Array.isArray(tx) ? tx : [tx]],
        });
    }

    async buildUserOperation({ tx, feeQuote, tokenPaymasterAddress }: UserOpParams): Promise<UserOpBundle> {
        const accountConfig = await this.getAccountConfig();
        return await this.sendRpc<UserOpBundle>({
            method: 'particle_aa_createUserOp',
            params: [accountConfig, Array.isArray(tx) ? tx : [tx], feeQuote, tokenPaymasterAddress].filter(
                (val) => !!val
            ),
        });
    }

    async signUserOperation({ userOpHash, userOp }: UserOpBundle): Promise<UserOp> {
        const eoas = await this.provider.request({ method: 'eth_accounts' });
        const signature = await this.provider.request({
            method: 'personal_sign',
            params: [userOpHash, eoas[0]],
        });
        return { ...userOp, signature };
    }

    async sendUserOperation({ userOpHash, userOp }: UserOpBundle): Promise<string> {
        const signedUserOp = await this.signUserOperation({ userOpHash, userOp });
        return this.sendSignedUserOperation(signedUserOp);
    }

    async sendSignedUserOperation(userOp: UserOp): Promise<string> {
        const accountConfig = await this.getAccountConfig();
        return this.sendRpc<string>({
            method: 'particle_aa_sendUserOp',
            params: [accountConfig, userOp],
        });
    }

    async sendTransaction(params: SendTransactionParams): Promise<string> {
        if (
            Object.prototype.hasOwnProperty.call(params, 'userOpHash') &&
            Object.prototype.hasOwnProperty.call(params, 'userOp')
        ) {
            const { userOpHash, userOp } = params as UserOpBundle;
            if (userOpHash && userOp) {
                return this.sendUserOperation({ userOpHash, userOp });
            }
        }

        const { tx, feeQuote, tokenPaymasterAddress } = params as UserOpParams;
        const userOpBundle = await this.buildUserOperation({ tx, feeQuote, tokenPaymasterAddress });
        return this.sendUserOperation(userOpBundle);
    }

    async getAccount(): Promise<Account> {
        const accountConfig = await this.getAccountConfig();
        const accounts = await this.sendRpc<Account[]>({
            method: 'particle_aa_getSmartAccount',
            params: [accountConfig],
        });
        return accounts[0];
    }

    async getAddress(): Promise<string> {
        const eoas = await this.provider.request({ method: 'eth_accounts' });
        if (!eoas || eoas.length === 0) {
            return '';
        }
        const accountConfig = await this.getAccountConfig();
        const localKey = `particle_${accountConfig.name}_${accountConfig.version}_${eoas[0]}`;
        if (typeof window !== 'undefined' && localStorage) {
            const localAA = localStorage.getItem(localKey);
            if (localAA) {
                return localAA;
            }
        }

        const account = await this.getAccount();
        const address = account.smartAccountAddress;
        if (typeof window !== 'undefined' && localStorage) {
            localStorage.setItem(localKey, address);
        }
        return address;
    }

    async getOwner(): Promise<string> {
        const eoas = await this.provider.request({ method: 'eth_accounts' });
        return eoas[0];
    }

    async isDeployed(): Promise<boolean> {
        const account = await this.getAccount();
        return account.isDeployed;
    }

    async deployWalletContract(): Promise<string> {
        return this.sendTransaction({
            tx: {
                to: '0x0000000000000000000000000000000000000000',
                data: '0x',
            },
        });
    }

    async sendRpc<T>(arg: RequestArguments): Promise<T> {
        const chainId = await this.getChainId();
        const response = await this.connection
            .post(
                '',
                {
                    ...arg,
                    id: payloadId(),
                    jsonrpc: '2.0',
                },
                {
                    params: {
                        chainId: Number(chainId),
                        projectUuid: this.config.projectId,
                        projectKey: this.config.clientKey,
                    },
                }
            )
            .then((res) => res.data);
        if (response.error) {
            return Promise.reject(response.error);
        } else {
            return response.result;
        }
    }
}

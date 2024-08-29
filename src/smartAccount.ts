import axios from 'axios';
import { Hex, hashMessage } from 'viem';
import type {
    Account,
    AccountConfig,
    AccountContract,
    CreateSessionKeyOptions,
    FeeQuotesResponse,
    IEthereumProvider,
    PasskeyProvider,
    PasskeySignerParams,
    RequestArguments,
    SendTransactionParams,
    SessionKey,
    SessionKeySignerParams,
    SignUserOpHashResult,
    SignUserOpResult,
    SmartAccountConfig,
    Transaction,
    UserOp,
    UserOpBundle,
    UserOpParams,
} from './types';
import { payloadId, rpcUrl } from './utils';

const loadAccountPromise = new Map<string, Promise<Account>>();

export class SmartAccount {
    private connection;

    private smartAccountContract: AccountContract;

    constructor(public provider: IEthereumProvider & Partial<PasskeyProvider>, private config: SmartAccountConfig) {
        if (!this.config.projectId || !this.config.clientKey || !this.config.appId) {
            throw new Error('invalid project config');
        }
        if (!this.config.aaOptions.accountContracts) {
            throw new Error('invalid AA contract config');
        }
        const name = Object.keys(this.config.aaOptions.accountContracts)[0];
        const version = this.config.aaOptions.accountContracts[name]?.[0]?.version;
        if (!name || !version) {
            throw new Error('invalid AA name or version');
        }
        this.smartAccountContract = {
            name,
            version,
        };

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

    setSmartAccountContract(contract: AccountContract) {
        const accountContract = this.config.aaOptions.accountContracts[contract.name];
        if (
            !accountContract ||
            accountContract.length === 0 ||
            accountContract.every((item) => item.version !== contract.version)
        ) {
            throw new Error('Please configure the smart account contract first');
        }
        this.smartAccountContract = contract;
    }

    getChainId = async (): Promise<string> => {
        return await this.provider.request({ method: 'eth_chainId' });
    };

    getOwner = async (): Promise<string> => {
        const eoas = await this.provider.request({ method: 'eth_accounts' });
        return eoas[0];
    };

    signUserOpHash = async (userOpHash: Hex): Promise<SignUserOpHashResult> => {
        if (this.provider.isPasskey) {
            let message = userOpHash;
            if (this.smartAccountContract.name !== 'COINBASE') {
                message = hashMessage({
                    raw: userOpHash,
                });
            }
            const result = await this.provider.signMessage!(message);
            return result;
        } else {
            const eoa = await this.getOwner();
            const signature = await this.provider.request({
                method: 'personal_sign',
                params: [userOpHash, eoa],
            });
            return { signature };
        }
    };

    private async getAccountConfig(): Promise<AccountConfig> {
        const accountContract = this.config.aaOptions.accountContracts[this.smartAccountContract.name];
        if (!accountContract || accountContract.every((item) => item.version !== this.smartAccountContract.version)) {
            throw new Error('Please configure the smart account contract first');
        }

        const ownerAddress = await this.getOwner();
        let passkeyOption;
        if (this.provider.isPasskey) {
            passkeyOption = await this.provider.getPasskeyOption?.();
        }

        return {
            name: this.smartAccountContract.name,
            version: this.smartAccountContract.version,
            ownerAddress,
            options: passkeyOption
                ? {
                      passkeyOption,
                  }
                : undefined,
        };
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

    async signUserOperation({ userOpHash, userOp }: UserOpBundle): Promise<SignUserOpResult> {
        const { signature, passkeyVerifyData } = await this.signUserOpHash(userOpHash as Hex);
        return {
            userOp: { ...userOp, signature },
            passkeySigner: passkeyVerifyData ? { passkeyVerifyData } : undefined,
        };
    }

    async sendUserOperation({ userOpHash, userOp }: UserOpBundle): Promise<string> {
        const { userOp: signedUserOp, passkeySigner } = await this.signUserOperation({ userOpHash, userOp });
        return this.sendSignedUserOperation(signedUserOp, passkeySigner);
    }

    async sendSignedUserOperation(
        userOp: UserOp,
        signerParams?: SessionKeySignerParams | PasskeySignerParams
    ): Promise<string> {
        const accountConfig = await this.getAccountConfig();
        return this.sendRpc<string>({
            method: 'particle_aa_sendUserOp',
            params: [accountConfig, userOp, signerParams],
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
        let suffix = await this.getOwner();
        if (!suffix) {
            return '';
        }

        if (this.provider.isPasskey && suffix === '0x0000000000000000000000000000000000000000') {
            // passkey
            const credentialId = (await this.provider.getPasskeyOption?.())?.credentialId;
            if (credentialId) {
                suffix = credentialId;
            }
        }

        const accountConfig = await this.getAccountConfig();
        const localKey = `particle_${accountConfig.name}_${accountConfig.version}_${suffix}`;
        if (typeof window !== 'undefined' && localStorage) {
            const localAA = localStorage.getItem(localKey);
            if (localAA) {
                return localAA;
            }
        }

        const configKey = JSON.stringify(accountConfig);
        let accountPromise = loadAccountPromise.get(configKey);
        if (!accountPromise) {
            accountPromise = this.getAccount();
            loadAccountPromise.set(configKey, accountPromise);
        }

        try {
            const account = await accountPromise;
            const address = account.smartAccountAddress;
            if (typeof window !== 'undefined' && localStorage) {
                localStorage.setItem(localKey, address);
            }
            return address;
        } catch (error) {
            loadAccountPromise.delete(configKey);
            throw error;
        }
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
        const chainId = Number(await this.getChainId());
        const accountContract = this.config.aaOptions.accountContracts[this.smartAccountContract.name];
        const contractConfig = accountContract.find(
            (contract) => contract.version === this.smartAccountContract.version
        );
        if (contractConfig?.chainIds?.length) {
            if (!contractConfig.chainIds.includes(chainId)) {
                throw new Error(`Invalid Chain: ${chainId}`);
            }
        }
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
                        chainId,
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

    async createSessions(options: CreateSessionKeyOptions[]): Promise<FeeQuotesResponse> {
        const accountConfig = await this.getAccountConfig();
        return await this.sendRpc<FeeQuotesResponse>({
            method: 'particle_aa_createSessions',
            params: [accountConfig, options],
        });
    }

    async validateSession(targetSession: SessionKey, sessions: SessionKey[]): Promise<boolean> {
        const accountConfig = await this.getAccountConfig();
        return await this.sendRpc<boolean>({
            method: 'particle_aa_validateSession',
            params: [
                accountConfig,
                {
                    sessions,
                    targetSession: targetSession,
                },
            ],
        });
    }
}

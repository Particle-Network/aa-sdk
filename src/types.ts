export type Transaction = {
    to: string;
    value?: string;
    data?: string;
    nonce?: number | string;
    gasLimit?: number | string;
};

export interface RequestArguments {
    method: string;
    params?: any[];
}

export interface JsonRpcRequest extends RequestArguments {
    id: number | string;
    jsonrpc: string;
}

export interface IEthereumProvider {
    on(event: string, listener: any): this;

    once?(event: string, listener: any): this;

    off?(event: string, listener: any): this;

    removeListener?(event: string, listener: any): this;

    request(request: Partial<JsonRpcRequest>): Promise<any>;
}

export type PasskeyProvider = {
    isPasskey: true;
    getPasskeyOption: () => Promise<PasskeyOption | null>;
};

export interface Account {
    isDeployed: boolean;
    chainId: number;
    eoaAddress: string;
    factoryAddress: string;
    entryPointAddress: string;
    smartAccountAddress: string;
    owner: string;
    index: number;
    implementationAddress: string;
    implementationVersion: string;
    fallBackHandlerAddress: string;
    version: string;
    passkeyCredentialId?: string;
    passkeyPublickey?: string;
}

export type AccountConfig = {
    name: string;
    version: string;
    ownerAddress: string;
    options?: AccountOptions;
};

export type AccountOptions = {
    passkeyOption?: PasskeyOption;
};

export type PasskeyOption = {
    credentialId: string;
    publicKey?: string;
};

export interface AccountContractConfig {
    chainIds?: number[];
    version: string;
}

export interface AccountContract {
    name: string;
    version: string;
}

export interface ApiKeyConfig {
    chainId: number;
    apiKey: string;
}

export interface SmartAccountConfig {
    projectId: string;
    clientKey: string;
    appId: string;
    aaOptions: AAOptions;
}

export interface AAOptions {
    accountContracts: {
        [key: string]: AccountContractConfig[];
    };
}

export interface TokenInfo {
    chainId: number;
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    logoURI: string;
}

export interface FeeQuote {
    tokenInfo: TokenInfo;
    fee: string;
    balance: string;
    premiumPercentage?: string;
}

export interface UserOpBundle {
    userOp: UserOp;
    userOpHash: string;
}

export interface VerifyingPaymaster extends UserOpBundle {
    feeQuote?: FeeQuote;
}

export interface UserOp {
    sender: string;
    nonce: string;
    initCode: string;
    callData: string;
    signature: string;
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
    verificationGasLimit: string;
    callGasLimit: string;
    preVerificationGas: string;
    paymasterAndData: string;
    [key: string]: any;
}

export interface TokenPaymaster {
    tokenPaymasterAddress: string;
    feeQuotes: FeeQuote[];
}

export interface FeeQuotesResponse {
    verifyingPaymasterGasless?: VerifyingPaymaster;
    verifyingPaymasterNative: VerifyingPaymaster;
    tokenPaymaster?: TokenPaymaster;
    sessions?: SessionKey[];
    transactions?: unknown[];
}

export interface UserOpParams {
    tx: Transaction | Transaction[];
    feeQuote?: FeeQuote;
    tokenPaymasterAddress?: string;
}

export type SendTransactionParams = UserOpBundle | UserOpParams;

export type ResolveTransactionParams = UserOpBundle | Omit<UserOpParams, 'tx'>;

export interface SessionKey {
    validUntil: number;
    validAfter: number;
    sessionValidationModule: string;
    sessionKeyData: string;
}

export interface CreateSessionKeyOptions extends Omit<SessionKey, 'sessionKeyData'> {
    sessionKeyData?: string;
    sessionKeyDataInAbi?: [[...string[]], [...unknown[]]];
}

export interface SessionKeySignerParams {
    sessions: SessionKey[];
    targetSession: SessionKey;
}

export type PasskeyVerifyData = {
    authenticatorData: string;
    clientDataJSON: string;
};

export type SignUserOpHashResult = {
    signature: string;
    passkeyVerifyData?: PasskeyVerifyData;
};

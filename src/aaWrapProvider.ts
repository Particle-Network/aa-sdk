import EventEmitter from 'events';
import { SmartAccount } from './smartAccount';
import type { IEthereumProvider, JsonRpcRequest, ResolveTransactionParams } from './types';

export enum SendTransactionMode {
    UserSelect = 0,
    Gasless = 1,
    UserPaidNative = 2,
}

export enum SendTransactionEvent {
    Request = 'RequestSendTransaction',
    Resolve = 'ResolveSendTransaction',
    Reject = 'RejectSendTransaction',
}

export class AAWrapProvider implements IEthereumProvider {
    private events = new EventEmitter();
    constructor(
        private smartAccount: SmartAccount,
        private sendTxMode: SendTransactionMode = SendTransactionMode.UserPaidNative
    ) {
        this.events.setMaxListeners(100);

        if (!Object.values(SendTransactionMode).includes(sendTxMode)) {
            throw new Error(`sendTxMode value error, must in ${Object.values(SendTransactionMode)}`);
        }
    }

    /**
     * when receive SendTransactionEvent.Request event, call this method to continue sending the transaction.
     *
     * @see SendTransactionEvent
     * @param params
     */
    resolveSendTransaction(params: ResolveTransactionParams) {
        this.events.emit(SendTransactionEvent.Resolve, params);
    }

    /**
     * when receive SendTransactionEvent.Request event, call this method to reject the transaction.
     *
     * @param error reject error message
     */
    rejectSendTransaction(error: Error) {
        this.events.emit(SendTransactionEvent.Reject, error);
    }

    on(event: string, listener: any): this {
        if (SendTransactionEvent.Request === event) {
            this.events.on(event, listener);
        } else {
            this.smartAccount.provider.on(event, listener);
        }
        return this;
    }

    once(event: string, listener: any): this {
        if (SendTransactionEvent.Request === event) {
            this.events.once(event, listener);
        } else {
            this.smartAccount.provider.once(event, listener);
        }
        return this;
    }

    off(event: string, listener: any): this {
        if (SendTransactionEvent.Request === event) {
            this.events.off(event, listener);
        } else {
            this.smartAccount.provider.off(event, listener);
        }
        return this;
    }

    removeListener(event: string, listener: any): this {
        if (SendTransactionEvent.Request === event) {
            this.events.removeListener(event, listener);
        } else {
            this.smartAccount.provider.removeListener(event, listener);
        }
        return this;
    }

    enable(): Promise<string[]> {
        return this.request({
            method: 'eth_requestAccounts',
        });
    }

    async request(payload: Partial<JsonRpcRequest>): Promise<any> {
        if (payload.method === 'eth_requestAccounts' || payload.method === 'eth_accounts') {
            await this.smartAccount.provider.request(payload);
            const address = await this.smartAccount.getAddress();
            return [address];
        } else if (payload.method === 'eth_sendTransaction') {
            if (!payload.params) {
                return Promise.reject(new Error('send transaction param error'));
            }
            const txData = payload.params[0];

            const feeQuotesResult = await this.smartAccount.getFeeQuotes(txData);
            if (this.sendTxMode === SendTransactionMode.Gasless) {
                const { userOp, userOpHash } =
                    feeQuotesResult.verifyingPaymasterGasless || feeQuotesResult.verifyingPaymasterNative;
                return this.smartAccount.sendUserOperation({ userOp, userOpHash });
            } else if (this.sendTxMode === SendTransactionMode.UserPaidNative) {
                const { userOp, userOpHash } = feeQuotesResult.verifyingPaymasterNative;
                return this.smartAccount.sendUserOperation({ userOp, userOpHash });
            }

            return new Promise((resolve, reject) => {
                this.events.removeAllListeners(SendTransactionEvent.Reject);
                this.events.removeAllListeners(SendTransactionEvent.Resolve);
                this.events.once(SendTransactionEvent.Resolve, async (params: ResolveTransactionParams) => {
                    try {
                        const sendParams = { ...params, tx: txData };
                        const txHash = await this.smartAccount.sendTransaction(sendParams);
                        resolve(txHash);
                    } catch (error) {
                        reject(error);
                    }
                });
                this.events.once(SendTransactionEvent.Reject, reject);
                if (!feeQuotesResult.transactions) {
                    feeQuotesResult.transactions = [txData];
                }
                this.events.emit(SendTransactionEvent.Request, feeQuotesResult);
            });
        }

        return this.smartAccount.provider.request(payload);
    }
}

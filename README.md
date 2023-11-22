# Particle AA SDK

## Installation[​](https://docs.walletconnect.com/1.0/#getting-started) <a href="#getting-started" id="getting-started"></a>

Install and import the biconomy package from the Particle Network SDK

```sh
yarn add @particle-network/aa
//or
npm install @particle-network/aa
```

## Before Start

1. All testnets have Particle Verifying Paymaster enabled, you can send any gasless transaction;
2. If you want to use [Particle Verifying Paymaster](paymaster.md) on Mainnet, you can deposit and use it directly without extra configration in SDK, [check docs](paymaster.md);
3. If you want to use Biconomy Paymaster, please go to [https://dashboard.biconomy.io/](https://dashboard.biconomy.io/), create Paymaster & get dappApiKey;
4. Token Paymaster is automatically enabled (we are using Biconomy Token Paymaster).

## Initialize the SmartAccount

You need to create a Particle project to connect to your app, Visit [Particle Dashboard](../../getting-started/dashboard/) to learn more about Particle projects and apps.

(Optional) And create a Biconomy Paymasters to connect AA, Visit [Biconomy Dashboard](https://dashboard.biconomy.io/) to learn more.

The provider is [EIP-1193: Ethereum Provider JavaScript API ](https://eips.ethereum.org/EIPS/eip-1193), you can use Particle Provider, MetaMask Provider or any EVM wallet provider.

```typescript
import { SmartAccount } from '@particle-network/aa';

//provider: eip1193
const smartAccount = new SmartAccount(provider, {
    projectId: 'particle project id',
    clientKey: 'particle client key',
    appId: 'particle app id',
    aaOptions: {
        accountContracts: {  // 'BICONOMY', 'CYBERCONNECT', 'SIMPLE' is supported now.
            BICONOMY: [
                {
                    version: '1.0.0',
                    chainIds: [x, xx],
                },
                {
                    version: '2.0.0',
                    chainIds: [x, xx],
                }
            ],
            CYBERCONNECT: [
                {
                    version: '1.0.0',
                    chainIds: [x, xx],
                }
            ],
            SIMPLE: [
                {
                    version: '1.0.0',
                    chainIds: [x, xx],
                }
            ],
        },
        paymasterApiKeys: [{
            chainId: 1,
            apiKey: 'paymaster api key',
        }]
    },
});

// set current smart account contract
smartAccount.setSmartAccountContract({ name: 'BICONOMY', version: '2.0.0' });

```

## Get Smart Account Address

Once you have connected your EOA signer and created an instance of Smart Account, the address is the public property and remains the same across all EVM chains.

```typescript
// AA address
const address = await smartAccount.getAddress();
// EOA address
const address = await smartAccount.getOwner();
// load account more info.
const accountInfo = await smartAccount.getAccount();
```

## Get Fee Quotes

Before send transactions, you can get fee quotes and display on UI Modal, users can choose which token to use to pay gas fees.

```typescript
const tx = {
    to: '0x...',
    value: '0x...'
}
// or bacth transactions
const txs = [
    {
        to: '0x...',
        value: '0x...'
    },
    {
        to: '0x...',
        value: '0x...'
    }
]
//get fee quotes with tx or txs
const feeQuotesResult = await smartAccount.getFeeQuotes(tx);

// gasless transaction userOp, maybe null
const gaslessUserOp = feeQuotesResult.verifyingPaymasterGasless?.userOp;
const gaslessUserOpHash = feeQuotesResult.verifyingPaymasterGasless?.userOpHash;

// pay with Native tokens: transaction userOp
const paidNativeUserOp = feeQuotesResult.verifyingPaymasterNative?.userOp;
const paidNativeUserOpHash = feeQuotesResult.verifyingPaymasterNative?.userOpHash;

// pay with ERC-20 tokens: fee quotes
const tokenPaymasterAddress = feeQuotesResult.tokenPaymaster.tokenPaymasterAddress;
const tokenFeeQuotes = feeQuotesResult.tokenPaymaster.feeQuotes;

</code></pre>
```

## Build User Operation

Builds a `UserOp` object from the provided array of `Transaction`s. It also accepts optional `feeQuote` and `tokenPaymasterAddress`. Returns a Promise that resolves to the `UserOpBundle`.

```typescript
// build user operation, feeQuote and tokenPaymasterAddress is optional.
const userOpBundle = await smartAccount.buildUserOperation({ tx, feeQuote, tokenPaymasterAddress })
const userOp = userOpBundle.userOp;
const userOpHash = userOpBundle.userOpHash;

```

### Send User Operation

Sends the pre-signed `UserOperation` to the Particle network for execution. Returns a Promise that resolves to a `TransactionHash`.

```typescript
// Some code
const txHash = await smartAccount.sendUserOperation({ userOp, userOpHash });
```

## Wallet Deployment flow

Any gasless or user paid transaction will check whether the wallet is deployed or not. If the wallet is not deployed, the SDK will batch the wallet deployment with the intended transaction/batch transactions. This behaviour is handled within the SDK itself & would require no changes in your code to enable this.

### Deploy Wallet Contract Manual

```typescript
// check the constract is deployed
const isDeploy = await smartAccount.isDeployed();
if (!isDeploy) {
    const txHash = await smartAccount.deployWalletContract();
}
```

## Wrap Provider

If your app has implemented sending transactions, or use web3.js, you can wrap the EIP-1193 provider to quickly implement AA wallet.

```typescript
import { AAWrapProvider, SendTransactionMode, SendTransactionEvent } from '@particle-network/aa';
import Web3 from "web3";

// sendTxMode: UserPaidNative(default), Gasless, UserSelect
const wrapProvider = new AAWrapProvider(smartAccount, SendTransactionMode.UserPaidNative);
// replace any EIP-1193 provider to wrapProvider
const web3 = new Web3(wrapProvider);
//send user paid transaction
await web3.eth.sendTransaction(tx);


// send gassless transaction
const wrapProvider = new AAWrapProvider(smartAccount, SendTransactionMode.Gasless);
const web3 = new Web3(wrapProvider);
await web3.eth.sendTransaction(tx);


// use select pay gas token or gasless
const wrapProvider = new AAWrapProvider(smartAccount, SendTransactionMode.UserSelect);
const web3 = new Web3(wrapProvider);
wrapProvider.once(SendTransactionEvent.Request, (feeQuotesResult) => {
    // let the user select the pay gas ERC-20 token
    wrapProvider.resolveSendTransaction({
        feeQuote: feeQuotesResult.tokenPaymaster.feeQuote[0],
        tokenPaymasterAddress: feeQuotesResult.tokenPaymaster.tokenPaymasterAddress
    });
    
    // or pay with native token
    wrapProvider.resolveSendTransaction(feeQuotesResult.verifyingPaymasterNative);
    
    // or send gasless
    if (feeQuotesResult.verifyingPaymasterGasless) {
        wrapProvider.resolveSendTransaction(feeQuotesResult.verifyingPaymasterGasless);
    }
      
    // or reject send transaction
    wrapProvider.rejectSendTransaction({ message: 'user rejected'});
});
await web3.eth.sendTransaction(tx);

```

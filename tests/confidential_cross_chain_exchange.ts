import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { ConfidentialCrossChainExchange } from "../target/types/confidential_cross_chain_exchange";
import { randomBytes, createHash } from "crypto";
import {
  awaitComputationFinalization,
  getArciumEnv,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgAddress,
  uploadCircuit,
  buildFinalizeCompDefTx,
  RescueCipher,
  deserializeLE,
  getMXEPublicKey,
  getMXEAccAddress,
  getMempoolAccAddress,
  getCompDefAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  x25519,
} from "@arcium-hq/client";
import * as fs from "fs";
import * as os from "os";
import { expect } from "chai";

describe("ConfidentialCrossChainExchange", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace
    .ConfidentialCrossChainExchange as Program<ConfidentialCrossChainExchange>;
  const provider = anchor.getProvider();

  type Event = anchor.IdlEvents<(typeof program)["idl"]>;
  const awaitEvent = async <E extends keyof Event>(
    eventName: E
  ): Promise<Event[E]> => {
    let listenerId: number;
    const event = await new Promise<Event[E]>((res) => {
      listenerId = program.addEventListener(eventName, (event) => {
        res(event);
      });
    });
    await program.removeEventListener(listenerId);

    return event;
  };

  const arciumEnv = getArciumEnv();

  // Helpers
  const u64ToLeBytes = (n: bigint | anchor.BN) => {
    const v = anchor.BN.isBN(n) ? (n as anchor.BN).toArrayLike(Buffer, "le", 8) : (() => {
      const b = Buffer.alloc(8);
      b.writeBigUInt64LE(n as bigint);
      return b;
    })();
    return v;
  };

  const keccakOrSha3ToU64 = (data: Uint8Array): bigint => {
    // Prefer sha3-256 if available. Node >= 20 supports 'sha3-256'. Fallback to 'sha256'.
    let digest: Buffer;
    try {
      digest = createHash("sha3-256").update(Buffer.from(data)).digest();
    } catch {
      digest = createHash("sha256").update(Buffer.from(data)).digest();
    }
    const first8 = digest.subarray(0, 8);
    return first8.readBigUInt64LE();
  };

  const toHexU64 = (n: bigint | anchor.BN) => {
    if (anchor.BN.isBN(n)) {
      return '0x' + (n as anchor.BN).toArrayLike(Buffer, 'le', 8).toString('hex');
    }
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(n as bigint);
    return '0x' + b.toString('hex');
  };

  const deriveInterchainOfferPda = (programId: PublicKey, owner: PublicKey, id: anchor.BN) => {
    const seed = Buffer.from("InterChainoffer");
    const idLe = Buffer.from(id.toArrayLike(Buffer, "le", 8));
    return PublicKey.findProgramAddressSync([seed, owner.toBuffer(), idLe], programId)[0];
  };

  const deriveIntrachainOfferPda = (programId: PublicKey, owner: PublicKey, id: anchor.BN) => {
    const seed = Buffer.from("IntraChainoffer");
    const idLe = Buffer.from(id.toArrayLike(Buffer, "le", 8));
    return PublicKey.findProgramAddressSync([seed, owner.toBuffer(), idLe], programId)[0];
  };

  const getSignPdaAccAddress = (programId: PublicKey) => {
    const seed = Buffer.from("SignerAccount");
    return PublicKey.findProgramAddressSync([seed], programId)[0];
  };

  it("Is initialized!", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);

    console.log("Initializing add together computation definition");
    const initATSig = await initAddTogetherCompDef(
      program,
      owner,
      false,
      false
    );
    console.log(
      "Add together computation definition initialized with signature",
      initATSig
    );

    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider as anchor.AnchorProvider,
      program.programId
    );

    console.log("MXE x25519 pubkey is", mxePublicKey);

    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);

    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);

    const val1 = BigInt(1);
    const val2 = BigInt(2);
    const plaintext = [val1, val2];

    const nonce = randomBytes(16);
    const ciphertext = cipher.encrypt(plaintext, nonce);

    const sumEventPromise = awaitEvent("sumEvent");
    const computationOffset = new anchor.BN(randomBytes(8), "hex");

    const queueSig = await program.methods
      .addTogether(
        computationOffset,
        Array.from(ciphertext[0]),
        Array.from(ciphertext[1]),
        Array.from(publicKey),
        new anchor.BN(deserializeLE(nonce).toString())
      )
      .accountsPartial({
        signPdaAccount: getSignPdaAccAddress(program.programId),
        computationAccount: getComputationAccAddress(
          program.programId,
          computationOffset
        ),
        clusterAccount: arciumEnv.arciumClusterPubkey,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(program.programId),
        executingPool: getExecutingPoolAccAddress(program.programId),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("add_together")).readUInt32LE()
        ),
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Queue sig is ", queueSig);

    const finalizeSig = await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      computationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Finalize sig is ", finalizeSig);

    const sumEvent = await sumEventPromise;
    const decrypted = (cipher as any).decrypt(
      [sumEvent.sum] as any,
      sumEvent.nonce as any
    )[0];
    expect(decrypted).to.equal(val1 + val2);
  });

  it("Relay offer clone works!", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);

    console.log("Initializing relay offer clone computation definition");
    const initROCSig = await initRelayOfferCloneCompDef(
      program,
      owner,
      false,
      false
    );
    console.log(
      "Relay offer clone computation definition initialized with signature",
      initROCSig
    );

    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider as anchor.AnchorProvider,
      program.programId
    );

    console.log("MXE x25519 pubkey is", mxePublicKey);

    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);

    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);

    // Public offer metadata
    const id = new anchor.BN(12345);
    const tokenBWanted = new anchor.BN(3_000_000_000); // 3000 USDC (assuming 6-9 decimals in test)
    const tokenAOffered = new anchor.BN(10_000_000_000); // 10 SOL in lamports for example
    const isTakerNative = true;
    const chainId = new anchor.BN(1);
    const deadline = new anchor.BN(Math.floor(Date.now() / 1000) + 600);

    // Confidential identity hash (external seller)
    const extSellerHashU64 = keccakOrSha3ToU64(publicKey);
    const idNonce = randomBytes(16);
    const idCiphertext = cipher.encrypt([extSellerHashU64], idNonce);

    const relayEventPromise = awaitEvent("relayOfferClonedEvent");
    const computationOffset = new anchor.BN(randomBytes(8), "hex");

    const interchainOffer = deriveInterchainOfferPda(
      program.programId,
      (provider.wallet as any).payer.publicKey,
      id
    );
    console.log('InterchainOffer PDA:', interchainOffer.toBase58());
    console.log('RelayOfferClone public inputs:', {
      id: id.toString(),
      tokenBWanted: tokenBWanted.toString(),
      tokenAOffered: tokenAOffered.toString(),
      isTakerNative,
      chainId: chainId.toString(),
      deadline: deadline.toString(),
    });
    console.log('External seller identity hash (u64):', toHexU64(extSellerHashU64));
    console.log('Computation offset (BN hex):', computationOffset.toString('hex'));

    const queueSig = await program.methods
      .relayOfferClone(
        id,
        tokenBWanted,
        tokenAOffered,
        isTakerNative,
        chainId,
        deadline,
        Array.from(idCiphertext[0]),
        Array.from(publicKey),
        new anchor.BN(deserializeLE(idNonce).toString()),
        computationOffset
      )
      .accounts({
        payer: (provider.wallet as any).payer.publicKey,
        interchainOffer,
        signPdaAccount: getSignPdaAccAddress(program.programId),
        computationAccount: getComputationAccAddress(
          program.programId,
          computationOffset
        ),
        clusterAccount: arciumEnv.arciumClusterPubkey,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(program.programId),
        executingPool: getExecutingPoolAccAddress(program.programId),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("relay_offer_clone")).readUInt32LE()
        ),
      } as any)
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Queue sig is ", queueSig);

    const finalizeSig = await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      computationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Finalize sig is ", finalizeSig);

    const relayEvent = await relayEventPromise as any;
    console.log('RelayOfferClonedEvent:', relayEvent);
    expect(relayEvent.acknowledged).to.equal(1);
  });

  it("Confidential deposit native works!", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);

    console.log("Initializing confidential deposit native computation definition");
    const initCDNSig = await initConfidentialDepositNativeCompDef(
      program,
      owner,
      false,
      false
    );
    console.log(
      "Confidential deposit native computation definition initialized with signature",
      initCDNSig
    );

    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider as anchor.AnchorProvider,
      program.programId
    );

    console.log("MXE x25519 pubkey is", mxePublicKey);

    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);

    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);

    const amount = BigInt(1000);
    const plaintext = [amount];

    const nonce = randomBytes(16);
    const ciphertext = cipher.encrypt(plaintext, nonce);

    const depositEventPromise = awaitEvent("confidentialDepositNativeEvent");
    const computationOffset = new anchor.BN(randomBytes(8), "hex");


    console.log("amount:", amount.toString());
    console.log("nonce:", nonce.toString("hex"));
    console.log("ciphertext:", ciphertext[0]);
    console.log("publicKey:", publicKey);
    console.log("plaintext:", plaintext);
    const queueSig = await program.methods
      .confidentialDepositNative(
        computationOffset,
        Array.from(ciphertext[0]),
        Array.from(publicKey),
        new anchor.BN(deserializeLE(nonce).toString())
      )
      .accountsPartial({
        signPdaAccount: getSignPdaAccAddress(program.programId),
        computationAccount: getComputationAccAddress(
          program.programId,
          computationOffset
        ),
        clusterAccount: arciumEnv.arciumClusterPubkey,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(program.programId),
        executingPool: getExecutingPoolAccAddress(program.programId),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("confidential_deposit_native")).readUInt32LE()
        ),
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Queue sig is ", queueSig);

    const finalizeSig = await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      computationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Finalize sig is ", finalizeSig);

    const depositEvent = await depositEventPromise;
    const decrypted = (cipher as any).decrypt(
      [depositEvent.processedAmount] as any,
      depositEvent.nonce as any
    )[0];

    console.log("Decrypted amount:", decrypted.toString());
    console.log("Expected amount:", amount.toString());
    expect(decrypted).to.equal(amount);
  });

  it("Interchain origin EVM deposit seller SPL works!", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);

    console.log("Initializing interchain origin EVM deposit seller SPL computation definition");
    const initIEDSSSig = await initInterchainOriginEvmDepositSellerSplCompDef(
      program,
      owner,
      true,
      false
    );
    console.log(
      "Interchain origin EVM deposit seller SPL computation definition initialized with signature",
      initIEDSSSig
    );

    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider as anchor.AnchorProvider,
      program.programId
    );

    console.log("MXE x25519 pubkey is", mxePublicKey);

    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);

    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);

    const id = new anchor.BN(23456);
    const tokenBWanted = new anchor.BN(3_000_000_000);
    const tokenAOffered = new anchor.BN(10_000_000_000);
    const isTakerNative = true;
    const chainId = new anchor.BN(1);
    const deadline = new anchor.BN(Math.floor(Date.now() / 1000) + 600);

    // Confidential seller identity
    const sellerHashU64 = keccakOrSha3ToU64(publicKey);
    const nonce = randomBytes(16);
    const sellerCiphertext = cipher.encrypt([sellerHashU64], nonce);

    const depositEventPromise = awaitEvent("interchainOriginEvmDepositSellerSplEvent");
    const computationOffset = new anchor.BN(randomBytes(8), "hex");

    const interchainOffer = deriveInterchainOfferPda(
      program.programId,
      (provider.wallet as any).payer.publicKey,
      id
    );
    console.log('InterchainOffer PDA:', interchainOffer.toBase58());
    console.log('Interchain deposit public inputs:', {
      id: id.toString(),
      tokenBWanted: tokenBWanted.toString(),
      tokenAOffered: tokenAOffered.toString(),
      isTakerNative,
      chainId: chainId.toString(),
      deadline: deadline.toString(),
    });
    console.log('Seller identity hash (u64):', toHexU64(sellerHashU64));
    console.log('Computation offset (BN hex):', computationOffset.toString('hex'));

    const queueSig = await program.methods
      .interchainOriginEvmDepositSellerSpl(
        id,
        tokenBWanted,
        tokenAOffered,
        isTakerNative,
        chainId,
        deadline,
        Array.from(sellerCiphertext[0]),
        Array.from(publicKey),
        new anchor.BN(deserializeLE(nonce).toString()),
        computationOffset
      )
      .accounts({
        payer: (provider.wallet as any).payer.publicKey,
        interchainOffer,
        signPdaAccount: getSignPdaAccAddress(program.programId),
        computationAccount: getComputationAccAddress(
          program.programId,
          computationOffset
        ),
        clusterAccount: arciumEnv.arciumClusterPubkey,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(program.programId),
        executingPool: getExecutingPoolAccAddress(program.programId),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("interchain_origin_evm_deposit_seller_spl")).readUInt32LE()
        ),
      } as any)
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Queue sig is ", queueSig);

    const finalizeSig = await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      computationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Finalize sig is ", finalizeSig);

    const depositEvent = await depositEventPromise as any;
    console.log('InterchainOriginEvmDepositSellerSplEvent:', depositEvent);
    expect(depositEvent.acknowledged).to.equal(1);

    // Verify PDA state stored for interchain offer
    const fetched = await (program.account as any).interchainOffer.fetch(interchainOffer);
    console.log('Fetched InterchainOffer PDA state:', fetched);
    expect(fetched.id.toString()).to.equal(id.toString());
    expect(fetched.tokenBWantedAmount.toString()).to.equal(tokenBWanted.toString());
    expect(fetched.tokenAOfferedAmount.toString()).to.equal(tokenAOffered.toString());
    expect(Boolean(fetched.isTakerNative)).to.equal(isTakerNative);
  });

  it("Finalize interchain origin EVM offer works!", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);

    console.log("Initializing finalize interchain origin EVM offer computation definition");
    const initFIEOSig = await initFinalizeInterchainOriginEvmOfferCompDef(
      program,
      owner,
      false,
      false
    );
    console.log(
      "Finalize interchain origin EVM offer computation definition initialized with signature",
      initFIEOSig
    );

    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider as anchor.AnchorProvider,
      program.programId
    );

    console.log("MXE x25519 pubkey is", mxePublicKey);

    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);

    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);

  const id = new anchor.BN(12345);
  const buyerHashU64 = keccakOrSha3ToU64(publicKey);
  const nonce = randomBytes(16);
  const buyerCiphertext = cipher.encrypt([buyerHashU64], nonce);
  console.log('Finalize interchain public input id:', id.toString());
  console.log('Buyer identity hash (u64):', toHexU64(buyerHashU64));

    const finalizeEventPromise = awaitEvent("finalizeInterchainOriginEvmOfferEvent");
    const computationOffset = new anchor.BN(randomBytes(8), "hex");

    const queueSig = await program.methods
      .finalizeInterchainOriginEvmOffer(
        id,
        Array.from(buyerCiphertext[0]),
        Array.from(publicKey),
        new anchor.BN(deserializeLE(nonce).toString()),
        computationOffset
      )
      .accountsPartial({
        payer: provider.wallet.publicKey,
        signPdaAccount: getSignPdaAccAddress(program.programId),
        computationAccount: getComputationAccAddress(
          program.programId,
          computationOffset
        ),
        clusterAccount: arciumEnv.arciumClusterPubkey,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(program.programId),
        executingPool: getExecutingPoolAccAddress(program.programId),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("finalize_interchain_origin_evm_offer")).readUInt32LE()
        ),
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Queue sig is ", queueSig);

    const finalizeSig = await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      computationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Finalize sig is ", finalizeSig);

    const finalizeEvent = await finalizeEventPromise as any;
    console.log('FinalizeInterchainOriginEvmOfferEvent:', finalizeEvent);
    expect(finalizeEvent.acknowledged).to.equal(1);
  });

  it("Deposit seller native works!", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);

    console.log("Initializing deposit seller native computation definition");
    const initDSNSig = await initDepositSellerNativeCompDef(
      program,
      owner,
      false,
      false
    );
    console.log(
      "Deposit seller native computation definition initialized with signature",
      initDSNSig
    );

    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider as anchor.AnchorProvider,
      program.programId
    );

    console.log("MXE x25519 pubkey is", mxePublicKey);

    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);

    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);

    // Public intrachain offer
    const id = new anchor.BN(34567);
    const tokenBWanted = new anchor.BN(5_000_000_000);
    const tokenAOffered = new anchor.BN(10_000_000_000);
    const isTakerNative = true;
    const deadline = new anchor.BN(Math.floor(Date.now() / 1000) + 600);

    const sellerHashU64 = keccakOrSha3ToU64(publicKey);
    const nonce = randomBytes(16);
    const sellerCiphertext = cipher.encrypt([sellerHashU64], nonce);

    const depositEventPromise = awaitEvent("depositSellerNativeEvent");
    const computationOffset = new anchor.BN(randomBytes(8), "hex");

    const intrachainOffer = deriveIntrachainOfferPda(
      program.programId,
      (provider.wallet as any).payer.publicKey,
      id
    );
    console.log('IntrachainOffer PDA (native):', intrachainOffer.toBase58());
    console.log('Deposit seller native public inputs:', {
      id: id.toString(),
      tokenBWanted: tokenBWanted.toString(),
      tokenAOffered: tokenAOffered.toString(),
      isTakerNative,
      deadline: deadline.toString(),
    });
    console.log('Seller identity hash (u64):', toHexU64(sellerHashU64));
    console.log('Computation offset (BN hex):', computationOffset.toString('hex'));

    const queueSig = await program.methods
      .depositSellerNative(
        id,
        tokenBWanted,
        tokenAOffered,
        isTakerNative,
        deadline,
        Array.from(sellerCiphertext[0]),
        Array.from(publicKey),
        new anchor.BN(deserializeLE(nonce).toString()),
        computationOffset
      )
      .accounts({
        payer: (provider.wallet as any).payer.publicKey,
        intrachainOffer,
        signPdaAccount: getSignPdaAccAddress(program.programId),
        computationAccount: getComputationAccAddress(
          program.programId,
          computationOffset
        ),
        clusterAccount: arciumEnv.arciumClusterPubkey,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(program.programId),
        executingPool: getExecutingPoolAccAddress(program.programId),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("deposit_seller_native")).readUInt32LE()
        ),
      } as any)
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Queue sig is ", queueSig);

    const finalizeSig = await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      computationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Finalize sig is ", finalizeSig);

    const depositEvent = await depositEventPromise as any;
    console.log('DepositSellerNativeEvent:', depositEvent);
    expect(depositEvent.acknowledged).to.equal(1);
  });

  it("Deposit seller SPL works!", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);

    console.log("Initializing deposit seller SPL computation definition");
    const initDSSSig = await initDepositSellerSplCompDef(
      program,
      owner,
      false,
      false
    );
    console.log(
      "Deposit seller SPL computation definition initialized with signature",
      initDSSSig
    );

    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider as anchor.AnchorProvider,
      program.programId
    );

    console.log("MXE x25519 pubkey is", mxePublicKey);

    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);

    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);

    const id = new anchor.BN(45678);
    const tokenBWanted = new anchor.BN(5_000_000_000);
    const tokenAOffered = new anchor.BN(10_000_000_000);
    const isTakerNative = false;
    const deadline = new anchor.BN(Math.floor(Date.now() / 1000) + 600);

    const sellerHashU64 = keccakOrSha3ToU64(publicKey);
    const nonce = randomBytes(16);
    const sellerCiphertext = cipher.encrypt([sellerHashU64], nonce);

    const depositEventPromise = awaitEvent("depositSellerSplEvent");
    const computationOffset = new anchor.BN(randomBytes(8), "hex");

    const intrachainOffer = deriveIntrachainOfferPda(
      program.programId,
      (provider.wallet as any).payer.publicKey,
      id
    );
    console.log('IntrachainOffer PDA (SPL):', intrachainOffer.toBase58());
    console.log('Deposit seller SPL public inputs:', {
      id: id.toString(),
      tokenBWanted: tokenBWanted.toString(),
      tokenAOffered: tokenAOffered.toString(),
      isTakerNative,
      deadline: deadline.toString(),
    });
    console.log('Seller identity hash (u64):', toHexU64(sellerHashU64));
    console.log('Computation offset (BN hex):', computationOffset.toString('hex'));

    const queueSig = await program.methods
      .depositSellerSpl(
        id,
        tokenBWanted,
        tokenAOffered,
        isTakerNative,
        deadline,
        Array.from(sellerCiphertext[0]),
        Array.from(publicKey),
        new anchor.BN(deserializeLE(nonce).toString()),
        computationOffset
      )
      .accounts({
        payer: (provider.wallet as any).payer.publicKey,
        intrachainOffer,
        signPdaAccount: getSignPdaAccAddress(program.programId),
        computationAccount: getComputationAccAddress(
          program.programId,
          computationOffset
        ),
        clusterAccount: arciumEnv.arciumClusterPubkey,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(program.programId),
        executingPool: getExecutingPoolAccAddress(program.programId),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("deposit_seller_spl")).readUInt32LE()
        ),
      } as any)
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Queue sig is ", queueSig);

    const finalizeSig = await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      computationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Finalize sig is ", finalizeSig);

    const depositEvent = await depositEventPromise as any;
    console.log('DepositSellerSplEvent:', depositEvent);
    expect(depositEvent.acknowledged).to.equal(1);
  });

  it("Finalize intrachain offer works!", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);

    console.log("Initializing finalize intrachain offer computation definition");
    const initFICSig = await initFinalizeIntrachainOfferCompDef(
      program,
      owner,
      false,
      false
    );
    console.log(
      "Finalize intrachain offer computation definition initialized with signature",
      initFICSig
    );

    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider as anchor.AnchorProvider,
      program.programId
    );

    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);
    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);

    const id = new anchor.BN(34567); // same as deposit_seller_native above
    const buyerHashU64 = keccakOrSha3ToU64(publicKey);
    const nonce = randomBytes(16);
    const buyerCiphertext = cipher.encrypt([buyerHashU64], nonce);

    const finalizeEventPromise = awaitEvent("finalizeIntrachainOfferEvent");
    const computationOffset = new anchor.BN(randomBytes(8), "hex");

    const queueSig = await program.methods
      .finalizeIntrachainOffer(
        id,
        Array.from(buyerCiphertext[0]),
        Array.from(publicKey),
        new anchor.BN(deserializeLE(nonce).toString()),
        computationOffset
      )
      .accountsPartial({
        payer: provider.wallet.publicKey,
        signPdaAccount: getSignPdaAccAddress(program.programId),
        computationAccount: getComputationAccAddress(
          program.programId,
          computationOffset
        ),
        clusterAccount: arciumEnv.arciumClusterPubkey,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(program.programId),
        executingPool: getExecutingPoolAccAddress(program.programId),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("finalize_intrachain_offer")).readUInt32LE()
        ),
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Queue sig is ", queueSig);

    const finalizeSig = await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      computationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Finalize sig is ", finalizeSig);

    const finalizeEvent = await finalizeEventPromise as any;
    console.log('FinalizeIntrachainOfferEvent:', finalizeEvent);
    expect(finalizeEvent.acknowledged).to.equal(1);
  });

  it("Complete intrachain swap with escrow & asset transfers works!", async () => {
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║  CONFIDENTIAL P2P EXCHANGE - COMPLETE SWAP FLOW              ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    // Test users
    const seller = (provider.wallet as any).payer;
    const buyer = anchor.web3.Keypair.generate();

    // Airdrop to buyer for testing
    const airdropSig = await provider.connection.requestAirdrop(
      buyer.publicKey,
      20 * anchor.web3.LAMPORTS_PER_SOL
    );
    // Confirm the airdrop using an explicit commitment to avoid relying on an expired blockhash
    await provider.connection.confirmTransaction(airdropSig, "confirmed");

    // 1. SETUP: Generate encrypted identities
    console.log("📝 STEP 1: Preparing encrypted identities...");

    const sellerIdentity = "alice@ethereum.eth";
    const buyerIdentity = "bob@ethereum.eth";

    const sellerHashBuffer = createHash("sha256").update(sellerIdentity).digest();
    const buyerHashBuffer = createHash("sha256").update(buyerIdentity).digest();

    const sellerHashU64 = sellerHashBuffer.readBigUInt64LE();
    const buyerHashU64 = buyerHashBuffer.readBigUInt64LE();

    console.log(`  Seller: ${sellerIdentity} → hash: 0x${sellerHashBuffer.toString('hex').substring(0, 16)}`);
    console.log(`  Buyer:  ${buyerIdentity} → hash: 0x${buyerHashBuffer.toString('hex').substring(0, 16)}\n`);

    // Get MXE public key and setup encryption
    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider as anchor.AnchorProvider,
      program.programId
    );

    const sellerPrivateKey = x25519.utils.randomSecretKey();
    const sellerPublicKey = x25519.getPublicKey(sellerPrivateKey);
    const sellerSharedSecret = x25519.getSharedSecret(sellerPrivateKey, mxePublicKey);
    const sellerCipher = new RescueCipher(sellerSharedSecret);

    const buyerPrivateKey = x25519.utils.randomSecretKey();
    const buyerPublicKey = x25519.getPublicKey(buyerPrivateKey);
    const buyerSharedSecret = x25519.getSharedSecret(buyerPrivateKey, mxePublicKey);
    const buyerCipher = new RescueCipher(buyerSharedSecret);

    // Encrypt identities
    const sellerNonce = randomBytes(16);
    const buyerNonce = randomBytes(16);
    const sellerCiphertext = sellerCipher.encrypt([sellerHashU64], sellerNonce);
    const buyerCiphertext = buyerCipher.encrypt([buyerHashU64], buyerNonce);

    // 2. SELLER CREATES OFFER
    console.log("💼 STEP 2: Seller creates offer...");

    const offerId = new anchor.BN(99999);
    const tokenAAmount = new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL); // 10 SOL (token A)
    const tokenBAmount = new anchor.BN(3 * anchor.web3.LAMPORTS_PER_SOL);  // 3 SOL (token B)

    console.log(`  Offer ID: ${offerId.toString()}`);
    console.log(`  Seller offers: ${tokenAAmount.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL (token A)`);
    console.log(`  Seller wants:  ${tokenBAmount.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL (token B)\n`);

    const intrachainOffer = deriveIntrachainOfferPda(
      program.programId,
      seller.publicKey,
      offerId
    );

    const computationOffset = new anchor.BN(randomBytes(8), "hex");

    // Initialize computation definition first (reuse existing from previous test)
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);
    // Note: deposit_seller_native comp def is already initialized in previous test

    await program.methods
      .depositSellerNative(
        offerId,
        tokenBAmount,
        tokenAAmount,
        true,
        new anchor.BN(Math.floor(Date.now() / 1000) + 3600),
        Array.from(sellerCiphertext[0]),
        Array.from(sellerPublicKey),
        new anchor.BN(deserializeLE(sellerNonce).toString()),
        computationOffset
      )
      .accounts({
        payer: seller.publicKey,
        intrachainOffer,
        signPdaAccount: getSignPdaAccAddress(program.programId),
        computationAccount: getComputationAccAddress(
          program.programId,
          computationOffset
        ),
        clusterAccount: arciumEnv.arciumClusterPubkey,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(program.programId),
        executingPool: getExecutingPoolAccAddress(program.programId),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("deposit_seller_native")).readUInt32LE()
        ),
      } as any)
      .rpc({ skipPreflight: true, commitment: "confirmed" });

    await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      computationOffset,
      program.programId,
      "confirmed"
    );
    console.log("  ✅ Offer created & seller identity verified via MPC\n");

    // 3. SELLER DEPOSITS TO ESCROW
    console.log("🔒 STEP 3: Seller deposits token A to escrow vault...");

    const sellerVault = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("seller_vault"),
        seller.publicKey.toBuffer(),
        offerId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    )[0];

    const sellerBalanceBefore = await provider.connection.getBalance(seller.publicKey);
    console.log(`  Seller balance before: ${sellerBalanceBefore / anchor.web3.LAMPORTS_PER_SOL} SOL`);

    // Use Anchor RPC call with signer instead of manually composing/signing/sending the transaction.
    // This avoids errors related to stale/expired blockhashes when sending raw transactions.
    await program.methods
      .depositToSellerVault(offerId, tokenAAmount)
      .accountsPartial({
        seller: seller.publicKey,
        sellerVault: sellerVault,
      })
      .signers([seller])
      .rpc({ skipPreflight: true, commitment: "confirmed" });

    const sellerBalanceAfterDeposit = await provider.connection.getBalance(seller.publicKey);
    const vaultBalanceAfterSeller = await provider.connection.getBalance(sellerVault);

    console.log(`  Seller balance after:  ${sellerBalanceAfterDeposit / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`  Vault balance:         ${vaultBalanceAfterSeller / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`  ✅ Seller deposited ${tokenAAmount.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL to escrow\n`);

    // 4. BUYER FINALIZES OFFER
    console.log("🤝 STEP 4: Buyer finalizes offer...");

    const buyerComputationOffset = new anchor.BN(randomBytes(8), "hex");

    // Initialize finalize computation definition (already done in previous test)
    // await initFinalizeIntrachainOfferCompDef(program, owner, false, false);

    await program.methods
      .finalizeIntrachainOffer(
        offerId,
        Array.from(buyerCiphertext[0]),
        Array.from(buyerPublicKey),
        new anchor.BN(deserializeLE(buyerNonce).toString()),
        buyerComputationOffset
      )
      .accountsPartial({
        payer: buyer.publicKey,
        signPdaAccount: getSignPdaAccAddress(program.programId),
        computationAccount: getComputationAccAddress(
          program.programId,
          buyerComputationOffset
        ),
        clusterAccount: arciumEnv.arciumClusterPubkey,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(program.programId),
        executingPool: getExecutingPoolAccAddress(program.programId),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("finalize_intrachain_offer")).readUInt32LE()
        ),
      })
      .signers([buyer])
      .rpc({ skipPreflight: true, commitment: "confirmed" });

    await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      buyerComputationOffset,
      program.programId,
      "confirmed"
    );
    console.log("  ✅ Buyer identity verified via MPC\n");

    // 5. BUYER DEPOSITS TO ESCROW
    console.log("🔒 STEP 5: Buyer deposits token B to escrow vault...");

    const buyerVault = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("buyer_vault"),
        buyer.publicKey.toBuffer(),
        offerId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    )[0];

    const buyerBalanceBefore = await provider.connection.getBalance(buyer.publicKey);
    console.log(`  Buyer balance before:  ${buyerBalanceBefore / anchor.web3.LAMPORTS_PER_SOL} SOL`);

    // Use Anchor RPC call with signer for buyer deposit as well.
    await program.methods
      .depositToBuyerVault(offerId, tokenBAmount)
      .accountsPartial({
        buyer: buyer.publicKey,
        buyerVault: buyerVault,
      })
      .signers([buyer])
      .rpc({ skipPreflight: true, commitment: "confirmed" });

    const buyerBalanceAfterDeposit = await provider.connection.getBalance(buyer.publicKey);
    const vaultBalanceAfterBuyer = await provider.connection.getBalance(buyerVault);

    console.log(`  Buyer balance after:   ${buyerBalanceAfterDeposit / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`  Vault balance:         ${vaultBalanceAfterBuyer / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`  ✅ Buyer deposited ${tokenBAmount.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL to escrow\n`);

    // 6. EXECUTE ATOMIC SWAP
    console.log("⚡ STEP 6: Executing atomic swap...");
    console.log("  📊 Pre-swap balances:");
    console.log(`     Seller: ${sellerBalanceAfterDeposit / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`     Buyer:  ${buyerBalanceAfterDeposit / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`     Seller vault: ${vaultBalanceAfterSeller / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`     Buyer vault:  ${vaultBalanceAfterBuyer / anchor.web3.LAMPORTS_PER_SOL} SOL\n`);

    // Execute the swap via Anchor RPC. Include both seller and buyer as signers to ensure
    // any required signatures are present and to let Anchor manage recent blockhash fetching.
    await program.methods
      .executeIntrachainSwap(offerId)
      .accountsPartial({
        intrachainOffer: intrachainOffer,
        seller: seller.publicKey,
        buyer: buyer.publicKey,
        sellerVault: sellerVault,
        buyerVault: buyerVault,
      })
      .signers([seller, buyer])
      .rpc({ skipPreflight: true, commitment: "confirmed" });

    // 7. VERIFY FINAL BALANCES
    console.log("\n  📊 Post-swap balances:");

    const sellerFinal = await provider.connection.getBalance(seller.publicKey);
    const buyerFinal = await provider.connection.getBalance(buyer.publicKey);
    const sellerVaultFinal = await provider.connection.getBalance(sellerVault);
    const buyerVaultFinal = await provider.connection.getBalance(buyerVault);

    console.log(`     Seller: ${sellerFinal / anchor.web3.LAMPORTS_PER_SOL} SOL (+${(sellerFinal - sellerBalanceAfterDeposit) / anchor.web3.LAMPORTS_PER_SOL} SOL)`);
    console.log(`     Buyer:  ${buyerFinal / anchor.web3.LAMPORTS_PER_SOL} SOL (+${(buyerFinal - buyerBalanceAfterDeposit) / anchor.web3.LAMPORTS_PER_SOL} SOL)`);
    console.log(`     Seller vault: ${sellerVaultFinal / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`     Buyer vault:  ${buyerVaultFinal / anchor.web3.LAMPORTS_PER_SOL} SOL\n`);

    // Assertions - verify that assets were transferred correctly
    // Vaults should have much less than their deposited amounts (only rent-exempt minimum remains)
    expect(sellerVaultFinal).to.be.below(tokenAAmount.toNumber(), "Seller vault should be drained of deposited token A");
    expect(buyerVaultFinal).to.be.below(tokenBAmount.toNumber(), "Buyer vault should be drained of deposited token B");

    const sellerGain = sellerFinal - sellerBalanceAfterDeposit;
    const buyerGain = buyerFinal - buyerBalanceAfterDeposit;

    // Allow for small transaction fee differences (within 1% of expected amount)
    const feeTolerance = tokenBAmount.toNumber() * 0.01; // 1% tolerance
    expect(Math.abs(sellerGain - tokenBAmount.toNumber())).to.be.below(feeTolerance, "Seller should receive approximately token B (accounting for fees)");
    expect(Math.abs(buyerGain - tokenAAmount.toNumber())).to.be.below(feeTolerance, "Buyer should receive approximately token A (accounting for fees)");

    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║  ✅ SWAP SUCCESSFUL!                                         ║");
    console.log("║  • Identities verified confidentially via MPC                ║");
    console.log("║  • Assets swapped atomically via escrow                      ║");
    console.log("║  • Balances validated correctly                              ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");
  });

  async function initAddTogetherCompDef(
    program: Program<ConfidentialCrossChainExchange>,
    owner: anchor.web3.Keypair,
    uploadRawCircuit: boolean,
    offchainSource: boolean
  ): Promise<string> {
    const baseSeedCompDefAcc = getArciumAccountBaseSeed(
      "ComputationDefinitionAccount"
    );
    const offset = getCompDefAccOffset("add_together");

    const compDefPDA = PublicKey.findProgramAddressSync(
      [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
      getArciumProgAddress()
    )[0];

    console.log("Comp def pda is ", compDefPDA);

    const sig = await program.methods
      .initAddTogetherCompDef()
      .accounts({
        compDefAccount: compDefPDA,
        payer: owner.publicKey,
        mxeAccount: getMXEAccAddress(program.programId),
      })
      .signers([owner])
      .rpc({
        commitment: "confirmed",
      });
    console.log("Init add together computation definition transaction", sig);

    if (uploadRawCircuit) {
      const rawCircuit = fs.readFileSync("build/add_together.arcis");

      await uploadCircuit(
        provider as anchor.AnchorProvider,
        "add_together",
        program.programId,
        rawCircuit,
        true
      );
    } else if (!offchainSource) {
      const finalizeTx = await buildFinalizeCompDefTx(
        provider as anchor.AnchorProvider,
        Buffer.from(offset).readUInt32LE(),
        program.programId
      );

      const latestBlockhash = await provider.connection.getLatestBlockhash();
      finalizeTx.recentBlockhash = latestBlockhash.blockhash;
      finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

      finalizeTx.sign(owner);

      await provider.sendAndConfirm(finalizeTx);
    }
    return sig;
  }
  async function initRelayOfferCloneCompDef(
    program: Program<ConfidentialCrossChainExchange>,
    owner: anchor.web3.Keypair,
    uploadRawCircuit: boolean,
    offchainSource: boolean
  ): Promise<string> {
    const baseSeedCompDefAcc = getArciumAccountBaseSeed(
      "ComputationDefinitionAccount"
    );
    const offset = getCompDefAccOffset("relay_offer_clone");

    const compDefPDA = PublicKey.findProgramAddressSync(
      [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
      getArciumProgAddress()
    )[0];

    console.log("Comp def pda is ", compDefPDA);

    const sig = await program.methods
      .initRelayOfferCloneCompDef()
      .accounts({
        compDefAccount: compDefPDA,
        payer: owner.publicKey,
        mxeAccount: getMXEAccAddress(program.programId),
      })
      .signers([owner])
      .rpc({
        commitment: "confirmed",
      });
    console.log("Init relay offer clone computation definition transaction", sig);

    if (uploadRawCircuit) {
      const rawCircuit = fs.readFileSync("build/relay_offer_clone.arcis");

      await uploadCircuit(
        provider as anchor.AnchorProvider,
        "relay_offer_clone",
        program.programId,
        rawCircuit,
        true
      );
    } else if (!offchainSource) {
      const finalizeTx = await buildFinalizeCompDefTx(
        provider as anchor.AnchorProvider,
        Buffer.from(offset).readUInt32LE(),
        program.programId
      );

      const latestBlockhash = await provider.connection.getLatestBlockhash();
      finalizeTx.recentBlockhash = latestBlockhash.blockhash;
      finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

      finalizeTx.sign(owner);

      await provider.sendAndConfirm(finalizeTx);
    }
    return sig;
  }

  async function initConfidentialDepositNativeCompDef(
    program: Program<ConfidentialCrossChainExchange>,
    owner: anchor.web3.Keypair,
    uploadRawCircuit: boolean,
    offchainSource: boolean
  ): Promise<string> {
    const baseSeedCompDefAcc = getArciumAccountBaseSeed(
      "ComputationDefinitionAccount"
    );
    const offset = getCompDefAccOffset("confidential_deposit_native");

    const compDefPDA = PublicKey.findProgramAddressSync(
      [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
      getArciumProgAddress()
    )[0];

    console.log("Comp def pda is ", compDefPDA);

    const sig = await program.methods
      .initConfidentialDepositNativeCompDef()
      .accounts({
        compDefAccount: compDefPDA,
        payer: owner.publicKey,
        mxeAccount: getMXEAccAddress(program.programId),
      })
      .signers([owner])
      .rpc({
        commitment: "confirmed",
      });
    console.log(
      "Init confidential deposit native computation definition transaction",
      sig
    );

    if (uploadRawCircuit) {
      const rawCircuit = fs.readFileSync(
        "build/confidential_deposit_native.arcis"
      );

      await uploadCircuit(
        provider as anchor.AnchorProvider,
        "confidential_deposit_native",
        program.programId,
        rawCircuit,
        true
      );
    } else if (!offchainSource) {
      const finalizeTx = await buildFinalizeCompDefTx(
        provider as anchor.AnchorProvider,
        Buffer.from(offset).readUInt32LE(),
        program.programId
      );

      const latestBlockhash = await provider.connection.getLatestBlockhash();
      finalizeTx.recentBlockhash = latestBlockhash.blockhash;
      finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

      finalizeTx.sign(owner);

      await provider.sendAndConfirm(finalizeTx);
    }
    return sig;
  }

  async function initInterchainOriginEvmDepositSellerSplCompDef(
    program: Program<ConfidentialCrossChainExchange>,
    owner: anchor.web3.Keypair,
    uploadRawCircuit: boolean,
    offchainSource: boolean
  ): Promise<string> {
    const baseSeedCompDefAcc = getArciumAccountBaseSeed(
      "ComputationDefinitionAccount"
    );
    const offset = getCompDefAccOffset("interchain_origin_evm_deposit_seller_spl");

    const compDefPDA = PublicKey.findProgramAddressSync(
      [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
      getArciumProgAddress()
    )[0];

    console.log("Comp def pda is ", compDefPDA);

    const sig = await program.methods
      .initInterchainOriginEvmDepositSellerSplCompDef()
      .accounts({
        compDefAccount: compDefPDA,
        payer: owner.publicKey,
        mxeAccount: getMXEAccAddress(program.programId),
      })
      .signers([owner])
      .rpc({
        commitment: "confirmed",
      });
    console.log(
      "Init interchain origin EVM deposit seller SPL computation definition transaction",
      sig
    );

    if (uploadRawCircuit) {
      try {
        const rawCircuit = fs.readFileSync(
          "build/interchain_origin_evm_deposit_seller_spl.arcis"
        );

        await uploadCircuit(
          provider as anchor.AnchorProvider,
          "interchain_origin_evm_deposit_seller_spl",
          program.programId,
          rawCircuit,
          true
        );
      } catch (error) {
        console.log("Upload failed, perhaps already uploaded", error.message);
      }

      // Finalize after upload
      const finalizeTx = await buildFinalizeCompDefTx(
        provider as anchor.AnchorProvider,
        Buffer.from(offset).readUInt32LE(),
        program.programId
      );

      const latestBlockhash = await provider.connection.getLatestBlockhash();
      finalizeTx.recentBlockhash = latestBlockhash.blockhash;
      finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

      finalizeTx.sign(owner);

      await provider.sendAndConfirm(finalizeTx);
      console.log("Finalize sig is ", finalizeTx.signature);
    } else if (!offchainSource) {
      const finalizeTx = await buildFinalizeCompDefTx(
        provider as anchor.AnchorProvider,
        Buffer.from(offset).readUInt32LE(),
        program.programId
      );

      const latestBlockhash = await provider.connection.getLatestBlockhash();
      finalizeTx.recentBlockhash = latestBlockhash.blockhash;
      finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

      finalizeTx.sign(owner);

      await provider.sendAndConfirm(finalizeTx);
      console.log("Finalize sig is ", finalizeTx.signature);
    }

    // Always finalize for interchain
    const finalizeTx = await buildFinalizeCompDefTx(
      provider as anchor.AnchorProvider,
      Buffer.from(offset).readUInt32LE(),
      program.programId
    );

    const latestBlockhash = await provider.connection.getLatestBlockhash();
    finalizeTx.recentBlockhash = latestBlockhash.blockhash;
    finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

    finalizeTx.sign(owner);

    await provider.sendAndConfirm(finalizeTx);
    console.log("Finalize sig is ", finalizeTx.signature);
    return sig;
  }

  async function initFinalizeInterchainOriginEvmOfferCompDef(
    program: Program<ConfidentialCrossChainExchange>,
    owner: anchor.web3.Keypair,
    uploadRawCircuit: boolean,
    offchainSource: boolean
  ): Promise<string> {
    const baseSeedCompDefAcc = getArciumAccountBaseSeed(
      "ComputationDefinitionAccount"
    );
    const offset = getCompDefAccOffset("finalize_interchain_origin_evm_offer");

    const compDefPDA = PublicKey.findProgramAddressSync(
      [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
      getArciumProgAddress()
    )[0];

    console.log("Comp def pda is ", compDefPDA);

    const sig = await program.methods
      .initFinalizeInterchainOriginEvmOfferCompDef()
      .accounts({
        compDefAccount: compDefPDA,
        payer: owner.publicKey,
        mxeAccount: getMXEAccAddress(program.programId),
      })
      .signers([owner])
      .rpc({
        commitment: "confirmed",
      });
    console.log(
      "Init finalize interchain origin EVM offer computation definition transaction",
      sig
    );

    if (uploadRawCircuit) {
      const rawCircuit = fs.readFileSync(
        "build/finalize_interchain_origin_evm_offer.arcis"
      );

      await uploadCircuit(
        provider as anchor.AnchorProvider,
        "finalize_interchain_origin_evm_offer",
        program.programId,
        rawCircuit,
        true
      );
    } else if (!offchainSource) {
      const finalizeTx = await buildFinalizeCompDefTx(
        provider as anchor.AnchorProvider,
        Buffer.from(offset).readUInt32LE(),
        program.programId
      );

      const latestBlockhash = await provider.connection.getLatestBlockhash();
      finalizeTx.recentBlockhash = latestBlockhash.blockhash;
      finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

      finalizeTx.sign(owner);

      await provider.sendAndConfirm(finalizeTx);
    }
    return sig;
  }

  async function initDepositSellerNativeCompDef(
    program: Program<ConfidentialCrossChainExchange>,
    owner: anchor.web3.Keypair,
    uploadRawCircuit: boolean,
    offchainSource: boolean
  ): Promise<string> {
    const baseSeedCompDefAcc = getArciumAccountBaseSeed(
      "ComputationDefinitionAccount"
    );
    const offset = getCompDefAccOffset("deposit_seller_native");

    const compDefPDA = PublicKey.findProgramAddressSync(
      [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
      getArciumProgAddress()
    )[0];

    console.log("Comp def pda is ", compDefPDA);

    const sig = await program.methods
      .initDepositSellerNativeCompDef()
      .accounts({
        compDefAccount: compDefPDA,
        payer: owner.publicKey,
        mxeAccount: getMXEAccAddress(program.programId),
      })
      .signers([owner])
      .rpc({
        commitment: "confirmed",
      });
    console.log(
      "Init deposit seller native computation definition transaction",
      sig
    );

    if (uploadRawCircuit) {
      const rawCircuit = fs.readFileSync(
        "build/deposit_seller_native.arcis"
      );

      await uploadCircuit(
        provider as anchor.AnchorProvider,
        "deposit_seller_native",
        program.programId,
        rawCircuit,
        true
      );
    } else if (!offchainSource) {
      const finalizeTx = await buildFinalizeCompDefTx(
        provider as anchor.AnchorProvider,
        Buffer.from(offset).readUInt32LE(),
        program.programId
      );

      const latestBlockhash = await provider.connection.getLatestBlockhash();
      finalizeTx.recentBlockhash = latestBlockhash.blockhash;
      finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

      finalizeTx.sign(owner);

      await provider.sendAndConfirm(finalizeTx);
    }
    return sig;
  }

  async function initDepositSellerSplCompDef(
    program: Program<ConfidentialCrossChainExchange>,
    owner: anchor.web3.Keypair,
    uploadRawCircuit: boolean,
    offchainSource: boolean
  ): Promise<string> {
    const baseSeedCompDefAcc = getArciumAccountBaseSeed(
      "ComputationDefinitionAccount"
    );
    const offset = getCompDefAccOffset("deposit_seller_spl");

    const compDefPDA = PublicKey.findProgramAddressSync(
      [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
      getArciumProgAddress()
    )[0];

    console.log("Comp def pda is ", compDefPDA);

    const sig = await program.methods
      .initDepositSellerSplCompDef()
      .accounts({
        compDefAccount: compDefPDA,
        payer: owner.publicKey,
        mxeAccount: getMXEAccAddress(program.programId),
      })
      .signers([owner])
      .rpc({
        commitment: "confirmed",
      });
    console.log(
      "Init deposit seller SPL computation definition transaction",
      sig
    );

    if (uploadRawCircuit) {
      const rawCircuit = fs.readFileSync(
        "build/deposit_seller_spl.arcis"
      );

      await uploadCircuit(
        provider as anchor.AnchorProvider,
        "deposit_seller_spl",
        program.programId,
        rawCircuit,
        true
      );
    } else if (!offchainSource) {
      const finalizeTx = await buildFinalizeCompDefTx(
        provider as anchor.AnchorProvider,
        Buffer.from(offset).readUInt32LE(),
        program.programId
      );

      const latestBlockhash = await provider.connection.getLatestBlockhash();
      finalizeTx.recentBlockhash = latestBlockhash.blockhash;
      finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

      finalizeTx.sign(owner);

      await provider.sendAndConfirm(finalizeTx);
    }
    return sig;
  }

  async function initFinalizeIntrachainOfferCompDef(
    program: Program<ConfidentialCrossChainExchange>,
    owner: anchor.web3.Keypair,
    uploadRawCircuit: boolean,
    offchainSource: boolean
  ): Promise<string> {
    const baseSeedCompDefAcc = getArciumAccountBaseSeed(
      "ComputationDefinitionAccount"
    );
    const offset = getCompDefAccOffset("finalize_intrachain_offer");

    const compDefPDA = PublicKey.findProgramAddressSync(
      [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
      getArciumProgAddress()
    )[0];

    console.log("Comp def pda is ", compDefPDA);

    const sig = await program.methods
      .initFinalizeIntrachainOfferCompDef()
      .accounts({
        compDefAccount: compDefPDA,
        payer: owner.publicKey,
        mxeAccount: getMXEAccAddress(program.programId),
      })
      .signers([owner])
      .rpc({
        commitment: "confirmed",
      });
    console.log(
      "Init finalize intrachain offer computation definition transaction",
      sig
    );

    if (uploadRawCircuit) {
      const rawCircuit = fs.readFileSync(
        "build/finalize_intrachain_offer.arcis"
      );

      await uploadCircuit(
        provider as anchor.AnchorProvider,
        "finalize_intrachain_offer",
        program.programId,
        rawCircuit,
        true
      );
    } else if (!offchainSource) {
      const finalizeTx = await buildFinalizeCompDefTx(
        provider as anchor.AnchorProvider,
        Buffer.from(offset).readUInt32LE(),
        program.programId
      );

      const latestBlockhash = await provider.connection.getLatestBlockhash();
      finalizeTx.recentBlockhash = latestBlockhash.blockhash;
      finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

      finalizeTx.sign(owner);

      await provider.sendAndConfirm(finalizeTx);
    }
    return sig;
  }
});

async function getMXEPublicKeyWithRetry(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  maxRetries: number = 10,
  retryDelayMs: number = 500
): Promise<Uint8Array> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const mxePublicKey = await getMXEPublicKey(provider, programId);
      if (mxePublicKey) {
        return mxePublicKey;
      }
    } catch (error) {
      console.log(`Attempt ${attempt} failed to fetch MXE public key:`, error);
    }

    if (attempt < maxRetries) {
      console.log(
        `Retrying in ${retryDelayMs}ms... (attempt ${attempt}/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error(
    `Failed to fetch MXE public key after ${maxRetries} attempts`
  );
}

function readKpJson(path: string): anchor.web3.Keypair {
  const file = fs.readFileSync(path);
  return anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(file.toString()))
  );
}
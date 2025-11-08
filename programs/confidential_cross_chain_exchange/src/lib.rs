use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer as SplTransfer};
use anchor_spl::associated_token::{self, AssociatedToken};
use arcium_anchor::prelude::*;

const COMP_DEF_OFFSET_ADD_TOGETHER: u32 = comp_def_offset("add_together");
const COMP_DEF_OFFSET_RELAY_OFFER_CLONE: u32 = comp_def_offset("relay_offer_clone");
const COMP_DEF_OFFSET_CONFIDENTIAL_DEPOSIT_NATIVE: u32 = comp_def_offset("confidential_deposit_native");
const COMP_DEF_OFFSET_INTERCHAIN_ORIGIN_EVM_DEPOSIT_SELLER_SPL: u32 = comp_def_offset("interchain_origin_evm_deposit_seller_spl");
const COMP_DEF_OFFSET_FINALIZE_INTERCHAIN_ORIGIN_EVM_OFFER: u32 = comp_def_offset("finalize_interchain_origin_evm_offer");
const COMP_DEF_OFFSET_DEPOSIT_SELLER_NATIVE: u32 = comp_def_offset("deposit_seller_native");
const COMP_DEF_OFFSET_DEPOSIT_SELLER_SPL: u32 = comp_def_offset("deposit_seller_spl");
const COMP_DEF_OFFSET_FINALIZE_INTRACHAIN_OFFER: u32 = comp_def_offset("finalize_intrachain_offer");


declare_id!("DzueqW4xsJRhv5pQdcwTsWgeKcV2xfEoKRALN4Ma8dHd");

#[arcium_program]
pub mod confidential_cross_chain_exchange {
    use super::*;

    pub fn init_add_together_comp_def(ctx: Context<InitAddTogetherCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, true, 0, None, None)?;
        Ok(())
    }

    pub fn add_together(
        ctx: Context<AddTogether>,
        computation_offset: u64,
        ciphertext_0: [u8; 32],
        ciphertext_1: [u8; 32],
        pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
        let args = vec![
            Argument::ArcisPubkey(pub_key),
            Argument::PlaintextU128(nonce),
            Argument::EncryptedU8(ciphertext_0),
            Argument::EncryptedU8(ciphertext_1),
        ];

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![AddTogetherCallback::callback_ix(&[])],
        )?;

        Ok(())
    }

    pub fn init_relay_offer_clone_comp_def(ctx: Context<InitRelayOfferCloneCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, true, 0, None, None)?;
        Ok(())
    }

    pub fn init_confidential_deposit_native_comp_def(ctx: Context<InitConfidentialDepositNativeCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, true, 0, None, None)?;
        Ok(())
    }

    pub fn init_interchain_origin_evm_deposit_seller_spl_comp_def(ctx: Context<InitInterchainOriginEvmDepositSellerSplCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, true, 0, None, None)?;
        Ok(())
    }

    pub fn init_finalize_interchain_origin_evm_offer_comp_def(ctx: Context<InitFinalizeInterchainOriginEvmOfferCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, true, 0, None, None)?;
        Ok(())
    }

    pub fn init_deposit_seller_native_comp_def(ctx: Context<InitDepositSellerNativeCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, true, 0, None, None)?;
        Ok(())
    }

    pub fn init_deposit_seller_spl_comp_def(ctx: Context<InitDepositSellerSplCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, true, 0, None, None)?;
        Ok(())
    }

    pub fn init_finalize_intrachain_offer_comp_def(ctx: Context<InitFinalizeIntrachainOfferCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, true, 0, None, None)?;
        Ok(())
    }


    pub fn relay_offer_clone(
        ctx: Context<RelayOfferClone>,
        // Public business fields (matching original program)
        id: u64,
        token_b_wanted_amount: u64,
        token_a_offered_amount: u64,
        is_taker_native: bool,
        chain_id: u64,
        deadline: i64,
        // Confidential identity
        ciphertext_external_seller_identity_hash: [u8; 32],
        // Arcium handshake
        pub_key: [u8; 32],
        nonce: u128,
        computation_offset: u64,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
        
        // Store public metadata in PDA
        let offer = &mut ctx.accounts.interchain_offer;
        offer.id = id;
        offer.token_a_offered_amount = token_a_offered_amount;
        offer.token_b_wanted_amount = token_b_wanted_amount;
        offer.is_taker_native = is_taker_native;
        offer.chain_id = chain_id;
        offer.deadline = deadline;
        offer.bump = ctx.bumps.interchain_offer;

        // Only pass encrypted inputs expected by the circuit (handshake + encrypted identity)
        let args = vec![
            Argument::ArcisPubkey(pub_key),
            Argument::PlaintextU128(nonce),
            Argument::EncryptedU64(ciphertext_external_seller_identity_hash),
        ];

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![RelayOfferCloneCallback::callback_ix(&[])],
        )?;

        Ok(())
    }

    pub fn confidential_deposit_native(
        ctx: Context<ConfidentialDepositNative>,
        computation_offset: u64,
        ciphertext_amount: [u8; 32],
        pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
        let args = vec![
            Argument::ArcisPubkey(pub_key),
            Argument::PlaintextU128(nonce),
            Argument::EncryptedU64(ciphertext_amount),
        ];

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![ConfidentialDepositNativeCallback::callback_ix(&[])],
        )?;

        Ok(())
    }

    pub fn interchain_origin_evm_deposit_seller_spl(
        ctx: Context<InterchainOriginEvmDepositSellerSpl>,
        // Public business fields
        id: u64,
        token_b_wanted_amount: u64,
        token_a_offered_amount: u64,
        is_taker_native: bool,
        chain_id: u64,
        deadline: i64,
        // Confidential identity
        ciphertext_seller_identity_hash: [u8; 32],
        // Arcium handshake
        pub_key: [u8; 32],
        nonce: u128,
        computation_offset: u64,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
        
        // Store public metadata in PDA
        let offer = &mut ctx.accounts.interchain_offer;
        offer.id = id;
        offer.token_a_offered_amount = token_a_offered_amount;
        offer.token_b_wanted_amount = token_b_wanted_amount;
        offer.is_taker_native = is_taker_native;
        offer.chain_id = chain_id;
        offer.deadline = deadline;
        offer.bump = ctx.bumps.interchain_offer;

        // Only pass encrypted inputs expected by the circuit
        let args = vec![
            Argument::ArcisPubkey(pub_key),
            Argument::PlaintextU128(nonce),
            Argument::EncryptedU64(ciphertext_seller_identity_hash),
        ];

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![InterchainOriginEvmDepositSellerSplCallback::callback_ix(&[])],
        )?;

        Ok(())
    }

    pub fn finalize_interchain_origin_evm_offer(
        ctx: Context<FinalizeInterchainOriginEvmOffer>,
        // Public business field
        id: u64,
        // Confidential buyer identity
        ciphertext_buyer_identity_hash: [u8; 32],
        // Arcium handshake
        pub_key: [u8; 32],
        nonce: u128,
        computation_offset: u64,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
        // Circuit expects only encrypted buyer identity (plus handshake)
        let args = vec![
            Argument::ArcisPubkey(pub_key),
            Argument::PlaintextU128(nonce),
            Argument::EncryptedU64(ciphertext_buyer_identity_hash),
        ];

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![FinalizeInterchainOriginEvmOfferCallback::callback_ix(&[])],
        )?;

        Ok(())
    }

    pub fn deposit_seller_native(
        ctx: Context<DepositSellerNative>,
        // Public business fields (matching original program)
        id: u64,
        token_b_wanted_amount: u64,
        token_a_offered_amount: u64,
        is_taker_native: bool,
        deadline: i64,
        // Confidential identity
        ciphertext_seller_identity_hash: [u8; 32],
        // Arcium handshake
        pub_key: [u8; 32],
        nonce: u128,
        computation_offset: u64,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
        
        // Store public metadata in PDA
        let offer = &mut ctx.accounts.intrachain_offer;
        offer.id = id;
        offer.token_a_offered_amount = token_a_offered_amount;
        offer.token_b_wanted_amount = token_b_wanted_amount;
        offer.is_taker_native = is_taker_native;
        offer.deadline = deadline;
        offer.bump = ctx.bumps.intrachain_offer;

        // Only pass encrypted inputs expected by the circuit
        let args = vec![
            Argument::ArcisPubkey(pub_key),
            Argument::PlaintextU128(nonce),
            Argument::EncryptedU64(ciphertext_seller_identity_hash),
        ];

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![DepositSellerNativeCallback::callback_ix(&[])],
        )?;

        Ok(())
    }

    pub fn deposit_seller_spl(
        ctx: Context<DepositSellerSpl>,
        // Public business fields (matching original program)
        id: u64,
        token_b_wanted_amount: u64,
        token_a_offered_amount: u64,
        is_taker_native: bool,
        deadline: i64,
        // Confidential identity
        ciphertext_seller_identity_hash: [u8; 32],
        // Arcium handshake
        pub_key: [u8; 32],
        nonce: u128,
        computation_offset: u64,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
        
        // Store public metadata in PDA
        let offer = &mut ctx.accounts.intrachain_offer;
        offer.id = id;
        offer.token_a_offered_amount = token_a_offered_amount;
        offer.token_b_wanted_amount = token_b_wanted_amount;
        offer.is_taker_native = is_taker_native;
        offer.deadline = deadline;
        offer.bump = ctx.bumps.intrachain_offer;

        // Only pass encrypted inputs expected by the circuit
        let args = vec![
            Argument::ArcisPubkey(pub_key),
            Argument::PlaintextU128(nonce),
            Argument::EncryptedU64(ciphertext_seller_identity_hash),
        ];

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![DepositSellerSplCallback::callback_ix(&[])],
        )?;

        Ok(())
    }

    pub fn finalize_intrachain_offer(
        ctx: Context<FinalizeIntrachainOffer>,
        // Public business field
        id: u64,
        // Confidential buyer identity
        ciphertext_buyer_identity_hash: [u8; 32],
        // Arcium handshake
        pub_key: [u8; 32],
        nonce: u128,
        computation_offset: u64,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
        // Circuit expects only encrypted buyer identity (plus handshake)
        let args = vec![
            Argument::ArcisPubkey(pub_key),
            Argument::PlaintextU128(nonce),
            Argument::EncryptedU64(ciphertext_buyer_identity_hash),
        ];

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![FinalizeIntrachainOfferCallback::callback_ix(&[])],
        )?;

        Ok(())
    }

    // === ASSET TRANSFER INSTRUCTIONS ===
    
    /// Execute atomic swap after both identities verified via MPC
    pub fn execute_intrachain_swap(
        ctx: Context<ExecuteIntrachainSwap>,
        offer_id: u64,
    ) -> Result<()> {
        let offer = &ctx.accounts.intrachain_offer;
        
        msg!("🔄 Executing intrachain swap for offer ID: {}", offer_id);
        msg!("  Seller vault → Buyer: {} lamports (token A)", offer.token_a_offered_amount);
        msg!("  Buyer vault → Seller: {} lamports (token B)", offer.token_b_wanted_amount);

        // Transfer token A from seller vault to buyer
        **ctx.accounts.seller_vault.to_account_info().try_borrow_mut_lamports()? -= offer.token_a_offered_amount;
        **ctx.accounts.buyer.to_account_info().try_borrow_mut_lamports()? += offer.token_a_offered_amount;

        // Transfer token B from buyer vault to seller
        **ctx.accounts.buyer_vault.to_account_info().try_borrow_mut_lamports()? -= offer.token_b_wanted_amount;
        **ctx.accounts.seller.to_account_info().try_borrow_mut_lamports()? += offer.token_b_wanted_amount;

        msg!("✅ Swap completed successfully");
        Ok(())
    }

    /// Execute atomic swap for interchain offers after identities verified
    pub fn execute_interchain_swap(
        ctx: Context<ExecuteInterchainSwap>,
        offer_id: u64,
    ) -> Result<()> {
        let offer = &ctx.accounts.interchain_offer;
        
        msg!("🔄 Executing interchain swap for offer ID: {}", offer_id);
        msg!("  Seller vault → Buyer: {} lamports (token A)", offer.token_a_offered_amount);
        msg!("  Buyer vault → Seller: {} lamports (token B)", offer.token_b_wanted_amount);

        // Transfer token A from seller vault to buyer
        **ctx.accounts.seller_vault.to_account_info().try_borrow_mut_lamports()? -= offer.token_a_offered_amount;
        **ctx.accounts.buyer.to_account_info().try_borrow_mut_lamports()? += offer.token_a_offered_amount;

        // Transfer token B from buyer vault to seller
        **ctx.accounts.buyer_vault.to_account_info().try_borrow_mut_lamports()? -= offer.token_b_wanted_amount;
        **ctx.accounts.seller.to_account_info().try_borrow_mut_lamports()? += offer.token_b_wanted_amount;

        msg!("✅ Swap completed successfully");
        Ok(())
    }

    /// Deposit seller assets into escrow vault
    pub fn deposit_to_seller_vault(
        ctx: Context<DepositToSellerVault>,
        offer_id: u64,
        amount: u64,
    ) -> Result<()> {
        msg!("💰 Seller depositing {} lamports to vault", amount);
        
        // Transfer from seller to vault
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.seller.to_account_info(),
                    to: ctx.accounts.seller_vault.to_account_info(),
                },
            ),
            amount,
        )?;

        msg!("✅ Deposit successful");
        Ok(())
    }

    /// Deposit buyer assets into escrow vault
    pub fn deposit_to_buyer_vault(
        ctx: Context<DepositToBuyerVault>,
        offer_id: u64,
        amount: u64,
    ) -> Result<()> {
        msg!("💰 Buyer depositing {} lamports to vault", amount);
        
        // Transfer from buyer to vault
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.buyer_vault.to_account_info(),
                },
            ),
            amount,
        )?;

        msg!("✅ Deposit successful");
        Ok(())
    }


    #[arcium_callback(encrypted_ix = "add_together")]
    pub fn add_together_callback(
        ctx: Context<AddTogetherCallback>,
        output: ComputationOutputs<AddTogetherOutput>,
    ) -> Result<()> {
        let o = match output {
            ComputationOutputs::Success(AddTogetherOutput { field_0 }) => field_0,
            _ => return Err(ErrorCode::AbortedComputation.into()),
        };

        emit!(SumEvent {
            sum: o.ciphertexts[0],
            nonce: o.nonce.to_le_bytes(),
        });
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "relay_offer_clone")]
    pub fn relay_offer_clone_callback(
        ctx: Context<RelayOfferCloneCallback>,
        output: ComputationOutputs<RelayOfferCloneOutput>,
    ) -> Result<()> {
        let _o = match output {
            ComputationOutputs::Success(RelayOfferCloneOutput { field_0 }) => field_0,
            _ => return Err(ErrorCode::AbortedComputation.into()),
        };

        // Public data already stored in PDA during relay_offer_clone call
        // Just emit acknowledgment
        emit!(RelayOfferClonedEvent {
            acknowledged: 1,
        });
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "confidential_deposit_native")]
    pub fn confidential_deposit_native_callback(
        ctx: Context<ConfidentialDepositNativeCallback>,
        output: ComputationOutputs<ConfidentialDepositNativeOutput>,
    ) -> Result<()> {
        let o = match output {
            ComputationOutputs::Success(ConfidentialDepositNativeOutput { field_0 }) => field_0,
            _ => return Err(ErrorCode::AbortedComputation.into()),
        };

        emit!(ConfidentialDepositNativeEvent {
            processed_amount: o.ciphertexts[0],
            nonce: o.nonce.to_le_bytes(),
        });
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "interchain_origin_evm_deposit_seller_spl")]
    pub fn interchain_origin_evm_deposit_seller_spl_callback(
        ctx: Context<InterchainOriginEvmDepositSellerSplCallback>,
        output: ComputationOutputs<InterchainOriginEvmDepositSellerSplOutput>,
    ) -> Result<()> {
        let _o = match output {
            ComputationOutputs::Success(InterchainOriginEvmDepositSellerSplOutput { field_0 }) => field_0,
            _ => return Err(ErrorCode::AbortedComputation.into()),
        };

        // Public data already stored in PDA during interchain_origin_evm_deposit_seller_spl call
        emit!(InterchainOriginEvmDepositSellerSplEvent {
            acknowledged: 1,
        });
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "finalize_interchain_origin_evm_offer")]
    pub fn finalize_interchain_origin_evm_offer_callback(
        ctx: Context<FinalizeInterchainOriginEvmOfferCallback>,
        output: ComputationOutputs<FinalizeInterchainOriginEvmOfferOutput>,
    ) -> Result<()> {
        let _o = match output {
            ComputationOutputs::Success(FinalizeInterchainOriginEvmOfferOutput { field_0 }) => field_0,
            _ => return Err(ErrorCode::AbortedComputation.into()),
        };

        // TODO: Asset transfers require vault accounts to be passed to callback
        // For now, just emit acknowledgment event
        // In production, you would:
        // 1. Pass seller/buyer vault accounts to this callback
        // 2. Deserialize the interchain_offer PDA to read amounts
        // 3. Execute SOL or SPL token transfers based on is_taker_native flag
        
        msg!("✅ Finalize interchain offer callback executed - identity verified via MPC");

        emit!(FinalizeInterchainOriginEvmOfferEvent {
            acknowledged: 1,
        });
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "deposit_seller_native")]
    pub fn deposit_seller_native_callback(
        ctx: Context<DepositSellerNativeCallback>,
        output: ComputationOutputs<DepositSellerNativeOutput>,
    ) -> Result<()> {
        let _o = match output {
            ComputationOutputs::Success(DepositSellerNativeOutput { field_0 }) => field_0,
            _ => return Err(ErrorCode::AbortedComputation.into()),
        };

        // Public data already stored in PDA during deposit_seller_native call
        emit!(DepositSellerNativeEvent {
            acknowledged: 1,
        });
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "deposit_seller_spl")]
    pub fn deposit_seller_spl_callback(
        ctx: Context<DepositSellerSplCallback>,
        output: ComputationOutputs<DepositSellerSplOutput>,
    ) -> Result<()> {
        let _o = match output {
            ComputationOutputs::Success(DepositSellerSplOutput { field_0 }) => field_0,
            _ => return Err(ErrorCode::AbortedComputation.into()),
        };

        // Public data already stored in PDA during deposit_seller_spl call
        emit!(DepositSellerSplEvent {
            acknowledged: 1,
        });
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "finalize_intrachain_offer")]
    pub fn finalize_intrachain_offer_callback(
            ctx: Context<FinalizeIntrachainOfferCallback>,
        output: ComputationOutputs<FinalizeIntrachainOfferOutput>,
    ) -> Result<()> {
            let _o = match output {
            ComputationOutputs::Success(FinalizeIntrachainOfferOutput { field_0 }) => field_0,
            _ => return Err(ErrorCode::AbortedComputation.into()),
        };

        // TODO: Asset transfers require vault accounts to be passed to callback
        // For now, just emit acknowledgment event
        // In production, you would:
        // 1. Pass seller/buyer vault accounts to this callback
        // 2. Deserialize the intrachain_offer PDA to read amounts
        // 3. Execute SOL or SPL token transfers based on is_taker_native flag
        
        msg!("✅ Finalize intrachain offer callback executed - identity verified via MPC");

        emit!(FinalizeIntrachainOfferEvent {
                acknowledged: 1,
        });
        Ok(())
    }
}

#[queue_computation_accounts("add_together", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct AddTogether<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, SignerAccount>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(
        mut,
        address = derive_mempool_pda!()
    )]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!()
    )]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset)
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_ADD_TOGETHER)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Account<'info, FeePool>,
    #[account(
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS
    )]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}


#[queue_computation_accounts("relay_offer_clone", payer)]
#[derive(Accounts)]
#[instruction(id: u64, token_b_wanted_amount: u64, token_a_offered_amount: u64, is_taker_native: bool, chain_id: u64, deadline: i64, ciphertext_external_seller_identity_hash: [u8; 32], pub_key: [u8; 32], nonce: u128, computation_offset: u64)]
pub struct RelayOfferClone<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + 8 + 8 + 8 + 1 + 8 + 8 + 1,
        seeds = [b"InterChainoffer", payer.key().as_ref(), &id.to_le_bytes()],
        bump
    )]
    pub interchain_offer: Account<'info, InterchainOffer>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, SignerAccount>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(
        mut,
        address = derive_mempool_pda!()
    )]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!()
    )]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset)
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_RELAY_OFFER_CLONE)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Account<'info, FeePool>,
    #[account(
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS
    )]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[queue_computation_accounts("confidential_deposit_native", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct ConfidentialDepositNative<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, SignerAccount>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(
        mut,
        address = derive_mempool_pda!()
    )]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!()
    )]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset)
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_CONFIDENTIAL_DEPOSIT_NATIVE)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Account<'info, FeePool>,
    #[account(
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS
    )]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[queue_computation_accounts("interchain_origin_evm_deposit_seller_spl", payer)]
#[derive(Accounts)]
#[instruction(id: u64, token_b_wanted_amount: u64, token_a_offered_amount: u64, is_taker_native: bool, chain_id: u64, deadline: i64, ciphertext_seller_identity_hash: [u8; 32], pub_key: [u8; 32], nonce: u128, computation_offset: u64)]
pub struct InterchainOriginEvmDepositSellerSpl<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + 8 + 8 + 8 + 1 + 8 + 8 + 1,
        seeds = [b"InterChainoffer", payer.key().as_ref(), &id.to_le_bytes()],
        bump
    )]
    pub interchain_offer: Account<'info, InterchainOffer>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, SignerAccount>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(
        mut,
        address = derive_mempool_pda!()
    )]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!()
    )]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset)
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_INTERCHAIN_ORIGIN_EVM_DEPOSIT_SELLER_SPL)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Account<'info, FeePool>,
    #[account(
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS
    )]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[queue_computation_accounts("finalize_interchain_origin_evm_offer", payer)]
#[derive(Accounts)]
#[instruction(id: u64, ciphertext_buyer_identity_hash: [u8; 32], pub_key: [u8; 32], nonce: u128, computation_offset: u64)]
pub struct FinalizeInterchainOriginEvmOffer<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, SignerAccount>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(
        mut,
        address = derive_mempool_pda!()
    )]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!()
    )]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset)
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_FINALIZE_INTERCHAIN_ORIGIN_EVM_OFFER)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Account<'info, FeePool>,
    #[account(
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS
    )]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[queue_computation_accounts("deposit_seller_native", payer)]
#[derive(Accounts)]
#[instruction(id: u64, token_b_wanted_amount: u64, token_a_offered_amount: u64, is_taker_native: bool, deadline: i64, ciphertext_seller_identity_hash: [u8; 32], pub_key: [u8; 32], nonce: u128, computation_offset: u64)]
pub struct DepositSellerNative<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + 8 + 8 + 8 + 1 + 8 + 1,
        seeds = [b"IntraChainoffer", payer.key().as_ref(), &id.to_le_bytes()],
        bump
    )]
    pub intrachain_offer: Account<'info, IntraChainOffer>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, SignerAccount>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(
        mut,
        address = derive_mempool_pda!()
    )]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!()
    )]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset)
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_DEPOSIT_SELLER_NATIVE)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Account<'info, FeePool>,
    #[account(
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS
    )]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[queue_computation_accounts("deposit_seller_spl", payer)]
#[derive(Accounts)]
#[instruction(id: u64, token_b_wanted_amount: u64, token_a_offered_amount: u64, is_taker_native: bool, deadline: i64, ciphertext_seller_identity_hash: [u8; 32], pub_key: [u8; 32], nonce: u128, computation_offset: u64)]
pub struct DepositSellerSpl<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + 8 + 8 + 8 + 1 + 8 + 1,
        seeds = [b"IntraChainoffer", payer.key().as_ref(), &id.to_le_bytes()],
        bump
    )]
    pub intrachain_offer: Account<'info, IntraChainOffer>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, SignerAccount>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(
        mut,
        address = derive_mempool_pda!()
    )]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!()
    )]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset)
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_DEPOSIT_SELLER_SPL)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Account<'info, FeePool>,
    #[account(
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS
    )]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[queue_computation_accounts("finalize_intrachain_offer", payer)]
#[derive(Accounts)]
#[instruction(id: u64, ciphertext_buyer_identity_hash: [u8; 32], pub_key: [u8; 32], nonce: u128, computation_offset: u64)]
pub struct FinalizeIntrachainOffer<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, SignerAccount>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(
        mut,
        address = derive_mempool_pda!()
    )]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!()
    )]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset)
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_FINALIZE_INTRACHAIN_OFFER)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Account<'info, FeePool>,
    #[account(
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS
    )]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

// === ESCROW VAULT ACCOUNT CONTEXTS ===

#[derive(Accounts)]
#[instruction(offer_id: u64)]
pub struct ExecuteIntrachainSwap<'info> {
    #[account(
        seeds = [b"IntraChainoffer", seller.key().as_ref(), &offer_id.to_le_bytes()],
        bump = intrachain_offer.bump,
    )]
    pub intrachain_offer: Account<'info, IntraChainOffer>,
    
    #[account(mut)]
    pub seller: Signer<'info>,
    
    #[account(mut)]
    pub buyer: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"seller_vault", seller.key().as_ref(), &offer_id.to_le_bytes()],
        bump,
    )]
    /// CHECK: Escrow vault holding seller's token A
    pub seller_vault: UncheckedAccount<'info>,
    
    #[account(
        mut,
        seeds = [b"buyer_vault", buyer.key().as_ref(), &offer_id.to_le_bytes()],
        bump,
    )]
    /// CHECK: Escrow vault holding buyer's token B
    pub buyer_vault: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(offer_id: u64)]
pub struct ExecuteInterchainSwap<'info> {
    #[account(
        seeds = [b"InterChainoffer", seller.key().as_ref(), &offer_id.to_le_bytes()],
        bump = interchain_offer.bump,
    )]
    pub interchain_offer: Account<'info, InterchainOffer>,
    
    #[account(mut)]
    pub seller: Signer<'info>,
    
    #[account(mut)]
    pub buyer: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"seller_vault", seller.key().as_ref(), &offer_id.to_le_bytes()],
        bump,
    )]
    /// CHECK: Escrow vault holding seller's token A
    pub seller_vault: UncheckedAccount<'info>,
    
    #[account(
        mut,
        seeds = [b"buyer_vault", buyer.key().as_ref(), &offer_id.to_le_bytes()],
        bump,
    )]
    /// CHECK: Escrow vault holding buyer's token B
    pub buyer_vault: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(offer_id: u64)]
pub struct DepositToSellerVault<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    
    #[account(
        init_if_needed,
        payer = seller,
        space = 8,
        seeds = [b"seller_vault", seller.key().as_ref(), &offer_id.to_le_bytes()],
        bump,
    )]
    /// CHECK: Escrow vault PDA
    pub seller_vault: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(offer_id: u64)]
pub struct DepositToBuyerVault<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    
    #[account(
        init_if_needed,
        payer = buyer,
        space = 8,
        seeds = [b"buyer_vault", buyer.key().as_ref(), &offer_id.to_le_bytes()],
        bump,
    )]
    /// CHECK: Escrow vault PDA
    pub buyer_vault: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}



#[callback_accounts("add_together")]
#[derive(Accounts)]
pub struct AddTogetherCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_ADD_TOGETHER)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
}

#[callback_accounts("relay_offer_clone")]
#[derive(Accounts)]
pub struct RelayOfferCloneCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_RELAY_OFFER_CLONE)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
}

#[callback_accounts("confidential_deposit_native")]
#[derive(Accounts)]
pub struct ConfidentialDepositNativeCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_CONFIDENTIAL_DEPOSIT_NATIVE)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
}

#[callback_accounts("interchain_origin_evm_deposit_seller_spl")]
#[derive(Accounts)]
pub struct InterchainOriginEvmDepositSellerSplCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_INTERCHAIN_ORIGIN_EVM_DEPOSIT_SELLER_SPL)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
}

#[callback_accounts("finalize_interchain_origin_evm_offer")]
#[derive(Accounts)]
pub struct FinalizeInterchainOriginEvmOfferCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_FINALIZE_INTERCHAIN_ORIGIN_EVM_OFFER)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
}

#[callback_accounts("deposit_seller_native")]
#[derive(Accounts)]
pub struct DepositSellerNativeCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_DEPOSIT_SELLER_NATIVE)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
}

#[callback_accounts("deposit_seller_spl")]
#[derive(Accounts)]
pub struct DepositSellerSplCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_DEPOSIT_SELLER_SPL)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
}

#[callback_accounts("finalize_intrachain_offer")]
#[derive(Accounts)]
pub struct FinalizeIntrachainOfferCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_FINALIZE_INTRACHAIN_OFFER)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
}



#[init_computation_definition_accounts("add_together", payer)]
#[derive(Accounts)]
pub struct InitAddTogetherCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    /// Can't check it here as it's not initialized yet.
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("relay_offer_clone", payer)]
#[derive(Accounts)]
pub struct InitRelayOfferCloneCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    /// Can't check it here as it's not initialized yet.
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("confidential_deposit_native", payer)]
#[derive(Accounts)]
pub struct InitConfidentialDepositNativeCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    /// Can't check it here as it's not initialized yet.
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("interchain_origin_evm_deposit_seller_spl", payer)]
#[derive(Accounts)]
pub struct InitInterchainOriginEvmDepositSellerSplCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    /// Can't check it here as it's not initialized yet.
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("finalize_interchain_origin_evm_offer", payer)]
#[derive(Accounts)]
pub struct InitFinalizeInterchainOriginEvmOfferCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    /// Can't check it here as it's not initialized yet.
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("deposit_seller_native", payer)]
#[derive(Accounts)]
pub struct InitDepositSellerNativeCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    /// Can't check it here as it's not initialized yet.
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("deposit_seller_spl", payer)]
#[derive(Accounts)]
pub struct InitDepositSellerSplCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    /// Can't check it here as it's not initialized yet.
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("finalize_intrachain_offer", payer)]
#[derive(Accounts)]
pub struct InitFinalizeIntrachainOfferCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    /// Can't check it here as it's not initialized yet.
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}


#[event]
pub struct SumEvent {
    pub sum: [u8; 32],
    pub nonce: [u8; 16],
}

#[event]
pub struct RelayOfferClonedEvent {
    pub acknowledged: u8,
}

#[event]
pub struct ConfidentialDepositNativeEvent {
    pub processed_amount: [u8; 32],
    pub nonce: [u8; 16],
}

#[event]
pub struct InterchainOriginEvmDepositSellerSplEvent {
    pub acknowledged: u8,
}

#[event]
pub struct FinalizeInterchainOriginEvmOfferEvent {
    pub acknowledged: u8,
}

#[event]
pub struct DepositSellerNativeEvent {
    pub acknowledged: u8,
}

#[event]
pub struct DepositSellerSplEvent {
    pub acknowledged: u8,
}

#[event]
pub struct FinalizeIntrachainOfferEvent {
    pub acknowledged: u8,
}


#[error_code]
pub enum ErrorCode {
    #[msg("The computation was aborted")]
    AbortedComputation,
    #[msg("Cluster not set")]
    ClusterNotSet,
}

// PDA account structures for on-chain state (matching original Anchor program)
#[account]
pub struct IntraChainOffer {
    pub id: u64,
    pub token_a_offered_amount: u64,
    pub token_b_wanted_amount: u64,
    pub is_taker_native: bool,
    pub deadline: i64,
    pub bump: u8,
}

#[account]
pub struct InterchainOffer {
    pub id: u64,
    pub token_a_offered_amount: u64,
    pub token_b_wanted_amount: u64,
    pub is_taker_native: bool,
    pub chain_id: u64,
    pub deadline: i64,
    pub bump: u8,
}
-- RenameIndex
ALTER INDEX "idx_saved_cards_guest" RENAME TO "saved_cards_guest_id_idx";

-- RenameIndex
ALTER INDEX "idx_transactions_guest_createdAt" RENAME TO "transactions_guest_id_created_at_idx";

-- RenameIndex
ALTER INDEX "idx_transactions_provider_payment_ref" RENAME TO "transactions_provider_payment_ref_idx";

-- RenameIndex
ALTER INDEX "idx_trust_ledger_account_occurred" RENAME TO "trust_ledger_entries_trust_account_id_occurred_at_idx";

-- RenameIndex
ALTER INDEX "idx_upsells_property_status" RENAME TO "upsells_property_id_status_idx";

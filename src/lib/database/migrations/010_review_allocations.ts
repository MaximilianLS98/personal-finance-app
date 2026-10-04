import type { Migration } from '../types';

export const migration010: Migration = {
	version: 10,
	description: 'Review audit, split purchases, and linked refunds',
	up(db) {
		db.exec(`
   CREATE TABLE transaction_allocations (
    transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES categories(id),
    amount REAL NOT NULL CHECK(amount > 0),
    PRIMARY KEY(transaction_id, category_id)
   );
   CREATE TABLE refund_links (
    refund_id TEXT PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
    purchase_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('refund','reimbursement')),
    CHECK(refund_id != purchase_id)
   );
   CREATE INDEX idx_refund_purchase ON refund_links(purchase_id);
   CREATE TABLE review_actions (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    category_id TEXT NOT NULL, rule_id TEXT, changes_json TEXT NOT NULL, undone_at TEXT
   );
   -- Round cumulative refunds by largest remainder, then post each receipt's difference.
   -- This preserves every receipt cent and returns every category to zero at a full refund.
   CREATE VIEW effective_transactions AS
    WITH receipts AS (
      SELECT t.id,t.date,t.description,t.currency,t.account_id,r.purchase_id,
       CAST(ROUND(t.amount*100) AS INTEGER) receipt_cents,
       CAST(ROUND(ABS(p.amount)*100) AS INTEGER) purchase_cents,p.category_id purchase_category
      FROM refund_links r JOIN transactions t ON t.id=r.refund_id
      JOIN transactions p ON p.id=r.purchase_id
    ), cumulative AS (
      SELECT *,SUM(receipt_cents) OVER(PARTITION BY purchase_id ORDER BY date,id ROWS UNBOUNDED PRECEDING) cumulative_cents
      FROM receipts
    ), receipt_shares AS (
      SELECT r.*,COALESCE(a.category_id,r.purchase_category) category_id,
       COALESCE(CAST(ROUND(a.amount*100) AS INTEGER),purchase_cents) allocation_cents
      FROM cumulative r LEFT JOIN transaction_allocations a ON a.transaction_id=r.purchase_id
    ), apportioned AS (
      SELECT *,
       CAST(cumulative_cents*allocation_cents/purchase_cents AS INTEGER) floor_cents,
       (cumulative_cents*allocation_cents)%purchase_cents remainder,
       CAST((cumulative_cents-receipt_cents)*allocation_cents/purchase_cents AS INTEGER) previous_floor,
       ((cumulative_cents-receipt_cents)*allocation_cents)%purchase_cents previous_remainder
      FROM receipt_shares
    ), rounded_receipts AS (
      SELECT id,date,description,currency,account_id,category_id,
       (floor_cents+CASE WHEN ROW_NUMBER() OVER(PARTITION BY id ORDER BY remainder DESC,category_id)
        <= cumulative_cents-SUM(floor_cents) OVER(PARTITION BY id) THEN 1 ELSE 0 END
        -previous_floor-CASE WHEN ROW_NUMBER() OVER(PARTITION BY id ORDER BY previous_remainder DESC,category_id)
        <= cumulative_cents-receipt_cents-SUM(previous_floor) OVER(PARTITION BY id) THEN 1 ELSE 0 END)/100.0 amount
      FROM apportioned
    )
    SELECT t.id, t.date, t.description, t.currency, t.account_id, t.type,
      COALESCE(a.category_id,t.category_id) category_id,
      CASE WHEN a.amount IS NOT NULL THEN -a.amount ELSE t.amount END amount
    FROM transactions t LEFT JOIN transaction_allocations a ON a.transaction_id=t.id
    WHERE NOT EXISTS(SELECT 1 FROM refund_links r WHERE r.refund_id=t.id)
    UNION ALL
    SELECT id,date,description,currency,account_id,'expense',category_id,amount
    FROM rounded_receipts;
   CREATE TRIGGER protect_allocated_transaction BEFORE UPDATE OF amount,type,currency ON transactions
    WHEN (NEW.amount != OLD.amount OR NEW.type != OLD.type OR COALESCE(NEW.currency,'') != COALESCE(OLD.currency,''))
     AND (EXISTS(SELECT 1 FROM transaction_allocations WHERE transaction_id=OLD.id)
       OR EXISTS(SELECT 1 FROM refund_links WHERE refund_id=OLD.id OR purchase_id=OLD.id))
    BEGIN SELECT RAISE(ABORT,'Remove splits and refund links before changing amount, type, or currency'); END;
   INSERT INTO schema_metadata(version) VALUES(10);
  `);
	},
	down(db) {
		db.exec(
			'DROP TRIGGER protect_allocated_transaction; DROP VIEW effective_transactions; DROP TABLE review_actions; DROP TABLE refund_links; DROP TABLE transaction_allocations; DELETE FROM schema_metadata WHERE version=10;',
		);
	},
};

# Transfers between your own accounts

Transfers stay in account balances but are excluded from income, spending, category totals and budgets. Import the actual movements into the correct accounts; do not delete either side to fix totals.

## Automatic detection

Each statement import applies saved rules and runs detection across existing accounts, so either bank can be imported first. The import preview labels recognized individual transfers. The result reports classifications and matched pairs.

- Revolut pocket deposits and withdrawals are transfers, even without the other side imported. The source `Transfer` type must have an explicit pocket description.
- Revolut currency exchanges with a zero source fee are transfers. Exchange rows with fees remain for review so fees are not silently hidden.
- Bank debits such as `Revolut**1234*` can match Revolut `Top-up by *1234` or `Apple Pay deposit by *1234` deposits. Card suffixes need not match: the two banks use different references. Both sides must have opposite equal amounts, the same currency, different accounts, and booking dates within three calendar days. Each side must have exactly one possible counterpart. Overlapping candidates remain for manual review.
- Other payments, including transfers to people, are not automatically excluded merely because their source type says `Transfer`.

Use **Accounts → Detect transfers in existing history** to scan older data. Old pocket movements can be recognized from explicit descriptions on Revolut accounts or Revolut account-statement imports. Reimporting a Revolut statement from an earlier account-aware import recovers missing source type/product/fee evidence for duplicate rows without duplicating transactions. This allows exchange and top-up detection on imports made before source evidence was retained. Existing manual decisions take precedence.

## Manual decisions and remembered rules

In **Transactions → Details**, choose **Exclude as transfer** or **Count as spending/income**. A counterpart is not required, so this also works for transfers involving accounts you do not track or different currencies.

Optional checkboxes let you:

- Remember the choice for future imports.
- Apply the choice to matching history.

Rules use account, currency, direction and the exact description (ignoring case and repeated whitespace). This avoids a broad “transfer” or “Revolut” keyword hiding unrelated payments. A remembered choice can either exclude transfers or keep an exception in totals. Historical application preserves individual overrides, matched pairs, split purchases and refund links.

**Accounts → Remembered transfer rules** lists saved rules. Removing a rule stops future application; it does not silently reclassify history. Change existing transactions in Details. Rules and decisions are included in complete database backups.

## Matched pairs and corrections

Accounts shows possible pairs with both descriptions, dates and amounts. Confirm only movements between your own accounts. **Unmatch** restores the original types and prevents automatic rematching of those transactions. Use individual classification controls to correct them if needed.

Matched amounts, dates, currencies and account assignments remain protected. Unmatch before editing. Remove purchase splits or refund links before changing a transaction's classification. Undoing an import removes its records and restores the surviving side of any matched transfer.

Test fixtures contain synthetic data. Private statements are not stored in the repository.

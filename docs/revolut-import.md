# Importing Revolut account CSV statements

Use **Statements**, select a local account with the matching currency, and preview the CSV. The importer recognizes `Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance` headers automatically. Generic column overrides do not alter the recognized Revolut fields.

Only `COMPLETED` rows are eligible. Pending, reverted, declined, failed, and cancelled rows are excluded with their source row numbers and reasons visible in the preview and retained in import history. Unknown states, invalid completed timestamps, or missing currencies remain errors for review.

A statement containing several products must be imported one product at a time into separate accounts, such as Current, Savings, and Pocket. Choose the product and preview again. Other products are listed as excluded rows for that batch. Currency must match the selected account; use separate currency exports/accounts rather than relabeling amounts.

The ledger date is **Completed Date**, including its time. Explicit timezone offsets are honored. When the CSV has no timezone, its clock is stored without applying the computer's local timezone; no original timezone is inferred. Started Date, source Type, Product, Amount, and Fee inform the preview and duplicate identity. Imported descriptions stay unchanged. Source `Transfer` labels alone do not establish that both accounts belong to you; use Accounts to match the two sides of your own transfers.

## Fees

Zero-fee rows need no additional choice. Nonzero fees require an explicit interpretation before those rows can be imported:

- **Amount excludes fee:** the imported movement is `Amount - Fee`, once. Negative fees add money back.
- **Amount already includes fee:** the imported movement remains `Amount`.

Use the statement's consecutive balances to determine the correct interpretation. No separate fee transaction is created, preventing a fee from being charged twice. Changing this interpretation does not make an already imported source row new; undo the original batch before correcting its fee interpretation.

[Revolut's expense-export documentation](https://help.revolut.com/en-NO/help/managing-my-business/expenses/introduction-to-expenses/what-information-does-the-expenses-csv-export-contain/) lists Amount and Fee separately, but does not establish how every account-statement format includes fees. The importer therefore asks explicitly for nonzero fees instead of assuming a convention from zero-fee examples.

## Balances and repeated imports

The `Balance` column is not imported as another movement. Set the account's opening balance to its balance immediately before the first included movement, then use Accounts reconciliation to compare the closing balance. Source identity includes account, product, currency, full timestamps, description, original amount, fee, and type. Overlapping exports and renamed files retain duplicate detection. Identical repeated source rows are tracked by occurrence; suspected duplicates can still be retained deliberately.

Import undo removes that batch's created records and restores affected matched-transfer state. Excluded states and other products do not become ledger records. Keep private statements local; automated regression fixtures use synthetic merchants and amounts.

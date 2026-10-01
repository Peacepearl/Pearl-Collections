# Open Decisions

This log tracks decisions called out by the PRD and implementation guide. Update each row with the decision, owner, and date when resolved. The PRD remains the product source of truth; update it when a decision changes requirements.

| Decision | Current state | Needed by |
|---|---|---|
| Final brand name styling and logo | Open | Storefront foundations and legal pages |
| Accent colour: muted gold or deep burgundy | Open | Design foundations |
| Product categories and first product inventory/photos | Open | Catalog integration and launch |
| Delivery fee: flat or location-based | PRD currently specifies flat ₦5,000 for v1; confirm final rule | Checkout and order calculation |
| Monetary representation: integer minor units or PostgreSQL `numeric` | Open; use one representation consistently | Database schema and checkout |
| Guest cart merge behavior for duplicate variants and quantities above stock | Open | Authentication/cart integration |
| Duplicate order retry/idempotency behavior | Open; database must prevent accidental duplicate orders | Checkout |
| Authorized email retry mechanism and operator permissions | Open | Production email operations |
| Production domain and OAuth redirect URLs | Open | Deployment |
| Mailgun sender domain and production account | Open | Production email |
| Legal page wording and business review | Open | Public launch and OAuth review |
| Customer support email and support hours | Open; contact page is a placeholder | Before launch |
| Delivery coverage and expected delivery times | Open; checkout currently uses the PRD flat ₦5,000 fee | Before launch |
| Return and exchange eligibility, window, and process | Open; page is marked as a draft | Before launch |
| Payment gateway | Accepted: Paystack hosted checkout for NGN; requires `PAYSTACK_SECRET_KEY` as a Supabase Edge Function secret | Before real payment testing |

## Decision Record Template

For decisions with important tradeoffs, add a short entry:

```text
### Decision: [Short title]
- Date:
- Owner:
- Status: Proposed / Accepted / Rejected / Superseded
- Context:
- Decision:
- Consequences:
```
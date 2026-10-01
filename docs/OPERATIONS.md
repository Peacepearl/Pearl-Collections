# Operations

This guide covers expected MVP incidents. Add actual dashboard links, alerting details, and named owners after the Supabase, Mailgun, and Vercel projects are established.

## Failed Order Email

1. Confirm the order exists in Supabase and note its order number. Do not ask the customer to place it again solely because email failed.
2. Inspect the associated `email_logs` attempt and the Edge Function/provider error. Avoid copying full addresses or secrets into shared logs.
3. Remember that an email log marked `sent` means Mailgun accepted the API request, not that the message reached the inbox. Check Mailgun Events/Logs for `delivered`, `temporary_fail`, `permanent_fail`, `rejected`, or `bounced`.
4. Check Mailgun account/domain status, sender verification, SPF/DKIM records, sandbox authorized recipients, spam folder, and the order's recipient mailbox.
5. Ask the signed-in customer to use the receipt resend action on the confirmation page. Resends are limited to one per minute, verify order ownership, and load the receipt from the database. Do not accept email content or totals from the browser.
6. Confirm the retry result is recorded. If sending remains unavailable, communicate the order confirmation through the approved support channel.

An operator-side bulk retry and alerting mechanism is not defined yet; decide whether it is needed before production support volume grows.

## Order or Inventory Discrepancy

- Use the persisted order and order-item snapshots as the record of what was placed.
- Check stock and order history before making a manual correction.
- Do not edit historical order totals to match current catalog prices.
- Record any production correction, reason, time, and authorized operator in an audit trail once one is defined.

## Suspected Credential Exposure

- Revoke or rotate the affected credential at its issuing provider immediately.
- Update the corresponding managed secret and redeploy/restart the affected function if required.
- Review repository history, deployment logs, and provider activity for exposure or misuse.
- Do not paste secrets into tickets, chat, or logs. Escalate according to the business incident contact process once established.

## Service Degradation

- If order placement is unavailable, do not claim an order succeeded unless it is present in the database.
- If email is unavailable but order creation works, preserve the order and retry email later.
- If catalog or stock data is stale, disable affected purchase paths until availability can be verified.
- Record incident start, impact, mitigation, and resolution in the project incident log when established.
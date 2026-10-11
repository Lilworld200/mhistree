# Durable care text messaging

server.ts owns sendCareMessage and careMessages. This is separate from AI chat. Current can_participate validates explicit context, connection and applicable qualification/membership/assignment/privilege. Messages retain signed-in author, order and idempotency key; transaction writes audit and outbox. Stored means durable, not read or clinical task completion. Pages are bounded and unauthorized participants are denied.

/api/care is the patient transport; T25 provides provider inbox producers. Narrowed/revoked access prevents further thread use; reconnect does not resume paused clinical work. Existing stored messages are retained. No email/push delivery daemon, audio or video is implied. See tests/integration/care.test.ts.

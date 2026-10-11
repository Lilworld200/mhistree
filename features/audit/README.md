# Audit owner

`appendEvent(tx,event)` writes a bounded attribution/reference event in the caller's transaction. There is no arbitrary metadata, password, source body or document text parameter. Audit rows have a database trigger rejecting updates/deletes. Schema starts in the identity migration; access/record operations share it. Callers: identity, authentication, access, health-records and private file delivery.

T09 tests cover immutable audit and atomic rollback with records/state/outbox. Ordinary callers cannot browse this table through a public API. T17/T33 must implement separately authorized patient access history and restricted operations views; no generic support clinical browse exists. Failed permission checks use `access.denied` without the requested patient's data. Transaction/DB outage can prevent audit persistence and must remain an operational error, not a false success.

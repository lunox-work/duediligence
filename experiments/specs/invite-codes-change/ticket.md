# Revoking a used code should take back the access it gave
## Context
Codes sometimes reach the wrong contributor or get passed around, and once a code is used the company cannot revoke it, so the access stays for good.
## Change
Let the company revoke a code that has been used; revoking it withdraws the task access that code granted, and the code is refused from then on to everyone, the contributor who used it included.
## Acceptance criteria
- Revoking a used code removes that contributor's access to the code's task, and to no other task.
- Redeeming a revoked code fails with reason "revoked", even for the contributor who used it.
- The company's listing shows such a code as "revoked" and still shows who used it and when.
## Scope
Revoking, redeeming and listing only; creating codes, expiry and the interface stay as they are.

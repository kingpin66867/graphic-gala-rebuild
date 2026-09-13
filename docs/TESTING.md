# Testing and local verification

## Automated integration tests

Run `npm test` from the project root. Requires Node.js 24.14+ within the 24.x line. Tests use temporary SQLite databases, fictional identities and local HTTP servers, without external services or a browser. They run in-process to also support restricted Windows environments.

| Group | Coverage |
|---|---|
| TC-01/02 | Required fields; invalid service/email; unique references; reference upload; hashed access code; customer re-entry |
| TC-03 through TC-10 | Owner assignment; assigned-staff visibility; status progression; two draft versions; revision before/after; exact-draft approval; completion; preserved history; reopening |
| Security | Anonymous access; wrong code/login; staff assignment boundaries; file authorization; staff-note privacy; blocked cross-origin and invalid-CSRF writes; prohibited customer staff actions; access-code replacement and session revocation |
| Data integrity | Invalid upload rejected without partial request; invalid assignment/date; stale version conflict; invalid draft leaves prior state intact |
| Accounts | Owner-only team creation; password length; duplicate email; self-deactivation prevention; password changes and session revocation; inactive account sign-in denied |
| Hardening | Repeated sign-in throttling; CSP; health endpoint; hidden configuration and source routes |
| Persistence | Database close/reopen; backup restored and checked for project and file bytes; refusal to run demo data or HTTP configuration in production |

**Result on 13 September 2026:** all seven grouped tests passed locally on Windows with Node.js 24.19.0. They include success and failure assertions; they are not seven individual button checks.

## Browser checks performed

The rebuilt app was run at `http://localhost:3000` in the available Chromium-based in-app browser.

- Customer homepage and staff dashboard visually inspected at desktop width.
- Owner login and database-derived counts displayed successfully.
- Queue search produced an explicit no-results state; clearing filters restored the queue.
- Revision detail displayed before/after requirements, draft preview, planning and staff controls.
- An incomplete customer request was blocked at the phone field; a completed request produced `GG1009` and a private receipt.
- Customer project detail rendered at a 390 × 844 viewport with no horizontal page overflow.
- Staff dashboard checked at the same mobile viewport. A navigation minimum-width overflow was corrected, then rechecked with page width equal to viewport content width.
- Customer lookup with `GG1005` and the seeded test code displayed the design.
- Approval confirmation without its checkbox was blocked; checked confirmation recorded approval and displayed success.
- Staff then completed that approved project in the browser; the completed state and retained activity were visible.
- Browser console was checked for errors/warnings during this flow; none were recorded at that check.
- Initial owner setup and the backup command were also executed successfully against a separate clean test directory.

Browser testing changes only the local fictional demo. The clean source ZIP does not contain that runtime database. Running `npm run demo` after a fresh extraction produces eight initial projects.

## Manual acceptance checklist

Record date, tester, browser/device, expected result, actual result and any screenshot for your own acceptance run. Use the README's separate customer and staff browser sessions.

1. Try an empty request, invalid email, missing phone, missing service and blank brief. Each must be blocked.
2. Submit a valid request with a reference file. Record the reference and save the private receipt. Refresh/reopen with that receipt and verify persisted details.
3. Search by reference, customer, service and designer. Combine search and status filters. Test a no-results search and clear it.
4. Sign in as a different staff account with no assignment. It should not see the project; direct access to its detail or file should fail too.
5. Assign a project, add a due date and start work. Upload a draft and verify it is visible to that customer.
6. Request a revision. Inspect feedback and before/after requirements. Upload a revised draft and confirm both versions remain downloadable.
7. Open a project in two staff tabs. Save an update in one, then submit an old form in the other. It must ask you to refresh rather than overwrite the newer state.
8. Attempt completion before approval. The action must not be available, and the API must reject it.
9. Approve the latest draft with explicit confirmation, complete it as staff, and verify it remains under Completed.
10. Reopen with an owner reason. Check that approval history stays intact and a new draft/approval is required.
11. Add a staff-only note; ensure it never appears in the customer session.
12. Test an invalid file and a file over 5 MB. Both must fail with a readable error.
13. Replace a customer's code after verifying their identity. Old code and sessions should stop working; the new code should work.
14. Deactivate a staff account, check it is signed out, then reassign its projects. Password reset should also invalidate old sessions.
15. Navigate with Tab/Shift+Tab and Enter. Check focus visibility, form labels, dialog cancellation, and approval confirmation. Test 200% zoom and a narrow screen.
16. Stop/restart the application. Verify data persists. Run and inspect a backup in a separate restore directory.

## Limits of the evidence

This is local functional verification, not a penetration test, formal accessibility certification, production load test or independent business acceptance. Native Chrome, Edge, Firefox, Safari, iOS and Android were not each independently exercised. Hosted HTTPS behaviour, provider account setup, Docker image building, disk recovery on the actual host, outbound notification services and real-data migration remain untested or unimplemented as described in the deployment guide.

No pass claims from the old Glide report were inherited as evidence for this new application. The new integration suite and local browser checks are the evidence for this rebuild.
